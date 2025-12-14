const express = require('express');
const router = express.Router();
const levelController = require('../controllers/levelController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// Public routes - viewing only
router.get('/', levelController.getAllLevels);
router.get('/:id', levelController.getLevelById);

// Admin only routes - CRUD operations
router.post('/', authenticateToken, authorize(['admin']), levelController.createLevel);
router.put('/:id', authenticateToken, authorize(['admin']), levelController.updateLevel);
router.delete('/:id', authenticateToken, authorize(['admin']), levelController.deleteLevel);

// Statistics routes - Admin and Teacher
router.get('/statistics/overview', authenticateToken, authorize(['admin', 'teacher']), levelController.getLevelStatistics);
router.get('/statistics/difficulty-analysis', authenticateToken, authorize(['admin', 'teacher']), levelController.getDifficultyAnalysis);

module.exports = router;