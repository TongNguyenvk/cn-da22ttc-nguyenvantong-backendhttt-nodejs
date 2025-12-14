const express = require('express');
const router = express.Router();
const teacherCodeAnalyticsController = require('../controllers/teacherCodeAnalyticsController');
const { authenticateToken } = require('../middleware/authMiddleware');

// All routes require authentication and teacher/admin role

// Get course overview (supports quiz_id, assignment_id, or subject_id)
// Query param 'type' determines which: ?type=quiz|assignment|subject
router.get(
    '/course/:id/overview',
    authenticateToken,
    teacherCodeAnalyticsController.getCourseOverview
);

// Get detailed student analysis
router.get(
    '/student/:userId',
    authenticateToken,
    teacherCodeAnalyticsController.getStudentAnalysis
);

// Compare multiple students
router.post(
    '/compare-students',
    authenticateToken,
    teacherCodeAnalyticsController.compareStudents
);

// Get question difficulty analysis
router.get(
    '/question/:questionId/difficulty',
    authenticateToken,
    teacherCodeAnalyticsController.getQuestionDifficulty
);

// Get students needing help
router.get(
    '/course/:subjectId/students-needing-help',
    authenticateToken,
    teacherCodeAnalyticsController.getStudentsNeedingHelp
);

module.exports = router;
