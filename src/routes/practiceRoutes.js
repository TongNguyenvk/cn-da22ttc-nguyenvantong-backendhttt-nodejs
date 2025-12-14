const express = require('express');
const router = express.Router();
const { 
    getPracticeRecommendations, 
    generatePracticeQuiz 
} = require('../controllers/practiceRecommendationController');
const {
    submitSessionResults,
    submitSessionWithEggs,
    getSessionHistory,
    getSessionDetails,
    endIndividualSession,
    startIndividualSession
} = require('../controllers/practiceSessionController');
const {
    testDatabaseConnection,
    testCourseStructure,
    testUserHistory
} = require('../controllers/databaseDebugController');
const { sequelize } = require('../models');
const { QuizResult } = require('../models');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');
const { logPracticeActivity, addResponseTime } = require('../middleware/practiceLogger');

/**
 * PRACTICE RECOMMENDATION ROUTES
 * Các routes cho hệ thống đề xuất luyện tập với logging và monitoring
 */

// Apply response time middleware to all routes
router.use(addResponseTime);

// ==================== PRACTICE SESSION ROUTES ====================

// POST /api/practice/submit-session-results
// Submit complete practice session results (EXP, coins, items, performance data)
router.post('/submit-session-results',
    authenticateToken,
    authorize(['student']),
    logPracticeActivity('session_submit'),
    submitSessionResults
);

// POST /api/practice/submit-with-eggs
// NEW: Submit practice session with egg opening handled by backend
// Replaces frontend egg opening logic for security and data integrity
router.post('/submit-with-eggs',
    authenticateToken,
    authorize(['student']),
    logPracticeActivity('session_submit_with_eggs'),
    submitSessionWithEggs
);

// GET /api/practice/session-history
// Get practice session history for current user
router.get('/session-history',
    authenticateToken,
    authorize(['student', 'teacher', 'admin']),
    logPracticeActivity('session_history'),
    getSessionHistory
);

// GET /api/practice/session-details/:quizResultId
// GET /api/practice/session-details/:quizResultId
// Get detailed performance data for a specific practice session
router.get('/session-details/:quizResultId',
    authenticateToken,
    authorize(['student', 'teacher', 'admin']),
    logPracticeActivity('session_details'),
    getSessionDetails
);

// POST /api/practice/start-session
// Start new individual practice session
router.post('/start-session',
    authenticateToken,
    authorize(['student']),
    logPracticeActivity('start_session'),
    startIndividualSession
);

// POST /api/practice/end-session
// End individual practice session immediately when user wants to quit
router.post('/end-session',
    authenticateToken,
    authorize(['student']),
    logPracticeActivity('end_session'),
    endIndividualSession
);

// ==================== PRACTICE RECOMMENDATION ROUTES ====================

// GET /api/practice/recommendations?courseId=xxx&userId=xxx
// Lấy đề xuất luyện tập cho học sinh dựa trên course
router.get('/recommendations', 
    authenticateToken, 
    authorize(['student', 'teacher', 'admin']),
    logPracticeActivity('recommendation'),
    getPracticeRecommendations
);

// POST /api/practice/generate
// Tạo bài luyện tập với câu hỏi cụ thể
// Body: { courseId, userId, loId?, difficulty?, totalQuestions?, includeReview? }
router.post('/generate', 
    authenticateToken, 
    authorize(['student', 'teacher', 'admin']),
    logPracticeActivity('generation'),
    generatePracticeQuiz
);

// GET /api/practice/analytics/stats
// Internal route để lấy thống kê practice (admin only)
router.get('/analytics/stats', 
    authenticateToken, 
    authorize(['admin']), 
    async (req, res) => {
        try {
            const { practiceLogger } = require('../middleware/practiceLogger');
            const days = parseInt(req.query.days) || 7;
            const stats = await practiceLogger.getPracticeStatistics(days);
            
            res.json({
                success: true,
                data: stats,
                period: `${days} days`
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Lỗi khi lấy thống kê practice',
                details: error.message
            });
        }
    }
);

// ==================== DEBUG ROUTES ====================

// Temporary test route without auth for debugging
router.get('/test-db', async (req, res) => {
    try {
        const { sequelize } = require('../models');
        
        // Test basic connection
        await sequelize.authenticate();
        
        // Test the fixed query
        const losQuery = `
            SELECT 
                l.lo_id,
                l.name as lo_name,
                l.description,
                s.name as subject_name,
                c.name as chapter_name
            FROM "LOs" l
            JOIN chapter_lo cl ON l.lo_id = cl.lo_id
            JOIN "Chapters" c ON cl.chapter_id = c.chapter_id
            JOIN "Subjects" s ON c.subject_id = s.subject_id
            JOIN "Courses" course ON s.subject_id = course.subject_id
            WHERE course.course_id = 1
            LIMIT 5
        `;
        
        const results = await sequelize.query(losQuery, {
            type: sequelize.QueryTypes.SELECT
        });
        
        res.json({
            success: true,
            message: 'Database connection and query successful',
            results: results
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message,
            details: error.stack
        });
    }
});

// TEMP: Cleanup stale practice sessions (admin only)
router.post('/cleanup/stale-sessions',
    authenticateToken,
    authorize(['admin']),
    async (req, res) => {
        try {
            const { maxAgeHours = 12 } = req.body || {};
            const cutoff = new Date(Date.now() - maxAgeHours * 3600 * 1000);
            const t = await sequelize.transaction();
            try {
                const stale = await QuizResult.findAll({
                    where: {
                        status: 'in_progress',
                        update_time: { [sequelize.Op.lt]: cutoff }
                    },
                    transaction: t,
                    attributes: ['result_id','user_id','quiz_id','update_time']
                });
                for (const row of stale) {
                    await row.update({ status: 'terminated', end_reason: 'admin_stale_cleanup', update_time: new Date(), completion_time: 0 }, { transaction: t });
                }
                await t.commit();
                res.json({ success: true, cleaned: stale.length, maxAgeHours });
            } catch (e) {
                await t.rollback();
                res.status(500).json({ success: false, error: e.message });
            }
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

// GET /api/practice/debug/database
// Test database connection và structure (admin only)
router.get('/debug/database', 
    authenticateToken, 
    authorize(['admin']), 
    testDatabaseConnection
);

// GET /api/practice/debug/course/:courseId
// Test course structure (admin only)
router.get('/debug/course/:courseId', 
    authenticateToken, 
    authorize(['admin']), 
    testCourseStructure
);

// GET /api/practice/debug/user/:userId
// Test user history data (admin only)
router.get('/debug/user/:userId', 
    authenticateToken, 
    authorize(['admin']), 
    testUserHistory
);

module.exports = router;
