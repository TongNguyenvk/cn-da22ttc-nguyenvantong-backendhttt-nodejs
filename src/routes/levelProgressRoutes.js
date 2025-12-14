const express = require('express');
const router = express.Router();
const LevelProgressController = require('../controllers/levelProgressController');
const { authenticateToken } = require('../middleware/authMiddleware');

// =====================================================
// LEVEL PROGRESS ROUTES
// =====================================================

/**
 * @route   GET /api/level-progress/tracker
 * @desc    Get level progress tracker with tier-based structure
 * @access  Private (authenticated users)
 */
router.get('/tracker', authenticateToken, LevelProgressController.getTracker);

/**
 * @route   POST /api/level-progress/claim-avatar
 * @desc    Claim avatar reward for completed level
 * @access  Private (authenticated users)
 */
router.post('/claim-avatar', authenticateToken, LevelProgressController.claimAvatar);

module.exports = router;
