// backend/src/controllers/answerChoiceStatsController.js
// Controller for Answer Choice Statistics API endpoints

const AnswerChoiceStatsService = require('../services/answerChoiceStatsService');

class AnswerChoiceStatsController {
    constructor(io) {
        this.answerChoiceStatsService = new AnswerChoiceStatsService(io);
    }

    /**
     * Get current choice statistics for a question
     * GET /api/quiz/:quizId/question/:questionId/choice-stats
     */
    async getQuestionChoiceStats(req, res) {
        try {
            const { quizId, questionId } = req.params;
            
            const stats = await this.answerChoiceStatsService.getChoiceStats(
                parseInt(quizId), 
                parseInt(questionId)
            );

            res.json({
                success: true,
                message: 'Lấy thống kê lựa chọn câu trả lời thành công',
                data: {
                    quiz_id: parseInt(quizId),
                    question_id: parseInt(questionId),
                    choice_stats: stats,
                    timestamp: Date.now()
                }
            });
        } catch (error) {
            console.error('Error getting question choice stats:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thống kê lựa chọn câu trả lời',
                error: error.message
            });
        }
    }

    /**
     * Get quiz-wide choice statistics summary
     * GET /api/quiz/:quizId/choice-stats-summary
     */
    async getQuizChoiceStatsSummary(req, res) {
        try {
            const { quizId } = req.params;
            
            const summary = await this.answerChoiceStatsService.getQuizChoiceStatsSummary(
                parseInt(quizId)
            );

            res.json({
                success: true,
                message: 'Lấy tổng hợp thống kê quiz thành công',
                data: summary
            });
        } catch (error) {
            console.error('Error getting quiz choice stats summary:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy tổng hợp thống kê quiz',
                error: error.message
            });
        }
    }

    /**
     * Clear choice statistics for a question (admin only)
     * DELETE /api/quiz/:quizId/question/:questionId/choice-stats
     */
    async clearQuestionChoiceStats(req, res) {
        try {
            const { quizId, questionId } = req.params;
            
            // Check if user is admin or teacher
            if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
                return res.status(403).json({
                    success: false,
                    message: 'Không có quyền thực hiện thao tác này'
                });
            }

            const result = await this.answerChoiceStatsService.clearChoiceStats(
                parseInt(quizId),
                parseInt(questionId)
            );

            if (result) {
                res.json({
                    success: true,
                    message: 'Xóa thống kê lựa chọn câu trả lời thành công',
                    data: {
                        quiz_id: parseInt(quizId),
                        question_id: parseInt(questionId),
                        cleared: true,
                        timestamp: Date.now()
                    }
                });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Không thể xóa thống kê lựa chọn câu trả lời'
                });
            }
        } catch (error) {
            console.error('Error clearing question choice stats:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi xóa thống kê lựa chọn câu trả lời',
                error: error.message
            });
        }
    }

    /**
     * Get real-time choice stats for teachers monitoring
     * GET /api/quiz/:quizId/live-choice-stats  
     */
    async getLiveChoiceStats(req, res) {
        try {
            const { quizId } = req.params;
            
            // Check if user is teacher or admin
            if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
                return res.status(403).json({
                    success: false,
                    message: 'Không có quyền truy cập thống kê trực tiếp'
                });
            }

            const { Quiz, Question, Answer } = require('../models');
            
            // Get quiz with all questions and answers
            const quiz = await Quiz.findByPk(quizId, {
                include: [{
                    model: Question,
                    as: 'Questions',
                    through: { attributes: [] },
                    include: [{
                        model: Answer,
                        attributes: ['answer_id', 'answer_text', 'iscorrect']
                    }]
                }]
            });

            if (!quiz) {
                return res.status(404).json({
                    success: false,
                    message: 'Quiz không tồn tại'
                });
            }

            const liveStats = [];

            for (const question of quiz.Questions) {
                const choiceStats = await this.answerChoiceStatsService.getChoiceStats(
                    quizId, 
                    question.question_id
                );

                // Combine with answer details
                const questionStats = {
                    question_id: question.question_id,
                    question_text: question.question_text,
                    total_responses: Object.values(choiceStats).reduce((sum, stat) => sum + stat.count, 0),
                    answers: question.Answers.map(answer => ({
                        answer_id: answer.answer_id,
                        answer_text: answer.answer_text,
                        is_correct: answer.iscorrect,
                        stats: choiceStats[answer.answer_id] || {
                            count: 0,
                            correct_count: 0,
                            incorrect_count: 0,
                            percentage: 0
                        }
                    }))
                };

                liveStats.push(questionStats);
            }

            res.json({
                success: true,
                message: 'Lấy thống kê trực tiếp thành công',
                data: {
                    quiz_id: quizId,
                    quiz_name: quiz.name,
                    total_questions: quiz.Questions.length,
                    question_stats: liveStats,
                    timestamp: Date.now()
                }
            });

        } catch (error) {
            console.error('Error getting live choice stats:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thống kê trực tiếp',
                error: error.message
            });
        }
    }
}

module.exports = AnswerChoiceStatsController;
