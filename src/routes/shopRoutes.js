const express = require('express');
const router = express.Router();
const ShopController = require('../controllers/shopController');
const { authenticateToken } = require('../middleware/authMiddleware');

// =====================================================
// SHOP ROUTES
// =====================================================

/**
 * @route   GET /api/shop/avatars
 * @desc    Get avatars available for purchase in shop
 * @access  Private (authenticated users)
 */
router.get('/avatars', authenticateToken, ShopController.getAvatars);

/**
 * @route   GET /api/shop/emojis
 * @desc    Get emojis available for purchase in shop
 * @access  Private (authenticated users)
 */
router.get('/emojis', authenticateToken, ShopController.getEmojis);

/**
 * @route   GET /api/shop/emojis-test
 * @desc    Test endpoint to check emoji formatting without auth
 * @access  Public (for testing only)
 */
router.get('/emojis-test', ShopController.getEmojisTest);

/**
 * @route   POST /api/shop/purchase
 * @desc    Purchase item from shop (generic endpoint)
 * @access  Private (authenticated users)
 */
router.post('/purchase', authenticateToken, ShopController.purchase);

module.exports = router;
