/**
 * Migration Routes for dual API support during transition period
 * Provides endpoints that support both subject_id and course_id
 */

const express = require('express');
const router = express.Router();
const MigrationController = require('../controllers/migrationController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// =====================================================
// MIGRATION STATUS AND HELP
// =====================================================

/**
 * Get migration status and current schema state
 * GET /api/migration/status
 */
router.get('/status', MigrationController.getMigrationStatus);

/**
 * Convert old subject_id query to new course_id format
 * GET /api/migration/convert-query?subject_id=1
 */
router.get('/convert-query', MigrationController.convertQuery);

// =====================================================
// DUAL SUPPORT QUIZ ENDPOINTS
// =====================================================

/**
 * Get quizzes with dual support
 * GET /api/migration/quizzes?subject_id=1
 * GET /api/migration/quizzes?course_id=1
 */
router.get('/quizzes', MigrationController.getQuizzes);

/**
 * Create quiz with dual support
 * POST /api/migration/quizzes
 * Body: { subject_id: 1, name: "Test", duration: 60 } OR { course_id: 1, ... }
 */
router.post('/quizzes', 
    authenticateToken, 
    authorize(['admin', 'teacher']), 
    MigrationController.createQuiz
);

/**
 * Get quiz statistics with dual support
 * GET /api/migration/quiz-statistics?subject_id=1
 * GET /api/migration/quiz-statistics?course_id=1
 */
router.get('/quiz-statistics', MigrationController.getQuizStatistics);

/**
 * Validate quiz assignment for grade columns
 * POST /api/migration/validate-quiz-assignment
 * Body: { quiz_id: 1, course_id: 1 } OR { quiz_id: 1, subject_id: 1 }
 */
router.post('/validate-quiz-assignment', 
    authenticateToken,
    authorize(['admin', 'teacher']),
    MigrationController.validateQuizAssignment
);

// =====================================================
// RELATIONSHIP EXPLORATION ENDPOINTS
// =====================================================

/**
 * Get courses by subject (for understanding new schema)
 * GET /api/migration/subject/:subject_id/courses
 */
router.get('/subject/:subject_id/courses', MigrationController.getCoursesBySubject);

/**
 * Get subjects by course (for understanding new schema)
 * GET /api/migration/course/:course_id/subjects
 */
router.get('/course/:course_id/subjects', MigrationController.getSubjectsByCourse);

// =====================================================
// MIDDLEWARE FOR DEPRECATION WARNINGS
// =====================================================

/**
 * Middleware to add deprecation warnings for subject_id usage
 */
const addDeprecationWarning = (req, res, next) => {
    if (req.query.subject_id || req.body.subject_id) {
        res.set('X-Deprecated-Parameter', 'subject_id');
        res.set('X-Migration-Message', 'Please use course_id instead of subject_id in future requests');
    }
    next();
};

// Apply deprecation warning to all routes
router.use(addDeprecationWarning);

// =====================================================
// DOCUMENTATION ENDPOINT
// =====================================================

/**
 * Get migration documentation and examples
 * GET /api/migration/docs
 */
router.get('/docs', (req, res) => {
    const documentation = {
        overview: {
            purpose: 'Provides dual support for subject_id and course_id during migration period',
            migration_path: 'subject_id (deprecated) -> course_id (new standard)',
            timeline: 'subject_id support will be removed in future version'
        },
        endpoints: {
            'GET /api/migration/quizzes': {
                description: 'Get quizzes by subject_id or course_id',
                parameters: {
                    subject_id: 'integer (deprecated)',
                    course_id: 'integer (recommended)',
                    status: 'string (optional)',
                    quiz_mode: 'string (optional)'
                },
                example_old: '/api/migration/quizzes?subject_id=1',
                example_new: '/api/migration/quizzes?course_id=1'
            },
            'POST /api/migration/quizzes': {
                description: 'Create quiz with subject_id or course_id',
                body_old: { subject_id: 1, name: 'Test Quiz', duration: 60 },
                body_new: { course_id: 1, name: 'Test Quiz', duration: 60 }
            },
            'GET /api/migration/convert-query': {
                description: 'Convert subject_id to course_id format',
                example: '/api/migration/convert-query?subject_id=1',
                returns: { course_id: 5 }
            }
        },
        schema_changes: {
            old_schema: 'Quiz -> Subject -> Course',
            new_schema: 'Quiz -> Course <-> Subject (many-to-many)',
            impact: 'Quizzes now belong directly to courses, subjects can have multiple courses'
        },
        migration_steps: [
            '1. Run database migration scripts',
            '2. Update frontend to use course_id instead of subject_id',
            '3. Test with dual API support',
            '4. Remove subject_id usage completely',
            '5. Clean up deprecated endpoints'
        ]
    };

    res.status(200).json({
        success: true,
        data: documentation
    });
});

module.exports = router;
