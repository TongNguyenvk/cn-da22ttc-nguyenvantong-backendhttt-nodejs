const express = require('express');
const router = express.Router();
const practiceRecommendationController = require('../controllers/practiceRecommendationController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Apply authentication middleware
router.use(authenticateToken);

/**
 * @route   GET /api/practice-recommendations/:quiz_id
 * @desc    Get practice quiz recommendations based on completed assessment quiz
 * @access  Private (Student)
 * @params  quiz_id - The completed assessment quiz ID
 */
router.get('/:quiz_id', practiceRecommendationController.getRecommendations);

/**
 * @route   POST /api/practice-recommendations/ai-analysis
 * @desc    Get AI analysis with radar chart data from completed quiz
 * @access  Private (Student)
 * @body    { quiz_id, user_id }
 */
router.post('/ai-analysis', practiceRecommendationController.getAIAnalysis);

/**
 * @route   POST /api/practice-recommendations/generate
 * @desc    Generate practice quiz for a specific LO (or auto-select weakest LO)
 * @access  Private (Student)
 * @body    { courseId, userId, loId?, difficulty?, totalQuestions?, includeReview? }
 */
router.post('/generate', practiceRecommendationController.generatePracticeQuiz);

/**
 * @route   POST /api/practice-recommendations/generate-adaptive
 * @desc    Generate adaptive practice quiz covering multiple weak LOs with proportional distribution
 * @access  Private (Student)
 * @body    { assessment_quiz_id, total_questions?, distribution_method? }
 */
router.post('/generate-adaptive', practiceRecommendationController.generateAdaptivePracticeQuiz);

module.exports = router;
