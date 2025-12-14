const express = require('express');
const router = express.Router();
const ProgressController = require('../controllers/progressController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// Routes cho tất cả user đã đăng nhập
router.get('/overview', authenticateToken, ProgressController.getUserProgressOverview);
router.get('/subject/:subjectId', authenticateToken, ProgressController.getSubjectProgress);
router.get('/subject/:subjectId/next-lo', authenticateToken, ProgressController.getNextRecommendedLO);

// Routes cho admin/teacher
router.get('/user/:userId', 
    authenticateToken, 
    authorize(['admin', 'teacher']), 
    ProgressController.getUserProgressById
);

router.get('/class/:courseId/stats', 
    authenticateToken, 
    authorize(['admin', 'teacher']), 
    ProgressController.getClassProgressStats
);

// Internal route để cập nhật progress (có thể dùng cho webhook)
router.post('/update-after-quiz', 
    authenticateToken, 
    ProgressController.updateProgressAfterQuiz
);

module.exports = router;
