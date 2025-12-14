const express = require('express');
const router = express.Router();
const DynamicScoringController = require('../controllers/dynamicScoringController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

/**
 * Dynamic Scoring Routes
 * Handles all endpoints for the dynamic quiz scoring system
 */

// =====================================================
// PUBLIC/CONFIG ROUTES
// =====================================================

/**
 * Get scoring configuration
 * GET /api/scoring/config
 * Access: All authenticated users
 */
router.get('/config',
    authenticateToken,
    DynamicScoringController.getScoringConfig
);

/**
 * Test dynamic scoring with real data
 * POST /api/scoring/test
 * Access: All authenticated users
 */
router.post('/test',
    authenticateToken,
    DynamicScoringController.testDynamicScoring
);

/**
 * Simulate scoring calculation (for testing/preview)
 * POST /api/scoring/simulate
 * Access: All authenticated users
 */
router.post('/simulate',
    authenticateToken,
    DynamicScoringController.simulateScoring
);

// =====================================================
// STUDENT ROUTES
// =====================================================

/**
 * Calculate score for a single question answer
 * POST /api/scoring/calculate-question
 * Access: Students only (during quiz)
 */
router.post('/calculate-question',
    authenticateToken,
    authorize(['student']),
    DynamicScoringController.calculateQuestionScore
);

/**
 * Process complete quiz with dynamic scoring
 * POST /api/scoring/process-quiz
 * Access: Students only (quiz completion)
 */
router.post('/process-quiz',
    authenticateToken,
    authorize(['student']),
    DynamicScoringController.processQuizCompletion
);

/**
 * Get current user's scoring statistics
 * GET /api/scoring/my-stats
 * Access: Students only
 */
router.get('/my-stats',
    authenticateToken,
    authorize(['student']),
    (req, res) => {
        // Redirect to user-stats without userId (will use current user)
        DynamicScoringController.getUserScoringStats(req, res);
    }
);

// =====================================================
// TEACHER/ADMIN ROUTES
// =====================================================

/**
 * Get user's scoring statistics (by admin/teacher)
 * GET /api/scoring/user-stats/:userId
 * Access: Teachers and Admins only
 */
router.get('/user-stats/:userId',
    authenticateToken,
    authorize(['teacher', 'admin']),
    DynamicScoringController.getUserScoringStats
);

/**
 * Get quiz scoring leaderboard
 * GET /api/scoring/leaderboard/:quizId
 * Access: Teachers and Admins only
 */
router.get('/leaderboard/:quizId',
    authenticateToken,
    authorize(['teacher', 'admin']),
    DynamicScoringController.getQuizScoringLeaderboard
);

// =====================================================
// ADMIN ONLY ROUTES
// =====================================================

/**
 * Get all users' scoring statistics (admin overview)
 * GET /api/scoring/admin/overview
 * Access: Admins only
 */
router.get('/admin/overview',
    authenticateToken,
    authorize(['admin']),
    async (req, res) => {
        try {
            // This could be expanded to show system-wide scoring statistics
            return res.status(200).json({
                success: true,
                message: 'Admin scoring overview endpoint - to be implemented',
                data: {
                    note: 'This endpoint can be expanded for admin dashboard statistics'
                }
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy overview',
                error: error.message
            });
        }
    }
);

// =====================================================
// MIDDLEWARE FOR ROUTE VALIDATION
// =====================================================

/**
 * Middleware to validate quiz access
 * Can be used to ensure user has access to specific quiz data
 */
const validateQuizAccess = async (req, res, next) => {
    try {
        const { quizId } = req.params;
        const userId = req.user.user_id;
        const userRole = req.user.role;

        if (!quizId) {
            return res.status(400).json({
                success: false,
                message: 'Quiz ID is required'
            });
        }

        // Admin and teachers have access to all quizzes
        if (['admin', 'teacher'].includes(userRole)) {
            return next();
        }

        // Students can only access quizzes they participated in
        const { QuizResult } = require('../models');
        const participation = await QuizResult.findOne({
            where: {
                quiz_id: quizId,
                user_id: userId
            }
        });

        if (!participation) {
            return res.status(403).json({
                success: false,
                message: 'Bạn không có quyền truy cập quiz này'
            });
        }

        next();
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Lỗi khi kiểm tra quyền truy cập quiz',
            error: error.message
        });
    }
};

// Apply quiz access validation to specific routes
router.use('/leaderboard/:quizId', validateQuizAccess);

// =====================================================
// ERROR HANDLING MIDDLEWARE
// =====================================================

/**
 * Error handling middleware for scoring routes
 */
router.use((error, req, res, next) => {
    console.error('Dynamic Scoring Route Error:', error);

    return res.status(500).json({
        success: false,
        message: 'Lỗi hệ thống scoring',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
});

// =====================================================
// ROUTE DOCUMENTATION
// =====================================================

/**
 * Get API documentation for scoring endpoints
 * GET /api/scoring/docs
 * Access: All authenticated users
 */
router.get('/docs', authenticateToken, (req, res) => {
    const documentation = {
        title: 'Dynamic Scoring System API',
        version: '1.0.0',
        description: 'API endpoints for the dynamic quiz scoring system with speed bonuses, streak multipliers, and perfect bonuses',
        endpoints: {
            'GET /config': 'Get scoring configuration and rules',
            'POST /simulate': 'Simulate scoring calculation for testing',
            'POST /calculate-question': 'Calculate score for a single question (students)',
            'POST /process-quiz': 'Process complete quiz with dynamic scoring (students)',
            'GET /my-stats': 'Get current user scoring statistics (students)',
            'GET /user-stats/:userId': 'Get user scoring statistics (teachers/admins)',
            'GET /leaderboard/:quizId': 'Get quiz scoring leaderboard (teachers/admins)',
            'GET /admin/overview': 'Get system-wide scoring overview (admins)'
        },
        scoring_features: {
            speed_bonuses: 'Bonus points for fast answers (2s, 3s, 5s, 8s thresholds)',
            streak_system: 'Bonus points and multipliers for consecutive correct answers',
            difficulty_multipliers: 'Score multipliers based on question difficulty',
            perfect_bonuses: 'Special bonuses for perfect scores, speed, and streaks',
            time_bonuses: 'Bonuses for early completion or time pressure performance'
        }
    };

    return res.status(200).json({
        success: true,
        message: 'Dynamic Scoring API Documentation',
        data: documentation
    });
});

module.exports = router;
