const express = require('express');
const router = express.Router();
const GamificationLevelController = require('../controllers/gamificationLevelController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// Routes cho level system
router.get('/levels', GamificationLevelController.getAllLevels);
router.get('/tiers', GamificationLevelController.getAllTiers);
router.get('/levels/:level', GamificationLevelController.getLevelInfo);
router.get('/calculate-level', GamificationLevelController.calculateLevelFromXP);
router.get('/distribution', GamificationLevelController.getLevelDistribution);
router.get('/leaderboard', GamificationLevelController.getTopUsersByLevel);

// Routes cần authentication
router.get('/my-progress', authenticateToken, GamificationLevelController.getUserLevelProgress);

module.exports = router;
