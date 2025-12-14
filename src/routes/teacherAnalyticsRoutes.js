const express = require('express');
const router = express.Router();
const teacherAnalyticsController = require('../controllers/teacherAnalyticsController');
const {
    authenticateToken,
    authorize,
} = require('../middleware/authMiddleware');

/**
 * TEACHER ANALYTICS ROUTES
 * Các API chuyên dành cho giảng viên phân tích quiz và học sinh
 */

/**
 * GET /api/teacher-analytics/quiz/:quizId/comprehensive-report
 * Lấy báo cáo tổng quan chi tiết về quiz
 * - Phân tích điểm mạnh/yếu theo LO và Level
 * - Phân nhóm học sinh theo performance
 * - Insights và recommendations cho giảng viên
 * - Chỉ teacher và admin mới có quyền truy cập
 */
router.get(
    '/quiz/:quizId/comprehensive-report',
    authenticateToken,
    authorize(['admin', 'teacher']),
    teacherAnalyticsController.getComprehensiveQuizReport
);

/**
 * GET /api/teacher-analytics/quiz/:quizId/student-groups
 * Lấy dữ liệu tất cả nhóm học sinh để vẽ biểu đồ cột
 * - Dữ liệu chart_data với màu sắc, số lượng sinh viên
 * - Cấu hình chart_config cho frontend
 * - Hỗ trợ click để xem chi tiết nhóm
 */
router.get(
    '/quiz/:quizId/student-groups',
    authenticateToken,
    authorize(['admin', 'teacher']),
    teacherAnalyticsController.getStudentGroupsChart
);



/**
 * GET /api/teacher-analytics/quiz-comparison
 * So sánh performance giữa các quiz
 * Query params:
 * - quiz_ids: danh sách quiz_id cách nhau bởi dấu phẩy (ví dụ: 1,2,3)
 * - course_id: so sánh tất cả quiz trong course
 * - Benchmark và insights so sánh
 */
router.get(
    '/quiz-comparison',
    authenticateToken,
    authorize(['admin', 'teacher']),
    teacherAnalyticsController.getQuizComparison
);

/**
 * GET /api/teacher-analytics/quiz/:quizId/student/:userId/detailed-analysis
 * Lấy phân tích chi tiết cá nhân học sinh
 * - Phân tích từng câu hỏi với insights
 * - Phân tích theo LO với recommendations
 * - Tổng kết performance và đề xuất cải thiện
 */
router.get(
    '/quiz/:quizId/student/:userId/detailed-analysis',
    authenticateToken,
    authorize(['admin', 'teacher']),
    teacherAnalyticsController.getStudentDetailedAnalysis
);

/**
 * GET /api/teacher-analytics/quiz/:quizId/student-groups/:groupName
 * Chi tiết nhóm học sinh khi click vào cột biểu đồ
 * - Danh sách học sinh trong nhóm (excellent, good, average, weak)
 * - Thông tin chi tiết điểm số và performance của từng học sinh
 * - Insights và recommendations cho nhóm cụ thể
 */
router.get(
    '/quiz/:quizId/student-groups/:groupName',
    authenticateToken,
    authorize(['admin', 'teacher']),
    teacherAnalyticsController.getStudentGroupDetail
);

/**
 * GET /api/teacher-analytics/quiz/:quizId/student/:userId/lo-analysis
 * Chi tiết phân tích Learning Outcomes của từng học sinh
 * - Điểm mạnh/yếu theo từng LO
 * - Phần trăm đạt được cho mỗi LO
 * - Thời gian trung bình và insights cá nhân
 */
router.get(
    '/quiz/:quizId/student/:userId/lo-analysis',
    authenticateToken,
    authorize(['admin', 'teacher']),
    teacherAnalyticsController.getStudentLOAnalysis
);

/**
 * GET /api/teacher-analytics/quiz/:quizId/difficulty-lo-distribution
 * Phân bố câu hỏi theo độ khó và Learning Outcomes
 * - Biểu đồ matrix/heatmap 2D (Difficulty × LO)
 * - Phân tích độ khó của quiz
 * - Performance học sinh theo từng ô matrix
 */
router.get(
    '/quiz/:quizId/difficulty-lo-distribution',
    authenticateToken,
    authorize(['admin', 'teacher']),
    teacherAnalyticsController.getDifficultyLODistribution
);

/**
 * GET /api/teacher-analytics/quiz/:quizId/learning-outcomes
 * Lấy dữ liệu phân tích Learning Outcomes để vẽ biểu đồ cột nhóm
 * - Trục tung: Số lượng sinh viên
 * - Trục hoành: Các LO (Learning Outcomes)
 * - Mỗi nhóm cột bao gồm: Tỷ lệ hoàn thành và số lượng sinh viên theo LO
 * - Phân loại sinh viên: hoàn thành, một phần, chưa hoàn thành
 * - Hỗ trợ click để xem chi tiết LO
 */
router.get(
    '/quiz/:quizId/learning-outcomes',
    authenticateToken,
    authorize(['admin', 'teacher']),
    teacherAnalyticsController.getLearningOutcomesChart
);

/**
 * GET /api/teacher-analytics/quiz/:quizId/learning-outcomes/:loId
 * Chi tiết phân tích Learning Outcome khi click vào cột biểu đồ
 * - Phân tích chi tiết từng câu hỏi trong LO
 * - Phân tích performance học sinh theo LO
 * - Thông tin chapter và section liên quan đến LO
 * - Insights và recommendations cho LO cụ thể
 */
router.get(
    '/quiz/:quizId/learning-outcomes/:loId',
    authenticateToken,
    authorize(['admin', 'teacher']),
    teacherAnalyticsController.getLearningOutcomeDetail
);

/**
 * GET /api/teacher-analytics/quiz/:quizId/teaching-insights
 * Lấy insights và recommendations tổng hợp cho giảng viên
 * - Phân tích curriculum và phương pháp giảng dạy
 * - Insights về học sinh và recommendations hành động
 * - Priority actions và timeline thực hiện
 */
router.get(
    '/quiz/:quizId/teaching-insights',
    authenticateToken,
    authorize(['admin', 'teacher']),
    teacherAnalyticsController.getTeachingInsights
);

/**
 * GET /api/teacher-analytics/quiz/:quizId/benchmark
 * Lấy benchmark và so sánh với historical data
 * Query params:
 * - compare_with_subject: so sánh với các quiz khác trong subject (default: true)
 * - compare_with_teacher: so sánh với quiz của cùng giảng viên (default: true)
 * - Performance ranking và insights so sánh
 */
router.get(
    '/quiz/:quizId/benchmark',
    authenticateToken,
    authorize(['admin', 'teacher']),
    teacherAnalyticsController.getQuizBenchmark
);

/**
 * GET /api/teacher-analytics/debug/:quizId
 * Debug API để kiểm tra dữ liệu quiz
 * - Kiểm tra quiz, quiz results, question history
 * - Test phân nhóm học sinh
 * - Chỉ dành cho debug, có thể xóa sau khi fix
 */
router.get(
    '/debug/:quizId',
    authenticateToken,
    authorize(['admin', 'teacher']),
    teacherAnalyticsController.debugQuizData
);

/**
 * GET /api/teacher-analytics/quiz/:quizId/difficulty-lo-questions
 * Lấy danh sách câu hỏi theo LO và độ khó (dùng cho click heatmap)
 * Query: lo_id, level_id
 */
router.get(
    '/quiz/:quizId/difficulty-lo-questions',
    authenticateToken,
    authorize(['admin', 'teacher']),
    teacherAnalyticsController.getQuestionsByDifficultyAndLO
);

/**
 * GET /api/teacher-analytics/quiz/:quizId/lo-questions
 * Lấy danh sách câu hỏi theo LO (dùng cho click Learning Outcomes chart)
 * Query: lo_id, userId (optional - để lấy câu trả lời của sinh viên)
 */
router.get(
    '/quiz/:quizId/lo-questions',
    authenticateToken,
    authorize(['admin', 'teacher']),
    teacherAnalyticsController.getQuestionsByLO
);

/**
 * GET /api/teacher-analytics/quiz/:quizId/retest-recommendation
 * Tạo blueprint đề xuất Test 2 cho một sinh viên
 * Query: user_id, target_questions (optional), course_id (optional)
 */
router.get(
    '/quiz/:quizId/retest-recommendation',
    authenticateToken,
    authorize(['admin', 'teacher']),
    teacherAnalyticsController.getRetestRecommendation
);

/**
 * GET /api/teacher-analytics/retest-improvement
 * So sánh cải thiện giữa Test 1 và Test 2 của một sinh viên
 * Query: baseline_quiz_id, retest_quiz_id, user_id
 */
router.get(
    '/retest-improvement',
    authenticateToken,
    authorize(['admin', 'teacher']),
    teacherAnalyticsController.getRetestImprovement
);

/**
 * GET /api/teacher-analytics/test-performance
 * Test endpoint để kiểm tra performance và timeout issues
 * Đơn giản để debug performance problems
 */
router.get(
    '/test-performance/:quizId',
    teacherAnalyticsController.testPerformance
);

/**
 * ===========================================================
 * QUIZ-SPECIFIC ANALYTICS ROUTES (EXISTING - Keep original format)
 * ===========================================================
 */

/**
 * GET /api/teacher-analytics/quiz/:quizId/benchmark
 * Lấy benchmark cho một quiz cụ thể
 */
router.get(
    '/quiz/:quizId/benchmark',
    authenticateToken,
    authorize(['admin', 'teacher']),
    teacherAnalyticsController.getQuizBenchmark
);

/**
 * GET /api/teacher-analytics/quiz-comparison  
 * So sánh quiz trong subject (existing functionality)
 * Query params: quiz_ids (required), course_id (optional)
 */
router.get(
    '/quiz-comparison',
    authenticateToken,
    authorize(['admin', 'teacher']),
    teacherAnalyticsController.getQuizComparison
);

/*
 * ===========================================================
 * COURSE-BASED ANALYTICS ROUTES (NEW - Migration from subject_id to course_id)
 * TODO: Implement course-based versions of analytics functions
 * ===========================================================
 */

/*
// TODO: Create getCourseBenchmark function for course-level benchmark
router.get(
    '/course-benchmark',
    authenticateToken,
    authorize(['admin', 'teacher']),
    teacherAnalyticsController.getCourseBenchmark
);

// TODO: Create getCourseComparison function for course-level comparison
router.get(
    '/course-comparison',
    authenticateToken,
    authorize(['admin', 'teacher']),
    teacherAnalyticsController.getCourseComparison
);
*/

module.exports = router;
