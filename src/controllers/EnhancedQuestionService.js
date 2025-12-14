const {
  QuestionType,
  Level,
  LO,
  Question,
  Answer,
  sequelize,
  MediaFile,
} = require("../models");
const fs = require("fs");
const { Op } = require("sequelize");

class EnhancedQuestionService {
  static async safeRollback(transaction) {
    if (!transaction) return;
    try {
      // Sequelize sets transaction.finished to 'commit' or 'rollback' after completion.
      if (
        transaction.finished === "commit" ||
        transaction.finished === "rollback"
      )
        return;
      await transaction.rollback();
    } catch (e) {
      // Ignore errors specifically about finished/closed transaction
      if (
        !/finished with state|Transaction cannot be rolled back/i.test(
          e.message
        )
      ) {
        console.error("safeRollback non-ignorable error:", e.message);
      }
    }
  }
  static getFileType(mimeType) {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType.startsWith("video/")) return "video";
    return "document";
  }

  static async createQuestionWithMedia(req, res) {
    const transaction = await sequelize.transaction();
    try {
      const {
        question_type_id,
        level_id,
        question_text,
        lo_id,
        validation_rules,
        hints,
        time_limit,
        tags,
        answers,
      } = req.body;
      if (!question_type_id || !level_id || !question_text || !lo_id) {
        await EnhancedQuestionService.safeRollback(transaction);
        return res
          .status(400)
          .json({ success: false, message: "Thiếu thông tin bắt buộc" });
      }
      const questionType = await QuestionType.findByPk(question_type_id);
      if (!questionType) {
        await EnhancedQuestionService.safeRollback(transaction);
        return res
          .status(400)
          .json({ success: false, message: "Loại câu hỏi không tồn tại" });
      }

      const newQuestion = await Question.create(
        {
          question_type_id,
          level_id,
          question_text,
          lo_id,
          validation_rules: validation_rules
            ? JSON.parse(validation_rules)
            : null,
          hints: hints ? JSON.parse(hints) : null,
          time_limit: time_limit ? parseInt(time_limit) : null,
          tags: tags ? JSON.parse(tags) : null,
        },
        { transaction }
      );

      // *** START FIX ***
      const parsedAnswers = answers ? JSON.parse(answers) : [];
      const createdAnswers = await EnhancedQuestionService.createAnswersByType(
        newQuestion.question_id,
        questionType.name,
        parsedAnswers,
        transaction
      );

      // Map uploaded files by original name for easy lookup
      const fileMap = new Map(
        (req.files || []).map((file) => [file.originalname, file])
      );
      const mediaToCreate = [];
      const usedFilenames = new Set();

      // Process media for answers
      if (createdAnswers && createdAnswers.length > 0) {
        for (let i = 0; i < createdAnswers.length; i++) {
          const answerRecord = createdAnswers[i];
          const answerData = parsedAnswers[i];

          if (
            answerData.media_filename &&
            fileMap.has(answerData.media_filename)
          ) {
            const file = fileMap.get(answerData.media_filename);
            mediaToCreate.push({
              question_id: newQuestion.question_id,
              owner_type: "answer",
              answer_id: answerRecord.answer_id, // Correctly assign answer_id
              file_type: EnhancedQuestionService.getFileType(file.mimetype),
              file_name: file.filename,
              file_path: file.path,
              file_size: file.size,
              mime_type: file.mimetype,
              alt_text: req.body[`alt_text_${file.originalname}`] || "",
              description: req.body[`description_${file.originalname}`] || "",
            });
            usedFilenames.add(file.originalname);
          }
        }
      }

      // Process remaining media for the question itself
      for (const file of req.files || []) {
        if (!usedFilenames.has(file.originalname)) {
          mediaToCreate.push({
            question_id: newQuestion.question_id,
            owner_type: "question", // This is for the question
            answer_id: null,
            file_type: EnhancedQuestionService.getFileType(file.mimetype),
            file_name: file.filename,
            file_path: file.path,
            file_size: file.size,
            mime_type: file.mimetype,
            alt_text: req.body[`alt_text_${file.originalname}`] || "",
            description: req.body[`description_${file.originalname}`] || "",
          });
        }
      }

      // Bulk create all media files
      if (mediaToCreate.length > 0) {
        await MediaFile.bulkCreate(mediaToCreate, { transaction });
      }
      // *** END FIX ***

      await transaction.commit();
      return EnhancedQuestionService.getQuestionWithMediaInternal(
        res,
        newQuestion.question_id,
        201,
        "Tạo câu hỏi thành công"
      );
    } catch (err) {
      await EnhancedQuestionService.safeRollback(transaction);
      console.error("createQuestionWithMedia error", err);
      return res
        .status(500)
        .json({
          success: false,
          message: "Lỗi khi tạo câu hỏi",
          error: err.message,
        });
    }
  }

  static async getQuestionWithMedia(req, res) {
    return EnhancedQuestionService.getQuestionWithMediaInternal(
      res,
      req.params.id,
      200,
      null
    );
  }

  static async getQuestionWithMediaInternal(
    res,
    questionId,
    status = 200,
    message = null
  ) {
    const question = await Question.findByPk(questionId, {
      include: [
        { model: QuestionType, attributes: ["question_type_id", "name"] },
        { model: Level, attributes: ["level_id", "name"] },
        { model: LO, as: "LO", attributes: ["lo_id", "name"] },
        {
          model: Answer,
          attributes: [
            "answer_id",
            "answer_text",
            "iscorrect",
            "answer_data",
            "answer_type",
            "display_order",
            "answer_explanation",
            // include answer-level media inside each answer
          ],
          include: [
            {
              model: MediaFile,
              as: "MediaFiles",
              attributes: [
                "media_id",
                "file_type",
                "file_name",
                "file_path",
                "alt_text",
                "description",
                "mime_type",
                "file_size",
                "owner_type",
                "answer_id",
              ],
            },
          ],
        },
        {
          model: MediaFile,
          as: "MediaFiles",
          attributes: [
            "media_id",
            "file_type",
            "file_name",
            "file_path",
            "alt_text",
            "description",
            "mime_type",
            "file_size",
            "owner_type",
            "answer_id",
          ],
        },
      ],
    });
    if (!question)
      return res
        .status(404)
        .json({ success: false, message: "Câu hỏi không tồn tại" });
    const data = question.toJSON();
    // Attach file_url + owner info for question-level media
    if (data.MediaFiles) {
      data.MediaFiles = data.MediaFiles.map((m) => ({
        ...m,
        owner_type: m.owner_type || "question",
        owner_id: m.owner_type === "answer" ? m.answer_id : questionId,
        file_url:
          m.owner_type === "answer"
            ? `/api/answers/${m.answer_id}/media/${m.file_name}`
            : `/api/questions/media/${questionId}/${m.file_name}`,
      }));
    }
    // Map answers to include their own media (flatten nested)
    if (data.Answers) {
      data.Answers = data.Answers.map((a) => ({
        ...a,
        media_files: (a.MediaFiles || []).map((m) => ({
          ...m,
          owner_type: "answer",
          owner_id: a.answer_id,
          file_url: `/api/answers/${a.answer_id}/media/${m.file_name}`,
        })),
      }));
    }
    return res
      .status(status)
      .json({ success: true, message: message || "OK", data });
  }

  static async updateQuestionWithMedia(req, res) {
    const transaction = await sequelize.transaction();
    try {
      const id = req.params.id;
      const q = await Question.findByPk(id);
      if (!q) {
        await EnhancedQuestionService.safeRollback(transaction);
        return res
          .status(404)
          .json({ success: false, message: "Câu hỏi không tồn tại" });
      }
      const {
        question_type_id,
        level_id,
        question_text,
        validation_rules,
        hints,
        time_limit,
        tags,
        answers,
        remove_media_ids,
      } = req.body;
      const updateData = {};
      if (question_type_id) updateData.question_type_id = question_type_id;
      if (level_id) updateData.level_id = level_id;
      if (question_text) updateData.question_text = question_text;
      if (validation_rules)
        updateData.validation_rules = JSON.parse(validation_rules);
      if (hints) updateData.hints = JSON.parse(hints);
      if (time_limit) updateData.time_limit = parseInt(time_limit);
      if (tags) updateData.tags = JSON.parse(tags);
      await q.update(updateData, { transaction });

      if (remove_media_ids) {
        const ids = JSON.parse(remove_media_ids);
        const medias = await MediaFile.findAll({
          where: { media_id: { [Op.in]: ids }, question_id: id },
        });
        for (const m of medias) {
          if (fs.existsSync(m.file_path)) fs.unlinkSync(m.file_path);
        }
        await MediaFile.destroy({
          where: { media_id: { [Op.in]: ids }, question_id: id },
          transaction,
        });
      }

      if (req.files && req.files.length) {
        const mediaFiles = req.files.map((file) => ({
          question_id: id,
          owner_type: "question", // Default to question owner
          answer_id: null,
          file_type: EnhancedQuestionService.getFileType(file.mimetype),
          file_name: file.filename,
          file_path: file.path,
          file_size: file.size,
          mime_type: file.mimetype,
          alt_text: req.body[`alt_text_${file.originalname}`] || "",
          description: req.body[`description_${file.originalname}`] || "",
        }));
        await MediaFile.bulkCreate(mediaFiles, { transaction });
      }

      if (answers) {
        const questionType = await QuestionType.findByPk(q.question_type_id);
        await Answer.destroy({ where: { question_id: id }, transaction });
        await EnhancedQuestionService.createAnswersByType(
          id,
          questionType.name,
          JSON.parse(answers),
          transaction
        );
      }

      await transaction.commit();
      return EnhancedQuestionService.getQuestionWithMediaInternal(
        res,
        id,
        200,
        "Cập nhật câu hỏi thành công"
      );
    } catch (err) {
      await EnhancedQuestionService.safeRollback(transaction);
      console.error("updateQuestionWithMedia error", err);
      return res
        .status(500)
        .json({
          success: false,
          message: "Lỗi khi cập nhật câu hỏi",
          error: err.message,
        });
    }
  }

  static async deleteQuestionWithMedia(req, res) {
    const transaction = await sequelize.transaction();
    try {
      const id = req.params.id;
      const q = await Question.findByPk(id, {
        include: [{ model: MediaFile, as: "MediaFiles" }],
      });
      if (!q) {
        await EnhancedQuestionService.safeRollback(transaction);
        return res
          .status(404)
          .json({ success: false, message: "Câu hỏi không tồn tại" });
      }
      if (q.MediaFiles) {
        for (const m of q.MediaFiles) {
          if (fs.existsSync(m.file_path)) fs.unlinkSync(m.file_path);
        }
      }
      await Answer.destroy({ where: { question_id: id }, transaction });
      await q.destroy({ transaction });
      await transaction.commit();
      return res
        .status(200)
        .json({ success: true, message: "Xóa câu hỏi thành công" });
    } catch (err) {
      await EnhancedQuestionService.safeRollback(transaction);
      console.error("deleteQuestionWithMedia error", err);
      return res
        .status(500)
        .json({
          success: false,
          message: "Lỗi khi xóa câu hỏi",
          error: err.message,
        });
    }
  }

  static async uploadSingleMedia(req, res) {
    try {
      const { question_id, alt_text, description } = req.body;
      if (!req.file)
        return res
          .status(400)
          .json({ success: false, message: "Không có file" });
      if (!question_id)
        return res
          .status(400)
          .json({ success: false, message: "Thiếu question_id" });
      const q = await Question.findByPk(question_id);
      if (!q)
        return res
          .status(404)
          .json({ success: false, message: "Câu hỏi không tồn tại" });
      const fileType = EnhancedQuestionService.getFileType(req.file.mimetype);
      MediaFile.validateFile(req.file, fileType);
      const media = await MediaFile.create({
        question_id: question_id,
        owner_type: "question", // Default to question owner
        answer_id: null,
        file_type: fileType,
        file_name: req.file.filename,
        file_path: req.file.path,
        file_size: req.file.size,
        mime_type: req.file.mimetype,
        alt_text: alt_text || "",
        description: description || "",
      });
      return res
        .status(201)
        .json({
          success: true,
          message: "Upload file thành công",
          data: {
            ...media.toJSON(),
            file_url: `/api/questions/media/${question_id}/${media.file_name}`,
          },
        });
    } catch (err) {
      console.error("uploadSingleMedia error", err);
      return res
        .status(500)
        .json({ success: false, message: "Lỗi upload", error: err.message });
    }
  }

  static async serveMediaFile(req, res) {
    try {
      const { questionId, filename } = req.params;
      const media = await MediaFile.findOne({
        where: { question_id: questionId, file_name: filename },
      });
      if (!media)
        return res
          .status(404)
          .json({ success: false, message: "File không tồn tại" });
      if (!fs.existsSync(media.file_path))
        return res
          .status(404)
          .json({ success: false, message: "File không tìm thấy trên server" });
      res.setHeader("Content-Type", media.mime_type);
      res.setHeader("Content-Length", media.file_size);
      fs.createReadStream(media.file_path).pipe(res);
    } catch (err) {
      console.error("serveMediaFile error", err);
      return res
        .status(500)
        .json({ success: false, message: "Lỗi tải file", error: err.message });
    }
  }

  static async getMediaStats(req, res) {
    try {
      const stats = await MediaFile.findAll({
        attributes: [
          "file_type",
          [sequelize.fn("COUNT", sequelize.col("media_id")), "count"],
          [sequelize.fn("SUM", sequelize.col("file_size")), "total_size"],
        ],
        group: ["file_type"],
      });
      return res.status(200).json({ success: true, data: stats });
    } catch (err) {
      console.error("getMediaStats error", err);
      return res
        .status(500)
        .json({ success: false, message: "Lỗi thống kê", error: err.message });
    }
  }

  static async getQuestionsAdvanced(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        lo_id,
        question_type_id,
        level_id,
        tags,
        has_media,
        search,
      } = req.query;
      const offset = (page - 1) * limit;
      const where = {};
      if (lo_id) where.lo_id = lo_id;
      if (question_type_id) where.question_type_id = question_type_id;
      if (level_id) where.level_id = level_id;
      if (tags) {
        where.tags = { [Op.contains]: tags.split(",") };
      }
      const include = [
        { model: QuestionType, attributes: ["question_type_id", "name"] },
        { model: Level, attributes: ["level_id", "name"] },
        { model: LO, as: "LO", attributes: ["lo_id", "name"] },
        {
          model: Answer,
          attributes: ["answer_id", "answer_text", "iscorrect"],
        },
        {
          model: MediaFile,
          as: "MediaFiles",
          attributes: ["media_id"],
          required: has_media === "true",
        },
      ];
      if (search) {
        where[Op.or] = [
          { question_text: { [Op.like]: `%${search}%` } },
          { "$LO.name$": { [Op.like]: `%${search}%` } },
        ];
      }
      // For has_media=false we filter by NOT EXISTS instead of relying on include null join to avoid missing FROM alias issues
      if (has_media === "false") {
        where[Op.and] = where[Op.and] || [];
        where[Op.and].push(
          sequelize.literal(
            'NOT EXISTS (SELECT 1 FROM "MediaFiles" mf WHERE mf.question_id = "Question"."question_id")'
          )
        );
      }
      const questions = await Question.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        include,
        distinct: true,
        order: [["question_id", "DESC"]],
      });
      return res
        .status(200)
        .json({
          success: true,
          data: {
            totalItems: questions.count,
            totalPages: Math.ceil(questions.count / limit),
            currentPage: parseInt(page),
            questions: questions.rows,
          },
        });
    } catch (err) {
      console.error("getQuestionsAdvanced error", err);
      return res
        .status(500)
        .json({
          success: false,
          message: "Lỗi lấy danh sách",
          error: err.message,
        });
    }
  }

  static async createAnswersByType(
    questionId,
    questionTypeName,
    answersData,
    transaction
  ) {
    const type =
      EnhancedQuestionService.normalizeQuestionTypeName(questionTypeName);
    switch (type) {
      case "code_exercise":
        // Programming/code exercise questions don't store traditional Answer rows.
        // All evaluation is done via code submissions + test cases, so nothing to create here.
        return [];
      case "multiple_choice":
        const normalized = answersData.map((a, i) => {
          const flag =
            a.is_correct !== undefined
              ? a.is_correct
              : a.iscorrect !== undefined
              ? a.iscorrect
              : a.correct !== undefined
              ? a.correct
              : false;
          return {
            question_id: questionId,
            answer_text: a.text,
            iscorrect: !!flag,
            answer_type: "text",
            display_order: i + 1,
            answer_explanation: a.explanation || null,
          };
        });
        // **MODIFIED**: Return created instances
        return await Answer.bulkCreate(normalized, {
          transaction,
          returning: true,
        });
      case "fill_in_blank":
        // **MODIFIED**: Return created instance in an array
        return [
          await Answer.create(
            {
              question_id: questionId,
              answer_text: "Fill in blank correct answers",
              answer_data: answersData,
              answer_type: "object",
              iscorrect: true,
            },
            { transaction }
          ),
        ];
      case "ordering":
        // **MODIFIED**: Return created instance in an array
        return [
          await Answer.create(
            {
              question_id: questionId,
              answer_text: "Correct order",
              answer_data: answersData,
              answer_type: "array",
              iscorrect: true,
            },
            { transaction }
          ),
        ];
      case "matching":
        // **MODIFIED**: Return created instance in an array
        return [
          await Answer.create(
            {
              question_id: questionId,
              answer_text: "Correct matches",
              answer_data: answersData,
              answer_type: "object",
              iscorrect: true,
            },
            { transaction }
          ),
        ];
      case "true_false":
        // **MODIFIED**: Return created instances
        return await Answer.bulkCreate(
          [
            {
              question_id: questionId,
              answer_text: "Đúng",
              iscorrect: answersData.correct_answer === true,
              answer_type: "boolean",
              display_order: 1,
            },
            {
              question_id: questionId,
              answer_text: "Sai",
              iscorrect: answersData.correct_answer === false,
              answer_type: "boolean",
              display_order: 2,
            },
          ],
          { transaction, returning: true }
        );
      case "essay":
        // **MODIFIED**: Return created instance in an array
        return [
          await Answer.create(
            {
              question_id: questionId,
              answer_text: "Essay rubric",
              answer_data: answersData,
              answer_type: "object",
              iscorrect: true,
            },
            { transaction }
          ),
        ];
      default:
        throw new Error("Unsupported question type");
    }
  }

  static normalizeQuestionTypeName(name) {
    if (!name) return name;
    const n = name.toString().trim().toLowerCase();
    const map = {
      // Programming / Code exercise
      code_exercise: "code_exercise",
      "code exercise": "code_exercise",
      lap_trinh: "code_exercise",
      "lập trình": "code_exercise",
      programming: "code_exercise",
      trac_nghiem: "multiple_choice",
      trắc_nghiệm: "multiple_choice",
      "trắc nghiệm": "multiple_choice",
      "multiple choice": "multiple_choice",
      mcq: "multiple_choice",
      mc: "multiple_choice",
      dien_khuyet: "fill_in_blank",
      điền_khuyết: "fill_in_blank",
      "điền khuyết": "fill_in_blank",
      "fill in blank": "fill_in_blank",
      sap_xep: "ordering",
      sắp_xếp: "ordering",
      "sắp xếp": "ordering",
      ordering: "ordering",
      matching: "matching",
      noi_dap: "matching",
      "nối đáp": "matching",
      true_false: "true_false",
      "đúng sai": "true_false",
      dung_sai: "true_false",
      essay: "essay",
      tu_luan: "essay",
      "tự luận": "essay",
    };
    return map[n] || n; // fallback to original normalized string
  }
}

module.exports = EnhancedQuestionService;
