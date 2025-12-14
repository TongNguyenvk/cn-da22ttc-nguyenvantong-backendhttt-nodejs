const express = require("express");
const router = express.Router();
const codeSubmissionController = require("../controllers/codeSubmissionController");
const { authenticateToken } = require("../middleware/authMiddleware");

// Get available models
router.get(
  "/available-models",
  authenticateToken,
  codeSubmissionController.getAvailableModels
);

// Submit code for analysis (with AI - legacy)
router.post("/submit", authenticateToken, codeSubmissionController.submitCode);

// Submit final code (NO AI - just save test results)
// Flow mới: Run Test có AI → Submit Final chỉ lưu kết quả
router.post("/submit-final", authenticateToken, codeSubmissionController.submitFinal);

// Get submission result
router.get(
  "/:submissionId/result",
  authenticateToken,
  codeSubmissionController.getSubmissionResult
);

// Get user's submission history for a question
router.get(
  "/question/:questionId/history",
  authenticateToken,
  codeSubmissionController.getSubmissionHistory
);

// Get question statistics (teachers only)
router.get(
  "/question/:questionId/stats",
  authenticateToken,
  codeSubmissionController.getQuestionStats
);

// Re-analyze submission
router.post(
  "/:submissionId/re-analyze",
  authenticateToken,
  codeSubmissionController.reAnalyzeSubmission
);

// Quick code analysis without question/quiz context
router.post(
  "/quick-analyze",
  authenticateToken,
  codeSubmissionController.quickAnalyze
);

// Simple code execution - just run and see console output
router.post("/run", authenticateToken, codeSubmissionController.runCode);

// Run code WITH custom input (stdin) - for manual testing
router.post("/run-with-input", authenticateToken, codeSubmissionController.runCodeWithInput);

// Run code WITH test cases validation
router.post(
  "/run-test",
  authenticateToken,
  codeSubmissionController.runCodeWithTests
);

// Get user's tracking for a question
router.get(
  "/tracking/:questionId",
  authenticateToken,
  codeSubmissionController.getUserTracking
);

// Get user's overall analytics
router.get(
  "/analytics",
  authenticateToken,
  codeSubmissionController.getUserAnalytics
);

module.exports = router;
