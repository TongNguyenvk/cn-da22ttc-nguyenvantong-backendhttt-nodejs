const express = require('express');
const router = express.Router();
const learningAnalyticsController = require('../controllers/learningAnalyticsController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// Routes cho phân tích chương trình - chỉ admin và teacher
router.post('/program-analysis', 
    authenticateToken, 
    authorize(['admin', 'teacher']), 
    learningAnalyticsController.createProgramAnalysis
);

// Lấy danh sách sinh viên theo tiến độ
router.get('/program/:program_id/students', 
    authenticateToken, 
    authorize(['admin', 'teacher']), 
    learningAnalyticsController.getStudentsByProgress
);

// Phân tích chi tiết một sinh viên
router.get('/student/:user_id/program/:program_id/analysis', 
    authenticateToken, 
    authorize(['admin', 'teacher']), 
    learningAnalyticsController.getStudentDetailedAnalysis
);

// NEW ROUTES for missing endpoints
router.get('/outcomes/progress',
    authenticateToken,
    authorize(['admin', 'teacher']),
    learningAnalyticsController.getOutcomesProgress
);

router.get('/outcomes/effectiveness',
    authenticateToken,
    authorize(['admin', 'teacher']),
    learningAnalyticsController.getOutcomesEffectiveness
);

router.get('/quiz-performance/trend',
    authenticateToken,
    authorize(['admin', 'teacher']),
    learningAnalyticsController.getQuizPerformanceTrend
);

router.get('/quiz-performance/comparison',
    authenticateToken,
    authorize(['admin', 'teacher']),
    learningAnalyticsController.getQuizPerformanceComparison
);

module.exports = router;
