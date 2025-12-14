const express = require('express');
const router = express.Router();
const subjectController = require('../controllers/subjectController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// Public routes - viewing only
router.get('/', subjectController.getAllSubjects);
router.get('/:id', subjectController.getSubjectById);

// Admin and Teacher routes - CRUD operations
router.post('/', authenticateToken, authorize(['admin', 'teacher']), subjectController.createSubject);
router.put('/:id', authenticateToken, authorize(['admin', 'teacher']), subjectController.updateSubject);
router.delete('/:id', authenticateToken, authorize(['admin', 'teacher']), subjectController.deleteSubject);

// Additional routes for subject management
router.get('/course/:course_id', subjectController.getSubjectsByCourse);
router.get('/:id/chapters', subjectController.getChaptersBySubject);

// Routes for managing PLO-Subject relationships (many-to-many)
router.get('/:subject_id/plos', subjectController.getSubjectPLOs);
router.post('/:subject_id/plos', authenticateToken, authorize(['admin', 'teacher']), subjectController.addPLOsToSubject);
router.delete('/:subject_id/plos', authenticateToken, authorize(['admin', 'teacher']), subjectController.removePLOsFromSubject);

module.exports = router;