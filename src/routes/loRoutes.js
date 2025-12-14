const express = require('express');
const router = express.Router();
const loController = require('../controllers/loController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// Public routes - có thể xem nhưng không chỉnh sửa
router.get('/subject/:subjectId', loController.getLOsBySubject);
// NEW: Direct subject relationship endpoint
router.get('/by-subject/:subject_id', loController.getLOsBySubjectDirect);
router.get('/', loController.getAllLOs);
router.get('/:id', loController.getLOById);

// Admin + Teacher routes - CRUD operations
router.post('/', authenticateToken, authorize(['admin', 'teacher']), loController.createLO);
router.put('/:id', authenticateToken, authorize(['admin', 'teacher']), loController.updateLO);
router.delete('/:id', authenticateToken, authorize(['admin', 'teacher']), loController.deleteLO);

// Statistics routes - Admin and Teacher
router.get('/statistics/overview', authenticateToken, authorize(['admin', 'teacher']), loController.getLOStatistics);
router.get('/statistics/performance', authenticateToken, authorize(['admin', 'teacher']), loController.getLOPerformanceAnalysis);
router.get('/:id/questions/statistics', authenticateToken, authorize(['admin', 'teacher']), loController.getLOQuestionStatistics);

// Performance comparison route
router.get('/compare-performance/:subject_id', loController.compareLOQueryMethods);

// Bulk operations - Admin only
router.post('/bulk/create', authenticateToken, authorize(['admin']), loController.bulkCreateLOs);
router.put('/bulk/update', authenticateToken, authorize(['admin']), loController.bulkUpdateLOs);
router.delete('/bulk/delete', authenticateToken, authorize(['admin']), loController.bulkDeleteLOs);

// LO-PLO Relationship Management - Admin + Teacher
router.post('/:id/plos', authenticateToken, authorize(['admin', 'teacher']), loController.addPLOsToLO);
router.delete('/:id/plos', authenticateToken, authorize(['admin', 'teacher']), loController.removePLOsFromLO);
router.get('/:id/plos', loController.getPLOsOfLO);

module.exports = router;
