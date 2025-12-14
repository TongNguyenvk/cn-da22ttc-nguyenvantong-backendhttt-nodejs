const express = require('express');
const router = express.Router();
const semesterController = require('../controllers/semesterController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// Public routes (có thể cần cho student xem thông tin học kỳ)
router.get('/active', authenticateToken, semesterController.getActiveSemester);
router.get('/current', authenticateToken, semesterController.getCurrentSemester);

// Admin and Teacher routes
router.get('/', authenticateToken, authorize(['admin', 'teacher']), semesterController.getAllSemesters);
router.get('/:id', authenticateToken, authorize(['admin', 'teacher']), semesterController.getSemesterById);
router.get('/:id/statistics', authenticateToken, authorize(['admin', 'teacher']), semesterController.getSemesterStatistics);

// NEW: Get subjects by semester - accessible by admin, teacher, and students
router.get('/:id/subjects', authenticateToken, semesterController.getSubjectsBySemester);

// Admin only routes
router.post('/', authenticateToken, authorize(['admin']), semesterController.createSemester);
router.put('/:id', authenticateToken, authorize(['admin']), semesterController.updateSemester);
router.delete('/:id', authenticateToken, authorize(['admin']), semesterController.deleteSemester);
router.post('/:id/activate', authenticateToken, authorize(['admin']), semesterController.setActiveSemester);

module.exports = router;
