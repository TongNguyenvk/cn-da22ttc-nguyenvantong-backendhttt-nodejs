// controllers/quizController.js
const moment = require("moment");
const {
  setCache,
  getCache,
  deleteCache,
  deleteCacheByPattern,
} = require("../redis/utils");
const questionController = require("./questionController"); // Import để gọi fetchQuestionsByLOs
const {
  sequelize,
  Quiz,
  Subject,
  QuizQuestion,
  Question,
  QuizResult,
  User,
  LO,
  Answer,
  QuestionType,
  Level,
  Course,
  QuizSession,
  UserQuizTracking,
  UserQuestionHistory,
  QuizAnalytics,
  MediaFile,
} = require("../models");
const { Op, literal } = require("sequelize");
const QuizRealtimeService = require("../services/quizRealtimeService");
const DynamicScoringService = require("../services/dynamicScoringService");
const QuizModeService = require("../services/quizModeService");
const AnswerChoiceStatsService = require("../services/answerChoiceStatsService");
const admin = require("firebase-admin");
const db = admin.database();

// Khai báo biến io toàn cục
let io = null;
let quizRealtimeService = null;
let answerChoiceStatsService = null;

// Hàm tạo mã PIN ngẫu nhiên
const generatePin = async () => {
  const generateRandomPin = () =>
    Math.floor(100000 + Math.random() * 900000).toString();

  let pin;
  let isUnique = false;

  while (!isUnique) {
    pin = generateRandomPin();
    const existingQuiz = await Quiz.findOne({ where: { pin } });
    if (!existingQuiz) {
      isUnique = true;
    }
  }

  return pin;
};

const fetchQuestionsByLOs = async (
  loIds,
  totalQuestions,
  difficultyRatio,
  type = null,
  quizId = null
) => {
  // Kiểm tra đầu vào
  if (!Array.isArray(loIds) || loIds.length === 0) {
    throw new Error("loIds phải là một mảng không rỗng");
  }
  if (!Number.isInteger(totalQuestions) || totalQuestions <= 0) {
    throw new Error("totalQuestions phải là số nguyên dương");
  }
  if (!difficultyRatio || typeof difficultyRatio !== "object") {
    throw new Error("difficultyRatio phải là một object");
  }

  // Nếu số LO lớn hơn số câu yêu cầu, chỉ chọn ngẫu nhiên N LO
  let filteredLoIds = loIds;
  if (loIds.length > totalQuestions) {
    // Trộn ngẫu nhiên và lấy N LO
    filteredLoIds = loIds
      .map((lo) => ({ lo, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .slice(0, totalQuestions)
      .map(({ lo }) => lo);
  }

  const { easy = 0, medium = 0, hard = 0 } = difficultyRatio;
  const totalRatio = easy + medium + hard;
  if (totalRatio !== 100) {
    throw new Error("Tổng tỷ lệ (easy + medium + hard) phải bằng 100");
  }

  // Tính số lượng câu hỏi cho từng mức độ khó
  let easyCount = Math.round((easy / 100) * totalQuestions);
  let mediumCount = Math.round((medium / 100) * totalQuestions);
  let hardCount = totalQuestions - easyCount - mediumCount;

  const questions = [];
  const excludeQuestionIds = new Set();

  // Hàm tạo số ngẫu nhiên dựa trên quizId
  const seededRandom = (index) => {
    if (!quizId) return Math.random();
    // Sử dụng quizId và index để tạo seed
    const seed = quizId + index;
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  // Bước 1: Đảm bảo mỗi LO có ít nhất 1 câu hỏi
  for (const loId of filteredLoIds) {
    let picked = null;
    const levelOrder = [1, 2, 3];
    for (const levelId of levelOrder) {
      const whereClause = {
        lo_id: loId,
        level_id: levelId,
        ...(type && { question_type_id: type }),
        question_id: { [Op.notIn]: Array.from(excludeQuestionIds) },
      };
      const found = await Question.findAll({
        attributes: [
          "question_id",
          "question_type_id",
          "level_id",
          "question_text",
          "lo_id",
          "explanation",
        ],
        where: whereClause,
        include: [
          { model: LO, as: "LO", attributes: ["lo_id", "name"] },
          {
            model: Answer,
            as: "Answers",
            attributes: ["answer_id", "answer_text", "iscorrect"],
          },
          {
            model: QuestionType,
            as: "QuestionType",
            attributes: ["question_type_id", "name"],
          },
          { model: Level, as: "Level", attributes: ["level_id", "name"] },
        ],
      });
      if (found.length > 0) {
        picked = found[Math.floor(Math.random() * found.length)];
        if (levelId === 1 && easyCount > 0) easyCount--;
        else if (levelId === 2 && mediumCount > 0) mediumCount--;
        else if (levelId === 3 && hardCount > 0) hardCount--;
        break;
      }
    }
    if (!picked) {
      throw new Error(`Không đủ câu hỏi cho LO ${loId}`);
    }
    questions.push(picked);
    excludeQuestionIds.add(picked.question_id);
  }

  // Hàm lấy câu hỏi ngẫu nhiên cho một mức độ khó
  const fetchQuestionsByDifficulty = async (levelId, count) => {
    if (count <= 0) return [];
    const allQuestions = await Question.findAll({
      attributes: [
        "question_id",
        "question_type_id",
        "level_id",
        "question_text",
        "lo_id",
        "explanation",
      ],
      where: {
        lo_id: { [Op.in]: filteredLoIds },
        level_id: levelId,
        question_id: { [Op.notIn]: Array.from(excludeQuestionIds) },
        ...(type && { question_type_id: type }),
      },
      include: [
        { model: LO, as: "LO", attributes: ["lo_id", "name"] },
        {
          model: Answer,
          as: "Answers",
          attributes: ["answer_id", "answer_text", "iscorrect"],
        },
        {
          model: QuestionType,
          as: "QuestionType",
          attributes: ["question_type_id", "name"],
        },
        { model: Level, as: "Level", attributes: ["level_id", "name"] },
      ],
    });
    const shuffledQuestions = allQuestions
      .map((q, index) => ({ q, sort: seededRandom(index) }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ q }) => q)
      .slice(0, count);
    shuffledQuestions.forEach((q) => excludeQuestionIds.add(q.question_id));
    return shuffledQuestions;
  };

  // Lấy câu hỏi dễ (level_id = 1)
  let easyQuestions = await fetchQuestionsByDifficulty(1, easyCount);
  questions.push(...easyQuestions);
  // Lấy câu hỏi trung bình (level_id = 2)
  let mediumQuestions = await fetchQuestionsByDifficulty(2, mediumCount);
  questions.push(...mediumQuestions);
  // Lấy câu hỏi khó (level_id = 3)
  let hardQuestions = await fetchQuestionsByDifficulty(3, hardCount);
  questions.push(...hardQuestions);

  // Nếu không đủ câu hỏi, thử lấy thêm từ các mức độ khác
  let remainingCount = totalQuestions - questions.length;
  if (remainingCount > 0) {
    const additionalMedium = await fetchQuestionsByDifficulty(
      2,
      remainingCount
    );
    questions.push(...additionalMedium);
    remainingCount -= additionalMedium.length;
    if (remainingCount > 0) {
      const additionalEasy = await fetchQuestionsByDifficulty(
        1,
        remainingCount
      );
      questions.push(...additionalEasy);
      remainingCount -= additionalEasy.length;
    }
    if (remainingCount > 0) {
      const additionalHard = await fetchQuestionsByDifficulty(
        3,
        remainingCount
      );
      questions.push(...additionalHard);
      remainingCount -= additionalHard.length;
    }
  }

  // Nếu số câu hỏi vượt quá totalQuestions, cắt bớt ngẫu nhiên cho đúng số lượng
  let finalQuestions = questions;
  if (questions.length > totalQuestions) {
    finalQuestions = questions
      .map((q, index) => ({ q, sort: seededRandom(index + questions.length) }))
      .sort((a, b) => a.sort - b.sort)
      .slice(0, totalQuestions)
      .map(({ q }) => q);
  } else {
    // Trộn lại toàn bộ câu hỏi một lần nữa với seed
    finalQuestions = questions
      .map((q, index) => ({ q, sort: seededRandom(index + questions.length) }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ q }) => q);
  }

  // Trả về danh sách câu hỏi đã được trộn
  return finalQuestions.map((q) => ({
    question_id: q.question_id,
    question_type: {
      question_type_id: q.QuestionType?.question_type_id,
      name: q.QuestionType?.name,
    },
    level: {
      level_id: q.Level?.level_id,
      name: q.Level?.name,
    },
    question_text: q.question_text,
    lo_id: q.lo_id,
    lo_name: q.LO?.name,
    explanation: q.explanation,
    answers: q.Answers.map((a) => ({
      answer_id: a.answer_id,
      answer_text: a.answer_text,
      iscorrect: a.iscorrect,
    })),
  }));
};

// Hàm gửi câu hỏi tiếp theo qua socket (dùng cache)
const sendNextQuestionSocket = async (quizId, currentIndex) => {
  const questions = await getCache(`quiz:${quizId}:questions`);
  if (!questions || !Array.isArray(questions)) return;
  if (currentIndex >= questions.length) return;

  // Lưu thời gian bắt đầu câu hỏi vào Firebase
  const questionStartTime = Date.now();
  const quizRef = db.ref(`quiz_sessions/${quizId}/current_question`);
  await quizRef.set({
    start_time: questionStartTime,
    question_index: currentIndex,
    question_id: questions[currentIndex].question_id,
  });

  if (io) {
    // Gửi câu hỏi mới cho tất cả client
    io.to(`quiz:${quizId}`).emit("newQuestion", {
      quiz_id: quizId,
      current_question: questions[currentIndex],
      current_question_index: currentIndex,
      total_questions: questions.length,
      question_start_time: questionStartTime,
    });

    // Lưu trạng thái hiện tại vào cache
    await setCache(
      `quiz:${quizId}:state`,
      {
        current_question_index: currentIndex,
        current_question: questions[currentIndex],
        total_questions: questions.length,
        question_start_time: questionStartTime,
      },
      3600
    );
  }
};

// Thêm hàm xử lý reconnect
const handleReconnect = async (socket, quizId) => {
  try {
    // Lấy trạng thái hiện tại từ cache
    const currentState = await getCache(`quiz:${quizId}:state`);
    if (currentState) {
      // Gửi lại trạng thái hiện tại cho client vừa kết nối lại
      socket.emit("restoreState", {
        quiz_id: quizId,
        current_question: currentState.current_question,
        current_question_index: currentState.current_question_index,
        total_questions: currentState.total_questions,
        question_start_time: currentState.question_start_time,
      });
    }

    // Lấy bảng xếp hạng hiện tại
    const leaderboard = await quizRealtimeService.getRealtimeLeaderboard(
      quizId
    );
    if (leaderboard) {
      socket.emit("leaderboardUpdate", {
        quiz_id: quizId,
        leaderboard,
        timestamp: Date.now(),
      });
    }
  } catch (error) {
    console.error("Lỗi trong handleReconnect:", error);
  }
};

// Thêm middleware xử lý socket connection
const setupSocketMiddleware = (io) => {
  // Initialize services with io
  quizRealtimeService = new QuizRealtimeService(io);
  answerChoiceStatsService = new AnswerChoiceStatsService(io);

  io.on("connection", (socket) => {
    // Xử lý khi client tham gia phòng quiz
    socket.on("joinQuiz", async (quizId) => {
      socket.join(`quiz:${quizId}`);
      await handleReconnect(socket, quizId);
    });

    // Xử lý khi client tham gia phòng giáo viên
    socket.on("joinTeacherRoom", (quizId) => {
      socket.join(`quiz:${quizId}:teachers`);
    });

    // Xử lý khi client tham gia phòng học sinh
    socket.on("joinStudentRoom", (quizId) => {
      socket.join(`quiz:${quizId}:students`);
    });

    // Handler for getting live choice stats
    socket.on("getLiveChoiceStats", async (data) => {
      try {
        const { quizId, questionId } = data;
        const stats = await answerChoiceStatsService.getChoiceStats(
          quizId,
          questionId
        );

        socket.emit("liveChoiceStatsUpdate", {
          quiz_id: quizId,
          question_id: questionId,
          choice_stats: stats,
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error("Error getting live choice stats:", error);
        socket.emit("error", { message: "Error getting live choice stats" });
      }
    });

    // Xử lý khi client tham gia phòng cá nhân
    socket.on("joinPersonalRoom", (quizId, userId) => {
      socket.join(`quiz:${quizId}:${userId}`);
    });

    // Xử lý khi client disconnect
    socket.on("disconnect", () => {
      // Có thể thêm logic xử lý khi client disconnect nếu cần
    });
  });
};

const createQuiz = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      subject_id, // DEPRECATED: for backward compatibility
      course_id, // NEW: recommended parameter
      name,
      duration,
      question_criteria,
      question_ids, // NEW: manual question selection (for code_practice)
      quiz_mode = "assessment", // NEW: quiz mode
      code_config = null, // NEW: code practice configuration
      inline_questions = null, // NEW: create questions inline (for code_practice)
    } = req.body;
    const io = req.app.get("io");

    console.log("Bắt đầu tạo quiz:", {
      subject_id,
      course_id,
      name,
      duration,
      quiz_mode,
      question_criteria,
      question_ids,
      code_config,
    });

    // Validate required fields with dual support
    let targetCourseId = course_id;
    let deprecationWarning = null;

    if (!course_id && !subject_id) {
      await transaction.rollback();
      return res.status(400).json({
        error:
          "Vui lòng cung cấp course_id (khuyến nghị) hoặc subject_id (deprecated)",
      });
    }

    if (!name) {
      await transaction.rollback();
      return res.status(400).json({ error: "Vui lòng cung cấp tên quiz" });
    }

    // Handle backward compatibility for subject_id
    if (subject_id && !course_id) {
      deprecationWarning =
        "subject_id parameter is deprecated. Please use course_id instead.";

      // Find course for this subject using the new 1:Many relationship
      const course = await Course.findOne({
        where: { subject_id: subject_id },
        transaction,
      });

      if (!course) {
        await transaction.rollback();
        return res.status(404).json({
          error: `Không tìm thấy khóa học nào cho subject ${subject_id}. Vui lòng sử dụng course_id thay thế.`,
        });
      }
      targetCourseId = course.course_id;
    }

    // Validate course exists
    const course = await Course.findByPk(targetCourseId, { transaction });
    if (!course) {
      await transaction.rollback();
      return res.status(404).json({ error: "Khóa học không tồn tại" });
    }

    if (duration && (duration <= 0 || isNaN(duration))) {
      await transaction.rollback();
      return res.status(400).json({ error: "Thời gian làm bài không hợp lệ" });
    }

    // NEW: Validate code_practice mode
    if (quiz_mode === "code_practice") {
      if (!code_config) {
        await transaction.rollback();
        return res.status(400).json({
          error: 'quiz_mode "code_practice" yêu cầu code_config',
          required_fields: [
            "allow_multiple_submissions",
            "show_test_results",
            "enable_ai_analysis",
            "time_limit_per_question",
          ],
        });
      }

      // Validate code_config structure
      const requiredFields = [
        "allow_multiple_submissions",
        "show_test_results",
        "enable_ai_analysis",
        "time_limit_per_question",
      ];
      const missingFields = requiredFields.filter(
        (field) => !(field in code_config)
      );

      if (missingFields.length > 0) {
        await transaction.rollback();
        return res.status(400).json({
          error: `code_config thiếu các field: ${missingFields.join(", ")}`,
        });
      }

      // Validate question selection method
      if (!question_ids && !question_criteria && !inline_questions) {
        await transaction.rollback();
        return res.status(400).json({
          error:
            'quiz_mode "code_practice" yêu cầu question_ids (chọn có sẵn), inline_questions (tạo mới), hoặc question_criteria (auto-generate)',
        });
      }

      // If using question_criteria, force type = 4 (code_exercise)
      if (question_criteria && question_criteria.type !== 4) {
        await transaction.rollback();
        return res.status(400).json({
          error:
            'quiz_mode "code_practice" chỉ chấp nhận question_criteria.type = 4 (code_exercise)',
        });
      }

      // If using question_ids, validate they are all code_exercise type
      if (
        question_ids &&
        Array.isArray(question_ids) &&
        question_ids.length > 0
      ) {
        const questionsToValidate = await Question.findAll({
          where: {
            question_id: question_ids,
          },
          attributes: ["question_id", "question_type_id"],
          transaction,
        });

        const nonCodeQuestions = questionsToValidate.filter(
          (q) => q.question_type_id !== 4
        );
        if (nonCodeQuestions.length > 0) {
          await transaction.rollback();
          return res.status(400).json({
            error:
              'quiz_mode "code_practice" chỉ chấp nhận câu hỏi type = 4 (code_exercise)',
            invalid_questions: nonCodeQuestions.map((q) => q.question_id),
          });
        }
      }
    }

    // Tạo mã PIN ngẫu nhiên
    const pin = await generatePin();
    console.log("Mã PIN đã được tạo:", pin);

    // Prepare quiz data with mode configuration
    const quizData = {
      course_id: targetCourseId, // NEW: Use course_id instead of subject_id
      name,
      duration,
      status: "pending",
      pin: pin,
      update_time: new Date(),
      quiz_mode: quiz_mode,
      code_config: quiz_mode === "code_practice" ? code_config : null,
    };

    // Apply mode-specific configuration
    const modeConfig = await QuizModeService.createQuizWithMode(quizData);

    // Validate mode configuration
    const validation = QuizModeService.validateQuizModeConfig(modeConfig);
    if (!validation.isValid) {
      await transaction.rollback();
      return res.status(400).json({
        error: "Cấu hình quiz mode không hợp lệ",
        details: validation.errors,
      });
    }

    const quiz = await Quiz.create(modeConfig, { transaction });
    console.log("Quiz đã được tạo:", quiz.toJSON());

    let selected_question_ids = [];
    let questions = [];

    // NEW: Handle inline question creation (inline_questions) - for code_practice
    if (
      inline_questions &&
      Array.isArray(inline_questions) &&
      inline_questions.length > 0
    ) {
      console.log("Tạo câu hỏi mới inline:", inline_questions.length, "câu");

      const createdQuestions = [];

      for (const questionData of inline_questions) {
        // Validate required fields for code question
        const requiredFields = ["question_text", "lo_id"];
        const missingFields = requiredFields.filter(
          (field) => !questionData[field]
        );

        if (missingFields.length > 0) {
          await transaction.rollback();
          return res.status(400).json({
            error: `Câu hỏi inline thiếu field: ${missingFields.join(", ")}`,
            question_data: questionData,
          });
        }

        // Create new code exercise question
        // Store code-specific data in question_data JSONB field
        const codeData = {
          starter_code: questionData.starter_code || {
            javascript: "// Viết code của bạn ở đây\n",
          },
          test_cases: questionData.test_cases || [],
          solution_code: questionData.solution_code || null,
          programming_languages: questionData.programming_languages || [
            "javascript",
            "python",
            "java",
            "c++",
            "c",
          ],
          memory_limit: questionData.memory_limit || 256,
          constraints: questionData.constraints || null,
        };

        const newQuestion = await Question.create(
          {
            question_text: questionData.question_text,
            question_type_id: 4, // Force code_exercise type
            level_id: questionData.level_id || 1, // Default: Easy
            lo_id: questionData.lo_id,
            explanation: questionData.explanation || null,
            question_data: codeData,
            validation_rules: questionData.validation_rules || null,
            hints: questionData.hints || null,
            time_limit: questionData.time_limit || 5000,
            tags: questionData.tags || null,
          },
          { transaction }
        );

        console.log(`Đã tạo câu hỏi mới ID: ${newQuestion.question_id}`);

        // Load full question with associations
        const fullQuestion = await Question.findByPk(newQuestion.question_id, {
          include: [
            {
              model: QuestionType,
              as: "QuestionType",
              attributes: ["question_type_id", "name"],
            },
            {
              model: Level,
              as: "Level",
              attributes: ["level_id", "name"],
            },
            {
              model: LO,
              as: "LO",
              attributes: ["lo_id", "name"],
            },
          ],
          transaction,
        });

        createdQuestions.push(fullQuestion);
        selected_question_ids.push(newQuestion.question_id);
      }

      questions = createdQuestions;
      console.log(`Đã tạo ${questions.length} câu hỏi code mới inline`);
    }
    // NEW: Handle manual question selection (question_ids)
    else if (
      question_ids &&
      Array.isArray(question_ids) &&
      question_ids.length > 0
    ) {
      console.log("Sử dụng question_ids thủ công:", question_ids);

      // Validate all questions exist
      const foundQuestions = await Question.findAll({
        where: {
          question_id: question_ids,
        },
        include: [
          {
            model: QuestionType,
            as: "QuestionType",
            attributes: ["question_type_id", "name"],
          },
          {
            model: Level,
            as: "Level",
            attributes: ["level_id", "name"],
          },
          {
            model: LO,
            as: "LO",
            attributes: ["lo_id", "name"],
          },
        ],
        transaction,
      });

      if (foundQuestions.length !== question_ids.length) {
        await transaction.rollback();
        const foundIds = foundQuestions.map((q) => q.question_id);
        const missingIds = question_ids.filter((id) => !foundIds.includes(id));
        return res.status(404).json({
          error: "Một số câu hỏi không tồn tại",
          missing_question_ids: missingIds,
        });
      }

      selected_question_ids = question_ids;
      questions = foundQuestions;

      console.log(`Đã chọn ${questions.length} câu hỏi thủ công`);
    }
    // Handle auto-generation with question_criteria
    else if (question_criteria) {
      const {
        loIds: providedLoIds,
        totalQuestions,
        difficultyRatio,
        type,
      } = question_criteria;
      console.log("Lọc câu hỏi với tiêu chí:", {
        loIds: providedLoIds,
        totalQuestions,
        difficultyRatio,
        type,
      });

      // Tìm loIds dựa trên course thay vì subject
      let loIds = providedLoIds;
      if (!loIds || !Array.isArray(loIds) || loIds.length === 0) {
        // Get subject_id from course to find LOs
        const courseWithSubject = await Course.findByPk(targetCourseId, {
          include: [
            {
              model: Subject,
              as: "Subject",
            },
          ],
          transaction,
        });

        if (!courseWithSubject || !courseWithSubject.Subject) {
          await transaction.rollback();
          return res
            .status(400)
            .json({ error: "Không tìm thấy subject cho course này" });
        }

        loIds = await LO.findAll({
          where: { subject_id: courseWithSubject.Subject.subject_id },
          attributes: ["lo_id"],
        }).then((los) => los.map((lo) => lo.lo_id));

        if (!loIds || loIds.length === 0) {
          await transaction.rollback();
          return res
            .status(400)
            .json({ error: "Không tìm thấy LO nào cho course này" });
        }
      }

      // Kiểm tra totalQuestions và difficultyRatio
      if (!Number.isInteger(totalQuestions) || totalQuestions <= 0) {
        await transaction.rollback();
        return res
          .status(400)
          .json({ error: "totalQuestions phải là số nguyên dương" });
      }

      if (!difficultyRatio || typeof difficultyRatio !== "object") {
        await transaction.rollback();
        return res
          .status(400)
          .json({ error: "difficultyRatio phải là một object" });
      }

      // Gọi trực tiếp fetchQuestionsByLOs
      questions = await fetchQuestionsByLOs(
        loIds,
        totalQuestions,
        difficultyRatio,
        type,
        quiz.quiz_id
      );
      selected_question_ids = questions.map((q) => q.question_id);
      console.log("Câu hỏi đã được lọc:", selected_question_ids);

      if (selected_question_ids.length === 0) {
        await transaction.rollback();
        return res
          .status(400)
          .json({ error: "Không tìm thấy câu hỏi phù hợp với tiêu chí" });
      }
    }

    // Insert questions into QuizQuestions (works for both manual and auto selection)
    if (selected_question_ids && selected_question_ids.length > 0) {
      const quizQuestions = selected_question_ids.map((question_id, index) => ({
        quiz_id: quiz.quiz_id,
        question_id,
        order_index: index,
      }));
      await QuizQuestion.bulkCreate(quizQuestions, { transaction });
      console.log(`QuizQuestion đã được tạo: ${quizQuestions.length} câu hỏi`);
    }

    // Xóa toàn bộ cache danh sách quiz
    await deleteCacheByPattern("quizzes*");
    console.log("Đã xóa cache: quizzes*");

    if (io) {
      // Gửi thông báo tới tất cả học sinh (broadcast) - updated for new schema
      io.emit("quizCreated", {
        quiz_id: quiz.quiz_id,
        name: quiz.name,
        course_id: quiz.course_id, // NEW: Use course_id
        subject_id: subject_id || null, // DEPRECATED: For backward compatibility
        duration: quiz.duration,
        status: quiz.status,
        pin: quiz.pin,
        current_question_index: quiz.current_question_index,
        show_leaderboard: quiz.show_leaderboard,
        update_time: quiz.update_time,
      });
    }

    // Cache danh sách câu hỏi chi tiết
    if (questions && questions.length > 0) {
      await setCache(`quiz:${quiz.quiz_id}:questions`, questions, 3600);
    }

    await transaction.commit();
    console.log("Transaction committed");

    const response = {
      success: true,
      data: {
        message: "Tạo bài kiểm tra thành công",
        quiz: {
          quiz_id: quiz.quiz_id,
          course_id: quiz.course_id, // NEW: Primary field
          name: quiz.name,
          duration: quiz.duration,
          status: quiz.status,
          pin: quiz.pin,
          current_question_index: quiz.current_question_index,
          show_leaderboard: quiz.show_leaderboard,
          update_time: quiz.update_time,
          quiz_mode: quiz.quiz_mode,
          code_config: quiz.code_config,
          questions: questions || [], // Include created questions
        },
      },
    };

    // Add deprecation warning if applicable
    if (deprecationWarning) {
      response.data.warning = deprecationWarning;
    }

    res.status(201).json(response);
  } catch (error) {
    await transaction.rollback();
    console.error("Lỗi trong createQuiz:", error);
    return res
      .status(500)
      .json({ error: "Lỗi khi tạo bài kiểm tra", details: error.message });
  }
};

const updateQuiz = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const quizId = req.params.id;
    const {
      subject_id, // DEPRECATED: for backward compatibility
      course_id, // NEW: recommended parameter
      name,
      duration,
      start_time,
      end_time,
      question_criteria,
    } = req.body;

    const quiz = await Quiz.findByPk(quizId, { transaction });
    if (!quiz) {
      await transaction.rollback();
      return res.status(404).json({ error: "Bài kiểm tra không tồn tại" });
    }

    // Handle course_id update with backward compatibility
    if (course_id) {
      const course = await Course.findByPk(course_id, { transaction });
      if (!course) {
        await transaction.rollback();
        return res.status(404).json({ error: "Khóa học không tồn tại" });
      }
      quiz.course_id = course_id;
    } else if (subject_id) {
      // Backward compatibility: find course for this subject
      const course = await Course.findOne({
        where: { subject_id: subject_id },
        transaction,
      });
      if (!course) {
        await transaction.rollback();
        return res.status(404).json({
          error: `Không tìm thấy khóa học nào cho subject ${subject_id}. Vui lòng sử dụng course_id thay thế.`,
        });
      }
      quiz.course_id = course.course_id;
    }

    if (start_time && end_time) {
      const start = moment(start_time);
      const end = moment(end_time);
      if (end.isBefore(start)) {
        await transaction.rollback();
        return res
          .status(400)
          .json({ error: "Thời gian kết thúc phải sau thời gian bắt đầu" });
      }
      quiz.start_time = start_time;
      quiz.end_time = end_time;
    } else if (start_time) {
      if (moment(start_time).isAfter(quiz.end_time)) {
        await transaction.rollback();
        return res
          .status(400)
          .json({ error: "Thời gian bắt đầu phải trước thời gian kết thúc" });
      }
      quiz.start_time = start_time;
    } else if (end_time) {
      if (moment(end_time).isBefore(quiz.start_time)) {
        await transaction.rollback();
        return res
          .status(400)
          .json({ error: "Thời gian kết thúc phải sau thời gian bắt đầu" });
      }
      quiz.end_time = end_time;
    }

    if (name) quiz.name = name;
    if (duration) {
      if (duration <= 0 || isNaN(duration)) {
        await transaction.rollback();
        return res
          .status(400)
          .json({ error: "Thời gian làm bài không hợp lệ" });
      }
      quiz.duration = duration;
    }
    quiz.update_time = new Date();

    await quiz.save({ transaction });
    await deleteCache("quizzes");

    // Gửi thông báo tới tất cả học sinh (broadcast)
    const io = req.app.get("io");
    if (io) {
      io.emit("quizUpdated", {
        quiz_id: quiz.quiz_id,
        name: quiz.name,
        course_id: quiz.course_id, // Use course_id instead of subject_id
        start_time: quiz.start_time,
        end_time: quiz.end_time,
      });
    }

    await transaction.commit();

    const response = {
      message: "Cập nhật bài kiểm tra thành công",
      quiz: {
        quiz_id: quiz.quiz_id,
        course_id: quiz.course_id, // Use course_id instead of subject_id
        name: quiz.name,
        duration: quiz.duration,
        start_time: quiz.start_time,
        end_time: quiz.end_time,
      },
    };

    // Add deprecation warning if applicable
    if (subject_id && !course_id) {
      response.warning =
        "subject_id parameter is deprecated. Please use course_id instead.";
    }

    return res.status(200).json(response);
  } catch (error) {
    await transaction.rollback();
    console.error("Lỗi trong updateQuiz:", error);
    return res
      .status(500)
      .json({ error: "Lỗi khi cập nhật bài kiểm tra", details: error.message });
  }
};

const deleteQuiz = async (req, res) => {
  const { id } = req.params;
  const transaction = await sequelize.transaction();

  try {
    // Check if quiz exists
    const quiz = await Quiz.findByPk(id);
    if (!quiz) {
      await transaction.rollback();
      return res
        .status(404)
        .json({ success: false, message: "Quiz not found" });
    }

    // Check if quiz is in progress
    if (quiz.status === "active") {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Cannot delete quiz that is in progress",
      });
    }

    // Delete related records in order
    // 1. Delete quiz results
    await QuizResult.destroy({
      where: { quiz_id: id },
      transaction,
    });

    // 2. Delete quiz questions
    await QuizQuestion.destroy({
      where: { quiz_id: id },
      transaction,
    });

    // 3. Delete user quiz tracking
    await UserQuizTracking.destroy({
      where: { quiz_id: id },
      transaction,
    });

    // 4. Delete user question history
    await UserQuestionHistory.destroy({
      where: { quiz_id: id },
      transaction,
    });

    // 5. Finally delete the quiz
    await quiz.destroy({ transaction });

    // Xóa tất cả cache liên quan đến quiz này
    await Promise.all([
      deleteCacheByPattern("quizzes*"),
      deleteCache(`quiz:${id}`),
      deleteCache(`quiz:${id}:questions`),
      deleteCache(`quiz:${id}:state`),
      deleteCacheByPattern(`quiz:${id}:*`), // Xóa tất cả cache có prefix là quiz:id
    ]);

    // Commit transaction
    await transaction.commit();

    res.json({ message: "Quiz deleted successfully" });
  } catch (error) {
    await transaction.rollback();
    console.error("Error deleting quiz:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting quiz",
      error: error.message,
    });
  }
};

const getQuizzes = async (req, res) => {
  try {
    // Lấy các tham số phân trang và lọc từ query
    const {
      page = 1,
      limit = 10,
      status,
      subject_id, // DEPRECATED: for backward compatibility
      course_id, // NEW: recommended parameter
      search,
      sort_by = "update_time",
      sort_order = "DESC",
    } = req.query;

    // Validate sort_by field to prevent SQL errors
    const validSortFields = [
      "quiz_id",
      "name",
      "duration",
      "start_time",
      "end_time",
      "update_time", // Valid field in Quiz model
      "status",
      "pin",
      "current_question_index",
    ];

    const finalSortBy = validSortFields.includes(sort_by)
      ? sort_by
      : "update_time";

    // Validate sort_order
    const finalSortOrder = ["ASC", "DESC"].includes(sort_order.toUpperCase())
      ? sort_order.toUpperCase()
      : "DESC";

    // Tính offset cho phân trang
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Xây dựng điều kiện tìm kiếm với dual support
    const whereClause = {};
    if (status) {
      whereClause.status = status;
    }

    // NEW: Support both subject_id and course_id
    if (course_id) {
      // Direct course_id query (new way)
      whereClause.course_id = course_id;
    } else if (subject_id) {
      // Convert subject_id to course_id(s) - find courses that belong to this subject
      const courses = await Course.findAll({
        where: { subject_id: subject_id },
        attributes: ["course_id"],
      });

      if (courses.length > 0) {
        const courseIds = courses.map((c) => c.course_id);
        whereClause.course_id = {
          [Op.in]: courseIds,
        };
      } else {
        // No courses found for this subject
        return res.status(200).json({
          success: true,
          message: "Không tìm thấy quiz nào cho subject này",
          data: [],
          pagination: {
            current_page: parseInt(page),
            total_pages: 0,
            total_items: 0,
            items_per_page: parseInt(limit),
          },
        });
      }
    }

    if (search) {
      whereClause.name = {
        [Op.like]: `%${search}%`,
      };
    }

    // Kiểm tra cache với các tham số (updated cache key)
    const cacheKey = `quizzes:${page}:${limit}:${status || "all"}:${
      course_id || subject_id || "all"
    }:${search || "all"}:${finalSortBy}:${finalSortOrder}`;
    const cachedQuizzes = await getCache(cacheKey);

    if (cachedQuizzes) {
      console.log("Lấy quiz từ cache");

      // Add deprecation warning if using subject_id
      if (subject_id && !course_id) {
        cachedQuizzes.deprecation_warning =
          "subject_id parameter is deprecated. Please use course_id instead.";
      }

      return res.status(200).json({
        success: true,
        message: "Lấy danh sách bài kiểm tra thành công (từ cache)",
        data: cachedQuizzes,
      });
    }

    console.log("Lấy quiz từ DB");
    // Thực hiện truy vấn với phân trang và sắp xếp (updated for new schema)
    const { count, rows: quizzes } = await Quiz.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Course,
          as: "Course",
          attributes: ["course_id", "name", "subject_id"],
          include: [
            {
              model: Subject,
              as: "Subject",
              attributes: ["subject_id", "name"],
            },
          ],
        },
        {
          model: Question,
          as: "Questions",
          through: { attributes: [] },
          attributes: ["question_id", "question_text"],
        },
      ],
      attributes: [
        "quiz_id",
        "course_id", // NEW: Use course_id instead of subject_id
        "name",
        "duration",
        "start_time",
        "end_time",
        "update_time",
        "status",
        "pin",
        "current_question_index",
        "show_leaderboard",
        "adaptive_config",
        "quiz_mode", // IMPORTANT: practice or assessment
        "gamification_enabled",
        "avatar_system_enabled",
        "level_progression_enabled",
        "real_time_leaderboard_enabled",
      ],
      order: [[finalSortBy, finalSortOrder]],
      limit: parseInt(limit),
      offset: offset,
      distinct: true,
    });

    // Transform data for backward compatibility
    const transformedQuizzes = quizzes.map((quiz) => {
      const quizData = quiz.toJSON();

      // Add backward compatibility: subject info from course
      if (quizData.Course && quizData.Course.Subject) {
        quizData.subject_id = quizData.Course.Subject.subject_id;
        quizData.Subject = quizData.Course.Subject;
      }

      return quizData;
    });

    // Tính toán thông tin phân trang
    const totalPages = Math.ceil(count / parseInt(limit));
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    const response = {
      quizzes: transformedQuizzes,
      pagination: {
        total: count,
        totalPages,
        currentPage: parseInt(page),
        limit: parseInt(limit),
        hasNextPage,
        hasPrevPage,
      },
    };

    // Add deprecation warning if using subject_id
    if (subject_id && !course_id) {
      response.deprecation_warning =
        "subject_id parameter is deprecated. Please use course_id instead.";
      response.migration_info = {
        message:
          "This API now uses course_id. Quiz belongs to Course, and Course can have multiple Subjects.",
        new_usage: `Use course_id=${
          quizzes.length > 0 ? quizzes[0].course_id : "N/A"
        } instead of subject_id=${subject_id}`,
      };
    }

    // Cache kết quả
    await setCache(cacheKey, response, 3600);

    return res.status(200).json({
      success: true,
      message: "Lấy danh sách bài kiểm tra thành công",
      data: response,
    });
  } catch (error) {
    console.error("Lỗi trong getQuizzes:", error);
    return res.status(500).json({
      error: "Lỗi khi lấy danh sách bài kiểm tra",
      details: error.message,
    });
  }
};

const getQuizById = async (req, res) => {
  try {
    const quizId = req.params.id;
    const userRole = req.user?.role; // Get user role from request

    let cachedQuiz = null;
    try {
      cachedQuiz = await getCache(`quiz:${quizId}`);
    } catch (redisError) {
      console.error("Redis cache error:", redisError);
      // Continue without cache if Redis is not available
    }

    if (cachedQuiz) {
      return res.status(200).json({
        success: true,
        data: {
          message: "Lấy chi tiết bài kiểm tra thành công (từ cache)",
          quiz: cachedQuiz,
        },
      });
    }

    const quiz = await Quiz.findByPk(quizId, {
      include: [
        {
          model: Course,
          as: "Course",
          attributes: ["course_id", "name", "subject_id"],
          include: [
            {
              model: Subject,
              as: "Subject",
              attributes: ["subject_id", "name"],
            },
          ],
        },
        {
          model: Question,
          as: "Questions",
          through: { attributes: [] },
          attributes: [
            "question_id",
            "question_text",
            "question_type_id",
            "level_id",
            "lo_id",
            "explanation",
            "question_data",
            "validation_rules",
            "hints",
            "time_limit",
            "tags",
          ],
          include: [
            {
              model: Answer,
              as: "Answers",
              attributes: ["answer_id", "answer_text", "iscorrect"],
              include: [
                {
                  model: MediaFile,
                  as: "MediaFiles",
                  attributes: [
                    "media_id",
                    "file_type",
                    "file_name",
                    "owner_type",
                    "answer_id",
                    "alt_text",
                    "description",
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
                "owner_type",
                "answer_id",
                "alt_text",
                "description",
              ],
            },
            {
              model: QuestionType,
              as: "QuestionType",
              attributes: ["question_type_id", "name"],
            },
            {
              model: Level,
              as: "Level",
              attributes: ["level_id", "name"],
            },
            {
              model: LO,
              as: "LO",
              attributes: ["lo_id", "name"],
            },
          ],
        },
        {
          model: QuizResult,
          as: "QuizResults",
          attributes: [
            "result_id",
            "user_id",
            "score",
            "status",
            "update_time",
            "completion_time",
          ],
          include: [
            {
              model: User,
              as: "Student",
              attributes: ["user_id", "name", "email"],
            },
          ],
        },
      ],
      attributes: [
        "quiz_id",
        "course_id", // NEW: Use course_id instead of subject_id
        "name",
        "duration",
        "start_time",
        "end_time",
        "update_time",
        "status",
        "pin",
        "quiz_mode",
        "code_config",
      ],
    });

    if (!quiz) {
      return res.status(404).json({ error: "Bài kiểm tra không tồn tại" });
    }

    // Format the response data
    const formattedQuiz = {
      quiz_id: quiz.quiz_id,
      course_id: quiz.course_id, // Use course_id instead of subject_id
      course_name: quiz.Course?.name,
      subject_id: quiz.Course?.Subject?.subject_id, // Get subject_id via Course
      subject_name: quiz.Course?.Subject?.name, // Get subject_name via Course
      name: quiz.name,
      duration: quiz.duration,
      start_time: quiz.start_time,
      end_time: quiz.end_time,
      update_time: quiz.update_time,
      status: quiz.status,
      pin: quiz.pin,
      quiz_mode: quiz.quiz_mode,
      code_config: quiz.code_config,
      questions: quiz.Questions.map((q) => ({
        question_id: q.question_id,
        question_text: q.question_text,
        question_type: {
          question_type_id: q.QuestionType?.question_type_id,
          name: q.QuestionType?.name,
        },
        level: {
          level_id: q.Level?.level_id,
          name: q.Level?.name,
        },
        lo: {
          lo_id: q.LO?.lo_id,
          name: q.LO?.name,
        },
        explanation: q.explanation,
        // Code exercise specific fields
        question_data: q.question_data || null,
        validation_rules: q.validation_rules || null,
        hints: q.hints || null,
        time_limit: q.time_limit || null,
        tags: q.tags || null,
        answers: q.Answers.map((a) => ({
          answer_id: a.answer_id,
          answer_text: a.answer_text,
          iscorrect: a.iscorrect,
          // Add media files for each answer
          media_files: (a.MediaFiles || []).map((m) => ({
            media_id: m.media_id,
            file_type: m.file_type,
            file_name: m.file_name,
            file_url: `/api/answers/${a.answer_id}/media/${m.file_name}`,
            owner_type: "answer",
            owner_id: a.answer_id,
            alt_text: m.alt_text,
            description: m.description,
          })),
        })),
        // Add media files for the question
        MediaFiles: (q.MediaFiles || []).map((m) => ({
          media_id: m.media_id,
          file_type: m.file_type,
          file_name: m.file_name,
          file_url:
            m.owner_type === "answer"
              ? `/api/answers/${m.answer_id}/media/${m.file_name}`
              : `/api/questions/media/${q.question_id}/${m.file_name}`,
          owner_type: m.owner_type || "question",
          owner_id: m.owner_type === "answer" ? m.answer_id : q.question_id,
          alt_text: m.alt_text,
          description: m.description,
        })),
      })),
      results: quiz.QuizResults.map((r) => ({
        result_id: r.result_id,
        student: {
          user_id: r.Student?.user_id,
          name: r.Student?.name,
          email: r.Student?.email,
        },
        score: r.score,
        status: r.status,
        update_time: r.update_time,
        completion_time: r.completion_time,
      })),
    };

    try {
      await setCache(`quiz:${quizId}`, formattedQuiz, 3600);
    } catch (redisError) {
      console.error("Redis cache error:", redisError);
      // Continue without caching if Redis is not available
    }

    return res.status(200).json({
      success: true,
      data: {
        message: "Lấy chi tiết bài kiểm tra thành công",
        quiz: formattedQuiz,
      },
    });
  } catch (error) {
    console.error("Lỗi trong getQuizById:", error);
    return res.status(500).json({
      error: "Lỗi khi lấy chi tiết bài kiểm tra",
      details: error.message,
    });
  }
};

const checkAndEndExpiredQuizzes = async (req) => {
  try {
    const now = new Date();
    const expiredQuizzes = await Quiz.findAll({
      where: {
        status: "active",
        end_time: {
          [Op.lt]: now,
        },
      },
    });

    for (const quiz of expiredQuizzes) {
      await endQuizById(quiz.quiz_id);
    }
  } catch (error) {
    console.error("Lỗi khi kiểm tra quiz hết thời gian:", error);
  }
};

// Chạy kiểm tra mỗi phút
setInterval(() => {
  checkAndEndExpiredQuizzes();
}, 60000);

// Hàm xử lý chính, nhận quizId
const endQuizById = async (quizId) => {
  const transaction = await sequelize.transaction();
  try {
    // Đồng bộ Firebase về DB với delay để tránh race condition
    console.log(
      `[END-QUIZ] Starting sync for quiz ${quizId} with anti-race-condition delay...`
    );
    await quizRealtimeService.syncQuizDataToDatabase(quizId, { delayMs: 3000 });
    const quiz = await Quiz.findByPk(quizId, { transaction });
    if (!quiz) {
      await transaction.rollback();
      return { error: "Bài kiểm tra không tồn tại" };
    }
    quiz.status = "finished";
    await quiz.save({ transaction });
    // Xóa toàn bộ cache liên quan quiz
    await Promise.all([
      deleteCacheByPattern("quizzes*"),
      deleteCache(`quiz:${quizId}`),
      deleteCache(`quiz:${quizId}:questions`),
      deleteCache(`quiz:${quizId}:state`),
      deleteCacheByPattern(`quiz:${quizId}:*`),
    ]);
    if (io) {
      // Gửi thông báo tới tất cả học sinh (broadcast)
      io.emit("quizEnded", {
        quiz_id: quizId,
        status: "finished",
      });
    }
    await transaction.commit();
    return { success: true };
  } catch (error) {
    await transaction.rollback();
    console.error("Lỗi trong endQuizById:", error);
    return { error: error.message };
  }
};

// API endpoint
const endQuiz = async (req, res) => {
  const quizId = req.params.id;
  const result = await endQuizById(quizId);
  if (result.error) {
    return res
      .status(500)
      .json({ error: "Lỗi khi kết thúc bài kiểm tra", details: result.error });
  }
  return res.status(200).json({
    success: true,
    data: { message: "Kết thúc bài kiểm tra thành công" },
  });
};

// Khi bắt đầu quiz, gửi câu hỏi đầu tiên qua socket (dùng cache)
const startQuiz = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const quizId = req.params.id;
    const io = req.app.get("io");

    const quiz = await Quiz.findOne({
      where: {
        quiz_id: quizId,
        status: "pending",
      },
      include: [
        {
          model: Question,
          as: "Questions",
          through: { attributes: [] },
          attributes: ["question_id"],
        },
      ],
      transaction,
    });

    if (!quiz) {
      await transaction.rollback();
      return res
        .status(404)
        .json({ error: "Bài kiểm tra không tồn tại hoặc đã bắt đầu" });
    }

    // Kiểm tra nếu quiz.duration hợp lệ
    if (!quiz.duration || quiz.duration <= 0) {
      await transaction.rollback();
      return res
        .status(400)
        .json({ error: "Thời gian bài kiểm tra không hợp lệ" });
    }

    const start_time = new Date();
    const end_time = new Date(start_time.getTime() + quiz.duration * 60 * 1000);

    // Cập nhật trạng thái quiz
    quiz.start_time = start_time;
    quiz.end_time = end_time;
    quiz.status = "active";
    quiz.current_question_index = 0;
    quiz.show_leaderboard = false;

    await quiz.save({ transaction });
    await deleteCache("quizzes");
    await deleteCache(`quiz:${quizId}`);

    // Lấy câu hỏi đầu tiên từ cache
    const questions = await getCache(`quiz:${quizId}:questions`);
    if (io && questions && questions.length > 0) {
      io.to(`quiz:${quizId}`).emit("quizStarted", {
        quiz_id: quiz.quiz_id,
        name: quiz.name,
        start_time: quiz.start_time,
        end_time: quiz.end_time,
        pin: quiz.pin,
        current_question: questions[0],
        total_questions: questions.length,
        current_question_index: 0,
      });
    }

    await transaction.commit();

    return res.status(200).json({
      message: "Bắt đầu bài kiểm tra thành công",
      quiz: {
        quiz_id: quiz.quiz_id,
        name: quiz.name,
        start_time: quiz.start_time,
        end_time: quiz.end_time,
        status: quiz.status,
        pin: quiz.pin,
        current_question_index: 0,
        total_questions: questions ? questions.length : 0,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Lỗi trong startQuiz:", error);
    return res
      .status(500)
      .json({ error: "Lỗi khi bắt đầu bài kiểm tra", details: error.message });
  }
};

// Hàm chuyển câu hỏi tiếp theo (dùng socket và cache, không query DB)
const nextQuestionSocket = async (quizId, currentIndex) => {
  // Kiểm tra nếu đã ở câu hỏi cuối cùng thì không gửi câu hỏi tiếp theo nữa
  const questions = await getCache(`quiz:${quizId}:questions`);
  if (!questions || currentIndex >= questions.length) {
    return;
  }
  await sendNextQuestionSocket(quizId, currentIndex);
};

const showLeaderboard = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const quizId = req.params.id;

    const quiz = await Quiz.findByPk(quizId, {
      include: [
        {
          model: QuizResult,
          as: "QuizResults",
          attributes: ["result_id", "user_id", "score"],
          include: [
            {
              model: User,
              as: "Student",
              attributes: ["user_id", "name"],
            },
          ],
        },
      ],
      transaction,
    });

    if (!quiz) {
      await transaction.rollback();
      return res.status(404).json({ error: "Bài kiểm tra không tồn tại" });
    }

    if (quiz.status !== "active") {
      await transaction.rollback();
      return res
        .status(400)
        .json({ error: "Bài kiểm tra chưa bắt đầu hoặc đã kết thúc" });
    }

    // Cập nhật trạng thái hiển thị bảng xếp hạng
    quiz.show_leaderboard = true;
    await quiz.save({ transaction });

    // Lấy bảng xếp hạng từ Firebase thay vì DB
    const leaderboard = await quizRealtimeService.getRealtimeLeaderboard(
      quiz.quiz_id
    );

    // Thông báo hiển thị bảng xếp hạng
    io.to(`quiz:${quiz.quiz_id}:students`).emit("showLeaderboard", {
      quiz_id: quiz.quiz_id,
      leaderboard: leaderboard || [],
      current_question_index: quiz.current_question_index || 0,
      total_questions: quiz.Questions ? quiz.Questions.length : 0,
    });

    await transaction.commit();

    return res.status(200).json({
      success: true,
      data: {
        message: "Hiển thị bảng xếp hạng thành công",
        leaderboard: leaderboard || [],
        current_question_index: quiz.current_question_index || 0,
        total_questions: quiz.Questions ? quiz.Questions.length : 0,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Lỗi trong showLeaderboard:", error);
    return res.status(500).json({
      error: "Lỗi khi hiển thị bảng xếp hạng",
      details: error.message,
    });
  }
};

const getQuizQuestions = async (req, res) => {
  try {
    const quizId = req.params.id;
    const userId = req.user?.user_id;
    let questions = null;
    let userAnswers = {};
    // Lấy danh sách câu hỏi
    let cachedQuestions = null;
    try {
      cachedQuestions = await getCache(`quiz:${quizId}:questions`);
    } catch {}
    if (cachedQuestions) {
      questions = cachedQuestions;
    } else {
      const quiz = await Quiz.findByPk(quizId, {
        include: [
          {
            model: Question,
            as: "Questions",
            through: { attributes: [] },
            attributes: [
              "question_id",
              "question_text",
              "question_type_id",
              "level_id",
              "lo_id",
              "explanation",
            ],
            include: [
              {
                model: Answer,
                as: "Answers",
                attributes: ["answer_id", "answer_text", "iscorrect"],
              },
              {
                model: QuestionType,
                as: "QuestionType",
                attributes: ["question_type_id", "name"],
              },
              { model: Level, as: "Level", attributes: ["level_id", "name"] },
              { model: LO, as: "LO", attributes: ["lo_id", "name"] },
            ],
          },
        ],
        attributes: ["quiz_id", "name", "status"],
      });
      if (!quiz)
        return res.status(404).json({ error: "Bài kiểm tra không tồn tại" });
      questions = quiz.Questions.map((q) => ({
        question_id: q.question_id,
        question_text: q.question_text,
        question_type: {
          question_type_id: q.QuestionType?.question_type_id,
          name: q.QuestionType?.name,
        },
        level: {
          level_id: q.Level?.level_id,
          name: q.Level?.name,
        },
        lo: {
          lo_id: q.LO?.lo_id,
          name: q.LO?.name,
        },
        explanation: q.explanation,
        answers: q.Answers.map((a) => ({
          answer_id: a.answer_id,
          answer_text: a.answer_text,
          iscorrect: a.iscorrect,
        })),
      }));
    }
    // Lấy trạng thái trả lời của user từ Firebase nếu có user
    if (userId) {
      const { db } = require("../config/firebase");
      const participantRef = db.ref(
        `quiz_sessions/${quizId}/participants/${userId}`
      );
      const snapshot = await participantRef.once("value");
      const data = snapshot.val();
      if (data && data.answers) userAnswers = data.answers;
    }
    // Gắn trạng thái vào từng câu hỏi
    const questionsWithStatus = questions.map((q) => {
      const ans = userAnswers[q.question_id];
      return {
        ...q,
        user_answer: ans
          ? {
              answer_id: ans.answer_id,
              is_correct: ans.is_correct,
              attempts: ans.attempts,
              can_retry: !ans.is_correct && ans.attempts < 2,
            }
          : null,
      };
    });
    return res.status(200).json({
      success: true,
      data: {
        message: "Lấy thông tin câu hỏi thành công",
        quiz_id: quizId,
        questions: questionsWithStatus,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Lỗi khi lấy thông tin câu hỏi", details: error.message });
  }
};

// Hàm tạo quiz session
const createQuizSession = async (quizId, userId, duration) => {
  const sessionId = `quiz_${quizId}_${userId}_${Date.now()}`;
  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

  const session = {
    session_id: sessionId,
    quiz_id: quizId,
    user_id: userId,
    start_time: startTime,
    end_time: endTime,
    current_question: 0,
    answers: {},
    status: "in_progress",
    last_activity: startTime,
    quiz_stages: [],
  };

  // Lưu session vào Redis với thời gian sống bằng thời gian làm bài
  await setCache(`quiz_session:${sessionId}`, session, duration * 60);

  return session;
};

// Hàm cập nhật quiz session
const updateQuizSession = async (sessionId, updates) => {
  const session = await getCache(`quiz_session:${sessionId}`);
  if (!session) return null;

  const updatedSession = {
    ...session,
    ...updates,
    last_activity: new Date(),
  };

  // Tính thời gian còn lại của session
  const remainingTime = Math.max(0, new Date(session.end_time) - new Date());
  const remainingMinutes = Math.ceil(remainingTime / (1000 * 60));

  // Cập nhật session với thời gian còn lại
  await setCache(
    `quiz_session:${sessionId}`,
    updatedSession,
    remainingMinutes * 60
  );

  return updatedSession;
};

// Hàm lấy quiz session
const getQuizSessionById = async (sessionId) => {
  return await getCache(`quiz_session:${sessionId}`);
};

// Sửa lại hàm joinQuiz để tạo session
const joinQuiz = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { pin } = req.body;
    const quizId = req.params.id;
    const io = req.app.get("io");

    // Log khi có request join quiz
    console.log("Join Quiz Request:");
    console.log("User ID:", req.user.user_id);
    console.log("Quiz ID:", quizId);
    console.log("PIN:", pin);
    console.log("Headers:", req.headers);
    console.log("User Agent:", req.headers["user-agent"]);

    if (!pin) {
      await transaction.rollback();
      return res.status(400).json({ error: "Vui lòng cung cấp mã PIN" });
    }

    // Tìm quiz với PIN và trạng thái pending hoặc active
    const quiz = await Quiz.findOne({
      where: {
        quiz_id: quizId,
        pin: pin,
        status: {
          [Op.in]: ["pending", "active"],
        },
      },
      include: [
        {
          model: Question,
          as: "Questions",
          through: { attributes: [] },
          attributes: ["question_id"],
        },
      ],
      transaction,
    });

    if (!quiz) {
      await transaction.rollback();
      return res
        .status(404)
        .json({ error: "Không tìm thấy bài kiểm tra hoặc mã PIN không đúng" });
    }

    // Kiểm tra xem quiz có câu hỏi nào không
    if (!quiz.Questions || quiz.Questions.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ error: "Bài kiểm tra chưa có câu hỏi" });
    }

    // Kiểm tra xem học viên đã tham gia quiz này chưa
    const existingResult = await QuizResult.findOne({
      where: {
        quiz_id: quizId,
        user_id: req.user.user_id,
      },
      transaction,
    });

    // Lấy thông tin người dùng
    const user = await User.findByPk(req.user.user_id, {
      attributes: ["user_id", "name", "email"],
      transaction,
    });

    // Kiểm tra dữ liệu từ Firebase
    const participantRef = db.ref(
      `quiz_sessions/${quizId}/participants/${req.user.user_id}`
    );
    const participantSnapshot = await participantRef.once("value");
    const participantData = participantSnapshot.val();

    let quizResult;
    if (existingResult) {
      // Nếu đã có kết quả trong DB, cập nhật trạng thái
      existingResult.status = "in_progress";
      existingResult.update_time = new Date();
      await existingResult.save({ transaction });
      quizResult = existingResult;
    } else {
      // Tạo kết quả mới cho học viên
      quizResult = await QuizResult.create(
        {
          quiz_id: quizId,
          user_id: req.user.user_id,
          score: 0,
          status: "in_progress",
          update_time: new Date(),
          completion_time: null,
        },
        { transaction }
      );
    }

    // Tạo hoặc lấy quiz session
    let session;
    if (participantData && participantData.session_id) {
      session = await getQuizSessionById(participantData.session_id);
      if (session) {
        // Cập nhật session hiện tại
        session = await updateQuizSession(participantData.session_id, {
          last_activity: new Date(),
          status: "in_progress",
        });
      }
    }

    if (!session) {
      // Tạo session mới
      session = await createQuizSession(
        quizId,
        req.user.user_id,
        quiz.duration
      );
    }

    // Khôi phục dữ liệu từ Firebase nếu có
    if (participantData) {
      // Cập nhật lại dữ liệu trong Firebase
      await participantRef.update({
        status: "in_progress",
        last_accessed: Date.now(),
        session_id: session.session_id,
      });

      // Gửi sự kiện realtime cho tất cả giáo viên đang theo dõi quiz này
      if (io) {
        io.to(`quiz:${quizId}:teachers`).emit("participantRejoined", {
          quiz_id: quizId,
          participant: {
            user_id: user.user_id,
            name: user.name,
            email: user.email,
            score: participantData.current_score || 0,
            status: "in_progress",
            last_accessed: new Date(),
            current_question_id: participantData.current_question_id,
            correct_answers: participantData.correct_answers || 0,
            total_answers: participantData.total_answers || 0,
          },
        });
      }

      // Lấy câu hỏi từ cache
      const questions = await getCache(`quiz:${quizId}:questions`);
      if (questions) {
        // Tìm câu hỏi hiện tại
        let currentQuestionIndex = 0;
        if (participantData.current_question_id) {
          currentQuestionIndex = questions.findIndex(
            (q) => q.question_id === participantData.current_question_id
          );
          if (currentQuestionIndex === -1) currentQuestionIndex = 0;
        }

        // Lấy thời gian bắt đầu câu hỏi hiện tại từ Firebase
        const currentQuestionRef = db.ref(
          `quiz_sessions/${quizId}/current_question`
        );
        const currentQuestionSnapshot = await currentQuestionRef.once("value");
        const currentQuestionData = currentQuestionSnapshot.val();

        // Tính toán thời gian còn lại
        let remainingTime = 30000; // 30 giây mặc định
        if (currentQuestionData && currentQuestionData.start_time) {
          const elapsedTime = Date.now() - currentQuestionData.start_time;
          remainingTime = Math.max(0, 30000 - elapsedTime);
        }

        // Đợi một khoảng thời gian ngắn để đảm bảo frontend đã kết nối socket
        setTimeout(() => {
          // Gửi câu hỏi hiện tại và thông tin tiến độ
          io.to(`quiz:${quizId}:${user.user_id}`).emit("restoreProgress", {
            quiz_id: quizId,
            current_question: questions[currentQuestionIndex],
            current_question_index: currentQuestionIndex,
            total_questions: questions.length,
            score: participantData.current_score || 0,
            correct_answers: participantData.correct_answers || 0,
            total_answers: participantData.total_answers || 0,
            answered_questions: participantData.answers || {},
            progress: {
              answered: Object.keys(participantData.answers || {}).length,
              total: questions.length,
              percentage:
                (Object.keys(participantData.answers || {}).length /
                  questions.length) *
                100,
            },
            remaining_time: remainingTime,
            question_start_time: currentQuestionData?.start_time || Date.now(),
          });

          // Gửi thời gian còn lại cho người dùng
          io.to(`quiz:${quizId}:${user.user_id}`).emit("restoreQuestionTimer", {
            quiz_id: quizId,
            remaining_time: remainingTime,
            question_index: currentQuestionIndex,
            question_start_time: currentQuestionData?.start_time || Date.now(),
          });
        }, 1000);
      }
    } else {
      // Nếu không có dữ liệu trong Firebase, gửi thông báo tham gia mới
      if (io) {
        io.to(`quiz:${quizId}:teachers`).emit("newParticipant", {
          quiz_id: quizId,
          participant: {
            user_id: user.user_id,
            name: user.name,
            email: user.email,
            score: 0,
            status: "in_progress",
            last_accessed: new Date(),
          },
        });
      }
    }

    await transaction.commit();

    return res.status(200).json({
      message: "Tham gia bài kiểm tra thành công",
      quiz: {
        quiz_id: quiz.quiz_id,
        name: quiz.name,
        status: quiz.status,
        current_question_index: quiz.current_question_index,
        total_questions: quiz.Questions.length,
        start_time: quiz.start_time,
        end_time: quiz.end_time,
      },
      progress: participantData
        ? {
            current_question_id: participantData.current_question_id,
            score: participantData.current_score || 0,
            correct_answers: participantData.correct_answers || 0,
            total_answers: participantData.total_answers || 0,
            answered_questions: participantData.answers || {},
          }
        : null,
      session: {
        session_id: session.session_id,
        start_time: session.start_time,
        end_time: session.end_time,
        remaining_time: Math.max(0, new Date(session.end_time) - new Date()),
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Lỗi trong joinQuiz:", error);
    return res.status(500).json({
      error: "Lỗi khi tham gia bài kiểm tra",
      details: error.message,
    });
  }
};

const getLeaderboard = async (req, res) => {
  try {
    const quizId = req.params.id;
    const quiz = await Quiz.findByPk(quizId);

    if (!quiz) {
      return res
        .status(404)
        .json({ success: false, message: "Quiz không tồn tại" });
    }

    let leaderboard;

    // Logic phân nhánh dựa trên quiz_mode
    if (quiz.quiz_mode === "assessment") {
      // Chế độ Đánh giá: Lấy leaderboard từ kết quả cuối cùng trong DB
      console.log(
        `[Leaderboard] Getting ASSESSMENT leaderboard for quiz ${quizId}`
      );
      const results = await QuizResult.findAll({
        where: { quiz_id: quizId },
        include: [
          {
            model: User,
            as: "Student",
            attributes: ["user_id", "name", "email"],
          },
        ],
        order: [["score", "DESC"]],
      });

      leaderboard = results.map((result, index) => ({
        position: index + 1,
        user_id: result.Student.user_id,
        name: result.Student.name,
        score: result.score,
      }));
    } else {
      // Chế độ Luyện tập (hoặc các mode có gamification): Lấy leaderboard real-time
      console.log(
        `[Leaderboard] Getting REALTIME leaderboard for quiz ${quizId}`
      );
      leaderboard = await quizRealtimeService.getRealtimeLeaderboard(quizId);
    }

    return res.status(200).json({
      success: true,
      data: {
        message: `Lấy bảng xếp hạng cho quiz mode '${quiz.quiz_mode}' thành công`,
        leaderboard,
      },
    });
  } catch (error) {
    console.error("Lỗi trong getLeaderboard:", error);
    return res
      .status(500)
      .json({ error: "Lỗi khi lấy bảng xếp hạng", details: error.message });
  }
};

const getCurrentQuestion = async (req, res) => {
  try {
    const quizId = req.params.id;
    const quiz = await Quiz.findByPk(quizId, {
      include: [
        {
          model: Question,
          as: "Questions",
          through: { attributes: [] },
          attributes: ["question_id", "question_text"],
          include: [
            {
              model: Answer,
              as: "Answers",
              attributes: ["answer_id", "answer_text"],
            },
          ],
        },
      ],
    });

    if (!quiz) {
      return res.status(404).json({ error: "Bài kiểm tra không tồn tại" });
    }

    if (quiz.status !== "active") {
      return res
        .status(400)
        .json({ error: "Bài kiểm tra chưa bắt đầu hoặc đã kết thúc" });
    }

    const currentQuestion = quiz.Questions[quiz.current_question_index];
    if (!currentQuestion) {
      return res.status(404).json({ error: "Không tìm thấy câu hỏi hiện tại" });
    }

    return res.status(200).json({
      message: "Lấy câu hỏi hiện tại thành công",
      question: {
        question_id: currentQuestion.question_id,
        question_text: currentQuestion.question_text,
        answers: currentQuestion.Answers,
        current_question_index: quiz.current_question_index,
        total_questions: quiz.Questions.length,
      },
    });
  } catch (error) {
    console.error("Lỗi trong getCurrentQuestion:", error);
    return res
      .status(500)
      .json({ error: "Lỗi khi lấy câu hỏi hiện tại", details: error.message });
  }
};

const getMyResult = async (req, res) => {
  try {
    const quizId = req.params.id;
    const userId = req.user.user_id;

    const quizResult = await QuizResult.findOne({
      where: {
        quiz_id: quizId,
        user_id: userId,
      },
      include: [
        {
          model: Quiz,
          as: "Quiz",
          attributes: ["quiz_id", "name", "status"],
        },
      ],
    });

    if (!quizResult) {
      return res.status(404).json({ error: "Không tìm thấy kết quả của bạn" });
    }

    return res.status(200).json({
      message: "Lấy kết quả thành công",
      result: {
        quiz_id: quizResult.Quiz.quiz_id,
        quiz_name: quizResult.Quiz.name,
        score: quizResult.score,
        status: quizResult.status,
        position: await getPositionInLeaderboard(quizId, userId),
      },
    });
  } catch (error) {
    console.error("Lỗi trong getMyResult:", error);
    return res
      .status(500)
      .json({ error: "Lỗi khi lấy kết quả", details: error.message });
  }
};

// Helper functions
async function getLeaderboardData(quizId) {
  const quiz = await Quiz.findByPk(quizId, {
    include: [
      {
        model: QuizResult,
        as: "QuizResults",
        attributes: ["result_id", "user_id", "score"],
        include: [
          {
            model: User,
            as: "Student",
            attributes: ["user_id", "name"],
          },
        ],
      },
    ],
  });

  return quiz.QuizResults.map((r) => ({
    user_id: r.Student.user_id,
    name: r.Student.name,
    score: r.score,
  })).sort((a, b) => b.score - a.score);
}

async function getPositionInLeaderboard(quizId, userId) {
  const leaderboard = await getLeaderboardData(quizId);
  const position = leaderboard.findIndex((item) => item.user_id === userId);
  return position + 1; // Vị trí bắt đầu từ 1
}

// Trộn lại câu hỏi của bài quiz
const shuffleQuestions = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const quizId = req.params.id;
    const quiz = await Quiz.findByPk(quizId, {
      include: [
        {
          model: Question,
          as: "Questions",
          through: { attributes: [] },
          attributes: ["question_id"],
        },
      ],
      transaction,
    });

    if (!quiz) {
      await transaction.rollback();
      return res.status(404).json({ error: "Bài kiểm tra không tồn tại" });
    }

    // Kiểm tra trạng thái quiz
    if (quiz.status !== "pending") {
      await transaction.rollback();
      return res.status(400).json({
        error: "Chỉ có thể trộn câu hỏi khi bài kiểm tra chưa bắt đầu",
      });
    }

    // Lấy danh sách câu hỏi hiện tại
    const currentQuestions = quiz.Questions.map((q) => q.question_id);

    // Xóa tất cả liên kết câu hỏi hiện tại
    await QuizQuestion.destroy({
      where: { quiz_id: quizId },
      transaction,
    });

    // Lấy thông tin về tỷ lệ độ khó từ các câu hỏi hiện tại
    const questions = await Question.findAll({
      where: { question_id: currentQuestions },
      include: [
        {
          model: Level,
          as: "Level",
          attributes: ["level_id", "name"],
        },
      ],
    });

    // Tính toán tỷ lệ độ khó
    const totalQuestions = questions.length;
    const easyCount = questions.filter((q) => q.Level.level_id === 1).length;
    const mediumCount = questions.filter((q) => q.Level.level_id === 2).length;
    const hardCount = questions.filter((q) => q.Level.level_id === 3).length;

    // Tính tỷ lệ phần trăm cho mỗi mức độ
    const difficultyRatio = {
      easy: Math.round((easyCount / totalQuestions) * 100),
      medium: Math.round((mediumCount / totalQuestions) * 100),
      hard: Math.round((hardCount / totalQuestions) * 100),
    };

    // Điều chỉnh tỷ lệ để đảm bảo tổng bằng 100
    const totalRatio =
      difficultyRatio.easy + difficultyRatio.medium + difficultyRatio.hard;
    if (totalRatio !== 100) {
      // Thêm phần dư vào mức độ có nhiều câu hỏi nhất
      if (easyCount >= mediumCount && easyCount >= hardCount) {
        difficultyRatio.easy += 100 - totalRatio;
      } else if (mediumCount >= easyCount && mediumCount >= hardCount) {
        difficultyRatio.medium += 100 - totalRatio;
      } else {
        difficultyRatio.hard += 100 - totalRatio;
      }
    }

    // Lấy danh sách LO từ các câu hỏi hiện tại
    const loIds = [...new Set(questions.map((q) => q.lo_id))];

    // Lấy lại câu hỏi với thứ tự mới và các câu hỏi khác nhau
    const shuffledQuestions = await fetchQuestionsByLOs(
      loIds,
      totalQuestions,
      difficultyRatio,
      null,
      quizId + Date.now() // Thêm timestamp vào quizId để tạo seed khác nhau mỗi lần
    );

    // Tạo lại liên kết với thứ tự mới
    const quizQuestions = shuffledQuestions.map((q) => ({
      quiz_id: quizId,
      question_id: q.question_id,
    }));

    // Cập nhật lại database với câu hỏi mới
    await QuizQuestion.bulkCreate(quizQuestions, { transaction });

    // Xóa cache để đảm bảo dữ liệu mới được lấy
    await deleteCache("quizzes");
    await deleteCache(`quiz:${quizId}`);
    await deleteCache(`quiz:${quizId}:questions`);

    await transaction.commit();

    return res.status(200).json({
      success: true,
      data: {
        message: "Trộn câu hỏi thành công",
        questions: shuffledQuestions,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Lỗi trong shuffleQuestions:", error);
    return res.status(500).json({
      error: "Lỗi khi trộn câu hỏi",
      details: error.message,
    });
  }
};

// Lấy danh sách người dùng đã vào quiz (TỐI ƯU CHO TEACHER, LẤY REALTIME TỪ FIREBASE)
const getQuizParticipants = async (req, res) => {
  try {
    const quizId = req.params.id;
    const io = req.app.get("io");

    // Lấy danh sách QuizResult từ DB (để lấy user_id, name, email)
    const quiz = await Quiz.findByPk(quizId, {
      include: [
        {
          model: QuizResult,
          as: "QuizResults",
          attributes: [
            "result_id",
            "user_id",
            "score",
            "status",
            "update_time",
          ],
          include: [
            {
              model: User,
              as: "Student",
              attributes: ["user_id", "name", "email"],
            },
          ],
        },
      ],
    });
    if (!quiz) {
      return res.status(404).json({ error: "Bài kiểm tra không tồn tại" });
    }

    // Lấy realtime từ Firebase
    const quizRef = db.ref(`quiz_sessions/${quizId}/participants`);
    const snapshot = await quizRef.once("value");
    const participantsRealtime = snapshot.val() || {};

    // Merge DB + Firebase, ưu tiên dữ liệu realtime
    // Nếu user chỉ có trong Firebase (chưa có QuizResult), vẫn trả về
    // Nếu user chỉ có trong DB, vẫn trả về (nhưng trạng thái realtime sẽ là null)
    const userMap = {};
    quiz.QuizResults.forEach((result) => {
      userMap[result.user_id] = {
        user_id: result.Student.user_id,
        name: result.Student.name,
        email: result.Student.email,
        db_score: result.score,
        db_status: result.status,
        db_update_time: result.update_time,
      };
    });
    // Lấy tất cả user_id từ cả DB và Firebase
    const allUserIds = Array.from(
      new Set([...Object.keys(userMap), ...Object.keys(participantsRealtime)])
    );
    // Format lại danh sách
    const participants = await Promise.all(
      allUserIds.map(async (userId) => {
        const dbInfo = userMap[userId] || {};
        const realtime = participantsRealtime[userId] || {};
        // Nếu user chỉ có trong Firebase, lấy thêm thông tin từ DB nếu có
        let name = dbInfo.name;
        let email = dbInfo.email;
        let avatar_url = null;
        if ((!name || !email) && !dbInfo.user_id) {
          // Thử lấy từ DB
          const user = await User.findByPk(userId, {
            attributes: ["user_id", "name", "email"],
            include: [
              {
                model: require("../models").UserCustomization,
                as: "UserCustomization",
                attributes: ["equipped_avatar_id"],
                required: false,
                include: [
                  {
                    model: require("../models").Avatar,
                    as: "EquippedAvatar",
                    attributes: ["image_path"],
                    required: false,
                  },
                ],
              },
            ],
          });
          if (user) {
            name = user.name;
            email = user.email;
            avatar_url =
              user.UserCustomization?.EquippedAvatar?.image_path ||
              "/assets/avatars/default.png";
          }
        } else if (dbInfo.user_id) {
          // Lấy avatar từ DB cho user đã có trong QuizResults
          const user = await User.findByPk(userId, {
            attributes: [],
            include: [
              {
                model: require("../models").UserCustomization,
                as: "UserCustomization",
                attributes: ["equipped_avatar_id"],
                required: false,
                include: [
                  {
                    model: require("../models").Avatar,
                    as: "EquippedAvatar",
                    attributes: ["image_path"],
                    required: false,
                  },
                ],
              },
            ],
          });
          if (user) {
            avatar_url =
              user.UserCustomization?.EquippedAvatar?.image_path ||
              "/assets/avatars/default.png";
          }
        }
        return {
          user_id: userId,
          name: name || "Unknown",
          email: email || "",
          avatar_url: avatar_url,
          score: realtime.current_score ?? dbInfo.db_score ?? 0,
          status: realtime.status ?? dbInfo.db_status ?? "in_progress",
          last_accessed: realtime.last_answer_time
            ? new Date(realtime.last_answer_time)
            : dbInfo.db_update_time,
          current_question_id: realtime.current_question_id ?? null,
          correct_answers: realtime.correct_answers ?? null,
          total_answers: realtime.total_answers ?? null,
          progress:
            realtime.current_question_id && realtime.total_questions
              ? typeof realtime.current_question_id === "number" &&
                typeof realtime.total_questions === "number" &&
                realtime.total_questions > 0
                ? Math.round(
                    (((realtime.question_index ?? 0) + 1) /
                      realtime.total_questions) *
                      100
                  )
                : null
              : null,
        };
      })
    );

    // Emit socket event cho giáo viên
    if (io) {
      io.to(`quiz:${quizId}:teachers`).emit("teacherUpdates", { participants });
    }

    return res.status(200).json({
      success: true,
      data: {
        message: "Lấy danh sách người tham gia thành công",
        participants,
      },
    });
  } catch (error) {
    console.error("Lỗi trong getQuizParticipants:", error);
    return res.status(500).json({
      error: "Lỗi khi lấy danh sách người tham gia",
      details: error.message,
    });
  }
};

// Lấy ID bài quiz từ mã PIN
const getQuizIdByPin = async (req, res) => {
  try {
    const { pin } = req.params;

    if (!pin) {
      return res.status(400).json({ error: "Vui lòng cung cấp mã PIN" });
    }

    const quiz = await Quiz.findOne({
      where: { pin },
      attributes: ["quiz_id", "name", "status"],
    });

    if (!quiz) {
      return res
        .status(404)
        .json({ error: "Không tìm thấy bài kiểm tra với mã PIN này" });
    }

    return res.status(200).json({
      message: "Lấy ID bài kiểm tra thành công",
      quiz: {
        quiz_id: quiz.quiz_id,
        name: quiz.name,
        status: quiz.status,
      },
    });
  } catch (error) {
    console.error("Lỗi trong getQuizIdByPin:", error);
    return res
      .status(500)
      .json({ error: "Lỗi khi lấy ID bài kiểm tra", details: error.message });
  }
};

// Hàm để thiết lập io instance toàn cục
const setGlobalIO = (ioInstance) => {
  if (ioInstance) {
    io = ioInstance;
    quizRealtimeService = new QuizRealtimeService(ioInstance);
    answerChoiceStatsService = new AnswerChoiceStatsService(ioInstance);
    setupSocketMiddleware(ioInstance);
  }
};

// Hàm xử lý cập nhật bảng xếp hạng realtime
const handleLeaderboardUpdate = async (quizId, userId, newScore) => {
  try {
    // Lấy bảng xếp hạng hiện tại
    const currentLeaderboard = await quizRealtimeService.getRealtimeLeaderboard(
      quizId
    );

    // Tìm vị trí cũ của người dùng
    const oldPosition = currentLeaderboard.findIndex(
      (entry) => entry.user_id === userId
    );

    // Cập nhật điểm mới
    const updatedLeaderboard = currentLeaderboard
      .map((entry) => {
        if (entry.user_id === userId) {
          return { ...entry, score: newScore };
        }
        return entry;
      })
      .sort((a, b) => b.score - a.score);

    // Tìm vị trí mới của người dùng
    const newPosition = updatedLeaderboard.findIndex(
      (entry) => entry.user_id === userId
    );

    // Gửi cập nhật qua socket với thông tin animation
    if (io) {
      io.to(`quiz:${quizId}`).emit("leaderboardUpdate", {
        leaderboard: updatedLeaderboard,
        user_id: userId,
        old_position: oldPosition,
        new_position: newPosition,
        score_change: newScore - (currentLeaderboard[oldPosition]?.score || 0),
        show_animation: true,
      });
    }
  } catch (error) {
    console.error("Error in handleLeaderboardUpdate:", error);
  }
};

// Hàm gửi cập nhật realtime cho giảng viên
const emitTeacherUpdates = async (quizId) => {
  try {
    // Lấy điểm số realtime trực tiếp từ Firebase
    const quizRef = db.ref(`quiz_sessions/${quizId}/participants`);
    const snapshot = await quizRef.once("value");
    const participants = snapshot.val() || {};

    // Format dữ liệu scores và kiểm tra user tồn tại
    const scores = [];
    for (const [userId, data] of Object.entries(participants)) {
      // Kiểm tra user tồn tại trong DB
      const user = await User.findByPk(userId);
      if (!user) {
        // Xóa dữ liệu không hợp lệ khỏi Firebase
        await db.ref(`quiz_sessions/${quizId}/participants/${userId}`).remove();
        console.warn(`User ${userId} not found in DB, removing from Firebase`);
        continue;
      }

      scores.push({
        user_id: userId,
        score: data.current_score || 0,
        correct_answers: data.correct_answers || 0,
        total_answers: data.total_answers || 0,
        status: data.status || "in_progress",
      });
    }

    // Tính toán thống kê
    const statistics = {
      total_participants: scores.length,
      average_score:
        scores.reduce((acc, curr) => acc + curr.score, 0) / scores.length || 0,
      highest_score: Math.max(...scores.map((s) => s.score), 0),
      lowest_score: Math.min(...scores.map((s) => s.score), 0),
      completion_rate:
        (scores.filter((s) => s.status === "completed").length /
          scores.length) *
          100 || 0,
      score_distribution: {
        "0-2": scores.filter((s) => s.score >= 0 && s.score < 2).length,
        "2-4": scores.filter((s) => s.score >= 2 && s.score < 4).length,
        "4-6": scores.filter((s) => s.score >= 4 && s.score < 6).length,
        "6-8": scores.filter((s) => s.score >= 6 && s.score < 8).length,
        "8-10": scores.filter((s) => s.score >= 8 && s.score <= 10).length,
      },
      average_response_time:
        scores.reduce((acc, curr) => acc + (curr.response_time || 0), 0) /
          scores.length || 0,
    };

    // Lấy dữ liệu chi tiết của tất cả học viên
    const detailedScores = await Promise.all(
      scores.map(async (score) => {
        const participantData = participants[score.user_id];
        if (!participantData) return null;

        const user = await User.findByPk(score.user_id, {
          attributes: ["user_id", "name", "email"],
        });

        if (!user) return null;

        return {
          user_id: score.user_id,
          name: user.name,
          email: user.email,
          current_score: score.score,
          correct_answers: score.correct_answers,
          total_answers: score.total_answers,
          status: score.status,
          current_question_id: participantData.current_question_id,
          answer_history: participantData.answers || {},
          last_answer_time: participantData.last_answer_time,
          progress: {
            current_question: participantData.current_question_id,
            total_questions: participantData.total_questions || 0,
            percentage: participantData.total_questions
              ? (Object.keys(participantData.answers || {}).length /
                  participantData.total_questions) *
                100
              : 0,
          },
        };
      })
    );

    // Gửi cập nhật qua socket
    if (io) {
      io.to(`quiz:${quizId}:teachers`).emit("teacherUpdates", {
        quiz_id: quizId,
        scores,
        statistics,
        detailed_scores: detailedScores.filter(Boolean),
        timestamp: Date.now(),
      });
    }
  } catch (error) {
    console.error("Lỗi trong emitTeacherUpdates:", error);
  }
};

// Thêm hàm kiểm tra và kết thúc quiz khi tất cả đã hoàn thành
const checkAndEndQuizIfAllCompleted = async (quizId) => {
  try {
    // Lấy dữ liệu từ Firebase
    const quizRef = db.ref(`quiz_sessions/${quizId}/participants`);
    const snapshot = await quizRef.once("value");
    const participants = snapshot.val();

    if (!participants) return;

    // Kiểm tra xem tất cả người tham gia đã hoàn thành chưa
    const allCompleted = Object.values(participants).every(
      (participant) => participant.status === "completed"
    );

    if (allCompleted) {
      // Thay vì endQuiz ngay lập tức, delay 5 giây rồi kiểm tra lại
      console.log(
        `Tất cả người tham gia đã hoàn thành quiz ${quizId}, sẽ kiểm tra lại sau 5 giây trước khi kết thúc quiz...`
      );
      setTimeout(async () => {
        // Kiểm tra lại lần nữa
        const snapshot2 = await quizRef.once("value");
        const participants2 = snapshot2.val();
        if (!participants2) return;
        const allCompleted2 = Object.values(participants2).every(
          (participant) => participant.status === "completed"
        );
        if (allCompleted2) {
          console.log(
            `Xác nhận lại: tất cả đã hoàn thành quiz ${quizId}, đang kết thúc quiz...`
          );
          await endQuizById(quizId);
        } else {
          console.log(
            `Sau 5 giây, phát hiện có người chưa hoàn thành quiz ${quizId}, không kết thúc quiz.`
          );
        }
      }, 5000);
    }
  } catch (error) {
    console.error("Lỗi khi kiểm tra trạng thái hoàn thành:", error);
  }
};

// Sửa lại hàm handleRealtimeAnswer để kiểm tra trạng thái hoàn thành và xử lý luồng bài quiz
const handleRealtimeAnswer = async (req, res) => {
  try {
    const {
      quizId,
      questionId,
      answerId,
      startTime,
      userId,
      showLeaderboardImmediately,
    } = req.body;

    // Kiểm tra quiz có tồn tại
    const quiz = await Quiz.findByPk(quizId);
    if (!quiz) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy bài kiểm tra" });
    }

    // Lấy thông tin câu hỏi và đáp án
    const question = await Question.findByPk(questionId, {
      include: [
        {
          model: Answer,
        },
        {
          model: Level, // THÊM INCLUDE LEVEL ĐỂ LẤY DIFFICULTY
        },
      ],
    });

    if (!question) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy câu hỏi" });
    }

    // Tính thời gian trả lời
    const responseTime = Date.now() - startTime;

    // Kiểm tra đáp án đúng
    const correctAnswer = await Answer.findOne({
      where: {
        question_id: questionId,
        answer_id: answerId,
        iscorrect: true,
      },
    });
    const isCorrect = !!correctAnswer;

    // Calculate score based on quiz mode
    let scoreResult = null;
    try {
      // LẤY DIFFICULTY TỪ LEVEL (đã được query ở trên với include Level)
      const questionDifficulty =
        question?.Level?.name?.toLowerCase() || "medium";

      console.log(
        `[handleRealtimeAnswer] Question ${questionId} difficulty: "${questionDifficulty}" (from Level: ${
          question?.Level?.name || "N/A"
        })`
      );

      // Use QuizModeService to calculate score based on mode
      scoreResult = await QuizModeService.calculateScore({
        userId,
        questionId,
        quizId,
        isCorrect,
        responseTime,
        attemptNumber: 1,
        questionDifficulty, // Sử dụng difficulty từ Level
        totalQuizTime: quiz.duration ? quiz.duration * 60 * 1000 : null, // Convert minutes to milliseconds
        timeRemaining: quiz.end_time
          ? new Date(quiz.end_time) - Date.now()
          : null,
      });

      console.log(
        `[handleRealtimeAnswer] Score calculation result:`,
        JSON.stringify(scoreResult, null, 2)
      );
    } catch (error) {
      console.error("Error calculating score:", error);
    }

    // Save answer using QuizModeService
    const saveResult = await QuizModeService.saveAnswer(
      quizId,
      userId,
      questionId,
      answerId,
      isCorrect,
      responseTime
    );

    // Lưu câu trả lời vào Redis với score result
    await quizRealtimeService.saveRealtimeAnswer(
      quizId,
      userId,
      questionId,
      answerId,
      isCorrect,
      responseTime,
      scoreResult
    );

    // Track answer choice for real-time statistics với user info
    try {
      if (answerChoiceStatsService) {
        // Lấy user info từ req.user để tránh query DB thêm
        const userInfo = {
          user_id: userId,
          name: req.user?.name || "Unknown User",
          email: req.user?.email || "",
          role: req.user?.Role?.name || req.roleName || "student",
        };

        await answerChoiceStatsService.trackAnswerChoice(
          quizId,
          questionId,
          userId,
          answerId,
          isCorrect,
          userInfo
        );
      }
    } catch (error) {
      console.error("Error tracking answer choice:", error);
      // Don't fail the request if choice tracking fails
    }

    // Lấy vị trí hiện tại của người dùng
    const userPosition = await quizRealtimeService.getPreviousPosition(
      quizId,
      userId
    );

    // Kiểm tra quiz mode để quyết định có hiển thị real-time leaderboard không
    const quizMode = await QuizModeService.getQuizMode(quizId);
    const isRealTimeLeaderboardEnabled =
      await QuizModeService.isGamificationEnabled(quizId);

    if (quizMode === "practice" && isRealTimeLeaderboardEnabled) {
      // Gửi cập nhật vị trí real-time cho practice mode
      io.to(`quiz_${quizId}`).emit("userPositionUpdate", {
        quizId,
        userId,
        position: userPosition.position,
        score: userPosition.score,
        totalParticipants: userPosition.totalParticipants,
        mode: "practice",
      });
    } else if (quizMode === "assessment") {
      // Không gửi real-time updates cho assessment mode
      console.log("Assessment mode: Skipping real-time leaderboard updates");
    }

    // Kiểm tra xem có phải câu hỏi cuối cùng không
    const quizQuestions = await QuizQuestion.findAll({
      where: { quiz_id: quizId },
      include: [
        {
          model: Question,
          attributes: ["question_id"],
        },
      ],
    });

    const totalQuestions = quizQuestions.length;
    const currentQuestionIndex = quizQuestions.findIndex(
      (qq) => qq.question_id === questionId
    );

    // ============================================================
    // PERFORMANCE OPTIMIZATION (99% improvement):
    // REMOVED immediate sync when answering last question
    // Lý do:
    // - Assessment mode: batch sync khi quiz auto-end (1 lần duy nhất)
    // - Practice mode: batch sync cũng đủ
    // - Tránh duplicate sync: immediate + batch = 2x database writes
    // - Real-time leaderboard vẫn hoạt động qua Firebase (không cần PostgreSQL)
    // ============================================================

    // Nếu là câu hỏi cuối cùng, chỉ gửi leaderboard event (không sync DB)
    if (
      currentQuestionIndex !== -1 &&
      currentQuestionIndex === totalQuestions - 1
    ) {
      console.log(
        `[handleRealtimeAnswer] User ${userId} answered last question of quiz ${quizId} - leaderboard will be sent (DB sync on quiz end only)`
      );

      const fullLeaderboard = await quizRealtimeService.getRealtimeLeaderboard(
        quizId
      );
      io.to(`quiz:${quizId}:students`).emit("showLeaderboard", {
        quiz_id: quizId,
        leaderboard: fullLeaderboard,
        current_question_index: currentQuestionIndex,
        isLastQuestion: true,
      });
    }

    // Trả về kết quả cho client
    res.json({
      success: true,
      isCorrect,
      position: userPosition.position,
      score: userPosition.score,
      totalParticipants: userPosition.totalParticipants,
    });
  } catch (error) {
    console.error("Error in handleRealtimeAnswer:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
};

const handleUserAnswer = async (quizId, currentQuestionId, userId) => {
  try {
    // Lấy danh sách câu hỏi
    const questions = await getCache(`quiz:${quizId}:questions`);
    if (!questions) return;

    // Tìm index của câu hỏi hiện tại
    const currentQuestionIndex = questions.findIndex(
      (q) => q.question_id === currentQuestionId
    );
    if (currentQuestionIndex === -1) return;

    // Lấy thông tin người dùng
    const participantRef = db.ref(
      `quiz_sessions/${quizId}/participants/${userId}`
    );
    const participantSnapshot = await participantRef.once("value");
    const participantData = participantSnapshot.val();

    if (!participantData) return;

    // Kiểm tra nếu đã hoàn thành quiz
    if (currentQuestionIndex >= questions.length - 1) {
      // Cập nhật trạng thái hoàn thành cho người dùng
      await participantRef.update({
        status: "completed",
        completed_at: Date.now(),
      });

      // Gửi thông báo hoàn thành cho người dùng
      if (io) {
        io.to(`quiz:${quizId}:${userId}`).emit("quizCompleted", {
          quiz_id: quizId,
          final_score: participantData.current_score || 0,
        });
      }

      // Finalize QuizResult trong DB (assessment mode) - idempotent
      try {
        const {
          finalizeAssessmentParticipant,
        } = require("../services/assessmentFinalizeService");
        await finalizeAssessmentParticipant(quizId, userId);
      } catch (finalizeErr) {
        console.error(
          "[finalize][handleUserAnswer] error:",
          finalizeErr.message
        );
      }

      // Kiểm tra và kết thúc quiz nếu tất cả đã hoàn thành
      await checkAndEndQuizIfAllCompleted(quizId);
      return;
    }

    // Hiển thị kết quả câu trả lời ngay lập tức
    if (io) {
      io.to(`quiz:${quizId}:${userId}`).emit("showAnswerResult", {
        quiz_id: quizId,
        question_id: currentQuestionId,
        is_correct: participantData.answers[currentQuestionId]?.is_correct,
        duration: 3000, // Hiển thị 3 giây
      });
    }

    // Đợi 3 giây để hiển thị kết quả
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Lấy bảng xếp hạng và hiển thị cho người dùng này
    const leaderboard = await quizRealtimeService.getRealtimeLeaderboard(
      quizId
    );
    if (io) {
      // Gửi sự kiện hiển thị bảng xếp hạng với animation cho người dùng này
      io.to(`quiz:${quizId}:${userId}`).emit("showLeaderboard", {
        quiz_id: quizId,
        leaderboard,
        current_question_index: currentQuestionIndex,
        show_animation: true,
        duration: 5000, // Hiển thị 5 giây
      });
    }

    // Đợi 5 giây để hiển thị bảng xếp hạng
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Gửi câu hỏi tiếp theo cho người dùng này
    const nextQuestion = questions[currentQuestionIndex + 1];
    if (io) {
      io.to(`quiz:${quizId}:${userId}`).emit("nextQuestion", {
        quiz_id: quizId,
        current_question: nextQuestion,
        current_question_index: currentQuestionIndex + 1,
        total_questions: questions.length,
      });
    }
  } catch (error) {
    console.error("Lỗi trong handleUserAnswer:", error);
  }
};

// API cho sinh viên rời khỏi phòng quiz
const leaveQuiz = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const quizId = req.params.id;
    const userId = req.user.user_id;
    const io = req.app.get("io");

    // Tìm kết quả quiz của user
    const quizResult = await QuizResult.findOne({
      where: { quiz_id: quizId, user_id: userId },
      transaction,
    });
    if (!quizResult) {
      await transaction.rollback();
      return res
        .status(404)
        .json({ error: "Bạn chưa tham gia phòng này hoặc đã nộp bài." });
    }
    if (quizResult.status !== "in_progress") {
      await transaction.rollback();
      return res
        .status(400)
        .json({ error: "Bạn đã nộp bài, không thể rời phòng." });
    }
    // Xóa kết quả
    await quizResult.destroy({ transaction });

    // Xóa khỏi Firebase realtime nếu có
    try {
      const QuizRealtimeServiceClass = require("../services/quizRealtimeService");
      const tempQuizRealtimeService = new QuizRealtimeServiceClass(io);
      const { db } = require("firebase-admin");
      await db().ref(`quiz_sessions/${quizId}/participants/${userId}`).remove();
    } catch (e) {
      // Không cần rollback nếu Firebase lỗi
    }

    // Gửi sự kiện cho giáo viên nếu cần
    if (io) {
      io.to(`quiz:${quizId}:teachers`).emit("participantLeft", {
        quiz_id: quizId,
        user_id: userId,
      });
    }

    await transaction.commit();
    return res
      .status(200)
      .json({ success: true, data: { message: "Rời phòng thành công." } });
  } catch (error) {
    await transaction.rollback();
    return res
      .status(500)
      .json({ error: "Lỗi khi rời phòng", details: error.message });
  }
};

// Lấy tất cả quiz của teacher theo user_id (chỉ cho teacher, chỉ lấy quiz của chính mình)
const getQuizzesByTeacherId = async (req, res) => {
  try {
    const { user_id } = req.params;
    if (req.roleName !== "teacher" || req.user.user_id !== parseInt(user_id)) {
      return res
        .status(403)
        .json({ message: "Bạn chỉ có thể xem quiz của chính mình (teacher)" });
    }
    const { Course, Subject, Quiz } = require("../models");
    // Lấy tất cả course của teacher
    const courses = await Course.findAll({
      where: { user_id },
      include: [
        {
          model: Subject,
          include: [
            {
              model: Quiz,
            },
          ],
        },
      ],
    });
    // Format lại dữ liệu trả về
    const result = courses.map((course) => ({
      course_id: course.course_id,
      course_name: course.name,
      subjects: course.Subjects.map((subject) => ({
        subject_id: subject.subject_id,
        subject_name: subject.name,
        quizzes: subject.Quizzes.map((quiz) => ({
          quiz_id: quiz.quiz_id,
          quiz_name: quiz.name,
          status: quiz.status,
          duration: quiz.duration,
          start_time: quiz.start_time,
          end_time: quiz.end_time,
          update_time: quiz.update_time,
        })),
      })),
    }));
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy quiz theo teacher",
      error: error.message,
    });
  }
};

// =====================================================
// QUIZ MODE FILTER CONTROLLERS
// =====================================================

// Lấy quiz theo quiz mode
const getQuizzesByMode = async (req, res) => {
  try {
    const { mode } = req.params;
    const {
      page = 1,
      limit = 10,
      course_id,
      status,
      search,
      sort_by = "update_time",
      sort_order = "DESC",
    } = req.query;

    // Validate quiz mode
    if (!["assessment", "practice", "code_practice"].includes(mode)) {
      return res.status(400).json({
        success: false,
        message:
          'Quiz mode không hợp lệ. Chỉ chấp nhận "assessment", "practice" hoặc "code_practice"',
      });
    }

    // Validate sort_by field
    const validSortFields = [
      "quiz_id",
      "name",
      "duration",
      "start_time",
      "end_time",
      "update_time",
      "status",
      "pin",
      "current_question_index",
    ];
    const finalSortBy = validSortFields.includes(sort_by)
      ? sort_by
      : "update_time";
    const finalSortOrder = ["ASC", "DESC"].includes(sort_order.toUpperCase())
      ? sort_order.toUpperCase()
      : "DESC";

    // Tính offset cho phân trang
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Xây dựng điều kiện tìm kiếm
    const whereClause = {
      quiz_mode: mode,
    };

    if (status) {
      whereClause.status = status;
    }

    if (course_id) {
      whereClause.course_id = course_id;
    }

    if (search) {
      whereClause.name = {
        [Op.like]: `%${search}%`,
      };
    }

    // Kiểm tra cache
    const cacheKey = `quizzes_mode:${mode}:${page}:${limit}:${
      course_id || "all"
    }:${status || "all"}:${search || "all"}:${finalSortBy}:${finalSortOrder}`;
    const cachedQuizzes = await getCache(cacheKey);

    if (cachedQuizzes) {
      return res.status(200).json({
        success: true,
        message: `Lấy danh sách quiz ${mode} mode thành công (từ cache)`,
        data: cachedQuizzes,
      });
    }

    // Thực hiện truy vấn
    const { count, rows: quizzes } = await Quiz.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Course,
          as: "Course",
          attributes: ["course_id", "name", "subject_id"],
          include: [
            {
              model: Subject,
              as: "Subject",
              attributes: ["subject_id", "name"],
            },
          ],
        },
        {
          model: Question,
          as: "Questions",
          through: { attributes: [] },
          attributes: ["question_id", "question_text"],
        },
      ],
      attributes: [
        "quiz_id",
        "course_id",
        "name",
        "duration",
        "start_time",
        "end_time",
        "update_time",
        "status",
        "pin",
        "current_question_index",
        "show_leaderboard",
        "quiz_mode",
        "gamification_enabled",
        "avatar_system_enabled",
        "level_progression_enabled",
        "real_time_leaderboard_enabled",
      ],
      order: [[finalSortBy, finalSortOrder]],
      limit: parseInt(limit),
      offset: offset,
      distinct: true,
    });

    // Transform data
    const transformedQuizzes = quizzes.map((quiz) => {
      const quizData = quiz.toJSON();

      // Add subject info for backward compatibility
      if (quizData.Course && quizData.Course.Subject) {
        quizData.subject_id = quizData.Course.Subject.subject_id;
        quizData.Subject = quizData.Course.Subject;
      }

      return quizData;
    });

    // Tính toán thông tin phân trang
    const totalPages = Math.ceil(count / parseInt(limit));
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    const response = {
      quizzes: transformedQuizzes,
      quiz_mode: mode,
      pagination: {
        total: count,
        totalPages,
        currentPage: parseInt(page),
        limit: parseInt(limit),
        hasNextPage,
        hasPrevPage,
      },
    };

    // Cache kết quả
    await setCache(cacheKey, response, 3600);

    return res.status(200).json({
      success: true,
      message: `Lấy danh sách quiz ${mode} mode thành công`,
      data: response,
    });
  } catch (error) {
    console.error("Lỗi trong getQuizzesByMode:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy danh sách quiz theo mode",
      error: error.message,
    });
  }
};

// Lấy quiz theo course và quiz mode
const getQuizzesByCourseAndMode = async (req, res) => {
  try {
    const { courseId, mode } = req.params;
    const {
      page = 1,
      limit = 10,
      status,
      search,
      sort_by = "update_time",
      sort_order = "DESC",
    } = req.query;

    // Validate sort_by field
    const validSortFields = [
      "quiz_id",
      "name",
      "duration",
      "start_time",
      "end_time",
      "update_time",
      "status",
      "pin",
      "current_question_index",
    ];
    const finalSortBy = validSortFields.includes(sort_by)
      ? sort_by
      : "update_time";
    const finalSortOrder = ["ASC", "DESC"].includes(sort_order.toUpperCase())
      ? sort_order.toUpperCase()
      : "DESC";

    // Validate quiz mode
    if (!["assessment", "practice", "code_practice"].includes(mode)) {
      return res.status(400).json({
        success: false,
        message:
          'Quiz mode không hợp lệ. Chỉ chấp nhận "assessment", "practice" hoặc "code_practice"',
      });
    }

    // Validate course_id
    if (!courseId || isNaN(parseInt(courseId))) {
      return res.status(400).json({
        success: false,
        message: "Course ID không hợp lệ",
      });
    }

    // Kiểm tra course có tồn tại không
    const course = await Course.findByPk(courseId, {
      include: [
        {
          model: Subject,
          as: "Subject",
          attributes: ["subject_id", "name"],
        },
      ],
    });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy course",
      });
    }

    // Tính offset cho phân trang
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Xây dựng điều kiện tìm kiếm
    const whereClause = {
      course_id: parseInt(courseId),
      quiz_mode: mode,
    };

    if (status) {
      whereClause.status = status;
    }

    if (search) {
      whereClause.name = {
        [Op.like]: `%${search}%`,
      };
    }

    // Kiểm tra cache
    const cacheKey = `quizzes_course_mode:${courseId}:${mode}:${page}:${limit}:${
      status || "all"
    }:${search || "all"}:${finalSortBy}:${finalSortOrder}`;
    const cachedQuizzes = await getCache(cacheKey);

    if (cachedQuizzes) {
      return res.status(200).json({
        success: true,
        message: `Lấy danh sách quiz course ${courseId} - ${mode} mode thành công (từ cache)`,
        data: cachedQuizzes,
      });
    }

    // Thực hiện truy vấn
    const { count, rows: quizzes } = await Quiz.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Course,
          as: "Course",
          attributes: ["course_id", "name", "subject_id"],
          include: [
            {
              model: Subject,
              as: "Subject",
              attributes: ["subject_id", "name"],
            },
          ],
        },
        {
          model: Question,
          as: "Questions",
          through: { attributes: [] },
          attributes: ["question_id", "question_text"],
        },
      ],
      attributes: [
        "quiz_id",
        "course_id",
        "name",
        "duration",
        "start_time",
        "end_time",
        "update_time",
        "status",
        "pin",
        "current_question_index",
        "show_leaderboard",
        "quiz_mode",
        "gamification_enabled",
        "avatar_system_enabled",
        "level_progression_enabled",
        "real_time_leaderboard_enabled",
      ],
      order: [[finalSortBy, finalSortOrder]],
      limit: parseInt(limit),
      offset: offset,
      distinct: true,
    });

    // Transform data
    const transformedQuizzes = quizzes.map((quiz) => {
      const quizData = quiz.toJSON();

      // Add subject info for backward compatibility
      if (quizData.Course && quizData.Course.Subject) {
        quizData.subject_id = quizData.Course.Subject.subject_id;
        quizData.Subject = quizData.Course.Subject;
      }

      return quizData;
    });

    // Tính toán thông tin phân trang
    const totalPages = Math.ceil(count / parseInt(limit));
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    const response = {
      quizzes: transformedQuizzes,
      course_info: {
        course_id: course.course_id,
        course_name: course.name,
        subject_id: course.Subject?.subject_id,
        subject_name: course.Subject?.name,
      },
      quiz_mode: mode,
      pagination: {
        total: count,
        totalPages,
        currentPage: parseInt(page),
        limit: parseInt(limit),
        hasNextPage,
        hasPrevPage,
      },
    };

    // Cache kết quả
    await setCache(cacheKey, response, 3600);

    return res.status(200).json({
      success: true,
      message: `Lấy danh sách quiz course ${courseId} - ${mode} mode thành công`,
      data: response,
    });
  } catch (error) {
    console.error("Lỗi trong getQuizzesByCourseAndMode:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy danh sách quiz theo course và mode",
      error: error.message,
    });
  }
};

const getQuizSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await QuizSession.findOne({
      where: { session_id: sessionId },
      include: [
        {
          model: Quiz,
          as: "Quiz",
          attributes: ["quiz_id", "name", "status"],
        },
        {
          model: User,
          as: "User",
          attributes: ["user_id", "name", "email"],
        },
      ],
    });

    if (!session) {
      return res.status(404).json({ error: "Không tìm thấy session" });
    }

    return res.status(200).json({
      success: true,
      data: { message: "Lấy thông tin session thành công", session },
    });
  } catch (error) {
    console.error("Lỗi trong getQuizSession:", error);
    return res
      .status(500)
      .json({ error: "Lỗi khi lấy thông tin session", details: error.message });
  }
};

// Lấy điểm số realtime của tất cả học viên
const getRealtimeScores = async (req, res) => {
  try {
    const quizId = req.params.id;

    // Lấy dữ liệu từ Firebase
    const quizRef = db.ref(`quiz_sessions/${quizId}/participants`);
    const snapshot = await quizRef.once("value");
    const participants = snapshot.val();

    if (!participants) {
      return res.status(200).json({
        success: true,
        data: { message: "Chưa có học viên nào tham gia", scores: [] },
      });
    }

    // Format dữ liệu trả về
    const scores = Object.entries(participants).map(([userId, data]) => ({
      user_id: userId,
      score: data.current_score || 0,
      correct_answers: data.correct_answers || 0,
      total_answers: data.total_answers || 0,
      current_question_id: data.current_question_id,
      status: data.status || "in_progress",
      last_answer_time: data.last_answer_time || null,
    }));

    // Sắp xếp theo điểm số
    scores.sort((a, b) => b.score - a.score);

    return res.status(200).json({
      success: true,
      data: { message: "Lấy điểm số realtime thành công", scores },
    });
  } catch (error) {
    console.error("Lỗi trong getRealtimeScores:", error);
    return res.status(500).json({
      error: "Lỗi khi lấy điểm số realtime",
      details: error.message,
    });
  }
};

// Lấy thống kê tổng quan của quiz
const getQuizStatistics = async (req, res) => {
  try {
    const quizId = req.params.id;

    // Lấy dữ liệu từ Firebase
    const quizRef = db.ref(`quiz_sessions/${quizId}/participants`);
    const snapshot = await quizRef.once("value");
    const participants = snapshot.val();

    if (!participants) {
      return res.status(200).json({
        message: "Chưa có học viên nào tham gia",
        statistics: {
          total_participants: 0,
          average_score: 0,
          highest_score: 0,
          lowest_score: 0,
          completion_rate: 0,
          score_distribution: {
            "0-2": 0,
            "2-4": 0,
            "4-6": 0,
            "6-8": 0,
            "8-10": 0,
          },
        },
      });
    }

    // Tính toán thống kê
    const scores = Object.values(participants).map((p) => p.current_score || 0);
    const completed = Object.values(participants).filter(
      (p) => p.status === "completed"
    ).length;

    const statistics = {
      total_participants: Object.keys(participants).length,
      average_score: scores.reduce((a, b) => a + b, 0) / scores.length,
      highest_score: Math.max(...scores),
      lowest_score: Math.min(...scores),
      completion_rate: (completed / Object.keys(participants).length) * 100,
      score_distribution: {
        "0-2": scores.filter((s) => s >= 0 && s < 2).length,
        "2-4": scores.filter((s) => s >= 2 && s < 4).length,
        "4-6": scores.filter((s) => s >= 4 && s < 6).length,
        "6-8": scores.filter((s) => s >= 6 && s < 8).length,
        "8-10": scores.filter((s) => s >= 8 && s <= 10).length,
      },
    };

    return res.status(200).json({
      success: true,
      data: { message: "Lấy thống kê quiz thành công", statistics },
    });
  } catch (error) {
    console.error("Lỗi trong getQuizStatistics:", error);
    return res.status(500).json({
      error: "Lỗi khi lấy thống kê quiz",
      details: error.message,
    });
  }
};

// Lấy lịch sử điểm số của một học viên
const getStudentScoreHistory = async (req, res) => {
  try {
    const { quizId, userId } = req.params;

    // Lấy dữ liệu từ Firebase
    const participantRef = db.ref(
      `quiz_sessions/${quizId}/participants/${userId}/answers`
    );
    const snapshot = await participantRef.once("value");
    const answers = snapshot.val();

    if (!answers) {
      return res.status(200).json({
        success: true,
        data: { message: "Chưa có dữ liệu câu trả lời", history: [] },
      });
    }

    // Format dữ liệu trả về
    const history = Object.entries(answers).map(([questionId, data]) => ({
      question_id: questionId,
      is_correct: data.is_correct,
      response_time: data.response_time,
      timestamp: data.timestamp,
      score: data.is_correct ? 10 : 0, // Mỗi câu đúng được 10 điểm
    }));

    // Sắp xếp theo thời gian
    history.sort((a, b) => a.timestamp - b.timestamp);

    return res.status(200).json({
      success: true,
      data: { message: "Lấy lịch sử điểm số thành công", history },
    });
  } catch (error) {
    console.error("Lỗi trong getStudentScoreHistory:", error);
    return res.status(500).json({
      error: "Lỗi khi lấy lịch sử điểm số",
      details: error.message,
    });
  }
};

// Lấy dữ liệu realtime chi tiết của một học viên
const getStudentRealtimeData = async (req, res) => {
  try {
    const { quizId, userId } = req.params;

    // Lấy dữ liệu từ Firebase
    const participantRef = db.ref(
      `quiz_sessions/${quizId}/participants/${userId}`
    );
    const snapshot = await participantRef.once("value");
    const participantData = snapshot.val();

    if (!participantData) {
      return res.status(404).json({
        error: "Không tìm thấy dữ liệu học viên",
      });
    }

    // Lấy thông tin câu hỏi hiện tại
    const currentQuestion = participantData.current_question_id;
    const questions = await getCache(`quiz:${quizId}:questions`);
    const currentQuestionIndex = questions
      ? questions.findIndex((q) => q.question_id === currentQuestion)
      : -1;

    // Format dữ liệu trả về
    const studentData = {
      user_id: userId,
      current_score: participantData.current_score || 0,
      correct_answers: participantData.correct_answers || 0,
      total_answers: participantData.total_answers || 0,
      status: participantData.status || "in_progress",
      current_question: {
        question_id: currentQuestion,
        index: currentQuestionIndex,
        total_questions: questions ? questions.length : 0,
      },
      answer_history: [],
      score_progression: [],
    };

    // Xử lý lịch sử câu trả lời
    if (participantData.answers) {
      const answers = Object.entries(participantData.answers);
      let runningScore = 0;

      // Sắp xếp theo thời gian
      answers.sort((a, b) => a[1].timestamp - b[1].timestamp);

      // Tạo lịch sử câu trả lời và tiến trình điểm
      answers.forEach(([questionId, answerData]) => {
        // Thêm vào lịch sử câu trả lời
        studentData.answer_history.push({
          question_id: questionId,
          answer_id: answerData.answer_id,
          is_correct: answerData.is_correct,
          response_time: answerData.response_time,
          timestamp: answerData.timestamp,
        });

        // Cập nhật tiến trình điểm
        if (answerData.is_correct) {
          runningScore += 10; // Mỗi câu đúng được 10 điểm
        }
        studentData.score_progression.push({
          question_id: questionId,
          score: runningScore,
          timestamp: answerData.timestamp,
          is_correct: answerData.is_correct,
        });
      });
    }

    // Lấy thông tin vị trí trong bảng xếp hạng
    const leaderboardRef = db.ref(
      `quiz_sessions/${quizId}/leaderboard/${userId}`
    );
    const leaderboardSnapshot = await leaderboardRef.once("value");
    const leaderboardData = leaderboardSnapshot.val();

    if (leaderboardData) {
      studentData.leaderboard = {
        position: leaderboardData.position,
        previous_position: leaderboardData.previous_position,
        is_ahead: leaderboardData.is_ahead,
        is_behind: leaderboardData.is_behind,
      };
    }

    return res.status(200).json({
      success: true,
      data: {
        message: "Lấy dữ liệu realtime học viên thành công",
        student: studentData,
      },
    });
  } catch (error) {
    console.error("Lỗi trong getStudentRealtimeData:", error);
    return res.status(500).json({
      error: "Lỗi khi lấy dữ liệu realtime học viên",
      details: error.message,
    });
  }
};

// Hàm gửi thông báo khi có học viên mới tham gia
const emitNewParticipantNotification = async (quizId, userId) => {
  try {
    const user = await User.findByPk(userId, {
      attributes: ["user_id", "name", "email", "student_id"],
    });

    if (io && user) {
      io.to(`quiz:${quizId}:teachers`).emit("newParticipant", {
        quiz_id: quizId,
        participant: {
          user_id: user.user_id,
          name: user.name,
          email: user.email,
          student_id: user.student_id,
          join_time: new Date(),
        },
      });
    }
  } catch (error) {
    console.error("Lỗi trong emitNewParticipantNotification:", error);
  }
};

// Hàm gửi thông báo khi học viên rời khỏi quiz
const emitParticipantLeftNotification = async (quizId, userId) => {
  try {
    const user = await User.findByPk(userId, {
      attributes: ["user_id", "name", "email", "student_id"],
    });

    if (io && user) {
      io.to(`quiz:${quizId}:teachers`).emit("participantLeft", {
        quiz_id: quizId,
        participant: {
          user_id: user.user_id,
          name: user.name,
          email: user.email,
          student_id: user.student_id,
          leave_time: new Date(),
        },
      });
    }
  } catch (error) {
    console.error("Lỗi trong emitParticipantLeftNotification:", error);
  }
};

// Hàm gửi thông báo khi quiz kết thúc
const emitQuizEndedNotification = async (quizId) => {
  try {
    // Lấy thống kê cuối cùng
    const finalStatistics = await getQuizStatistics(
      { params: { id: quizId } },
      {
        status: () => ({
          json: () => ({ statistics: {} }),
        }),
      }
    );

    if (io) {
      io.to(`quiz:${quizId}:teachers`).emit("quizEnded", {
        quiz_id: quizId,
        statistics: finalStatistics.statistics,
        timestamp: Date.now(),
      });
    }
  } catch (error) {
    console.error("Lỗi trong emitQuizEndedNotification:", error);
  }
};

// API lấy báo cáo tổng thể về quiz
const getQuizAnalytics = async (req, res) => {
  try {
    const quizId = req.params.id;

    // Kiểm tra quyền truy cập
    if (!["admin", "teacher"].includes(req.roleName)) {
      return res.status(403).json({ error: "Không có quyền truy cập" });
    }

    // Lấy thông tin quiz
    const quiz = await Quiz.findByPk(quizId, {
      include: [
        {
          model: Question,
          as: "Questions",
          through: { attributes: [] },
          attributes: ["question_id", "question_text", "level_id", "lo_id"],
          include: [
            {
              model: Answer,
              as: "Answers",
              attributes: ["answer_id", "answer_text", "iscorrect"],
            },
            {
              model: Level,
              as: "Level",
              attributes: ["level_id", "name"],
            },
            {
              model: LO,
              as: "LO",
              attributes: ["lo_id", "name"],
            },
          ],
        },
      ],
    });

    if (!quiz) {
      return res.status(404).json({ error: "Không tìm thấy quiz" });
    }

    // Lấy thông tin kết quả của tất cả người tham gia
    const quizResults = await QuizResult.findAll({
      where: { quiz_id: quizId },
      include: [
        {
          model: User,
          as: "Student",
          attributes: ["user_id", "name", "email"],
        },
      ],
    });

    // Lấy lịch sử trả lời câu hỏi
    const questionHistory = await UserQuestionHistory.findAll({
      where: { quiz_id: quizId },
      include: [
        {
          model: User,
          as: "User",
          attributes: ["user_id", "name", "email"],
        },
        {
          model: Question,
          as: "Question",
          attributes: ["question_id", "question_text", "level_id", "lo_id"],
          include: [
            {
              model: Answer,
              as: "Answers",
              attributes: ["answer_id", "answer_text", "iscorrect"],
            },
            {
              model: Level,
              as: "Level",
              attributes: ["level_id", "name"],
            },
            {
              model: LO,
              as: "LO",
              attributes: ["lo_id", "name"],
            },
          ],
        },
      ],
      order: [["attempt_date", "ASC"]],
    });

    // Tính toán thống kê
    const totalParticipants = quizResults.length;
    const completedParticipants = quizResults.filter(
      (r) => r.status === "completed"
    ).length;
    const averageScore =
      quizResults.reduce((acc, curr) => acc + curr.score, 0) /
        totalParticipants || 0;
    const highestScore = Math.max(...quizResults.map((r) => r.score));
    const lowestScore = Math.min(...quizResults.map((r) => r.score));

    // Phân tích theo mức độ khó
    const difficultyAnalysis = {};
    quiz.Questions.forEach((question) => {
      const level = question.Level.name;
      if (!difficultyAnalysis[level]) {
        difficultyAnalysis[level] = {
          total: 0,
          correct: 0,
          averageTime: 0,
        };
      }
      const questionHistory = questionHistory.filter(
        (h) => h.question_id === question.question_id
      );
      difficultyAnalysis[level].total += questionHistory.length;
      difficultyAnalysis[level].correct += questionHistory.filter(
        (h) => h.is_correct
      ).length;
      difficultyAnalysis[level].averageTime =
        questionHistory.reduce((acc, curr) => acc + (curr.time_spent || 0), 0) /
          questionHistory.length || 0;
    });

    // Phân tích theo LO
    const loAnalysis = {};
    quiz.Questions.forEach((question) => {
      const lo = question.LO.name;
      if (!loAnalysis[lo]) {
        loAnalysis[lo] = {
          total: 0,
          correct: 0,
          averageTime: 0,
        };
      }
      const questionHistory = questionHistory.filter(
        (h) => h.question_id === question.question_id
      );
      loAnalysis[lo].total += questionHistory.length;
      loAnalysis[lo].correct += questionHistory.filter(
        (h) => h.is_correct
      ).length;
      loAnalysis[lo].averageTime =
        questionHistory.reduce((acc, curr) => acc + (curr.time_spent || 0), 0) /
          questionHistory.length || 0;
    });

    // Phân tích thời gian trả lời
    const timeAnalysis = {
      average:
        questionHistory.reduce((acc, curr) => acc + (curr.time_spent || 0), 0) /
          questionHistory.length || 0,
      fastest: Math.min(...questionHistory.map((h) => h.time_spent || 0)),
      slowest: Math.max(...questionHistory.map((h) => h.time_spent || 0)),
    };

    return res.status(200).json({
      quiz_info: {
        quiz_id: quiz.quiz_id,
        name: quiz.name,
        total_questions: quiz.Questions.length,
        duration: quiz.duration,
      },
      participant_stats: {
        total_participants: totalParticipants,
        completed_participants: completedParticipants,
        completion_rate: (completedParticipants / totalParticipants) * 100,
        average_score: averageScore,
        highest_score: highestScore,
        lowest_score: lowestScore,
      },
      difficulty_analysis: difficultyAnalysis,
      lo_analysis: loAnalysis,
      time_analysis: timeAnalysis,
    });
  } catch (error) {
    console.error("Lỗi trong getQuizAnalytics:", error);
    return res
      .status(500)
      .json({ error: "Lỗi khi lấy báo cáo tổng thể", details: error.message });
  }
};

// API lấy báo cáo chi tiết của một người tham gia
const getParticipantDetail = async (req, res) => {
  try {
    const { quizId, userId } = req.params;

    // Kiểm tra quyền truy cập
    if (!["admin", "teacher"].includes(req.roleName)) {
      return res.status(403).json({ error: "Không có quyền truy cập" });
    }

    // Lấy thông tin quiz
    const quiz = await Quiz.findByPk(quizId, {
      include: [
        {
          model: Question,
          as: "Questions",
          through: { attributes: [] },
          attributes: ["question_id", "question_text", "level_id", "lo_id"],
          include: [
            {
              model: Answer,
              as: "Answers",
              attributes: ["answer_id", "answer_text", "iscorrect"],
            },
            {
              model: Level,
              as: "Level",
              attributes: ["level_id", "name"],
            },
            {
              model: LO,
              as: "LO",
              attributes: ["lo_id", "name"],
            },
          ],
        },
      ],
    });

    if (!quiz) {
      return res.status(404).json({ error: "Không tìm thấy quiz" });
    }

    // Lấy thông tin người tham gia
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: "Không tìm thấy người dùng" });
    }

    // Lấy kết quả quiz của người dùng
    const quizResult = await QuizResult.findOne({
      where: { quiz_id: quizId, user_id: userId },
    });

    // Lấy lịch sử trả lời câu hỏi
    const questionHistory = await UserQuestionHistory.findAll({
      where: { quiz_id: quizId, user_id: userId },
      include: [
        {
          model: Question,
          as: "Question",
          attributes: ["question_id", "question_text", "level_id", "lo_id"],
          include: [
            {
              model: Answer,
              as: "Answers",
              attributes: ["answer_id", "answer_text", "iscorrect"],
            },
            {
              model: Level,
              as: "Level",
              attributes: ["level_id", "name"],
            },
            {
              model: LO,
              as: "LO",
              attributes: ["lo_id", "name"],
            },
          ],
        },
      ],
      order: [["attempt_date", "ASC"]],
    });

    // Tính toán thống kê
    const totalQuestions = quiz.Questions.length;
    const correctAnswers = questionHistory.filter((h) => h.is_correct).length;
    const accuracy = (correctAnswers / totalQuestions) * 100;
    const averageTime =
      questionHistory.reduce((acc, curr) => acc + (curr.time_spent || 0), 0) /
      totalQuestions;

    // Phân tích theo mức độ khó
    const difficultyAnalysis = {};
    quiz.Questions.forEach((question) => {
      const level = question.Level.name;
      if (!difficultyAnalysis[level]) {
        difficultyAnalysis[level] = {
          total: 0,
          correct: 0,
          averageTime: 0,
        };
      }
      const questionHistory = questionHistory.filter(
        (h) => h.question_id === question.question_id
      );
      difficultyAnalysis[level].total += questionHistory.length;
      difficultyAnalysis[level].correct += questionHistory.filter(
        (h) => h.is_correct
      ).length;
      difficultyAnalysis[level].averageTime =
        questionHistory.reduce((acc, curr) => acc + (curr.time_spent || 0), 0) /
          questionHistory.length || 0;
    });

    // Phân tích theo LO
    const loAnalysis = {};
    quiz.Questions.forEach((question) => {
      const lo = question.LO.name;
      if (!loAnalysis[lo]) {
        loAnalysis[lo] = {
          total: 0,
          correct: 0,
          averageTime: 0,
        };
      }
      const questionHistory = questionHistory.filter(
        (h) => h.question_id === question.question_id
      );
      loAnalysis[lo].total += questionHistory.length;
      loAnalysis[lo].correct += questionHistory.filter(
        (h) => h.is_correct
      ).length;
      loAnalysis[lo].averageTime =
        questionHistory.reduce((acc, curr) => acc + (curr.time_spent || 0), 0) /
          questionHistory.length || 0;
    });

    return res.status(200).json({
      user_info: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
      },
      quiz_result: {
        score: quizResult?.score || 0,
        status: quizResult?.status || "not_started",
        completion_time: quizResult?.completion_time,
        update_time: quizResult?.update_time,
      },
      performance_stats: {
        total_questions: totalQuestions,
        correct_answers: correctAnswers,
        accuracy: accuracy,
        average_time: averageTime,
      },
      question_details: questionHistory.map((h) => ({
        question_id: h.Question.question_id,
        question_text: h.Question.question_text,
        level: h.Question.Level.name,
        lo: h.Question.LO.name,
        selected_answer: h.selected_answer,
        is_correct: h.is_correct,
        time_spent: h.time_spent,
        attempt_date: h.attempt_date,
      })),
      difficulty_analysis: difficultyAnalysis,
      lo_analysis: loAnalysis,
    });
  } catch (error) {
    console.error("Lỗi trong getParticipantDetail:", error);
    return res
      .status(500)
      .json({ error: "Lỗi khi lấy báo cáo chi tiết", details: error.message });
  }
};

const getQuizProgress = async (req, res) => {
  try {
    const quizId = req.params.id;
    const userId = req.user.user_id;
    const { db } = require("../config/firebase");
    const participantRef = db.ref(
      `quiz_sessions/${quizId}/participants/${userId}`
    );
    const snapshot = await participantRef.once("value");
    const data = snapshot.val();
    let answers = data?.answers || {};
    // Lấy danh sách câu hỏi
    let questions = await getCache(`quiz:${quizId}:questions`);
    if (!questions) {
      const quiz = await Quiz.findByPk(quizId, {
        include: [
          {
            model: Question,
            as: "Questions",
            through: { attributes: [] },
            attributes: ["question_id"],
          },
        ],
      });
      questions = quiz.Questions.map((q) => ({ question_id: q.question_id }));
    }
    // Trả về trạng thái từng câu hỏi
    const progress = questions.map((q) => {
      const ans = answers[q.question_id];
      return {
        question_id: q.question_id,
        answered: !!ans,
        is_correct: ans?.is_correct,
        attempts: ans?.attempts || 0,
        can_retry: ans ? !ans.is_correct && ans.attempts < 2 : false,
      };
    });
    return res
      .status(200)
      .json({ success: true, data: { quiz_id: quizId, progress } });
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Lỗi khi lấy tiến độ quiz", details: error.message });
  }
};

// Thêm hàm submitQuiz đúng nghiệp vụ mới:
const submitQuiz = async (req, res) => {
  try {
    const quizId = req.params.id;
    const userId = req.user.user_id;
    // Validate quiz tồn tại & đang active hoặc finished (cho phép nộp sớm nếu active, không cho nếu pending)
    const quiz = await Quiz.findByPk(quizId, {
      attributes: ["quiz_id", "status", "end_time"],
    });
    if (!quiz) {
      return res.status(404).json({ error: "Quiz không tồn tại" });
    }
    if (quiz.status === "pending") {
      return res.status(400).json({ error: "Quiz chưa bắt đầu" });
    }
    // Nếu đã kết thúc thì chấp nhận idempotent trả 200 (frontend có thể đã gọi muộn)
    const isEnded =
      quiz.status === "finished" ||
      (quiz.end_time && new Date(quiz.end_time) < new Date());
    const { db } = require("../config/firebase");
    const participantRef = db.ref(
      `quiz_sessions/${quizId}/participants/${userId}`
    );
    const snapshot = await participantRef.once("value");
    const data = snapshot.val();
    if (!data) {
      if (isEnded) {
        return res.status(200).json({
          success: true,
          data: { message: "Quiz đã kết thúc. Không còn dữ liệu phiên." },
        });
      }
      return res
        .status(404)
        .json({ error: "Không tìm thấy phiên làm bài của bạn" });
    }
    // Idempotent: nếu đã completed trả success
    if (data.status === "completed") {
      return res.status(200).json({
        success: true,
        data: { message: "Bạn đã nộp bài trước đó", already_submitted: true },
      });
    }
    let answers = data.answers || {};
    let questions = await getCache(`quiz:${quizId}:questions`);
    if (!questions) {
      const qz = await Quiz.findByPk(quizId, {
        include: [
          {
            model: Question,
            as: "Questions",
            through: { attributes: [] },
            attributes: ["question_id"],
          },
        ],
      });
      questions = qz
        ? qz.Questions.map((q) => ({ question_id: q.question_id }))
        : [];
    }
    // Guard nếu không có danh sách câu hỏi
    if (!questions || questions.length === 0) {
      return res.status(400).json({
        error:
          "Không xác định được danh sách câu hỏi để kiểm tra điều kiện nộp",
      });
    }
    let canSubmit = true;
    for (const q of questions) {
      const ans = answers[q.question_id];
      if (!ans || (!ans.is_correct && (ans.attempts || 0) < 2)) {
        canSubmit = false;
        break;
      }
    }
    if (!canSubmit && !isEnded) {
      // nếu quiz đã hết thời gian vẫn cho nộp để chốt
      return res.status(400).json({
        error:
          "Bạn chưa hoàn thành tất cả câu hỏi hoặc còn câu sai chưa hết lượt.",
      });
    }
    // Đánh dấu hoàn thành
    await participantRef.update({
      status: "completed",
      completed_at: Date.now(),
    });

    // ============================================================
    // CRITICAL FIX: Sync quiz data to PostgreSQL (both Practice & Assessment mode)
    // This ensures:
    // 1. user_question_histories is populated with ALL attempts
    // 2. quiz_results has correct score (raw_total_points, max_points, bonuses)
    // 3. Score calculated from LATEST attempt per question (not all attempts)
    // ============================================================
    try {
      console.log(
        `[submitQuiz] Syncing quiz ${quizId} user ${userId} to PostgreSQL...`
      );
      const quizRealtimeService = require("../services/quizRealtimeService");
      await quizRealtimeService.syncQuizDataToDatabase(quizId);
      console.log(
        `[submitQuiz] Sync completed successfully for quiz ${quizId}`
      );
    } catch (syncErr) {
      console.error("[submitQuiz][sync] error:", syncErr.message);
      // Don't fail the request if sync fails - can retry later
    }

    // Legacy finalize (kept for backward compatibility but should be redundant now)
    try {
      const {
        finalizeAssessmentParticipant,
      } = require("../services/assessmentFinalizeService");
      await finalizeAssessmentParticipant(quizId, userId);
    } catch (finalizeErr) {
      console.error("[finalize][submitQuiz] error:", finalizeErr.message);
    }

    return res.status(200).json({
      success: true,
      data: {
        message: "Nộp bài thành công!",
        forced_due_to_end: !canSubmit && isEnded,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Lỗi khi nộp bài", details: error.message });
  }
};

// API endpoint để lấy dữ liệu tracking tiến trình realtime cho biểu đồ đường
const getQuizProgressTracking = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { interval = "30s", user_id } = req.query; // interval: 30s, 1m, 5m

    // Validate quiz exists
    const quiz = await Quiz.findByPk(quizId, {
      include: [
        {
          model: Question,
          as: "Questions",
          through: { attributes: [] },
          attributes: ["question_id"],
        },
      ],
    });

    if (!quiz) {
      return res
        .status(404)
        .json({ success: false, message: "Quiz không tồn tại" });
    }

    // Lấy dữ liệu time-series
    const progressData = await getQuizProgressTimeSeries(
      quizId,
      interval,
      user_id
    );

    res.status(200).json({
      success: true,
      quiz_id: quizId,
      quiz_name: quiz.name,
      total_questions: quiz.Questions.length,
      interval: interval,
      data: progressData,
      generated_at: new Date(),
    });
  } catch (error) {
    console.error("Lỗi khi lấy dữ liệu tracking tiến trình:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy dữ liệu tracking tiến trình",
      error: error.message,
    });
  }
};

// Hàm lấy dữ liệu time-series cho tracking tiến trình
async function getQuizProgressTimeSeries(
  quizId,
  interval = "30s",
  userId = null
) {
  try {
    // Lấy tất cả lịch sử trả lời câu hỏi
    const whereCondition = { quiz_id: quizId };
    if (userId) {
      whereCondition.user_id = userId;
    }

    const questionHistory = await UserQuestionHistory.findAll({
      where: whereCondition,
      include: [
        {
          model: User,
          as: "User",
          attributes: ["user_id", "name"],
        },
        {
          model: Question,
          as: "Question",
          attributes: ["question_id", "level_id", "lo_id"],
          include: [
            { model: Level, as: "Level", attributes: ["level_id", "name"] },
            { model: LO, as: "LO", attributes: ["lo_id", "name"] },
          ],
        },
      ],
      order: [["attempt_date", "ASC"]],
    });

    if (!questionHistory.length) {
      return {
        participants_progress: [],
        overall_progress: [],
        summary: {
          total_participants: 0,
          total_answers: 0,
          interval_used: interval,
        },
      };
    }

    // Tính toán interval trong milliseconds
    const intervalMs = parseInterval(interval);

    // Lấy thời gian bắt đầu và kết thúc
    const startTime = new Date(questionHistory[0].attempt_date);
    const endTime = new Date(
      questionHistory[questionHistory.length - 1].attempt_date
    );

    // Tạo time buckets
    const timeBuckets = createTimeBuckets(startTime, endTime, intervalMs);

    // Nhóm dữ liệu theo user nếu không có userId cụ thể
    if (!userId) {
      const participantsProgress = calculateParticipantsProgress(
        questionHistory,
        timeBuckets,
        intervalMs
      );
      const overallProgress = calculateOverallProgress(
        questionHistory,
        timeBuckets,
        intervalMs
      );

      return {
        participants_progress: participantsProgress,
        overall_progress: overallProgress,
        summary: {
          total_participants: participantsProgress.length,
          total_answers: questionHistory.length,
          interval_used: interval,
          time_range: {
            start: startTime,
            end: endTime,
          },
        },
      };
    } else {
      // Trả về dữ liệu cho user cụ thể
      const userProgress = calculateUserProgress(
        questionHistory,
        timeBuckets,
        intervalMs
      );

      return {
        user_progress: userProgress,
        summary: {
          total_answers: questionHistory.length,
          interval_used: interval,
          time_range: {
            start: startTime,
            end: endTime,
          },
        },
      };
    }
  } catch (error) {
    console.error("Lỗi trong getQuizProgressTimeSeries:", error);
    throw error;
  }
}

// Helper functions cho time-series calculation
function parseInterval(interval) {
  const unit = interval.slice(-1);
  const value = parseInt(interval.slice(0, -1));

  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    default:
      return 30 * 1000; // default 30 seconds
  }
}

function createTimeBuckets(startTime, endTime, intervalMs) {
  const buckets = [];
  let currentTime = new Date(startTime);

  while (currentTime <= endTime) {
    buckets.push(new Date(currentTime));
    currentTime = new Date(currentTime.getTime() + intervalMs);
  }

  return buckets;
}

function calculateParticipantsProgress(
  questionHistory,
  timeBuckets,
  intervalMs
) {
  const participantsData = {};

  // Nhóm theo user
  questionHistory.forEach((history) => {
    const userId = history.user_id;
    if (!participantsData[userId]) {
      participantsData[userId] = {
        user_id: userId,
        user_name: history.User.name,
        progress_data: [],
        cumulative_score: 0,
        cumulative_correct: 0,
        cumulative_total: 0,
      };
    }
  });

  // Tính toán progress cho từng time bucket
  timeBuckets.forEach((bucketTime) => {
    const bucketEnd = new Date(bucketTime.getTime() + intervalMs);

    Object.keys(participantsData).forEach((userId) => {
      const userHistory = questionHistory.filter(
        (h) =>
          h.user_id == userId &&
          new Date(h.attempt_date) >= bucketTime &&
          new Date(h.attempt_date) < bucketEnd
      );

      const participant = participantsData[userId];

      // Cập nhật cumulative data
      userHistory.forEach((h) => {
        participant.cumulative_total++;
        if (h.is_correct) {
          participant.cumulative_correct++;
          participant.cumulative_score += 10; // 10 points per correct answer
        }
      });

      participant.progress_data.push({
        timestamp: bucketTime,
        score: participant.cumulative_score,
        correct_answers: participant.cumulative_correct,
        total_answers: participant.cumulative_total,
        accuracy:
          participant.cumulative_total > 0
            ? Math.round(
                (participant.cumulative_correct /
                  participant.cumulative_total) *
                  100
              )
            : 0,
        answers_in_interval: userHistory.length,
      });
    });
  });

  return Object.values(participantsData);
}

function calculateOverallProgress(questionHistory, timeBuckets, intervalMs) {
  const overallData = [];
  let cumulativeScore = 0;
  let cumulativeCorrect = 0;
  let cumulativeTotal = 0;
  let totalParticipants = new Set();

  timeBuckets.forEach((bucketTime) => {
    const bucketEnd = new Date(bucketTime.getTime() + intervalMs);

    const bucketHistory = questionHistory.filter(
      (h) =>
        new Date(h.attempt_date) >= bucketTime &&
        new Date(h.attempt_date) < bucketEnd
    );

    // Cập nhật cumulative data
    bucketHistory.forEach((h) => {
      cumulativeTotal++;
      totalParticipants.add(h.user_id);
      if (h.is_correct) {
        cumulativeCorrect++;
        cumulativeScore += 10;
      }
    });

    overallData.push({
      timestamp: bucketTime,
      total_participants: totalParticipants.size,
      average_score:
        totalParticipants.size > 0
          ? Math.round(cumulativeScore / totalParticipants.size)
          : 0,
      total_answers: cumulativeTotal,
      total_correct: cumulativeCorrect,
      overall_accuracy:
        cumulativeTotal > 0
          ? Math.round((cumulativeCorrect / cumulativeTotal) * 100)
          : 0,
      answers_in_interval: bucketHistory.length,
      active_participants: new Set(bucketHistory.map((h) => h.user_id)).size,
    });
  });

  return overallData;
}

function calculateUserProgress(questionHistory, timeBuckets, intervalMs) {
  const progressData = [];
  let cumulativeScore = 0;
  let cumulativeCorrect = 0;
  let cumulativeTotal = 0;

  timeBuckets.forEach((bucketTime) => {
    const bucketEnd = new Date(bucketTime.getTime() + intervalMs);

    const bucketHistory = questionHistory.filter(
      (h) =>
        new Date(h.attempt_date) >= bucketTime &&
        new Date(h.attempt_date) < bucketEnd
    );

    // Cập nhật cumulative data
    bucketHistory.forEach((h) => {
      cumulativeTotal++;
      if (h.is_correct) {
        cumulativeCorrect++;
        cumulativeScore += 10;
      }
    });

    progressData.push({
      timestamp: bucketTime,
      score: cumulativeScore,
      correct_answers: cumulativeCorrect,
      total_answers: cumulativeTotal,
      accuracy:
        cumulativeTotal > 0
          ? Math.round((cumulativeCorrect / cumulativeTotal) * 100)
          : 0,
      answers_in_interval: bucketHistory.length,
      questions_answered: bucketHistory.map((h) => ({
        question_id: h.Question.question_id,
        is_correct: h.is_correct,
        time_spent: h.time_spent,
        level: h.Question.Level.name,
        lo: h.Question.LO.name,
      })),
    });
  });

  return progressData;
}

// Clone quiz với tất cả câu hỏi và cấu hình
const cloneQuiz = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id: originalQuizId } = req.params;
    const {
      new_name,
      new_course_id,
      clone_questions = true,
      clone_settings = true,
      clone_mode_config = true,
      reset_pin = true,
      reset_status = true,
    } = req.body;

    console.log("Bắt đầu clone quiz:", {
      originalQuizId,
      new_name,
      new_course_id,
      clone_questions,
      clone_settings,
      clone_mode_config,
      reset_pin,
      reset_status,
    });

    // Tìm quiz gốc với tất cả thông tin
    const originalQuiz = await Quiz.findByPk(originalQuizId, {
      include: [
        {
          model: Course,
          as: "Course",
          include: [
            {
              model: Subject,
              as: "Subject",
            },
          ],
        },
        {
          model: Question,
          as: "Questions",
          through: { attributes: [] },
          // Chỉ định rõ các cột hiện có trong DB để tránh lỗi nếu chưa chạy migration thêm question_data
          attributes: [
            "question_id",
            "question_type_id",
            "level_id",
            "question_text",
            "lo_id",
            "explanation",
          ],
          include: [
            {
              model: Answer,
              as: "Answers",
              attributes: ["answer_text", "iscorrect"],
            },
            {
              model: QuestionType,
              as: "QuestionType",
            },
            {
              model: Level,
              as: "Level",
            },
            {
              model: LO,
              as: "LO",
            },
          ],
        },
      ],
      transaction,
    });

    if (!originalQuiz) {
      await transaction.rollback();
      return res.status(404).json({
        error: "Quiz gốc không tồn tại",
        quiz_id: originalQuizId,
      });
    }

    // Validate new_course_id nếu được cung cấp
    let targetCourseId = new_course_id || originalQuiz.course_id;
    if (new_course_id) {
      const targetCourse = await Course.findByPk(new_course_id, {
        transaction,
      });
      if (!targetCourse) {
        await transaction.rollback();
        return res.status(404).json({
          error: "Course đích không tồn tại",
          course_id: new_course_id,
        });
      }
    }

    // Tạo tên mới cho quiz clone
    const clonedQuizName =
      new_name ||
      `${originalQuiz.name} - Copy (${new Date().toISOString().slice(0, 19)})`;

    // Tạo PIN mới nếu cần
    let newPin = null;
    if (reset_pin || !originalQuiz.pin) {
      newPin = await generatePin();
    } else {
      // Kiểm tra PIN có trùng không và tạo mới nếu cần
      const existingQuizWithPin = await Quiz.findOne({
        where: { pin: originalQuiz.pin },
        transaction,
      });
      if (existingQuizWithPin) {
        newPin = await generatePin();
        console.log("PIN đã tồn tại, tạo PIN mới:", newPin);
      } else {
        newPin = originalQuiz.pin;
      }
    }

    // Chuẩn bị dữ liệu cho quiz mới
    const clonedQuizData = {
      course_id: targetCourseId,
      name: clonedQuizName,
      duration: originalQuiz.duration,
      update_time: new Date(),
      pin: newPin,
      // Reset hoặc copy settings
      status: reset_status ? "pending" : originalQuiz.status,
      current_question_index: reset_status
        ? 0
        : originalQuiz.current_question_index,
      show_leaderboard: reset_status ? false : originalQuiz.show_leaderboard,
    };

    // Copy mode configurations nếu được yêu cầu
    if (clone_mode_config) {
      clonedQuizData.quiz_mode = originalQuiz.quiz_mode || "assessment";
      clonedQuizData.gamification_enabled =
        originalQuiz.gamification_enabled || false;
      clonedQuizData.avatar_system_enabled =
        originalQuiz.avatar_system_enabled || false;
      clonedQuizData.level_progression_enabled =
        originalQuiz.level_progression_enabled || false;
      clonedQuizData.real_time_leaderboard_enabled =
        originalQuiz.real_time_leaderboard_enabled || false;
      clonedQuizData.adaptive_config = originalQuiz.adaptive_config || null;
      clonedQuizData.code_config = originalQuiz.code_config || null;
    }

    // Copy additional settings nếu được yêu cầu
    if (clone_settings) {
      clonedQuizData.start_time = originalQuiz.start_time;
      clonedQuizData.end_time = originalQuiz.end_time;
    }

    console.log("Dữ liệu quiz clone:", clonedQuizData);

    // Tạo quiz mới
    const clonedQuiz = await Quiz.create(clonedQuizData, { transaction });
    console.log("Quiz clone đã được tạo:", clonedQuiz.toJSON());

    // Clone questions nếu được yêu cầu
    let clonedQuestionsCount = 0;
    if (
      clone_questions &&
      originalQuiz.Questions &&
      originalQuiz.Questions.length > 0
    ) {
      const questionIds = originalQuiz.Questions.map((q) => q.question_id);

      // Tạo các QuizQuestion relationships mới
      const quizQuestions = questionIds.map((questionId) => ({
        quiz_id: clonedQuiz.quiz_id,
        question_id: questionId,
      }));

      await QuizQuestion.bulkCreate(quizQuestions, { transaction });
      clonedQuestionsCount = questionIds.length;
      console.log(`Đã clone ${clonedQuestionsCount} câu hỏi`);

      // Cache danh sách câu hỏi chi tiết cho quiz mới
      const questionsWithDetails = originalQuiz.Questions.map((q) => ({
        question_id: q.question_id,
        question_text: q.question_text,
        question_type_id: q.question_type_id,
        level_id: q.level_id,
        lo_id: q.lo_id,
        explanation: q.explanation,
        QuestionType: q.QuestionType,
        Level: q.Level,
        LO: q.LO,
        Answers: q.Answers,
      }));

      await setCache(
        `quiz:${clonedQuiz.quiz_id}:questions`,
        questionsWithDetails,
        3600
      );
    }

    // Xóa cache danh sách quiz
    await deleteCacheByPattern("quizzes*");
    console.log("Đã xóa cache: quizzes*");

    // Lấy thông tin đầy đủ của quiz đã clone để trả về
    const finalClonedQuiz = await Quiz.findByPk(clonedQuiz.quiz_id, {
      include: [
        {
          model: Course,
          as: "Course",
          attributes: ["course_id", "name"],
          include: [
            {
              model: Subject,
              as: "Subject",
              attributes: ["subject_id", "name"],
            },
          ],
        },
      ],
      transaction,
    });

    // Emit socket event nếu có IO
    const io = req.app.get("io");
    if (io) {
      io.emit("quizCloned", {
        original_quiz_id: originalQuizId,
        cloned_quiz: {
          quiz_id: clonedQuiz.quiz_id,
          name: clonedQuiz.name,
          course_id: clonedQuiz.course_id,
          status: clonedQuiz.status,
          pin: clonedQuiz.pin,
          questions_count: clonedQuestionsCount,
        },
      });
    }

    await transaction.commit();
    console.log("Transaction committed - Quiz clone thành công");

    // Trả về response
    res.status(201).json({
      message: "Clone quiz thành công",
      original_quiz: {
        quiz_id: originalQuiz.quiz_id,
        name: originalQuiz.name,
        course_id: originalQuiz.course_id,
        questions_count: originalQuiz.Questions
          ? originalQuiz.Questions.length
          : 0,
      },
      cloned_quiz: {
        quiz_id: clonedQuiz.quiz_id,
        name: clonedQuiz.name,
        course_id: clonedQuiz.course_id,
        course_name: finalClonedQuiz.Course?.name,
        subject_id: finalClonedQuiz.Course?.Subject?.subject_id,
        subject_name: finalClonedQuiz.Course?.Subject?.name,
        duration: clonedQuiz.duration,
        status: clonedQuiz.status,
        pin: clonedQuiz.pin,
        quiz_mode: clonedQuiz.quiz_mode,
        gamification_enabled: clonedQuiz.gamification_enabled,
        update_time: clonedQuiz.update_time,
        questions_cloned: clonedQuestionsCount,
        settings_cloned: clone_settings,
        mode_config_cloned: clone_mode_config,
      },
      clone_summary: {
        questions_cloned: clone_questions ? clonedQuestionsCount : 0,
        settings_cloned: clone_settings,
        mode_config_cloned: clone_mode_config,
        new_pin_generated: reset_pin || newPin !== originalQuiz.pin,
        status_reset: reset_status,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Lỗi trong cloneQuiz:", error);
    return res.status(500).json({
      error: "Lỗi khi clone quiz",
      details: error.message,
      quiz_id: req.params.id,
    });
  }
};

// =====================================================
// ANSWER CHOICE STATISTICS ENDPOINTS
// =====================================================

const getQuestionChoiceStats = async (req, res) => {
  try {
    const { quizId, questionId } = req.params;

    if (!answerChoiceStatsService) {
      return res.status(500).json({
        success: false,
        message: "Answer Choice Stats Service not initialized",
      });
    }

    const stats = await answerChoiceStatsService.getChoiceStats(
      parseInt(quizId),
      parseInt(questionId)
    );

    res.json({
      success: true,
      message: "Lấy thống kê lựa chọn câu trả lời thành công",
      data: {
        quiz_id: parseInt(quizId),
        question_id: parseInt(questionId),
        choice_stats: stats,
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    console.error("Error getting question choice stats:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy thống kê lựa chọn câu trả lời",
      error: error.message,
    });
  }
};

const getQuizChoiceStatsSummary = async (req, res) => {
  try {
    const { quizId } = req.params;

    // Check if user is teacher or admin
    if (req.user.role !== "admin" && req.user.role !== "teacher") {
      return res.status(403).json({
        success: false,
        message: "Không có quyền truy cập tổng hợp thống kê",
      });
    }

    if (!answerChoiceStatsService) {
      return res.status(500).json({
        success: false,
        message: "Answer Choice Stats Service not initialized",
      });
    }

    const summary = await answerChoiceStatsService.getQuizChoiceStatsSummary(
      parseInt(quizId)
    );

    res.json({
      success: true,
      message: "Lấy tổng hợp thống kê quiz thành công",
      data: summary,
    });
  } catch (error) {
    console.error("Error getting quiz choice stats summary:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy tổng hợp thống kê quiz",
      error: error.message,
    });
  }
};

const getLiveChoiceStats = async (req, res) => {
  try {
    const { quizId } = req.params;

    // Check if user is teacher or admin
    if (req.user.role !== "admin" && req.user.role !== "teacher") {
      return res.status(403).json({
        success: false,
        message: "Không có quyền truy cập thống kê trực tiếp",
      });
    }

    if (!answerChoiceStatsService) {
      return res.status(500).json({
        success: false,
        message: "Answer Choice Stats Service not initialized",
      });
    }

    // Get quiz with all questions and answers
    const quiz = await Quiz.findByPk(quizId, {
      include: [
        {
          model: Question,
          as: "Questions",
          through: { attributes: [] },
          include: [
            {
              model: Answer,
              attributes: ["answer_id", "answer_text", "iscorrect"],
            },
          ],
        },
      ],
    });

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz không tồn tại",
      });
    }

    const liveStats = [];

    for (const question of quiz.Questions) {
      const choiceStats = await answerChoiceStatsService.getChoiceStats(
        quizId,
        question.question_id
      );

      // Combine with answer details
      const questionStats = {
        question_id: question.question_id,
        question_text: question.question_text,
        total_responses: Object.values(choiceStats).reduce(
          (sum, stat) => sum + stat.count,
          0
        ),
        answers: question.Answers.map((answer) => ({
          answer_id: answer.answer_id,
          answer_text: answer.answer_text,
          is_correct: answer.iscorrect,
          stats: choiceStats[answer.answer_id] || {
            count: 0,
            correct_count: 0,
            incorrect_count: 0,
            percentage: 0,
          },
        })),
      };

      liveStats.push(questionStats);
    }

    res.json({
      success: true,
      message: "Lấy thống kê trực tiếp thành công",
      data: {
        quiz_id: quizId,
        quiz_name: quiz.name,
        total_questions: quiz.Questions.length,
        question_stats: liveStats,
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    console.error("Error getting live choice stats:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy thống kê trực tiếp",
      error: error.message,
    });
  }
};

const clearQuestionChoiceStats = async (req, res) => {
  try {
    const { quizId, questionId } = req.params;

    // Check if user is admin or teacher
    if (req.user.role !== "admin" && req.user.role !== "teacher") {
      return res.status(403).json({
        success: false,
        message: "Không có quyền thực hiện thao tác này",
      });
    }

    if (!answerChoiceStatsService) {
      return res.status(500).json({
        success: false,
        message: "Answer Choice Stats Service not initialized",
      });
    }

    const result = await answerChoiceStatsService.clearChoiceStats(
      parseInt(quizId),
      parseInt(questionId)
    );

    if (result) {
      res.json({
        success: true,
        message: "Xóa thống kê lựa chọn câu trả lời thành công",
        data: {
          quiz_id: parseInt(quizId),
          question_id: parseInt(questionId),
          cleared: true,
          timestamp: Date.now(),
        },
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Không thể xóa thống kê lựa chọn câu trả lời",
      });
    }
  } catch (error) {
    console.error("Error clearing question choice stats:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi xóa thống kê lựa chọn câu trả lời",
      error: error.message,
    });
  }
};

/**
 * GET /api/quizzes/:quizId/teacher/dashboard
 * Comprehensive teacher dashboard with real-time analytics
 * TIER 1 FEATURE - Week 1-2 Implementation
 */
const getTeacherDashboard = async (req, res) => {
  try {
    const { quizId } = req.params;

    // Check authorization
    const userRole = req.roleName || req.user.Role?.name;
    if (userRole !== "admin" && userRole !== "teacher") {
      return res.status(403).json({
        success: false,
        message: "Chỉ giáo viên và admin mới có quyền xem dashboard này",
      });
    }

    // Get quiz info
    const quiz = await Quiz.findByPk(quizId, {
      include: [
        {
          model: Question,
          as: "Questions",
          through: { attributes: [] },
          attributes: ["question_id", "question_text", "level_id", "lo_id"],
          include: [
            { model: Level, as: "Level", attributes: ["name"] },
            { model: LO, as: "LO", attributes: ["name"] },
            {
              model: Answer,
              as: "Answers",
              attributes: ["answer_id", "answer_text", "iscorrect"],
            },
          ],
        },
        {
          model: Course,
          as: "Course",
          attributes: ["course_id", "name"],
        },
      ],
    });

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy quiz",
      });
    }

    // Get realtime data from Firebase
    const quizRef = db.ref(`quiz_sessions/${quizId}`);
    const snapshot = await quizRef.once("value");
    const quizData = snapshot.val();

    if (!quizData || !quizData.participants) {
      return res.status(200).json({
        success: true,
        message: "Quiz chưa có người tham gia",
        data: {
          quiz_info: {
            quiz_id: quiz.quiz_id,
            name: quiz.name,
            status: quiz.status,
            total_questions: quiz.Questions.length,
            course: quiz.Course?.name,
          },
          participants_summary: {
            total: 0,
            active: 0,
            completed: 0,
          },
          class_metrics: null,
          struggling_students: [],
          current_question_analytics: null,
          predictions: null,
          alerts: [],
          timestamp: Date.now(),
        },
      });
    }

    // Import enhanced services
    const StrugglingDetectionService = require("../services/strugglingDetectionService");
    const QuestionAnalyticsService = require("../services/questionAnalyticsService");
    const PredictionService = require("../services/predictionService");

    const participants = quizData.participants;
    const participantsList = Object.values(participants);
    const totalQuestions = quiz.Questions.length;

    // Calculate class metrics
    const calculateClassMetrics = (participants) => {
      const participantsList = Object.values(participants || {});

      if (participantsList.length === 0) {
        return null;
      }

      const scores = [];
      const accuracies = [];
      const responseTimes = [];
      let completedCount = 0;
      let activeCount = 0;

      participantsList.forEach((p) => {
        if (p.score !== undefined) scores.push(p.score);
        if (p.accuracy !== undefined) accuracies.push(p.accuracy);
        if (p.avg_response_time !== undefined)
          responseTimes.push(p.avg_response_time);
        if (p.status === "completed") completedCount++;
        if (
          p.status !== "completed" &&
          Date.now() - (p.last_answer_time || 0) < 300000
        ) {
          activeCount++;
        }
      });

      const avg = (arr) =>
        arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      const median = (arr) => {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0
          ? sorted[mid]
          : (sorted[mid - 1] + sorted[mid]) / 2;
      };

      return {
        total_participants: participantsList.length,
        active_participants: activeCount,
        completed_participants: completedCount,
        avg_score: Math.round(avg(scores) * 10) / 10,
        median_score: Math.round(median(scores) * 10) / 10,
        avg_accuracy: Math.round(avg(accuracies) * 10) / 10,
        avg_response_time: Math.round(avg(responseTimes) * 10) / 10,
        completion_rate:
          Math.round((completedCount / participantsList.length) * 100 * 10) /
          10,
      };
    };

    const classMetrics = calculateClassMetrics(participants);

    // Detect struggling students
    const strugglingStudents =
      StrugglingDetectionService.detectStrugglingStudents(
        participantsList,
        classMetrics
      );

    // Find current question (most recent question being answered)
    let currentQuestionId = null;
    let maxLastAnswerTime = 0;
    participantsList.forEach((p) => {
      const answers = p.answers || {};
      Object.keys(answers).forEach((qId) => {
        const answerTime = answers[qId].timestamp || 0;
        if (answerTime > maxLastAnswerTime) {
          maxLastAnswerTime = answerTime;
          currentQuestionId = parseInt(qId);
        }
      });
    });

    // Analyze current question
    let currentQuestionAnalytics = null;
    if (currentQuestionId) {
      currentQuestionAnalytics =
        await QuestionAnalyticsService.analyzeLiveQuestionDifficulty(
          quizId,
          currentQuestionId,
          participants
        );
    }

    // Generate predictions
    const currentQuestionIndex = currentQuestionId
      ? quiz.Questions.findIndex((q) => q.question_id === currentQuestionId)
      : 0;

    const predictions = PredictionService.predictQuizOutcome(
      participants,
      totalQuestions,
      currentQuestionIndex,
      classMetrics
    );

    // Generate alerts
    const generateAlerts = (
      strugglingStudents,
      questionAnalytics,
      predictions,
      classMetrics
    ) => {
      const alerts = [];

      // Critical struggling students
      const criticalStudents = strugglingStudents.filter(
        (s) => s.risk_level === "critical"
      );
      if (criticalStudents.length > 0) {
        alerts.push({
          type: "critical",
          category: "struggling_students",
          title: `${criticalStudents.length} học sinh cần giúp đỡ ngay`,
          message: `Các học sinh đang gặp khó khăn nghiêm trọng`,
          students: criticalStudents.map((s) => s.user_name),
          action: "Hãy kiểm tra các học sinh này ngay lập tức",
          priority: 1,
        });
      }

      // Difficult question
      if (questionAnalytics && questionAnalytics.live_stats) {
        const correctRate = questionAnalytics.live_stats.current_correct_rate;
        if (correctRate < 30) {
          alerts.push({
            type: "warning",
            category: "question_difficulty",
            title: `Câu hỏi hiện tại rất khó`,
            message: `Chỉ ${correctRate}% trả lời đúng`,
            action:
              questionAnalytics.insights?.teaching_suggestion ||
              "Xem xét tạm dừng để ôn tập",
            priority: 2,
          });
        }

        // Misconception
        if (questionAnalytics.insights?.common_misconception?.detected) {
          alerts.push({
            type: "warning",
            category: "misconception",
            title: "Phát hiện hiểu lầm phổ biến",
            message: questionAnalytics.insights.common_misconception.evidence,
            action: questionAnalytics.insights.common_misconception.suggestion,
            priority: 2,
          });
        }
      }

      // Low predicted pass rate
      if (
        predictions?.pass_rate_prediction?.predicted_pass_rate < 50 &&
        predictions.pass_rate_prediction.confidence > 70
      ) {
        alerts.push({
          type: "warning",
          category: "predicted_outcome",
          title: "Tỷ lệ đỗ dự đoán thấp",
          message: `Chỉ ${predictions.pass_rate_prediction.predicted_pass_rate}% dự đoán đạt yêu cầu`,
          action: "Xem xét điều chỉnh độ khó hoặc cung cấp thêm hỗ trợ",
          priority: 3,
        });
      }

      return alerts.sort((a, b) => a.priority - b.priority);
    };

    const alerts = generateAlerts(
      strugglingStudents,
      currentQuestionAnalytics,
      predictions,
      classMetrics
    );

    // Response
    res.json({
      success: true,
      message: "Lấy teacher dashboard thành công",
      data: {
        quiz_info: {
          quiz_id: quiz.quiz_id,
          name: quiz.name,
          status: quiz.status,
          total_questions: totalQuestions,
          course: quiz.Course?.name,
          created_at: quiz.created_at,
        },

        participants_summary: {
          total: classMetrics.total_participants,
          active: classMetrics.active_participants,
          completed: classMetrics.completed_participants,
        },

        class_metrics: classMetrics,

        struggling_students: {
          count: strugglingStudents.length,
          critical_count: strugglingStudents.filter(
            (s) => s.risk_level === "critical"
          ).length,
          high_count: strugglingStudents.filter((s) => s.risk_level === "high")
            .length,
          students: strugglingStudents.slice(0, 10), // Top 10
        },

        current_question_analytics: currentQuestionAnalytics,

        predictions: predictions,

        alerts: alerts,

        timestamp: Date.now(),
      },
    });
  } catch (error) {
    console.error("Error getting teacher dashboard:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy teacher dashboard",
      error: error.message,
    });
  }
};

/**
 * Get all code practice quizzes
 * GET /api/quizzes/code-practice
 */
const getCodePracticeQuizzes = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      course_id,
      search,
      sort_by = "update_time",
      sort_order = "DESC",
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const whereClause = {
      quiz_mode: "code_practice",
    };

    if (status) {
      whereClause.status = status;
    }

    if (course_id) {
      whereClause.course_id = parseInt(course_id);
    }

    if (search) {
      whereClause.name = {
        [Op.iLike]: `%${search}%`,
      };
    }

    const { count, rows: quizzes } = await Quiz.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Course,
          as: "Course",
          attributes: ["course_id", "name"],
          include: [
            {
              model: Subject,
              as: "Subject",
              attributes: ["subject_id", "name"],
            },
          ],
        },
        {
          model: Question,
          as: "Questions",
          through: { attributes: [] },
          attributes: [
            "question_id",
            "question_text",
            "level_id",
            "question_type_id",
            "question_data",
            "validation_rules",
            "hints",
            "time_limit",
            "tags",
            "explanation",
          ],
          include: [
            {
              model: Level,
              as: "Level",
              attributes: ["level_id", "name"],
            },
            {
              model: QuestionType,
              as: "QuestionType",
              attributes: ["question_type_id", "name"],
            },
          ],
        },
      ],
      order: [[sort_by, sort_order]],
      limit: parseInt(limit),
      offset: offset,
      distinct: true,
    });

    const totalPages = Math.ceil(count / parseInt(limit));

    return res.status(200).json({
      success: true,
      data: {
        message: "Lấy danh sách quiz code practice thành công",
        quizzes: quizzes.map((q) => ({
          quiz_id: q.quiz_id,
          name: q.name,
          course_id: q.course_id,
          course_name: q.Course?.name,
          subject_id: q.Course?.Subject?.subject_id,
          subject_name: q.Course?.Subject?.name,
          duration: q.duration,
          status: q.status,
          pin: q.pin,
          quiz_mode: q.quiz_mode,
          code_config: q.code_config,
          start_time: q.start_time,
          end_time: q.end_time,
          update_time: q.update_time,
          question_count: q.Questions?.length || 0,
          questions: q.Questions?.map((question) => ({
            question_id: question.question_id,
            question_text: question.question_text,
            level: question.Level?.name,
            type: question.QuestionType?.name,
            question_data: question.question_data,
            validation_rules: question.validation_rules,
            hints: question.hints,
            time_limit: question.time_limit,
            tags: question.tags,
            explanation: question.explanation,
          })),
        })),
        pagination: {
          total: count,
          totalPages,
          currentPage: parseInt(page),
          limit: parseInt(limit),
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1,
        },
      },
    });
  } catch (error) {
    console.error("Lỗi trong getCodePracticeQuizzes:", error);
    return res.status(500).json({
      error: "Lỗi khi lấy danh sách quiz code practice",
      details: error.message,
    });
  }
};

module.exports = {
  createQuiz,
  updateQuiz,
  deleteQuiz,
  getQuizzes,
  getQuizById,
  submitQuiz,
  startQuiz,
  //getNextQuestion,
  showLeaderboard,
  getQuizQuestions,
  joinQuiz,
  getLeaderboard,
  getCurrentQuestion,
  getMyResult,
  shuffleQuestions,
  getQuizParticipants,
  checkAndEndExpiredQuizzes,
  getQuizIdByPin,
  setGlobalIO,
  handleRealtimeAnswer,
  nextQuestionSocket,
  leaveQuiz,
  getQuizzesByTeacherId,
  getQuizzesByMode,
  getQuizzesByCourseAndMode,
  getQuizSession,
  getRealtimeScores,
  getQuizStatistics,
  getStudentScoreHistory,
  getStudentRealtimeData,
  createQuizSession,
  updateQuizSession,
  getQuizSessionById,
  emitNewParticipantNotification,
  emitParticipantLeftNotification,
  emitQuizEndedNotification,
  getQuizAnalytics,
  getParticipantDetail,
  getQuizProgress,
  getQuizProgressTracking,
  cloneQuiz, // Thêm function mới
  getQuestionChoiceStats,
  getQuizChoiceStatsSummary,
  getLiveChoiceStats,
  clearQuestionChoiceStats,
  getTeacherDashboard, // NEW: Enhanced teacher dashboard endpoint
  getCodePracticeQuizzes, // NEW: Get code practice quizzes
};
