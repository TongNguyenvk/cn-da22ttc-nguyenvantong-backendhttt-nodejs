// routes/quizRoutes.js
const express = require("express");
const router = express.Router();
const quizController = require("../controllers/quizController");
const { authenticateToken, authorize } = require("../middleware/authMiddleware");
const { checkQuizSession } = require('../middleware/quizSessionMiddleware');

// Public routes - không cần xác thực
router.get("/", quizController.getQuizzes);
router.get("/code-practice", quizController.getCodePracticeQuizzes); // NEW: Get code practice quizzes
router.get("/:id", quizController.getQuizById);
router.get("/:id/questions", quizController.getQuizQuestions);
router.get("/:id/leaderboard", quizController.getLeaderboard);
router.get("/pin/:pin", quizController.getQuizIdByPin);
// Lấy danh sách người tham gia quiz
router.get("/:id/participants", quizController.getQuizParticipants);
// Test route để trigger leaderboard (chỉ dùng cho development)
router.post("/:id/test-leaderboard", quizController.showLeaderboard);

// Teacher routes - chỉ giảng viên mới có quyền
router.post("/", authenticateToken, authorize(["teacher", "admin"]), quizController.createQuiz);
router.post("/create", authenticateToken, authorize(["teacher", "admin"]), quizController.createQuiz);
router.put("/:id", authenticateToken, authorize(["teacher", "admin"]), quizController.updateQuiz);
router.delete(
    "/:id",
    authenticateToken,
    authorize(["teacher", "admin"]),
    quizController.deleteQuiz
);
// Clone quiz endpoint - Teacher/Admin only
router.post(
    "/:id/clone",
    authenticateToken,
    authorize(["teacher", "admin"]),
    quizController.cloneQuiz
);
router.post(
    "/:id/start",
    authenticateToken,
    authorize(["teacher", "admin"]),
    quizController.startQuiz
);
/*router.post(
    "/:id/next",
    authenticateToken,
    authorize(["teacher", "admin"]),
    quizController.triggerNextQuestion
);*/
router.post(
    "/:id/leaderboard",
    authenticateToken,
    authorize(["teacher", "admin"]),
    quizController.showLeaderboard
);
router.post(
    "/:id/shuffle",
    authenticateToken,
    authorize(["teacher", "admin"]),
    quizController.shuffleQuestions
);
//router.post('/:id/auto', authenticateToken, authorize(["teacher", "admin"]), quizController.startAutoQuiz);
router.get(
    "/:id/realtime-scores",
    authenticateToken,
    authorize(["teacher", "admin"]),
    quizController.getRealtimeScores
);
router.get(
    "/:id/statistics",
    authenticateToken,
    authorize(["teacher", "admin"]),
    quizController.getQuizStatistics
);
router.get(
    "/:quizId/student/:userId/score-history",
    authenticateToken,
    authorize(["teacher", "admin"]),
    quizController.getStudentScoreHistory
);
router.get(
    "/:quizId/student/:userId/realtime",
    authenticateToken,
    authorize(["teacher", "admin"]),
    quizController.getStudentRealtimeData
);

// Route mới cho progress tracking
router.get(
    "/:quizId/progress-tracking",
    authenticateToken,
    authorize(["teacher", "admin"]),
    quizController.getQuizProgressTracking
);

// Student routes - chỉ học viên mới có quyền
router.post("/:id/submit", authenticateToken, authorize(["student"]), quizController.submitQuiz);
router.post("/:id/join", authenticateToken, authorize(["student"]), quizController.joinQuiz);
router.get(
    "/:id/current-question",
    authenticateToken,
    authorize(["student"]),
    quizController.getCurrentQuestion
);
router.get(
    "/:id/my-result",
    authenticateToken,
    authorize(["student"]),
    quizController.getMyResult
);
router.post('/:id/leave', authenticateToken, authorize(["student"]), quizController.leaveQuiz);

router.post('/realtime/answer', authenticateToken, authorize(["student"]), quizController.handleRealtimeAnswer);

router.get('/teacher/:user_id/quizzes', authenticateToken, authorize(['teacher']), quizController.getQuizzesByTeacherId);

// =====================================================
// QUIZ MODE FILTER ROUTES
// =====================================================

// Get quizzes by quiz mode only
router.get('/mode/:mode', authenticateToken, quizController.getQuizzesByMode);

// Get quizzes by course and quiz mode combination
router.get('/course/:courseId/mode/:mode', authenticateToken, quizController.getQuizzesByCourseAndMode);

// Thêm routes mới cho báo cáo
router.get('/:id/analytics', authenticateToken, authorize(['admin', 'teacher']), quizController.getQuizAnalytics);
router.get('/:quizId/participants/:userId', authenticateToken, authorize(['admin', 'teacher']), quizController.getParticipantDetail);

// =====================================================
// ANSWER CHOICE STATISTICS ROUTES
// =====================================================

// Get choice statistics for a specific question (all users)
router.get(
    '/:quizId/question/:questionId/choice-stats', 
    authenticateToken, 
    quizController.getQuestionChoiceStats
);

// Get quiz-wide choice statistics summary (teachers/admins only)
router.get(
    '/:quizId/choice-stats-summary', 
    authenticateToken, 
    authorize(['admin', 'teacher']), 
    quizController.getQuizChoiceStatsSummary
);

// Get real-time choice stats for teachers monitoring (teachers/admins only)
router.get(
    '/:quizId/live-choice-stats', 
    authenticateToken, 
    authorize(['admin', 'teacher']), 
    quizController.getLiveChoiceStats
);

// Clear choice statistics for a question (teachers/admins only)
router.delete(
    '/:quizId/question/:questionId/choice-stats', 
    authenticateToken, 
    authorize(['admin', 'teacher']), 
    quizController.clearQuestionChoiceStats
);

// =====================================================
// ENHANCED TEACHER DASHBOARD ROUTE (NEW - TIER 1)
// =====================================================

// Get comprehensive teacher dashboard with AI-powered insights
// Features: Struggling detection, question analytics, predictions, alerts
router.get(
    '/:quizId/teacher/dashboard',
    authenticateToken,
    authorize(['admin', 'teacher']),
    quizController.getTeacherDashboard
);

module.exports = router;