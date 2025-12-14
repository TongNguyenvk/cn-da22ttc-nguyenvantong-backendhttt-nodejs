// backend/src/routes/answerChoiceStatsRoutes.js
// Routes for Answer Choice Statistics API

const express = require('express');
const router = express.Router();
const { authenticateToken, authorize } = require('../middleware/authMiddleware');
const AnswerChoiceStatsController = require('../controllers/answerChoiceStatsController');

// Initialize controller (will be set by app.js when io is available)
let answerChoiceStatsController;

const initializeController = (io) => {
    answerChoiceStatsController = new AnswerChoiceStatsController(io);
};

/**
 * @route GET /api/quizzes/:quizId/question/:questionId/choice-stats
 * @desc Get current choice statistics for a specific question
 * @access Private (Students, Teachers, Admins)
 */
router.get('/:quizId/question/:questionId/choice-stats', 
    authenticateToken, 
    authorize(['student', 'teacher', 'admin']),
    async (req, res) => {
        if (!answerChoiceStatsController) {
            return res.status(500).json({
                success: false,
                message: 'Answer Choice Stats Controller not initialized'
            });
        }
        await answerChoiceStatsController.getQuestionChoiceStats(req, res);
    }
);

/**
 * @route GET /api/quizzes/:quizId/choice-stats-summary
 * @desc Get quiz-wide choice statistics summary
 * @access Private (Teachers, Admins)
 */
router.get('/:quizId/choice-stats-summary', 
    authenticateToken, 
    authorize(['teacher', 'admin']),
    async (req, res) => {
        if (!answerChoiceStatsController) {
            return res.status(500).json({
                success: false,
                message: 'Answer Choice Stats Controller not initialized'
            });
        }
        await answerChoiceStatsController.getQuizChoiceStatsSummary(req, res);
    }
);

/**
 * @route GET /api/quizzes/:quizId/live-choice-stats
 * @desc Get live choice statistics for all questions in quiz
 * @access Private (Teachers, Admins)
 */
router.get('/:quizId/live-choice-stats', 
    authenticateToken, 
    authorize(['teacher', 'admin']),
    async (req, res) => {
        if (!answerChoiceStatsController) {
            return res.status(500).json({
                success: false,
                message: 'Answer Choice Stats Controller not initialized'
            });
        }
        await answerChoiceStatsController.getLiveChoiceStats(req, res);
    }
);

/**
 * @route DELETE /api/quizzes/:quizId/question/:questionId/choice-stats
 * @desc Clear choice statistics for a specific question
 * @access Private (Teachers, Admins)
 */
router.delete('/:quizId/question/:questionId/choice-stats', 
    authenticateToken, 
    authorize(['teacher', 'admin']),
    async (req, res) => {
        if (!answerChoiceStatsController) {
            return res.status(500).json({
                success: false,
                message: 'Answer Choice Stats Controller not initialized'
            });
        }
        await answerChoiceStatsController.clearQuestionChoiceStats(req, res);
    }
);

module.exports = { router, initializeController };
