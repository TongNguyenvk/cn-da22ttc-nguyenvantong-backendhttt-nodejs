const express = require("express");
const router = express.Router();
const quizResultController = require("../controllers/quizResultController");
const {
  authenticateToken,
  authorize,
} = require("../middleware/authMiddleware");

router.get(
  "/",
  authenticateToken,
  authorize(["admin", "teacher"]),
  quizResultController.getAllQuizResults
);

// Route cho phân tích cải thiện - phải đặt trước /:id để tránh conflict
router.get(
  "/improvement-analysis",
  authenticateToken,
  authorize(["admin", "teacher", "student"]),
  quizResultController.getImprovementAnalysis
);

router.get(
  "/:id",
  authenticateToken,
  authorize(["admin", "teacher", "student"]),
  quizResultController.getQuizResultById
);
router.post(
  "/",
  authenticateToken,
  authorize(["admin", "teacher"]),
  quizResultController.createQuizResult
);
router.post(
  "/ensure-history-completeness",
  authenticateToken,
  authorize(["admin", "teacher"]),
  quizResultController.ensureUserQuestionHistoryCompleteness
);
router.put(
  "/:id",
  authenticateToken,
  authorize(["admin", "teacher"]),
  quizResultController.updateQuizResult
);
router.delete(
  "/:id",
  authenticateToken,
  authorize(["admin", "teacher"]),
  quizResultController.deleteQuizResult
);
router.get(
  "/user/:user_id",
  authenticateToken,
  authorize(["student"]),
  quizResultController.getQuizResultsByUserId
);
router.get(
  "/quiz/:quiz_id",
  authenticateToken,
  authorize(["admin", "teacher", "student"]),
  quizResultController.getQuizResultsByQuizId
);
router.get(
  "/quiz/:quizId/radar/current-user",
  authenticateToken,
  authorize(["student"]),
  quizResultController.getCurrentUserRadarData
);
router.get(
  "/quiz/:quizId/radar/average",
  authenticateToken,
  authorize(["admin", "teacher", "student"]),
  quizResultController.getAverageRadarData
);
router.get(
  "/quiz/:quizId/radar/top-performer",
  authenticateToken,
  authorize(["admin", "teacher", "student"]),
  quizResultController.getTopPerformerRadarData
);
router.get(
  "/quiz/:quizId/radar/all",
  authenticateToken,
  authorize(["admin", "teacher"]),
  quizResultController.getAllRadarData
);

// Route mới: Phân tích chi tiết kết quả quiz cho người học
router.get(
  "/detailed-analysis/:quiz_id/:user_id",
  authenticateToken,
  authorize(["admin", "teacher", "student"]),
  quizResultController.getDetailedQuizAnalysisForStudent
);

// Route mới: Phân tích kết quả quiz theo LO với gợi ý học tập
router.get(
  "/lo-analysis/:quiz_id/:user_id",
  authenticateToken,
  authorize(["admin", "teacher", "student"]),
  quizResultController.getQuizLOAnalysis
);

// Route mới: Phân tích kết quả quiz theo LO với thông tin chương chi tiết
router.get(
  "/lo-analysis-with-chapters/:quiz_id/:user_id",
  authenticateToken,
  authorize(["admin", "teacher", "student"]),
  quizResultController.getQuizLOAnalysisWithChapters
);

/**
 * ===========================================================
 * COURSE-BASED QUIZ RESULT ROUTES (NEW - Migration from subject_id to course_id)
 * ===========================================================
 */

// Route đã tồn tại: Phân tích cải thiện theo course_id
router.get(
  "/improvement-analysis",
  authenticateToken,
  authorize(["admin", "teacher", "student"]),
  quizResultController.getImprovementAnalysis
);

// Route đã tồn tại: Phân tích quiz LO với chapters theo course
router.get(
  "/quiz-lo-analysis-chapters",
  authenticateToken,
  authorize(["admin", "teacher", "student"]),
  quizResultController.getQuizLOAnalysisWithChapters
);

/*
// TODO: Implement these functions in controller
router.post(
  "/analyze-course-improvement",
  authenticateToken,
  authorize(["admin", "teacher", "student"]),
  quizResultController.analyzeCourseImprovement
);
*/

module.exports = router;
