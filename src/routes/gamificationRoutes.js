const express = require('express');
const router = express.Router();
const GamificationController = require('../controllers/gamificationController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// Routes cho tất cả user đã đăng nhập
router.get('/me', authenticateToken, GamificationController.getUserGamificationInfo);
router.get('/leaderboard', authenticateToken, GamificationController.getPointsLeaderboard);
router.get('/level-progress', authenticateToken, GamificationController.getUserLevelProgress);

// Test endpoint để add points
router.post('/add-points-test', authenticateToken, GamificationController.addPointsTest);

// Sync titles và badges cho user hiện tại
router.post('/sync-gamification', authenticateToken, GamificationController.syncUserGamification);

// Routes cho admin/teacher
router.get('/user/:userId',
    authenticateToken,
    authorize(['admin', 'teacher']),
    GamificationController.getUserGamificationInfoById
);

router.post('/add-points',
    authenticateToken,
    authorize(['admin']),
    GamificationController.addPointsManually
);

router.get('/stats',
    authenticateToken,
    authorize(['admin']),
    GamificationController.getGamificationStats
);

module.exports = router;
