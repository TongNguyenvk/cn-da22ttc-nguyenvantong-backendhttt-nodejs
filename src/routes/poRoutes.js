const express = require('express');
const router = express.Router();
const poController = require('../controllers/poController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// Public routes - viewing only
router.get('/', poController.getAllPOs);
router.get('/:id', poController.getPOById);
router.get('/program/:program_id', poController.getPOsByProgram);

// Admin only routes - CRUD operations
router.post('/', authenticateToken, authorize(['admin']), poController.createPO);
router.put('/:id', authenticateToken, authorize(['admin']), poController.updatePO);
router.delete('/:id', authenticateToken, authorize(['admin']), poController.deletePO);

// Statistics routes - Admin and Teacher
router.get('/statistics/overview', authenticateToken, authorize(['admin', 'teacher']), poController.getPOStatistics);
router.get('/statistics/achievement/:program_id', authenticateToken, authorize(['admin', 'teacher']), poController.getPOAchievementAnalysis);

// Bulk operations - Admin only
router.post('/bulk/create', authenticateToken, authorize(['admin']), poController.bulkCreatePOs);
router.put('/bulk/update', authenticateToken, authorize(['admin']), poController.bulkUpdatePOs);
router.delete('/bulk/delete', authenticateToken, authorize(['admin']), poController.bulkDeletePOs);

module.exports = router;