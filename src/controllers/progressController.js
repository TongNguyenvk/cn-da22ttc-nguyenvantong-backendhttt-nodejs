const ProgressService = require('../services/progressService');

class ProgressController {
    
    // Lấy tổng quan tiến độ của user hiện tại
    static async getUserProgressOverview(req, res) {
        try {
            const userId = req.user.user_id;
            const progressOverview = await ProgressService.getUserProgressOverview(userId);
            
            return res.status(200).json({
                success: true,
                message: 'Lấy tổng quan tiến độ thành công',
                data: progressOverview
            });
        } catch (error) {
            console.error('Error getting user progress overview:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy tổng quan tiến độ',
                error: error.message
            });
        }
    }

    // Lấy tiến độ của user theo subject cụ thể
    static async getSubjectProgress(req, res) {
        try {
            const userId = req.user.user_id;
            const { subjectId } = req.params;
            
            const progressData = await ProgressService.calculateSubjectProgress(userId, parseInt(subjectId));
            
            return res.status(200).json({
                success: true,
                message: 'Lấy tiến độ subject thành công',
                data: progressData
            });
        } catch (error) {
            console.error('Error getting subject progress:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy tiến độ subject',
                error: error.message
            });
        }
    }

    // Lấy LO được khuyến nghị tiếp theo
    static async getNextRecommendedLO(req, res) {
        try {
            const userId = req.user.user_id;
            const { subjectId } = req.params;
            
            const nextLO = await ProgressService.getNextRecommendedLO(userId, parseInt(subjectId));
            
            return res.status(200).json({
                success: true,
                message: 'Lấy LO khuyến nghị thành công',
                data: nextLO
            });
        } catch (error) {
            console.error('Error getting next recommended LO:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy LO khuyến nghị',
                error: error.message
            });
        }
    }

    // Cập nhật tiến độ sau khi hoàn thành quiz (internal use)
    static async updateProgressAfterQuiz(req, res) {
        try {
            const { userId, subjectId, quizResult } = req.body;
            
            // Tính toán lại progress
            const progressData = await ProgressService.calculateSubjectProgress(userId, subjectId);
            
            // Cập nhật UserLearningPath
            await ProgressService.updateUserLearningPath(userId, subjectId, {
                ...progressData,
                completed_quizzes: [...(progressData.completed_quizzes || []), quizResult.quiz_id],
                quiz_scores: [...(progressData.quiz_scores || []), {
                    quiz_id: quizResult.quiz_id,
                    score: quizResult.score,
                    date: new Date()
                }]
            });
            
            return res.status(200).json({
                success: true,
                message: 'Cập nhật tiến độ thành công',
                data: progressData
            });
        } catch (error) {
            console.error('Error updating progress after quiz:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi cập nhật tiến độ',
                error: error.message
            });
        }
    }

    // Lấy tiến độ của user cụ thể (cho admin/teacher)
    static async getUserProgressById(req, res) {
        try {
            const { userId } = req.params;
            const progressOverview = await ProgressService.getUserProgressOverview(parseInt(userId));
            
            return res.status(200).json({
                success: true,
                message: 'Lấy tiến độ user thành công',
                data: progressOverview
            });
        } catch (error) {
            console.error('Error getting user progress by id:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy tiến độ user',
                error: error.message
            });
        }
    }

    // Lấy thống kê tiến độ lớp học (cho teacher)
    static async getClassProgressStats(req, res) {
        try {
            const { courseId } = req.params;
            
            // Lấy danh sách students trong course
            const students = await User.findAll({
                include: [{
                    model: Course,
                    as: 'StudentCourses',
                    where: { course_id: courseId },
                    through: { attributes: [] }
                }],
                attributes: ['user_id', 'name']
            });

            const classStats = [];
            
            for (const student of students) {
                const progressOverview = await ProgressService.getUserProgressOverview(student.user_id);
                classStats.push({
                    user_id: student.user_id,
                    name: student.name,
                    overall_progress: progressOverview.progress_overview.overall_progress,
                    total_points: progressOverview.user_info.total_points,
                    current_level: progressOverview.user_info.current_level,
                    subjects_completed: progressOverview.progress_overview.subjects_completed,
                    last_activity: progressOverview.recent_activity.last_activity
                });
            }

            // Tính thống kê tổng
            const totalStudents = classStats.length;
            const averageProgress = totalStudents > 0 ? 
                Math.round(classStats.reduce((sum, s) => sum + s.overall_progress, 0) / totalStudents) : 0;
            const activeStudents = classStats.filter(s => s.last_activity && 
                new Date(s.last_activity) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length;

            return res.status(200).json({
                success: true,
                message: 'Lấy thống kê lớp học thành công',
                data: {
                    class_overview: {
                        total_students: totalStudents,
                        average_progress: averageProgress,
                        active_students: activeStudents,
                        engagement_rate: totalStudents > 0 ? Math.round((activeStudents / totalStudents) * 100) : 0
                    },
                    student_progress: classStats.sort((a, b) => b.overall_progress - a.overall_progress)
                }
            });
        } catch (error) {
            console.error('Error getting class progress stats:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thống kê lớp học',
                error: error.message
            });
        }
    }
}

module.exports = ProgressController;
