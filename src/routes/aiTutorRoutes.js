/**
 * AI Tutor Routes
 * 
 * Endpoints cho AI Tutor - trợ lý học lập trình
 */

const express = require("express");
const router = express.Router();
const aiTutorController = require("../controllers/aiTutorController");
const { authenticateToken } = require("../middleware/authMiddleware");

// All routes require authentication
router.use(authenticateToken);

/**
 * @route POST /api/ai-tutor/chat
 * @desc Chat với AI Tutor (có lưu history)
 * @body { message, question_id?, code?, language? }
 * @access Student, Teacher
 */
router.post("/chat", aiTutorController.chat);

/**
 * @route POST /api/ai-tutor/quick-help
 * @desc Hỏi nhanh (không lưu history)
 * @body { question, question_id?, code?, language? }
 * @access Student, Teacher
 */
router.post("/quick-help", aiTutorController.quickHelp);

/**
 * @route POST /api/ai-tutor/explain
 * @desc Giải thích khái niệm lập trình
 * @body { concept, language? }
 * @access Student, Teacher
 */
router.post("/explain", aiTutorController.explainConcept);

/**
 * @route POST /api/ai-tutor/hint
 * @desc Lấy gợi ý cho bài tập
 * @body { question_id, code?, language?, hint_level? }
 * @access Student
 */
router.post("/hint", aiTutorController.getHint);

/**
 * @route POST /api/ai-tutor/review
 * @desc Review code của sinh viên
 * @body { code, language?, question_id? }
 * @access Student, Teacher
 */
router.post("/review", aiTutorController.reviewCode);

/**
 * @route POST /api/ai-tutor/clear-history
 * @desc Xóa lịch sử chat
 * @body { question_id? }
 * @access Student, Teacher
 */
router.post("/clear-history", aiTutorController.clearHistory);

/**
 * @route GET /api/ai-tutor/session-stats
 * @desc Lấy thống kê session
 * @query { question_id? }
 * @access Student, Teacher
 */
router.get("/session-stats", aiTutorController.getSessionStats);

/**
 * @route GET /api/ai-tutor/history
 * @desc Lấy lịch sử chat từ database
 * @query { question_id?, limit? }
 * @access Student, Teacher
 */
router.get("/history", aiTutorController.getHistory);

// ========================================
// 📊 ANALYTICS ROUTES
// ========================================

// --- Teacher Analytics ---

/**
 * @route GET /api/ai-tutor/analytics/question/:questionId/stats
 * @desc Thống kê chat của sinh viên theo câu hỏi
 * @access Teacher
 */
router.get("/analytics/question/:questionId/stats", aiTutorController.getQuestionChatStats);

/**
 * @route GET /api/ai-tutor/analytics/question/:questionId/topics
 * @desc Phân tích các chủ đề sinh viên hay thắc mắc
 * @query { limit? }
 * @access Teacher
 */
router.get("/analytics/question/:questionId/topics", aiTutorController.analyzeCommonTopics);

/**
 * @route GET /api/ai-tutor/analytics/question/:questionId/need-help
 * @desc Danh sách sinh viên cần hỗ trợ
 * @query { threshold? }
 * @access Teacher
 */
router.get("/analytics/question/:questionId/need-help", aiTutorController.getStudentsNeedingHelp);

/**
 * @route GET /api/ai-tutor/analytics/question/:questionId/faq
 * @desc FAQ tự động từ câu hỏi hay gặp
 * @query { limit? }
 * @access Teacher, Student
 */
router.get("/analytics/question/:questionId/faq", aiTutorController.getQuestionFAQ);

/**
 * @route GET /api/ai-tutor/analytics/question/:questionId/difficulty
 * @desc Đánh giá độ khó của bài tập
 * @access Teacher
 */
router.get("/analytics/question/:questionId/difficulty", aiTutorController.assessQuestionDifficulty);

// --- Student Analytics ---

/**
 * @route GET /api/ai-tutor/analytics/my-summary
 * @desc Tóm tắt những gì đã học
 * @query { question_id? }
 * @access Student
 */
router.get("/analytics/my-summary", aiTutorController.getMyLearningSummary);

/**
 * @route GET /api/ai-tutor/analytics/my-review
 * @desc Gợi ý ôn tập
 * @access Student
 */
router.get("/analytics/my-review", aiTutorController.getMyReviewSuggestions);

/**
 * @route GET /api/ai-tutor/analytics/my-activity
 * @desc Thống kê hoạt động chat
 * @query { days? }
 * @access Student
 */
router.get("/analytics/my-activity", aiTutorController.getMyActivity);

module.exports = router;
