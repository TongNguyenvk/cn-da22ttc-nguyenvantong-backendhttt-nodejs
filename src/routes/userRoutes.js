const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const enrollStudentsController = require('../controllers/enrollStudentsController');
const smartEnrollController = require('../controllers/smartEnrollController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');
const multer = require('multer');

// Cấu hình multer cho upload file
const upload = multer({ dest: 'uploads/' });

// Đăng nhập (không cần phân quyền)
router.post('/login', userController.login);

// Routes
router.get('/', authenticateToken, authorize(['admin']), userController.getAllUsers);
// Convenient role-based lists
router.get('/teachers', authenticateToken, authorize(['admin']), userController.getTeachers);
router.get('/students', authenticateToken, authorize(['admin', 'teacher']), userController.getStudents);
router.get('/:id', authenticateToken, authorize(['admin', 'teacher', 'student']), userController.getUserById);

// Đổi mật khẩu cho chính mình
router.post('/change-password', authenticateToken, authorize(['admin', 'teacher', 'student']), userController.changeMyPassword);

// Admin/Teacher đổi mật khẩu cho người khác
router.put('/:id/password', authenticateToken, authorize(['admin', 'teacher']), userController.adminChangeUserPassword);

// Tạo user
router.post('/createAdmin', authenticateToken, authorize(['admin']), userController.createAdmin);
router.post('/createTeacher', authenticateToken, authorize(['admin']), userController.createTeacher);
//router.post('/importTeachers', authenticateToken, authorize(['admin']), upload.single('file'), userController.importTeachers);

// Tạo student
router.post('/createStudent', authenticateToken, authorize(['admin', 'teacher']), userController.createStudent);

// Import students
router.post('/importStudents', 
    authenticateToken, 
    authorize(['admin', 'teacher']), 
    upload.single('file'), 
    userController.importStudents
);

// Import và enroll students vào course
router.post('/importAndEnrollStudents', 
    authenticateToken, 
    authorize(['admin', 'teacher']), 
    upload.single('file'), 
    userController.importAndEnrollStudents
);

// Enroll nhiều students vào course
router.post('/enrollStudentsInCourse', 
    authenticateToken, 
    authorize(['admin', 'teacher']), 
    enrollStudentsController.enrollStudentsInCourse
);

// ===== SMART IMPORT & ENROLL V4.0 =====
// Nếu sinh viên đã tồn tại thì chỉ enroll, không tạo mới
router.post('/smartImportAndEnrollStudents', 
    upload.single('file'),
    authenticateToken, 
    authorize(['admin', 'teacher']), 
    smartEnrollController.smartImportAndEnrollStudents
);

// Cập nhật và xóa user
router.put('/:id', authenticateToken, authorize(['admin', 'teacher', 'student']), userController.updateUser);
router.delete('/:id', authenticateToken, authorize(['admin']), userController.deleteUser);

module.exports = router;