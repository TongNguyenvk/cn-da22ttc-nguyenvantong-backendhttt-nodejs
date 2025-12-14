const express = require('express');
const router = express.Router();
const studentCourseController = require('../controllers/studentCourseController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// =====================================================
// LEGACY ROUTES (Backward Compatibility)
// =====================================================

// Lấy tất cả student-course relationships
router.get('/',
    authenticateToken,
    authorize(['admin', 'teacher']),
    studentCourseController.getAllStudentCourses
);

// Lấy thông tin đăng ký cụ thể
router.get('/:user_id/:course_id',
    authenticateToken,
    authorize(['admin', 'teacher', 'student']),
    studentCourseController.getStudentCourseById
);

// Tạo đăng ký mới (legacy)
router.post('/',
    authenticateToken,
    authorize(['admin', 'teacher']),
    studentCourseController.createStudentCourse
);

// Xóa đăng ký (legacy)
router.delete('/:user_id/:course_id',
    authenticateToken,
    authorize(['admin', 'teacher']),
    studentCourseController.deleteStudentCourse
);

// =====================================================
// NEW MODERN ROUTES
// =====================================================

// Đăng ký sinh viên vào khóa học
router.post('/courses/:courseId/enroll',
    authenticateToken,
    authorize(['admin', 'teacher']),
    studentCourseController.enrollStudent
);

// Đăng ký nhiều sinh viên vào khóa học
router.post('/courses/:courseId/enroll-multiple',
    authenticateToken,
    authorize(['admin', 'teacher']),
    studentCourseController.enrollMultipleStudents
);

// Hủy đăng ký sinh viên khỏi khóa học
router.delete('/courses/:courseId/students/:userId',
    authenticateToken,
    authorize(['admin', 'teacher']),
    studentCourseController.unenrollStudent
);

// Lấy danh sách sinh viên trong khóa học
router.get('/courses/:courseId/students',
    authenticateToken,
    authorize(['admin', 'teacher']),
    studentCourseController.getStudentsInCourse
);

// Lấy danh sách khóa học của sinh viên
router.get('/students/:userId/courses',
    authenticateToken,
    authorize(['admin', 'teacher', 'student']),
    studentCourseController.getCoursesOfStudent
);

module.exports = router;