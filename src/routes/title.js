const express = require('express');
const router = express.Router();
const TitleController = require('../controllers/titleController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// Public routes
router.get('/titles', TitleController.getAllTitles);
router.get('/badges', TitleController.getAllBadges);
router.get('/unlockable/:level', TitleController.getUnlockableAtLevel);

// User routes (cần authentication)
router.get('/my-titles', authenticateToken, TitleController.getUserTitles);
router.get('/my-badges', authenticateToken, TitleController.getUserBadges);
router.get('/my-active-title', authenticateToken, TitleController.getActiveTitle);
router.post('/set-active-title', authenticateToken, TitleController.setActiveTitle);

// Admin routes (cần authentication và role admin)
router.post('/admin/unlock-title', authenticateToken, authorize(['admin']), TitleController.unlockTitleForUser);
router.post('/admin/unlock-badge', authenticateToken, authorize(['admin']), TitleController.unlockBadgeForUser);

module.exports = router;
