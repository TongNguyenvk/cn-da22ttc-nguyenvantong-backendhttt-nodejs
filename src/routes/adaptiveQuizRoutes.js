const express = require('express');
const router = express.Router();
const adaptiveQuizController = require('../controllers/adaptiveQuizController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// Routes cho Adaptive Quiz Generation

// Lấy preview quiz thích ứng cho học sinh
router.get('/preview', 
    authenticateToken, 
    authorize(['teacher', 'admin']), 
    adaptiveQuizController.getAdaptiveQuizPreview
);

// Lấy danh sách học sinh có thể tạo quiz thích ứng
router.get('/eligible-students', 
    authenticateToken, 
    authorize(['teacher', 'admin']), 
    adaptiveQuizController.getEligibleStudents
);

// Tạo quiz thích ứng
router.post('/generate', 
    authenticateToken, 
    authorize(['teacher', 'admin']), 
    adaptiveQuizController.generateAdaptiveQuiz
);

module.exports = router;
