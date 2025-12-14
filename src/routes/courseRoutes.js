const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// Basic CRUD routes
router.get('/', authenticateToken, courseController.getAllCourses);
router.get('/:id', authenticateToken, courseController.getCourseById);
router.post('/', authenticateToken, authorize(['teacher', 'admin']), courseController.createCourse);
router.put('/:id', authenticateToken, authorize(['teacher', 'admin']), courseController.updateCourse);
router.delete('/:id', authenticateToken, authorize(['teacher', 'admin']), courseController.deleteCourse);

// Additional routes for course management
router.get('/:id/subjects', authenticateToken, courseController.getSubjectsByCourse);
router.get('/program/:program_id', authenticateToken, courseController.getCoursesByProgram);

// Statistics route
router.get('/:id/statistics', authenticateToken, courseController.getCourseStatistics);

// ==================== NEW ROUTES FOR SEMESTER AND CLONE FEATURES ====================

// Semester-based routes
router.get('/semester/:semester_id', authenticateToken, courseController.getCoursesBySemester);
router.get('/semester/:semester_id/my-courses', authenticateToken, authorize(['teacher']), courseController.getMyCoursesInSemester);

// Assignment-based course creation
router.post('/from-assignment/:assignment_id', authenticateToken, authorize(['teacher']), courseController.createCourseFromAssignment);

// Assign existing course to assignment
router.post('/assign-to-assignment/:assignment_id', authenticateToken, authorize(['teacher', 'admin']), courseController.assignCourseToAssignment);

// Clone functionality
router.get('/clone/available', authenticateToken, authorize(['teacher', 'admin']), courseController.getClonableCourses);
router.post('/clone/:original_course_id', authenticateToken, authorize(['teacher', 'admin']), courseController.cloneCourse);

// Template management
router.post('/:id/set-template', authenticateToken, authorize(['teacher']), courseController.setAsTemplate);
router.get('/:id/clone-statistics', authenticateToken, authorize(['teacher', 'admin']), courseController.getCloneStatistics);

module.exports = router;