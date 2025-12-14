const express = require('express');
const router = express.Router();
const teacherAssignmentController = require('../controllers/teacherAssignmentController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// Teacher routes - xem phân công của mình
router.get('/my-assignments', authenticateToken, authorize(['teacher']), teacherAssignmentController.getMyAssignments);

// Admin and Teacher routes - xem chi tiết phân công
router.get('/:id', authenticateToken, authorize(['admin', 'teacher']), teacherAssignmentController.getAssignmentById);

// Admin routes - quản lý phân công
router.post('/', authenticateToken, authorize(['admin']), teacherAssignmentController.assignTeacher);
router.post('/bulk-assign', authenticateToken, authorize(['admin']), teacherAssignmentController.bulkAssignTeachers);
router.get('/semester/:semester_id', authenticateToken, authorize(['admin']), teacherAssignmentController.getAssignmentsBySemester);
router.put('/:id', authenticateToken, authorize(['admin']), teacherAssignmentController.updateAssignment);
router.post('/:id/deactivate', authenticateToken, authorize(['admin']), teacherAssignmentController.deactivateAssignment);
router.delete('/:id', authenticateToken, authorize(['admin']), teacherAssignmentController.deleteAssignment);

// Admin helper routes
router.get('/available/teachers', authenticateToken, authorize(['admin']), teacherAssignmentController.getAvailableTeachers);
router.get('/available/subjects', authenticateToken, authorize(['admin']), teacherAssignmentController.getAvailableSubjects);
router.get('/statistics/semester/:semester_id', authenticateToken, authorize(['admin']), teacherAssignmentController.getAssignmentStatistics);

module.exports = router;
