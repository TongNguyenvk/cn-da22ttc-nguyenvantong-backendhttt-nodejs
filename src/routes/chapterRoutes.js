const express = require('express');
const router = express.Router();
const chapterController = require('../controllers/chapterController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// Public routes - viewing only
router.get('/', chapterController.getAllChapters);
router.get('/:id', chapterController.getChapterById);
router.get('/subject/:subject_id', chapterController.getChaptersBySubject);

// Admin only routes - CRUD operations
router.post('/', authenticateToken, authorize(['admin']), chapterController.createChapter);
router.put('/:id', authenticateToken, authorize(['admin']), chapterController.updateChapter);
router.delete('/:id', authenticateToken, authorize(['admin']), chapterController.deleteChapter);

// Statistics routes - Admin and Teacher
router.get('/statistics/overview', authenticateToken, authorize(['admin', 'teacher']), chapterController.getChapterStatistics);

// Bulk operations - Admin only
router.post('/bulk/create', authenticateToken, authorize(['admin']), chapterController.bulkCreateChapters);
router.delete('/bulk/delete', authenticateToken, authorize(['admin']), chapterController.bulkDeleteChapters);

// Chapter-LO Relationship Management - Admin + Teacher
router.post('/:id/los', authenticateToken, authorize(['admin', 'teacher']), chapterController.addLOsToChapter);
router.delete('/:id/los', authenticateToken, authorize(['admin', 'teacher']), chapterController.removeLOsFromChapter);
router.get('/:id/los', chapterController.getLOsOfChapter);

// Chapter Section Management - Admin + Teacher
router.post('/:id/sections', authenticateToken, authorize(['admin', 'teacher']), chapterController.addSectionsToChapter);
router.get('/:id/sections', chapterController.getSectionsOfChapter);
router.put('/:id/sections/:sectionId', authenticateToken, authorize(['admin', 'teacher']), chapterController.updateChapterSection);
router.delete('/:id/sections/:sectionId', authenticateToken, authorize(['admin', 'teacher']), chapterController.deleteChapterSection);

module.exports = router;
