const express = require('express');
const router = express.Router();
const courseGradeController = require('../controllers/courseGradeController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');
const courseOwnership = require('../middleware/courseOwnership');

// Tất cả routes đều yêu cầu authentication và chỉ teacher/admin mới có quyền

// Route tạo khóa học với cột điểm
router.post('/create-with-grade-columns',
    authenticateToken,
    authorize(['teacher', 'admin']),
    courseGradeController.createCourseWithGradeColumns
);

// Routes cho quản lý cột điểm quá trình
router.get('/:id/grade-columns', 
    authenticateToken, 
    authorize(['teacher', 'admin']),
    courseOwnership,
    courseGradeController.getGradeColumns
);

router.post('/:id/grade-columns', 
    authenticateToken, 
    authorize(['teacher', 'admin']),
    courseOwnership,
    courseGradeController.createGradeColumn
);

router.put('/:id/grade-columns/:columnId', 
    authenticateToken, 
    authorize(['teacher', 'admin']),
    courseOwnership,
    courseGradeController.updateGradeColumn
);

router.delete('/:id/grade-columns/:columnId', 
    authenticateToken, 
    authorize(['teacher', 'admin']),
    courseOwnership,
    courseGradeController.deleteGradeColumn
);

// Routes cho gán quiz vào cột điểm
router.post('/:id/grade-columns/:columnId/assign-quizzes',
    authenticateToken,
    authorize(['teacher', 'admin']),
    courseOwnership,
    courseGradeController.assignQuizzesToColumn
);

// Convenience endpoint: assign quizzes by subject (only quizzes from the subject belonging to this course)
router.post('/:id/assign-quizzes-by-subject',
    authenticateToken,
    authorize(['teacher', 'admin']),
    courseOwnership,
    courseGradeController.assignQuizzesBySubject
);

// Bỏ gán quiz khỏi cột điểm (một số quiz cụ thể)
router.delete('/:id/grade-columns/:columnId/unassign-quizzes',
    authenticateToken,
    authorize(['teacher', 'admin']),
    courseOwnership,
    courseGradeController.unassignQuizzesFromColumn
);

// Bỏ gán tất cả quiz khỏi cột điểm
router.delete('/:id/grade-columns/:columnId/unassign-all-quizzes',
    authenticateToken,
    authorize(['teacher', 'admin']),
    courseOwnership,
    courseGradeController.unassignAllQuizzesFromColumn
);

router.get('/:id/available-quizzes',
    authenticateToken,
    authorize(['teacher', 'admin']),
    courseOwnership,
    courseGradeController.getAvailableQuizzes
);

// Routes cho tính toán điểm
router.post('/:id/calculate-grade',
    authenticateToken,
    authorize(['teacher', 'admin']),
    courseOwnership,
    courseGradeController.calculateStudentGrade
);

// Route cho tính toán điểm tất cả sinh viên
router.post('/:id/calculate-all-grades',
    authenticateToken,
    authorize(['teacher', 'admin']),
    courseOwnership,
    courseGradeController.calculateAllStudentGrades
);

router.put('/:id/final-exam-score',
    authenticateToken,
    authorize(['teacher', 'admin']),
    courseOwnership,
    courseGradeController.updateFinalExamScore
);

router.post('/:id/recalculate-all',
    authenticateToken,
    authorize(['teacher', 'admin']),
    courseOwnership,
    courseGradeController.recalculateAllGrades
);

// Route cho xuất kết quả học tập
router.get('/:id/export-results',
    authenticateToken,
    authorize(['teacher', 'admin']),
    courseOwnership,
    courseGradeController.exportCourseResults
);

// New: get grade results list (without export formatting)
router.get('/:id/grade-results',
    authenticateToken,
    authorize(['teacher','admin']),
    courseOwnership,
    courseGradeController.getCourseGradeResults
);

// Debug route cho kiểm tra mối quan hệ Quiz-Course
router.get('/:id/debug-quiz-relationship',
    authenticateToken,
    authorize(['admin']), // hạn chế chỉ admin
    courseOwnership,
    courseGradeController.debugQuizCourseRelationship
);

module.exports = router;
