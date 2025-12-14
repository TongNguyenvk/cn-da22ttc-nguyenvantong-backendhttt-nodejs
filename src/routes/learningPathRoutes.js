const express = require('express');
const router = express.Router();
const { 
    getNextLearningRecommendations, 
    checkCoursePrerequisites,
    getUserProgressOverview,
    updateUserProgress
} = require('../controllers/learningPathController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

/**
 * LEARNING PATH ROUTES
 * API routes cho hệ thống gợi ý học tập và progression path
 */

/**
 * GET /api/learning-path/next-recommendations
 * Gợi ý phần học tiếp theo và môn học tiếp theo cho sinh viên
 * Query params: 
 * - user_id (required): ID của sinh viên
 * - current_course_id (optional): ID của môn học hiện tại
 * 
 * Response:
 * - immediate_actions: Hành động cần làm ngay
 * - next_courses: Danh sách môn học được gợi ý
 * - learning_path: Lộ trình học tập từng phase
 * - study_plan: Kế hoạch học tập chi tiết
 */
router.get('/next-recommendations',
    authenticateToken,
    authorize(['student', 'teacher', 'admin']),
    getNextLearningRecommendations
);

/**
 * GET /api/learning-path/course-prerequisites  
 * Kiểm tra điều kiện tiên quyết cho một môn học cụ thể
 * Query params:
 * - user_id (required): ID của sinh viên
 * - course_id (required): ID của môn học muốn kiểm tra
 * 
 * Response:
 * - prerequisites_met: Có đáp ứng điều kiện không
 * - missing_prerequisites: Danh sách điều kiện chưa đáp ứng
 * - recommendation: Gợi ý hành động
 */
router.get('/course-prerequisites',
    authenticateToken,
    authorize(['student', 'teacher', 'admin']),
    checkCoursePrerequisites
);

/**
 * GET /api/learning-path/user-progress
 * Lấy tổng quan tiến độ học tập của sinh viên
 * Query params: user_id (required)
 */
router.get('/user-progress',
    authenticateToken,
    authorize(['student', 'teacher', 'admin']),
    getUserProgressOverview
);

/**
 * POST /api/learning-path/update-progress
 * Cập nhật tiến độ học tập cho một subject
 * Body: { user_id, subject_id, progress_data }
 */
router.post('/update-progress',
    authenticateToken,
    authorize(['student', 'teacher', 'admin']),
    updateUserProgress
);

module.exports = router;
