const {
  LO,
  Chapter,
  Question,
  ChapterLO,
  Subject,
  UserQuestionHistory,
  Level,
  Quiz,
  Course,
  Answer,
  QuestionType,
  PLO,
  LOsPLO,
  sequelize,
} = require("../models");
const {
  successResponse,
  errorResponse,
  handleError,
  notFoundResponse,
  validationErrorResponse,
} = require("../utils/responseFormatter");
const { Op } = require("sequelize");
//const { sequelize } = require('../config/database');

exports.getAllLOs = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const los = await LO.findAndCountAll({
      limit: parseInt(limit),
      offset: parseInt(offset),
      include: [
        {
          model: Subject,
          as: "Subject",
          attributes: ["subject_id", "name"],
        },
        {
          model: Chapter,
          as: "Chapters",
          attributes: ["chapter_id", "name"],
          through: { attributes: [] },
        },
        {
          model: PLO,
          as: "PLOs",
          attributes: ["plo_id", "name", "program_id"],
          through: { attributes: [] },
        },
      ],
    });

    res.status(200).json({
      success: true,
      data: {
        totalItems: los.count,
        totalPages: Math.ceil(los.count / limit),
        currentPage: parseInt(page),
        los: los.rows,
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách LO:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy danh sách LO",
      error: error.message,
    });
  }
};

exports.getLOById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return successResponse(res, 400, "Thiếu ID của LO");
    }

    const lo = await LO.findByPk(id, {
      include: [
        {
          model: Chapter,
          as: "Chapters",
          attributes: ["chapter_id", "name"],
          through: { attributes: [] },
        },
        {
          model: Question,
          attributes: ["question_id", "question_text"],
        },
      ],
    });

    if (!lo) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy LO",
      });
    }

    res.status(200).json({
      success: true,
      data: lo,
    });
  } catch (error) {
    console.error("Lỗi khi lấy thông tin LO:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
};

exports.createLO = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { name, description, subject_id, chapter_ids, plo_ids } = req.body;

    if (!name) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Tên LO là bắt buộc",
      });
    }

    if (!subject_id) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "subject_id là bắt buộc",
      });
    }

    // Kiểm tra subject có tồn tại không
    const subject = await Subject.findByPk(subject_id, { transaction });
    if (!subject) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy môn học",
      });
    }

    // Kiểm tra trùng lặp tên LO trong cùng subject
    const existingLO = await LO.findOne({
      where: {
        name,
        subject_id,
      },
      transaction,
    });

    if (existingLO) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Tên LO đã tồn tại trong môn học này",
      });
    }

    // Validate optional chapter_ids
    let linkedChapters = [];
    let uniqueChapterIds = [];
    if (Array.isArray(chapter_ids) && chapter_ids.length > 0) {
      // Remove duplicates & falsy
      uniqueChapterIds = [
        ...new Set(chapter_ids.filter((id) => Number.isInteger(id))),
      ];
      if (uniqueChapterIds.length === 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Danh sách chapter_ids không hợp lệ",
        });
      }
      // Load chapters and ensure they belong to the same subject
      linkedChapters = await Chapter.findAll({
        where: { chapter_id: uniqueChapterIds },
        transaction,
      });
      if (linkedChapters.length !== uniqueChapterIds.length) {
        const found = new Set(linkedChapters.map((c) => c.chapter_id));
        const missing = uniqueChapterIds.filter((id) => !found.has(id));
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Các chapter không tồn tại: ${missing.join(", ")}`,
        });
      }
      // Subject consistency check
      const invalidSubject = linkedChapters.find(
        (ch) => ch.subject_id !== subject_id
      );
      if (invalidSubject) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Tồn tại chapter không thuộc cùng subject với LO",
        });
      }
    }

    // Validate optional plo_ids
    let linkedPLOs = [];
    let uniquePLOIds = [];
    if (Array.isArray(plo_ids) && plo_ids.length > 0) {
      // Remove duplicates & falsy
      uniquePLOIds = [
        ...new Set(plo_ids.filter((id) => Number.isInteger(id))),
      ];
      if (uniquePLOIds.length === 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Danh sách plo_ids không hợp lệ",
        });
      }
      // Load PLOs
      linkedPLOs = await PLO.findAll({
        where: { plo_id: uniquePLOIds },
        transaction,
      });
      if (linkedPLOs.length !== uniquePLOIds.length) {
        const found = new Set(linkedPLOs.map((p) => p.plo_id));
        const missing = uniquePLOIds.filter((id) => !found.has(id));
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Các PLO không tồn tại: ${missing.join(", ")}`,
        });
      }
    }

    const newLO = await LO.create(
      {
        name,
        description: description || null,
        subject_id,
      },
      { transaction }
    );

    // Create join records if provided
    if (linkedChapters.length > 0) {
      const joinRows = linkedChapters.map((ch) => ({
        chapter_id: ch.chapter_id,
        lo_id: newLO.lo_id,
      }));
      await ChapterLO.bulkCreate(joinRows, {
        transaction,
        ignoreDuplicates: true,
      });
    }

    // Create PLO join records if provided
    if (linkedPLOs.length > 0) {
      const ploJoinRows = linkedPLOs.map((plo) => ({
        plo_id: plo.plo_id,
        lo_id: newLO.lo_id,
      }));
      await LOsPLO.bulkCreate(ploJoinRows, {
        transaction,
        ignoreDuplicates: true,
      });
    }

    await transaction.commit();
    return res.status(201).json({
      success: true,
      data: {
        lo: newLO,
        linked_chapters: linkedChapters.map((ch) => ({
          chapter_id: ch.chapter_id,
          name: ch.name,
          subject_id: ch.subject_id,
        })),
        linked_plos: linkedPLOs.map((plo) => ({
          plo_id: plo.plo_id,
          name: plo.name,
          program_id: plo.program_id,
        })),
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Lỗi khi tạo LO:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
};

exports.updateLO = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { name, description, chapter_ids, plo_ids } = req.body;

    if (!id) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Thiếu ID của LO",
      });
    }

    const lo = await LO.findByPk(id, { transaction });
    if (!lo) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy LO",
      });
    }

    if (name) {
      // Kiểm tra trùng lặp tên LO
      const existingLO = await LO.findOne({
        where: {
          name,
          lo_id: { [Op.ne]: id },
        },
        transaction,
      });

      if (existingLO) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Tên LO đã tồn tại",
        });
      }
    }

    // Update basic fields
    await lo.update(
      {
        name: name || lo.name,
        description: description || lo.description,
      },
      { transaction }
    );

    // Optional chapter association update
    if (chapter_ids !== undefined) {
      if (!Array.isArray(chapter_ids)) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "chapter_ids phải là mảng",
        });
      }

      // Remove duplicates & keep only integers
      const uniqueChapterIds = [
        ...new Set(chapter_ids.filter((idVal) => Number.isInteger(idVal))),
      ];

      // Load existing linked chapters
      const existingLinks = await ChapterLO.findAll({
        where: { lo_id: id },
        attributes: ["chapter_id"],
        transaction,
      });
      const existingSet = new Set(existingLinks.map((l) => l.chapter_id));

      // Validate and load new chapters (if any expected)
      let chaptersToLink = [];
      if (uniqueChapterIds.length > 0) {
        chaptersToLink = await Chapter.findAll({
          where: { chapter_id: uniqueChapterIds },
          transaction,
        });
        if (chaptersToLink.length !== uniqueChapterIds.length) {
          const found = new Set(chaptersToLink.map((c) => c.chapter_id));
          const missing = uniqueChapterIds.filter((cid) => !found.has(cid));
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Các chapter không tồn tại: ${missing.join(", ")}`,
          });
        }
        // Subject consistency check
        const invalid = chaptersToLink.find(
          (ch) => ch.subject_id !== lo.subject_id
        );
        if (invalid) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: "Tồn tại chapter không thuộc cùng subject với LO",
          });
        }
      }

      // Determine adds & removals
      const desiredSet = new Set(uniqueChapterIds);
      const toAdd = [...desiredSet]
        .filter((cid) => !existingSet.has(cid))
        .map((cid) => ({ chapter_id: cid, lo_id: Number(id) }));
      const toRemove = [...existingSet].filter((cid) => !desiredSet.has(cid));

      if (toAdd.length > 0) {
        await ChapterLO.bulkCreate(toAdd, {
          transaction,
          ignoreDuplicates: true,
        });
      }
      if (toRemove.length > 0) {
        await ChapterLO.destroy({
          where: { lo_id: id, chapter_id: toRemove },
          transaction,
        });
      }
    }

    // Optional PLO association update
    if (plo_ids !== undefined) {
      if (!Array.isArray(plo_ids)) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "plo_ids phải là mảng",
        });
      }

      // Remove duplicates & keep only integers
      const uniquePLOIds = [
        ...new Set(plo_ids.filter((idVal) => Number.isInteger(idVal))),
      ];

      // Load existing linked PLOs
      const existingPLOLinks = await LOsPLO.findAll({
        where: { lo_id: id },
        attributes: ["plo_id"],
        transaction,
      });
      const existingPLOSet = new Set(existingPLOLinks.map((l) => l.plo_id));

      // Validate and load new PLOs (if any expected)
      let plosToLink = [];
      if (uniquePLOIds.length > 0) {
        plosToLink = await PLO.findAll({
          where: { plo_id: uniquePLOIds },
          transaction,
        });
        if (plosToLink.length !== uniquePLOIds.length) {
          const found = new Set(plosToLink.map((p) => p.plo_id));
          const missing = uniquePLOIds.filter((pid) => !found.has(pid));
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Các PLO không tồn tại: ${missing.join(", ")}`,
          });
        }
      }

      // Determine adds & removals
      const desiredPLOSet = new Set(uniquePLOIds);
      const ploToAdd = [...desiredPLOSet]
        .filter((pid) => !existingPLOSet.has(pid))
        .map((pid) => ({ plo_id: pid, lo_id: Number(id) }));
      const ploToRemove = [...existingPLOSet].filter((pid) => !desiredPLOSet.has(pid));

      if (ploToAdd.length > 0) {
        await LOsPLO.bulkCreate(ploToAdd, {
          transaction,
          ignoreDuplicates: true,
        });
      }
      if (ploToRemove.length > 0) {
        await LOsPLO.destroy({
          where: { lo_id: id, plo_id: ploToRemove },
          transaction,
        });
      }
    }

    // Reload LO with associations after update
    const updatedLO = await LO.findByPk(id, {
      transaction,
      include: [
        {
          model: Chapter,
          as: "Chapters",
          attributes: ["chapter_id", "name"],
          through: { attributes: [] },
        },
        {
          model: Subject,
          as: "Subject",
          attributes: ["subject_id", "name"],
        },
        {
          model: PLO,
          as: "PLOs",
          attributes: ["plo_id", "name", "program_id"],
          through: { attributes: [] },
        },
      ],
    });

    await transaction.commit();
    res.status(200).json({
      success: true,
      data: updatedLO,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Lỗi khi cập nhật LO:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
};

exports.deleteLO = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;

    if (!id) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Thiếu ID của LO",
      });
    }

    const lo = await LO.findByPk(id, { transaction });
    if (!lo) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy LO",
      });
    }

    // Lấy tất cả questions liên quan đến LO này
    const questions = await Question.findAll({
      where: { lo_id: id },
      attributes: ["question_id"],
      transaction,
    });
    const questionIds = questions.map((q) => q.question_id);

    if (questionIds.length > 0) {
      console.log(
        `Deleting ${questionIds.length} questions related to LO ${id}`
      );

      // Xóa tất cả answers của các questions này
      await Answer.destroy({
        where: { question_id: questionIds },
        transaction,
      });

      // Xóa tất cả user question history của các questions này
      await UserQuestionHistory.destroy({
        where: { question_id: questionIds },
        transaction,
      });

      // Xóa các questions khỏi quiz (many-to-many relationship)
      const { QuizQuestion } = require("../models");
      await QuizQuestion.destroy({
        where: { question_id: questionIds },
        transaction,
      });

      // Xóa tất cả questions thuộc LO này
      await Question.destroy({
        where: { lo_id: id },
        transaction,
      });
    }

    // Xóa các liên kết với chapters (ChapterLO)
    await ChapterLO.destroy({
      where: { lo_id: id },
      transaction,
    });

    // Xóa LO
    await lo.destroy({ transaction });
    await transaction.commit();

    res.status(200).json({
      success: true,
      message: `Xóa LO và ${questionIds.length} câu hỏi liên quan thành công`,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Lỗi khi xóa LO:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
};

// NEW: Get LOs by subject using direct relationship (Enhanced)
exports.getLOsBySubjectDirect = async (req, res) => {
  try {
    const startTime = Date.now();
    const { subject_id } = req.params;
    const {
      page = 1,
      limit = 10,
      include_stats = true,
      include_questions = true,
    } = req.query;
    const offset = (page - 1) * limit;

    if (!subject_id) {
      return res.status(400).json({
        success: false,
        message: "Thiếu subject_id",
      });
    }

    // Kiểm tra subject có tồn tại không
    const subject = await Subject.findByPk(subject_id);
    if (!subject) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy môn học",
      });
    }

    // Build include array based on query parameters
    const includeArray = [
      {
        model: Subject,
        as: "Subject",
        attributes: ["subject_id", "name", "description"],
      },
    ];

    // Add Chapters if needed
    includeArray.push({
      model: Chapter,
      as: "Chapters",
      attributes: ["chapter_id", "name", "description"],
      through: { attributes: [] },
    });

    // Add Questions if requested
    if (include_questions === "true") {
      includeArray.push({
        model: Question,
        attributes: [
          "question_id",
          "question_text",
          "level_id",
          "question_type_id",
        ],
        include: [
          {
            model: Level,
            attributes: ["level_id", "name"],
          },
          {
            model: QuestionType,
            attributes: ["question_type_id", "name"],
          },
        ],
      });
    }

    // Lấy LOs trực tiếp theo subject_id
    const los = await LO.findAndCountAll({
      where: { subject_id },
      limit: parseInt(limit),
      offset: parseInt(offset),
      include: includeArray,
      order: [["lo_id", "ASC"]],
    });

    // Get statistics if requested
    let statistics = null;
    if (include_stats === "true") {
      const [totalQuestions, totalChapterLORelations, avgQuestionsPerLO] =
        await Promise.all([
          // Total questions for this subject's LOs
          Question.count({
            include: [
              {
                model: LO,
                where: { subject_id },
                attributes: [],
              },
            ],
          }),

          // Total Chapter-LO relationships for this subject
          sequelize.query(
            `
                    SELECT COUNT(*) as count
                    FROM "ChapterLO" cl
                    INNER JOIN "LOs" l ON cl.lo_id = l.lo_id
                    WHERE l.subject_id = :subject_id
                `,
            {
              replacements: { subject_id },
              type: sequelize.QueryTypes.SELECT,
            }
          ),

          // Average questions per LO
          sequelize.query(
            `
                    SELECT AVG(question_count) as avg_questions
                    FROM (
                        SELECT COUNT(q.question_id) as question_count
                        FROM "LOs" l
                        LEFT JOIN "Questions" q ON l.lo_id = q.lo_id
                        WHERE l.subject_id = :subject_id
                        GROUP BY l.lo_id
                    ) subquery
                `,
            {
              replacements: { subject_id },
              type: sequelize.QueryTypes.SELECT,
            }
          ),
        ]);

      statistics = {
        total_los: los.count,
        total_questions: totalQuestions,
        total_chapter_relations: totalChapterLORelations[0].count,
        avg_questions_per_lo: Math.round(
          avgQuestionsPerLO[0].avg_questions || 0
        ),
        query_method: "direct_relationship",
        performance: {
          query_time_ms: Date.now() - startTime,
          method: "SELECT * FROM LOs WHERE subject_id = ?",
        },
      };
    }

    // Calculate performance metrics
    const endTime = Date.now();
    const queryTime = endTime - startTime;

    res.status(200).json({
      success: true,
      message: "Lấy danh sách LO thành công (Direct Relationship)",
      method: "ENHANCED_DIRECT_QUERY",
      performance: {
        query_time_ms: queryTime,
        query_method: "direct_subject_id_lookup",
        optimized: true,
      },
      data: {
        totalItems: los.count,
        totalPages: Math.ceil(los.count / limit),
        currentPage: parseInt(page),
        subject: {
          subject_id: subject.subject_id,
          name: subject.name,
          description: subject.description,
        },
        statistics,
        los: los.rows.map((lo) => ({
          ...lo.toJSON(),
          question_count: lo.Questions ? lo.Questions.length : 0,
          chapter_count: lo.Chapters ? lo.Chapters.length : 0,
          has_direct_subject_relation: true,
        })),
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy LO theo subject (Direct):", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
};

exports.getLOsBySubject = async (req, res) => {
  try {
    const startTime = Date.now();
    const { subjectId } = req.params;
    const { page = 1, limit = 10, include_performance = false } = req.query;
    const offset = (page - 1) * limit;

    if (!subjectId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu ID của môn học",
      });
    }

    // Kiểm tra subject có tồn tại không
    const subject = await Subject.findByPk(subjectId);
    if (!subject) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy môn học",
      });
    }

    // 1. Lấy danh sách chapter theo subject
    const chapters = await Chapter.findAll({
      where: { subject_id: subjectId },
      attributes: ["chapter_id"],
    });

    if (!chapters.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy chương nào thuộc môn học này",
      });
    }

    const chapterIds = chapters.map((ch) => ch.chapter_id);

    // 2. Lấy danh sách ChapterLO theo các chapter_id
    const chapterLOs = await ChapterLO.findAll({
      where: { chapter_id: { [Op.in]: chapterIds } },
      attributes: ["lo_id"],
    });

    if (!chapterLOs.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy LO nào liên kết với môn học này",
      });
    }

    const loIds = [...new Set(chapterLOs.map((clo) => clo.lo_id))];

    // 3. Lấy danh sách LO với pagination
    const { count, rows: los } = await LO.findAndCountAll({
      where: { lo_id: { [Op.in]: loIds } },
      include: [
        {
          model: Chapter,
          as: "Chapters",
          attributes: ["chapter_id", "name"],
          through: { attributes: [] },
        },
        {
          model: Question,
          attributes: ["question_id", "question_text"],
          limit: 3, // Preview questions
        },
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    const endTime = Date.now();
    const queryTime = endTime - startTime;

    const response = {
      success: true,
      message: "Lấy danh sách LO thành công (Legacy Method)",
      method: "LEGACY_COMPLEX_QUERY",
      data: {
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: parseInt(page),
        subject: {
          subject_id: subject.subject_id,
          name: subject.name,
        },
        los: los.map((lo) => ({
          ...lo.toJSON(),
          question_count: lo.Questions ? lo.Questions.length : 0,
          chapter_count: lo.Chapters ? lo.Chapters.length : 0,
          has_direct_subject_relation: !!lo.subject_id,
        })),
      },
    };

    // Add performance metrics if requested
    if (include_performance === "true") {
      response.performance = {
        query_time_ms: queryTime,
        query_method: "complex_join_via_chapters",
        query_steps: [
          "1. Find chapters by subject_id",
          "2. Find ChapterLO relationships",
          "3. Find LOs by chapter relationships",
          "4. Include additional data",
        ],
        optimized: false,
        db_operations: 3,
      };
    }

    return successResponse(res, 200, "Thành công", response);
  } catch (error) {
    console.error("Lỗi khi lấy LO theo Subject:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
};

// NEW: Performance comparison endpoint
exports.compareLOQueryMethods = async (req, res) => {
  try {
    const { subject_id } = req.params;
    const { iterations = 1 } = req.query;

    if (!subject_id) {
      return res.status(400).json({
        success: false,
        message: "Thiếu subject_id",
      });
    }

    // Verify subject exists
    const subject = await Subject.findByPk(subject_id);
    if (!subject) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy môn học",
      });
    }

    const results = {
      subject: {
        subject_id: subject.subject_id,
        name: subject.name,
      },
      iterations: parseInt(iterations),
      methods: {},
      summary: {},
    };

    // Test Legacy Method
    const legacyTimes = [];
    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();

      // Legacy method steps
      const chapters = await Chapter.findAll({
        where: { subject_id },
        attributes: ["chapter_id"],
      });

      const chapterIds = chapters.map((ch) => ch.chapter_id);

      const chapterLOs = await ChapterLO.findAll({
        where: { chapter_id: { [Op.in]: chapterIds } },
        attributes: ["lo_id"],
      });

      const loIds = [...new Set(chapterLOs.map((clo) => clo.lo_id))];

      const los = await LO.findAll({
        where: { lo_id: { [Op.in]: loIds } },
        attributes: ["lo_id", "name"],
      });

      const endTime = Date.now();
      legacyTimes.push(endTime - startTime);
    }

    // Test Direct Method
    const directTimes = [];
    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();

      // Direct method
      const los = await LO.findAll({
        where: { subject_id },
        attributes: ["lo_id", "name"],
      });

      const endTime = Date.now();
      directTimes.push(endTime - startTime);
    }

    // Calculate statistics
    const avgLegacy =
      legacyTimes.reduce((a, b) => a + b, 0) / legacyTimes.length;
    const avgDirect =
      directTimes.reduce((a, b) => a + b, 0) / directTimes.length;
    const improvement = ((avgLegacy - avgDirect) / avgLegacy) * 100;

    results.methods = {
      legacy: {
        name: "Legacy Complex Join Method",
        avg_time_ms: Math.round(avgLegacy * 100) / 100,
        min_time_ms: Math.min(...legacyTimes),
        max_time_ms: Math.max(...legacyTimes),
        all_times: legacyTimes,
        query_steps: 4,
        db_operations: 3,
        complexity: "HIGH",
      },
      direct: {
        name: "Direct Subject ID Method",
        avg_time_ms: Math.round(avgDirect * 100) / 100,
        min_time_ms: Math.min(...directTimes),
        max_time_ms: Math.max(...directTimes),
        all_times: directTimes,
        query_steps: 1,
        db_operations: 1,
        complexity: "LOW",
      },
    };

    results.summary = {
      performance_improvement_percent: Math.round(improvement * 100) / 100,
      faster_method: improvement > 0 ? "direct" : "legacy",
      speed_multiplier: Math.round((avgLegacy / avgDirect) * 100) / 100,
      recommendation:
        improvement > 30 ? "USE_DIRECT_METHOD" : "BOTH_METHODS_ACCEPTABLE",
      migration_success: improvement > 0 ? "SUCCESSFUL" : "NEEDS_REVIEW",
    };

    res.status(200).json({
      success: true,
      message: "Performance comparison completed",
      data: results,
    });
  } catch (error) {
    console.error("Lỗi khi so sánh performance:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
};

// =====================================================
// NEW ADMIN FUNCTIONS FOR STATISTICS AND ANALYTICS
// =====================================================

// Lấy thống kê tổng quan về LO
exports.getLOStatistics = async (req, res) => {
  try {
    const { program_id, subject_id, time_period } = req.query;

    // Build where clause
    let whereClause = {};
    if (program_id) {
      // Get subjects in program first
      const subjects = await Subject.findAll({
        include: [
          {
            model: Course,
            where: { program_id },
          },
        ],
        attributes: ["subject_id"],
      });
      const subjectIds = subjects.map((s) => s.subject_id);

      // Get chapters in those subjects
      const chapters = await Chapter.findAll({
        where: { subject_id: { [Op.in]: subjectIds } },
        attributes: ["chapter_id"],
      });
      const chapterIds = chapters.map((c) => c.chapter_id);

      // Filter LOs by chapters
      if (chapterIds.length > 0) {
        const chapterLOs = await ChapterLO.findAll({
          where: { chapter_id: { [Op.in]: chapterIds } },
          attributes: ["lo_id"],
        });
        const loIds = chapterLOs.map((cl) => cl.lo_id);
        whereClause.lo_id = { [Op.in]: loIds };
      }
    }

    // Get total LOs
    const totalLOs = await LO.count({ where: whereClause });

    // Get LOs with questions
    const losWithQuestions = await LO.count({
      where: whereClause,
      include: [
        {
          model: Question,
          required: true,
        },
      ],
    });

    // Get question statistics
    const questionStats = await Question.findAll({
      include: [
        {
          model: LO,
          where: whereClause,
          attributes: ["lo_id", "name"],
        },
        {
          model: Level,
          as: "Level",
          attributes: ["name"],
        },
      ],
      attributes: ["question_id", "lo_id"],
    });

    // Process statistics
    const loQuestionCount = {};
    const difficultyDistribution = { easy: 0, medium: 0, hard: 0 };

    questionStats.forEach((question) => {
      const lo_id = question.lo_id;
      loQuestionCount[lo_id] = (loQuestionCount[lo_id] || 0) + 1;

      const difficulty = question.Level?.name?.toLowerCase() || "medium";
      if (difficultyDistribution[difficulty] !== undefined) {
        difficultyDistribution[difficulty]++;
      }
    });

    return successResponse(res, 200, "Thành công", {
      overview: {
        total_los: totalLOs,
        los_with_questions: losWithQuestions,
        los_without_questions: totalLOs - losWithQuestions,
        total_questions: questionStats.length,
        average_questions_per_lo:
          totalLOs > 0 ? (questionStats.length / totalLOs).toFixed(2) : 0,
      },
      difficulty_distribution: difficultyDistribution,
      lo_question_distribution: loQuestionCount,
      generated_at: new Date(),
    });
  } catch (error) {
    console.error("Error getting LO statistics:", error);
    return handleError(res, error, "Lỗi khi lấy thống kê LO");
  }
};

// Phân tích hiệu suất LO
exports.getLOPerformanceAnalysis = async (req, res) => {
  try {
    const { program_id, subject_id, time_period } = req.query;
    const { start_date, end_date } = time_period || {};

    // Build where clause for UserQuestionHistory
    let historyWhereClause = {};
    if (start_date && end_date) {
      historyWhereClause.attempt_date = {
        [Op.between]: [start_date, end_date],
      };
    }

    // Get performance data
    const performanceData = await UserQuestionHistory.findAll({
      where: historyWhereClause,
      include: [
        {
          model: Question,
          as: "Question",
          include: [
            {
              model: LO,
              as: "LO",
              attributes: ["lo_id", "name", "description"],
            },
            {
              model: Level,
              as: "Level",
              attributes: ["name"],
            },
          ],
        },
      ],
      attributes: [
        "user_id",
        "question_id",
        "is_correct",
        "time_spent",
        "attempt_date",
      ],
    });

    // Process performance by LO
    const loPerformance = {};

    performanceData.forEach((history) => {
      const lo = history.Question?.LO;
      if (!lo) return;

      const lo_id = lo.lo_id;
      if (!loPerformance[lo_id]) {
        loPerformance[lo_id] = {
          lo_info: {
            lo_id: lo.lo_id,
            name: lo.name,
            description: lo.description,
          },
          total_attempts: 0,
          correct_attempts: 0,
          unique_students: new Set(),
          total_time: 0,
          difficulty_breakdown: { easy: 0, medium: 0, hard: 0 },
        };
      }

      const data = loPerformance[lo_id];
      data.total_attempts++;
      data.unique_students.add(history.user_id);

      if (history.is_correct) {
        data.correct_attempts++;
      }

      if (history.time_spent) {
        data.total_time += history.time_spent;
      }

      // Track difficulty
      const difficulty =
        history.Question.Level?.name?.toLowerCase() || "medium";
      if (data.difficulty_breakdown[difficulty] !== undefined) {
        data.difficulty_breakdown[difficulty]++;
      }
    });

    // Calculate final metrics
    const results = Object.keys(loPerformance).map((lo_id) => {
      const data = loPerformance[lo_id];
      return {
        ...data.lo_info,
        performance_metrics: {
          total_attempts: data.total_attempts,
          unique_students: data.unique_students.size,
          accuracy_rate:
            data.total_attempts > 0
              ? ((data.correct_attempts / data.total_attempts) * 100).toFixed(2)
              : 0,
          average_time:
            data.total_attempts > 0
              ? Math.round(data.total_time / data.total_attempts)
              : 0,
          difficulty_breakdown: data.difficulty_breakdown,
        },
      };
    });

    // Sort by accuracy rate
    results.sort(
      (a, b) =>
        b.performance_metrics.accuracy_rate -
        a.performance_metrics.accuracy_rate
    );

    res.json({
      success: true,
      data: {
        total_los_analyzed: results.length,
        performance_analysis: results,
        summary: {
          best_performing_lo: results[0] || null,
          worst_performing_lo: results[results.length - 1] || null,
          average_accuracy:
            results.length > 0
              ? (
                  results.reduce(
                    (sum, lo) =>
                      sum + parseFloat(lo.performance_metrics.accuracy_rate),
                    0
                  ) / results.length
                ).toFixed(2)
              : 0,
        },
        generated_at: new Date(),
      },
    });
  } catch (error) {
    console.error("Error getting LO performance analysis:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi phân tích hiệu suất LO",
      error: error.message,
    });
  }
};

// Thống kê câu hỏi theo LO
exports.getLOQuestionStatistics = async (req, res) => {
  try {
    const { id } = req.params;

    const lo = await LO.findByPk(id, {
      include: [
        {
          model: Question,
          include: [
            {
              model: Level,
              as: "Level",
              attributes: ["name"],
            },
            {
              model: UserQuestionHistory,
              attributes: ["user_id", "is_correct", "time_spent"],
            },
          ],
        },
      ],
    });

    if (!lo) {
      return res.status(404).json({
        success: false,
        message: "LO không tồn tại",
      });
    }

    const questionStats = lo.Questions.map((question) => {
      const histories = question.UserQuestionHistories || [];
      const totalAttempts = histories.length;
      const correctAttempts = histories.filter((h) => h.is_correct).length;
      const uniqueStudents = new Set(histories.map((h) => h.user_id)).size;
      const avgTime =
        histories.length > 0
          ? histories.reduce((sum, h) => sum + (h.time_spent || 0), 0) /
            histories.length
          : 0;

      return {
        question_id: question.question_id,
        question_text: question.question_text,
        difficulty: question.Level?.name || "Unknown",
        statistics: {
          total_attempts: totalAttempts,
          correct_attempts: correctAttempts,
          accuracy_rate:
            totalAttempts > 0
              ? ((correctAttempts / totalAttempts) * 100).toFixed(2)
              : 0,
          unique_students: uniqueStudents,
          average_time: Math.round(avgTime),
        },
      };
    });

    res.json({
      success: true,
      data: {
        lo_info: {
          lo_id: lo.lo_id,
          name: lo.name,
          description: lo.description,
        },
        total_questions: questionStats.length,
        question_statistics: questionStats,
        summary: {
          total_attempts: questionStats.reduce(
            (sum, q) => sum + q.statistics.total_attempts,
            0
          ),
          average_accuracy:
            questionStats.length > 0
              ? (
                  questionStats.reduce(
                    (sum, q) => sum + parseFloat(q.statistics.accuracy_rate),
                    0
                  ) / questionStats.length
                ).toFixed(2)
              : 0,
          most_difficult_question:
            questionStats.sort(
              (a, b) =>
                parseFloat(a.statistics.accuracy_rate) -
                parseFloat(b.statistics.accuracy_rate)
            )[0] || null,
        },
        generated_at: new Date(),
      },
    });
  } catch (error) {
    console.error("Error getting LO question statistics:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy thống kê câu hỏi LO",
      error: error.message,
    });
  }
};

// Bulk create LOs
exports.bulkCreateLOs = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { los } = req.body; // Array of LO objects

    if (!Array.isArray(los) || los.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Danh sách LO không hợp lệ",
      });
    }

    // Validate each LO
    for (const lo of los) {
      if (!lo.name) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Tên LO là bắt buộc cho tất cả LO",
        });
      }
    }

    // Check for duplicate names
    const names = los.map((lo) => lo.name);
    const existingLOs = await LO.findAll({
      where: { name: { [Op.in]: names } },
      transaction,
    });

    if (existingLOs.length > 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Một số tên LO đã tồn tại",
        data: {
          duplicates: existingLOs.map((lo) => lo.name),
        },
      });
    }

    // Create LOs
    const createdLOs = await LO.bulkCreate(los, { transaction });
    await transaction.commit();

    res.status(201).json({
      success: true,
      message: `Đã tạo thành công ${createdLOs.length} LO`,
      data: {
        created_los: createdLOs,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error bulk creating LOs:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi tạo hàng loạt LO",
      error: error.message,
    });
  }
};

// Bulk update LOs
exports.bulkUpdateLOs = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { updates } = req.body; // Array of {lo_id, name, description}

    if (!Array.isArray(updates) || updates.length === 0) {
      await transaction.rollback();
      return successResponse(res, 400, "Danh sách cập nhật không hợp lệ");
    }

    const results = [];
    for (const update of updates) {
      const { lo_id, name, description } = update;

      if (!lo_id) {
        continue; // Skip invalid entries
      }

      const lo = await LO.findByPk(lo_id, { transaction });
      if (lo) {
        await lo.update(
          {
            name: name || lo.name,
            description:
              description !== undefined ? description : lo.description,
          },
          { transaction }
        );
        results.push(lo);
      }
    }

    await transaction.commit();

    return successResponse(res, 200, "Thành công", {
      message: `Đã cập nhật thành công ${results.length} LO`,
      updated_los: results,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error bulk updating LOs:", error);
    return handleError(res, error, "Lỗi khi cập nhật hàng loạt LO");
  }
};

// Bulk delete LOs
exports.bulkDeleteLOs = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { lo_ids } = req.body; // Array of LO IDs

    if (!Array.isArray(lo_ids) || lo_ids.length === 0) {
      await transaction.rollback();
      return successResponse(res, 400, "Danh sách ID LO không hợp lệ");
    }

    // Check if any LO has associated questions
    const losWithQuestions = await LO.findAll({
      where: { lo_id: { [Op.in]: lo_ids } },
      include: [
        {
          model: Question,
          required: true,
          attributes: ["question_id"],
        },
      ],
      transaction,
    });

    if (losWithQuestions.length > 0) {
      await transaction.rollback();
      return successResponse(res, 400, "Hoàn tất", {
        message: "Không thể xóa LO có câu hỏi liên quan",
        los_with_questions: losWithQuestions.map((lo) => ({
          lo_id: lo.lo_id,
          name: lo.name,
          question_count: lo.Questions.length,
        })),
      });
    }

    // Delete LOs
    const deletedCount = await LO.destroy({
      where: { lo_id: { [Op.in]: lo_ids } },
      transaction,
    });

    await transaction.commit();

    return successResponse(res, 200, "Thành công", {
      message: `Đã xóa thành công ${deletedCount} LO`,
      deleted_count: deletedCount,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error bulk deleting LOs:", error);
    return handleError(res, error, "Lỗi khi xóa hàng loạt LO");
  }
};

// =====================================================
// LO-PLO RELATIONSHIP MANAGEMENT
// =====================================================

/**
 * Add PLOs to an LO
 * POST /api/los/:id/plos
 * Body: { plo_ids: [1, 2, 3] }
 */
exports.addPLOsToLO = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { plo_ids } = req.body;

    if (!Array.isArray(plo_ids) || plo_ids.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "plo_ids phải là mảng và không được rỗng",
      });
    }

    const lo = await LO.findByPk(id, { transaction });
    if (!lo) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy LO",
      });
    }

    // Remove duplicates & validate
    const uniquePLOIds = [...new Set(plo_ids.filter((id) => Number.isInteger(id)))];
    if (uniquePLOIds.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Danh sách plo_ids không hợp lệ",
      });
    }

    // Load PLOs
    const plos = await PLO.findAll({
      where: { plo_id: uniquePLOIds },
      transaction,
    });

    if (plos.length !== uniquePLOIds.length) {
      const found = new Set(plos.map((p) => p.plo_id));
      const missing = uniquePLOIds.filter((id) => !found.has(id));
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Các PLO không tồn tại: ${missing.join(", ")}`,
      });
    }

    // Create join records (ignore duplicates)
    const joinRows = plos.map((plo) => ({
      plo_id: plo.plo_id,
      lo_id: Number(id),
    }));

    const createdCount = await LOsPLO.bulkCreate(joinRows, {
      transaction,
      ignoreDuplicates: true,
    });

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: `Đã thêm ${createdCount.length} mối quan hệ LO-PLO`,
      data: {
        lo_id: id,
        added_plos: plos.map((plo) => ({
          plo_id: plo.plo_id,
          name: plo.name,
        })),
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error adding PLOs to LO:", error);
    return handleError(res, error, "Lỗi khi thêm PLO vào LO");
  }
};

/**
 * Remove PLOs from an LO
 * DELETE /api/los/:id/plos
 * Body: { plo_ids: [1, 2, 3] }
 */
exports.removePLOsFromLO = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { plo_ids } = req.body;

    if (!Array.isArray(plo_ids) || plo_ids.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "plo_ids phải là mảng và không được rỗng",
      });
    }

    const lo = await LO.findByPk(id, { transaction });
    if (!lo) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy LO",
      });
    }

    // Remove duplicates & validate
    const uniquePLOIds = [...new Set(plo_ids.filter((id) => Number.isInteger(id)))];

    // Delete relationships
    const deletedCount = await LOsPLO.destroy({
      where: {
        lo_id: id,
        plo_id: uniquePLOIds,
      },
      transaction,
    });

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: `Đã xóa ${deletedCount} mối quan hệ LO-PLO`,
      data: {
        lo_id: id,
        removed_plo_ids: uniquePLOIds,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error removing PLOs from LO:", error);
    return handleError(res, error, "Lỗi khi xóa PLO khỏi LO");
  }
};

/**
 * Get PLOs of an LO
 * GET /api/los/:id/plos
 */
exports.getPLOsOfLO = async (req, res) => {
  try {
    const { id } = req.params;

    const lo = await LO.findByPk(id, {
      include: [
        {
          model: PLO,
          as: "PLOs",
          attributes: ["plo_id", "name", "description", "program_id"],
          through: { attributes: [] },
          include: [
            {
              model: Program,
              attributes: ["program_id", "name"],
            },
          ],
        },
      ],
    });

    if (!lo) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy LO",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        lo: {
          lo_id: lo.lo_id,
          name: lo.name,
          subject_id: lo.subject_id,
        },
        plos: lo.PLOs,
      },
    });
  } catch (error) {
    console.error("Error getting PLOs of LO:", error);
    return handleError(res, error, "Lỗi khi lấy danh sách PLO của LO");
  }
};
