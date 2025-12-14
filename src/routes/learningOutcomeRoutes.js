const express = require('express');
const router = express.Router();
const learningOutcomeController = require('../controllers/learningOutcomeController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

/**
 * LEARNING OUTCOME ROUTES
 * Routes cho phân tích Learning Outcomes theo % hoàn thành
 */

// API chính: Phân tích chi tiết LO theo % hoàn thành
router.get('/completion-analysis/:course_id/:user_id',
    authenticateToken,
    authorize(['admin', 'teacher', 'student']),
    learningOutcomeController.getLOCompletionAnalysis
);

// API hỗ trợ: Lấy danh sách LO của một khóa học
router.get('/course/:course_id',
    authenticateToken,
    authorize(['admin', 'teacher', 'student']),
    learningOutcomeController.getLOsByCourse
);

// API hỗ trợ: Lấy chi tiết một LO cụ thể
router.get('/:lo_id/details',
    authenticateToken,
    authorize(['admin', 'teacher', 'student']),
    learningOutcomeController.getLODetails
);

module.exports = router;
