'use strict';

const TeacherCodeAnalyticsService = require('../services/teacherCodeAnalyticsService');

class TeacherCodeAnalyticsController {

    /**
     * Get course/subject overview
     * GET /api/teacher/code-analytics/course/:id/overview?type=quiz|course|subject
     * 
     * Supports:
     * - /course/243/overview?type=quiz (default) - Analytics for quiz 243
     * - /course/15/overview?type=course - Analytics for course 15 (all quizzes in course)
     * - /course/15/overview?type=assignment - Same as course (backward compatible)
     * - /course/2/overview?type=subject - Analytics for subject 2 (old behavior)
     */
    getCourseOverview = async (req, res) => {
        try {
            const { id } = req.params;
            const { type = 'quiz' } = req.query;

            // Check if user is teacher/admin
            if (!['admin', 'teacher'].includes(req.roleName)) {
                return res.status(403).json({
                    success: false,
                    message: 'Không có quyền truy cập'
                });
            }

            const analytics = await TeacherCodeAnalyticsService.getCourseOverview(
                parseInt(id),
                type
            );

            return res.json({
                success: true,
                data: analytics
            });
        } catch (error) {
            console.error('Error getting course overview:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thống kê khóa học',
                error: error.message
            });
        }
    };

    /**
     * Get detailed student analysis
     * GET /api/teacher/code-analytics/student/:userId?quiz_id=243
     * 
     * Query params:
     * - quiz_id: Filter by specific quiz (preferred by Frontend)
     * - subject_id: Filter by subject (legacy support)
     */
    getStudentAnalysis = async (req, res) => {
        try {
            const { userId } = req.params;
            const { quiz_id, subject_id } = req.query;

            // Check if user is teacher/admin
            if (!['admin', 'teacher'].includes(req.roleName)) {
                return res.status(403).json({
                    success: false,
                    message: 'Không có quyền truy cập'
                });
            }

            const analysis = await TeacherCodeAnalyticsService.getStudentDetailedAnalysis(
                parseInt(userId),
                quiz_id ? parseInt(quiz_id) : null,
                subject_id ? parseInt(subject_id) : null
            );

            return res.json({
                success: true,
                data: analysis
            });
        } catch (error) {
            console.error('Error getting student analysis:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi phân tích học viên',
                error: error.message
            });
        }
    };

    /**
     * Compare multiple students
     * POST /api/teacher/code-analytics/compare-students
     */
    compareStudents = async (req, res) => {
        try {
            const { user_ids, subject_id } = req.body;

            // Check if user is teacher/admin
            if (!['admin', 'teacher'].includes(req.roleName)) {
                return res.status(403).json({
                    success: false,
                    message: 'Không có quyền truy cập'
                });
            }

            if (!user_ids || !Array.isArray(user_ids) || user_ids.length < 2) {
                return res.status(400).json({
                    success: false,
                    message: 'Cần ít nhất 2 học viên để so sánh'
                });
            }

            const comparison = await TeacherCodeAnalyticsService.compareStudents(
                user_ids,
                subject_id ? parseInt(subject_id) : null
            );

            return res.json({
                success: true,
                data: comparison
            });
        } catch (error) {
            console.error('Error comparing students:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi so sánh học viên',
                error: error.message
            });
        }
    };

    /**
     * Get question difficulty analysis
     * GET /api/teacher/code-analytics/question/:questionId/difficulty
     */
    getQuestionDifficulty = async (req, res) => {
        try {
            const { questionId } = req.params;

            // Check if user is teacher/admin
            if (!['admin', 'teacher'].includes(req.roleName)) {
                return res.status(403).json({
                    success: false,
                    message: 'Không có quyền truy cập'
                });
            }

            const analysis = await TeacherCodeAnalyticsService.getQuestionDifficultyAnalysis(
                parseInt(questionId)
            );

            return res.json({
                success: true,
                data: analysis
            });
        } catch (error) {
            console.error('Error getting question difficulty:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi phân tích độ khó câu hỏi',
                error: error.message
            });
        }
    };

    /**
     * Get students needing help
     * GET /api/teacher/code-analytics/course/:subjectId/students-needing-help
     */
    getStudentsNeedingHelp = async (req, res) => {
        try {
            const { subjectId } = req.params;
            const { threshold = 0.5 } = req.query;

            // Check if user is teacher/admin
            if (!['admin', 'teacher'].includes(req.roleName)) {
                return res.status(403).json({
                    success: false,
                    message: 'Không có quyền truy cập'
                });
            }

            const overview = await TeacherCodeAnalyticsService.getCourseOverview(parseInt(subjectId));

            return res.json({
                success: true,
                data: {
                    students_needing_help: overview.students_needing_help,
                    total_count: overview.students_needing_help.length,
                    threshold: parseFloat(threshold)
                }
            });
        } catch (error) {
            console.error('Error getting students needing help:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách học viên cần hỗ trợ',
                error: error.message
            });
        }
    };
}

module.exports = new TeacherCodeAnalyticsController();
