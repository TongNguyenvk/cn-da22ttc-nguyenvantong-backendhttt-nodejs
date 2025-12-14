/**
 * AI Tutor Controller
 * 
 * Endpoints cho AI Tutor chat và analytics
 */

const AITutorService = require("../services/aiTutorService");
const AITutorAnalyticsService = require("../services/aiTutorAnalyticsService");
const { Question } = require("../models");

// Singleton instances
let tutorService = null;
let analyticsService = null;

const getTutorService = () => {
  if (!tutorService) {
    tutorService = new AITutorService();
  }
  return tutorService;
};

const getAnalyticsService = () => {
  if (!analyticsService) {
    analyticsService = new AITutorAnalyticsService();
  }
  return analyticsService;
};

/**
 * POST /api/ai-tutor/chat
 * Main chat endpoint
 */
const chat = async (req, res) => {
  try {
    const { message, question_id, code, language } = req.body;
    const user_id = req.user.user_id;
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập tin nhắn"
      });
    }
    
    // Build session ID
    const sessionId = question_id 
      ? `user_${user_id}_q_${question_id}`
      : `user_${user_id}_general`;
    
    // Build context
    let context = {};
    
    if (question_id) {
      const question = await Question.findByPk(question_id);
      if (question) {
        context.questionText = question.question_text;
      }
    }
    
    if (code) {
      context.currentCode = code;
    }
    
    if (language) {
      context.language = language;
    }
    
    // Chat with AI (with userId and questionId for DB persistence)
    const tutor = getTutorService();
    const result = await tutor.chat(sessionId, message.trim(), context, user_id, question_id || null);
    
    return res.status(200).json({
      success: result.success,
      data: {
        message: result.message,
        session_id: sessionId,
        history_length: result.historyLength
      },
      error: result.error || null
    });
    
  } catch (error) {
    console.error("[AITutorController] Chat error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống",
      error: error.message
    });
  }
};

/**
 * POST /api/ai-tutor/quick-help
 * One-shot question (no history)
 */
const quickHelp = async (req, res) => {
  try {
    const { question, question_id, code, language } = req.body;
    
    if (!question || question.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập câu hỏi"
      });
    }
    
    // Build context
    let context = {};
    
    if (question_id) {
      const questionData = await Question.findByPk(question_id);
      if (questionData) {
        context.questionText = questionData.question_text;
      }
    }
    
    if (code) context.currentCode = code;
    if (language) context.language = language;
    
    const tutor = getTutorService();
    const result = await tutor.quickHelp(question.trim(), context);
    
    return res.status(200).json({
      success: result.success,
      data: {
        message: result.message
      },
      error: result.error || null
    });
    
  } catch (error) {
    console.error("[AITutorController] Quick help error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống",
      error: error.message
    });
  }
};

/**
 * POST /api/ai-tutor/explain
 * Explain a programming concept
 */
const explainConcept = async (req, res) => {
  try {
    const { concept, language = 'c' } = req.body;
    
    if (!concept || concept.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập khái niệm cần giải thích"
      });
    }
    
    const tutor = getTutorService();
    const result = await tutor.explainConcept(concept.trim(), language);
    
    return res.status(200).json({
      success: result.success,
      data: {
        concept: result.concept,
        explanation: result.explanation
      },
      error: result.error || null
    });
    
  } catch (error) {
    console.error("[AITutorController] Explain error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống",
      error: error.message
    });
  }
};

/**
 * POST /api/ai-tutor/hint
 * Get hint for current problem
 */
const getHint = async (req, res) => {
  try {
    const { question_id, code, language = 'c', hint_level = 1 } = req.body;
    
    if (!question_id) {
      return res.status(400).json({
        success: false,
        message: "question_id là bắt buộc"
      });
    }
    
    const question = await Question.findByPk(question_id);
    if (!question) {
      return res.status(404).json({
        success: false,
        message: "Câu hỏi không tồn tại"
      });
    }
    
    const tutor = getTutorService();
    const result = await tutor.getHint(
      question.question_text,
      code || '',
      language,
      Math.min(Math.max(hint_level, 1), 3) // Clamp 1-3
    );
    
    return res.status(200).json({
      success: result.success,
      data: {
        hint: result.hint,
        hint_level: result.hintLevel,
        next_hint_available: result.nextHintAvailable
      },
      error: result.error || null
    });
    
  } catch (error) {
    console.error("[AITutorController] Get hint error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống",
      error: error.message
    });
  }
};

/**
 * POST /api/ai-tutor/review
 * Review code
 */
const reviewCode = async (req, res) => {
  try {
    const { code, language = 'c', question_id } = req.body;
    
    if (!code || code.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp code để review"
      });
    }
    
    let questionText = null;
    if (question_id) {
      const question = await Question.findByPk(question_id);
      if (question) {
        questionText = question.question_text;
      }
    }
    
    const tutor = getTutorService();
    const result = await tutor.reviewCode(code.trim(), language, questionText);
    
    return res.status(200).json({
      success: result.success,
      data: {
        review: result.review
      },
      error: result.error || null
    });
    
  } catch (error) {
    console.error("[AITutorController] Review error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống",
      error: error.message
    });
  }
};

/**
 * POST /api/ai-tutor/clear-history
 * Clear chat history for current session
 */
const clearHistory = async (req, res) => {
  try {
    const { question_id } = req.body;
    const user_id = req.user.user_id;
    
    const sessionId = question_id 
      ? `user_${user_id}_q_${question_id}`
      : `user_${user_id}_general`;
    
    const tutor = getTutorService();
    await tutor.clearHistory(sessionId, user_id);
    
    return res.status(200).json({
      success: true,
      message: "Đã xóa lịch sử chat",
      data: {
        session_id: sessionId
      }
    });
    
  } catch (error) {
    console.error("[AITutorController] Clear history error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống",
      error: error.message
    });
  }
};

/**
 * GET /api/ai-tutor/session-stats
 * Get session statistics
 */
const getSessionStats = async (req, res) => {
  try {
    const { question_id } = req.query;
    const user_id = req.user.user_id;
    
    const sessionId = question_id 
      ? `user_${user_id}_q_${question_id}`
      : `user_${user_id}_general`;
    
    const tutor = getTutorService();
    const stats = await tutor.getSessionStats(sessionId, user_id);
    
    return res.status(200).json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    console.error("[AITutorController] Session stats error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống",
      error: error.message
    });
  }
};

/**
 * GET /api/ai-tutor/history
 * Get conversation history from database
 */
const getHistory = async (req, res) => {
  try {
    const { question_id, limit = 50 } = req.query;
    const user_id = req.user.user_id;
    
    const tutor = getTutorService();
    const history = await tutor.getConversationHistory(
      user_id, 
      question_id ? parseInt(question_id) : null, 
      parseInt(limit)
    );
    
    return res.status(200).json({
      success: true,
      data: {
        messages: history,
        count: history.length
      }
    });
    
  } catch (error) {
    console.error("[AITutorController] Get history error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống",
      error: error.message
    });
  }
};

// ========================================
// 📊 ANALYTICS ENDPOINTS
// ========================================

/**
 * GET /api/ai-tutor/analytics/question/:questionId/stats
 * [Teacher] Thống kê chat của sinh viên theo câu hỏi
 */
const getQuestionChatStats = async (req, res) => {
  try {
    const { questionId } = req.params;
    
    const analytics = getAnalyticsService();
    const stats = await analytics.getQuestionChatStats(parseInt(questionId));
    
    return res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error("[AITutorController] getQuestionChatStats error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống",
      error: error.message
    });
  }
};

/**
 * GET /api/ai-tutor/analytics/question/:questionId/topics
 * [Teacher] Phân tích các chủ đề sinh viên hay thắc mắc
 */
const analyzeCommonTopics = async (req, res) => {
  try {
    const { questionId } = req.params;
    const { limit = 20 } = req.query;
    
    const analytics = getAnalyticsService();
    const topics = await analytics.analyzeCommonTopics(
      parseInt(questionId), 
      parseInt(limit)
    );
    
    return res.status(200).json({
      success: true,
      data: topics
    });
  } catch (error) {
    console.error("[AITutorController] analyzeCommonTopics error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống",
      error: error.message
    });
  }
};

/**
 * GET /api/ai-tutor/analytics/question/:questionId/need-help
 * [Teacher] Danh sách sinh viên cần hỗ trợ
 */
const getStudentsNeedingHelp = async (req, res) => {
  try {
    const { questionId } = req.params;
    const { threshold = 8 } = req.query;
    
    const analytics = getAnalyticsService();
    const result = await analytics.getStudentsNeedingHelp(
      parseInt(questionId), 
      parseInt(threshold)
    );
    
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error("[AITutorController] getStudentsNeedingHelp error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống",
      error: error.message
    });
  }
};

/**
 * GET /api/ai-tutor/analytics/question/:questionId/faq
 * [Teacher/Student] FAQ tự động từ câu hỏi hay gặp
 */
const getQuestionFAQ = async (req, res) => {
  try {
    const { questionId } = req.params;
    const { limit = 5 } = req.query;
    
    const analytics = getAnalyticsService();
    const faq = await analytics.generateFAQ(
      parseInt(questionId), 
      parseInt(limit)
    );
    
    return res.status(200).json({
      success: true,
      data: faq
    });
  } catch (error) {
    console.error("[AITutorController] getQuestionFAQ error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống",
      error: error.message
    });
  }
};

/**
 * GET /api/ai-tutor/analytics/question/:questionId/difficulty
 * [Teacher] Đánh giá độ khó của bài tập
 */
const assessQuestionDifficulty = async (req, res) => {
  try {
    const { questionId } = req.params;
    
    const analytics = getAnalyticsService();
    const difficulty = await analytics.assessQuestionDifficulty(parseInt(questionId));
    
    return res.status(200).json({
      success: true,
      data: difficulty
    });
  } catch (error) {
    console.error("[AITutorController] assessQuestionDifficulty error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống",
      error: error.message
    });
  }
};

/**
 * GET /api/ai-tutor/analytics/my-summary
 * [Student] Tóm tắt những gì đã học
 */
const getMyLearningSummary = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const { question_id } = req.query;
    
    const analytics = getAnalyticsService();
    const summary = await analytics.summarizeLearning(
      user_id, 
      question_id ? parseInt(question_id) : null
    );
    
    return res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error("[AITutorController] getMyLearningSummary error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống",
      error: error.message
    });
  }
};

/**
 * GET /api/ai-tutor/analytics/my-review
 * [Student] Gợi ý ôn tập
 */
const getMyReviewSuggestions = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    
    const analytics = getAnalyticsService();
    const suggestions = await analytics.getReviewSuggestions(user_id);
    
    return res.status(200).json({
      success: true,
      data: suggestions
    });
  } catch (error) {
    console.error("[AITutorController] getMyReviewSuggestions error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống",
      error: error.message
    });
  }
};

/**
 * GET /api/ai-tutor/analytics/my-activity
 * [Student] Thống kê hoạt động chat
 */
const getMyActivity = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const { days = 7 } = req.query;
    
    const analytics = getAnalyticsService();
    const activity = await analytics.getStudentChatActivity(user_id, parseInt(days));
    
    return res.status(200).json({
      success: true,
      data: activity
    });
  } catch (error) {
    console.error("[AITutorController] getMyActivity error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống",
      error: error.message
    });
  }
};

module.exports = {
  chat,
  quickHelp,
  explainConcept,
  getHint,
  reviewCode,
  clearHistory,
  getSessionStats,
  getHistory,
  // Analytics
  getQuestionChatStats,
  analyzeCommonTopics,
  getStudentsNeedingHelp,
  getQuestionFAQ,
  assessQuestionDifficulty,
  getMyLearningSummary,
  getMyReviewSuggestions,
  getMyActivity
};
