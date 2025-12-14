const express = require('express');
const router = express.Router();
const ploController = require('../controllers/ploController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// Public routes - viewing only
router.get('/', ploController.getAllPLOs);
router.get('/:id', ploController.getPLOById);
router.get('/program/:program_id', ploController.getPLOsByProgram);

// Admin only routes - CRUD operations
router.post('/', authenticateToken, authorize(['admin']), ploController.createPLO);
router.put('/:id', authenticateToken, authorize(['admin']), ploController.updatePLO);
router.delete('/:id', authenticateToken, authorize(['admin']), ploController.deletePLO);

// Statistics routes - Admin and Teacher
router.get('/statistics/overview', authenticateToken, authorize(['admin', 'teacher']), ploController.getPLOStatistics);
router.get('/statistics/achievement/:program_id', authenticateToken, authorize(['admin', 'teacher']), ploController.getPLOAchievementAnalysis);

// Bulk operations - Admin only
router.post('/bulk/create', authenticateToken, authorize(['admin']), ploController.bulkCreatePLOs);
router.put('/bulk/update', authenticateToken, authorize(['admin']), ploController.bulkUpdatePLOs);
router.delete('/bulk/delete', authenticateToken, authorize(['admin']), ploController.bulkDeletePLOs);

// PLO-LO Relationship Management - Admin + Teacher
router.post('/:id/los', authenticateToken, authorize(['admin', 'teacher']), ploController.addLOsToPLO);
router.delete('/:id/los', authenticateToken, authorize(['admin', 'teacher']), ploController.removeLOsFromPLO);
router.get('/:id/los', ploController.getLOsOfPLO);

module.exports = router;