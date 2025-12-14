const express = require('express');
const router = express.Router();
const SocialController = require('../controllers/socialController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Apply authentication middleware to all social routes
router.use(authenticateToken);

// =====================================================
// SOCIAL INTERACTION ROUTES
// =====================================================

/**
 * @route   POST /api/social/emoji-reaction
 * @desc    Send emoji reaction to another user
 * @access  Private
 * @body    { to_user_id, emoji_type_id, context?, context_id?, metadata? }
 */
router.post('/emoji-reaction', SocialController.sendEmojiReaction);

/**
 * @route   POST /api/social/encouragement
 * @desc    Send encouragement to another user
 * @access  Private
 * @body    { to_user_id, context?, context_id?, message? }
 */
router.post('/encouragement', SocialController.sendEncouragement);

/**
 * @route   POST /api/social/celebrate
 * @desc    Celebrate another user's achievement
 * @access  Private
 * @body    { to_user_id, achievement_type, emoji_type_id?, message? }
 */
router.post('/celebrate', SocialController.celebrateAchievement);

// =====================================================
// SOCIAL STATS ROUTES
// =====================================================

/**
 * @route   GET /api/social/stats
 * @desc    Get user's social statistics
 * @access  Private
 * @query   timeframe (1d, 7d, 30d)
 */
router.get('/stats', SocialController.getUserSocialStats);

/**
 * @route   GET /api/social/interactions/history
 * @desc    Get user's social interaction history
 * @access  Private
 * @query   type (sent, received, both), interaction_type, limit
 */
router.get('/interactions/history', SocialController.getSocialInteractionHistory);

/**
 * @route   GET /api/social/top-users
 * @desc    Get top social users (most positive interactions)
 * @access  Private
 * @query   timeframe, limit
 */
router.get('/top-users', SocialController.getTopSocialUsers);

// =====================================================
// SOCIAL LEADERBOARD ROUTES
// =====================================================

/**
 * @route   GET /api/social/leaderboard
 * @desc    Get social leaderboard
 * @access  Private
 * @query   criteria (reputation, emojis, usage, kindness, popularity), limit
 */
router.get('/leaderboard', SocialController.getSocialLeaderboard);

/**
 * @route   GET /api/social/rank
 * @desc    Get user's social rank
 * @access  Private
 * @query   criteria
 */
router.get('/rank', SocialController.getUserSocialRank);

// =====================================================
// SOCIAL PROFILE ROUTES
// =====================================================

/**
 * @route   POST /api/social/favorite-emoji
 * @desc    Set favorite emoji for social profile
 * @access  Private
 * @body    { emoji_type_id }
 */
router.post('/favorite-emoji', SocialController.setFavoriteEmoji);

/**
 * @route   GET /api/social/profile
 * @desc    Get user's own social profile
 * @access  Private
 */
router.get('/profile', SocialController.getUserSocialProfile);

/**
 * @route   GET /api/social/profile/:user_id
 * @desc    Get another user's social profile
 * @access  Private
 */
router.get('/profile/:user_id', SocialController.getUserSocialProfile);

module.exports = router;
