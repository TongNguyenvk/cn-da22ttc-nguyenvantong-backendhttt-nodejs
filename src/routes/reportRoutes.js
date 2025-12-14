const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// Báo cáo tổng quan chương trình
router.get('/program/:program_id/overview',
    authenticateToken,
    authorize(['admin', 'teacher']),
    reportController.getProgramOverviewReport
);

// Báo cáo chi tiết sinh viên
router.get('/student/:user_id/program/:program_id/detail',
    authenticateToken,
    authorize(['admin', 'teacher']),
    reportController.getStudentDetailReport
);

// Báo cáo so sánh môn học
router.get('/program/:program_id/subjects/comparison',
    authenticateToken,
    authorize(['admin', 'teacher']),
    reportController.getSubjectComparisonReport
);

// Route mới: Báo cáo tổng thể theo môn học cho người học
router.get('/subject/:subject_id/comprehensive-analysis/:user_id',
    authenticateToken,
    authorize(['admin', 'teacher', 'student']),
    reportController.getSubjectComprehensiveAnalysisForStudent
);

// Route mới: Báo cáo tổng thể theo khóa học cho người học  
router.get('/course/:course_id/comprehensive-analysis/:user_id',
    authenticateToken,
    authorize(['admin', 'teacher', 'student']),
    reportController.getCourseComprehensiveAnalysisForStudent
);

module.exports = router;
