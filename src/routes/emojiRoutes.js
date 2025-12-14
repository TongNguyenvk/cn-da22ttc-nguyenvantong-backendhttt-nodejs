const express = require('express');
const router = express.Router();
const EmojiController = require('../controllers/emojiController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Apply authentication middleware to all emoji routes
router.use(authenticateToken);

// =====================================================
// EMOJI COLLECTION ROUTES
// =====================================================

/**
 * @route   POST /api/emojis/initialize
 * @desc    Initialize emoji system for user (unlock basic emojis based on tier)
 * @access  Private
 */
router.post('/initialize', EmojiController.initializeUserEmojis);

/**
 * @route   GET /api/emojis/collection
 * @desc    Get user's emoji collection
 * @access  Private
 * @query   category, rarity, is_favorite
 */
router.get('/collection', EmojiController.getUserEmojiCollection);

/**
 * @route   GET /api/emojis/available
 * @desc    Get available emojis for user's tier
 * @access  Private
 * @query   tier (optional)
 */
router.get('/available', EmojiController.getAvailableEmojis);

/**
 * @route   GET /api/emojis/category/:category
 * @desc    Get emojis by category
 * @access  Private
 */
router.get('/category/:category', EmojiController.getEmojisByCategory);

// =====================================================
// EMOJI SHOP ROUTES
// =====================================================

/**
 * @route   GET /api/emojis/shop
 * @desc    Get emoji shop (purchasable emojis for user's tier)
 * @access  Private
 */
router.get('/shop', EmojiController.getEmojiShop);

/**
 * @route   POST /api/emojis/purchase
 * @desc    Purchase emoji with Kristal
 * @access  Private
 * @body    { emoji_type_id }
 */
router.post('/purchase', EmojiController.purchaseEmoji);

// =====================================================
// EMOJI USAGE ROUTES
// =====================================================

/**
 * @route   POST /api/emojis/use
 * @desc    Use an emoji (record usage and social interaction if applicable)
 * @access  Private
 * @body    { emoji_type_id, context, target_user_id?, quiz_session_id?, metadata? }
 */
router.post('/use', EmojiController.useEmoji);

/**
 * @route   POST /api/emojis/send-realtime
 * @desc    Send an emoji realtime in quiz
 * @access  Private
 * @body    { emoji_type_id, quiz_id, target_user_id? }
 */
router.post('/send-realtime', EmojiController.sendEmojiRealtime);

/**
 * @route   GET /api/emojis/usage/history
 * @desc    Get user's emoji usage history
 * @access  Private
 * @query   context, timeframe, limit
 */
router.get('/usage/history', EmojiController.getEmojiUsageHistory);

/**
 * @route   GET /api/emojis/usage/stats
 * @desc    Get user's emoji usage statistics
 * @access  Private
 * @query   timeframe
 */
router.get('/usage/stats', EmojiController.getEmojiUsageStats);

// =====================================================
// EMOJI MANAGEMENT ROUTES
// =====================================================

/**
 * @route   POST /api/emojis/favorite
 * @desc    Set favorite emoji for user
 * @access  Private
 * @body    { emoji_type_id }
 */
router.post('/favorite', EmojiController.setFavoriteEmoji);

/**
 * @route   GET /api/emojis/:emoji_id
 * @desc    Get emoji details by ID
 * @access  Private
 */
router.get('/:emoji_id', EmojiController.getEmojiDetails);

module.exports = router;
