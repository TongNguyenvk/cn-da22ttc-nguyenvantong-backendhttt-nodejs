const DynamicScoringService = require('../services/dynamicScoringService');
const { User, Quiz, QuizResult, UserQuestionHistory, Question } = require('../models');
const { Op } = require('sequelize');

/**
 * Dynamic Scoring Controller
 * Handles API endpoints for dynamic quiz scoring system
 */
class DynamicScoringController {

    /**
     * Calculate score for a single question answer
     * POST /api/scoring/calculate-question
     */
    static async calculateQuestionScore(req, res) {
        try {
            const userId = req.user.user_id;
            const {
                questionId,
                quizId,
                isCorrect,
                responseTime,
                attemptNumber = 1,
                questionDifficulty,
                totalQuizTime,
                timeRemaining
            } = req.body;

            if (!questionId || !quizId || isCorrect === undefined || !responseTime) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu thông tin bắt buộc: questionId, quizId, isCorrect, responseTime'
                });
            }

            // Get question difficulty if not provided
            let difficulty = questionDifficulty;
            if (!difficulty) {
                const question = await Question.findByPk(questionId);
                difficulty = question?.difficulty || 'medium';
            }

            const scoreResult = await DynamicScoringService.calculateQuestionScore({
                userId,
                questionId,
                quizId,
                isCorrect,
                responseTime,
                attemptNumber,
                questionDifficulty: difficulty,
                totalQuizTime,
                timeRemaining
            });

            return res.status(200).json({
                success: true,
                message: 'Tính điểm câu hỏi thành công',
                data: scoreResult
            });

        } catch (error) {
            console.error('Error calculating question score:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi tính điểm câu hỏi',
                error: error.message
            });
        }
    }

    /**
     * Process complete quiz with dynamic scoring
     * POST /api/scoring/process-quiz
     */
    static async processQuizCompletion(req, res) {
        try {
            const userId = req.user.user_id;
            const {
                quizId,
                answers,
                totalQuestions,
                quizDuration,
                timeSpent
            } = req.body;

            if (!quizId || !answers || !Array.isArray(answers)) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu thông tin: quizId, answers (array)'
                });
            }

            const quizData = {
                answers,
                totalQuestions: totalQuestions || answers.length,
                quizDuration,
                timeSpent
            };

            const result = await DynamicScoringService.processQuizCompletion(
                userId,
                quizId,
                quizData
            );

            return res.status(200).json({
                success: true,
                message: 'Xử lý hoàn thành quiz thành công',
                data: result
            });

        } catch (error) {
            console.error('Error processing quiz completion:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi xử lý hoàn thành quiz',
                error: error.message
            });
        }
    }

    /**
     * Get scoring configuration
     * GET /api/scoring/config
     */
    static async getScoringConfig(req, res) {
        try {
            const config = DynamicScoringService.SCORING_CONFIG;

            return res.status(200).json({
                success: true,
                message: 'Lấy cấu hình scoring thành công',
                data: {
                    base_points: config.BASE_POINTS,
                    speed_tiers: config.SPEED_TIERS,
                    streak_system: config.STREAK_SYSTEM,
                    difficulty_multipliers: config.DIFFICULTY_MULTIPLIERS,
                    time_bonus: config.TIME_BONUS,
                    perfect_bonuses: config.PERFECT_BONUSES
                }
            });

        } catch (error) {
            console.error('Error getting scoring config:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy cấu hình scoring',
                error: error.message
            });
        }
    }

    /**
     * Get user's scoring statistics
     * GET /api/scoring/user-stats/:userId?
     */
    static async getUserScoringStats(req, res) {
        try {
            const requestedUserId = req.params.userId;
            const currentUserId = req.user.user_id;
            const userRole = req.user.role;

            // Check permissions
            let targetUserId = currentUserId;
            if (requestedUserId) {
                if (['admin', 'teacher'].includes(userRole)) {
                    targetUserId = parseInt(requestedUserId);
                } else if (parseInt(requestedUserId) !== currentUserId) {
                    return res.status(403).json({
                        success: false,
                        message: 'Không có quyền xem thống kê của user khác'
                    });
                }
            }

            // Get user's quiz history with scoring details
            const quizHistory = await UserQuestionHistory.findAll({
                where: { user_id: targetUserId },
                include: [
                    {
                        model: Question,
                        attributes: ['question_id', 'difficulty']
                    }
                ],
                order: [['attempt_date', 'DESC']],
                limit: 100
            });

            // Calculate statistics
            const stats = {
                total_questions_answered: quizHistory.length,
                total_points_earned: quizHistory.reduce((sum, h) => sum + (h.points_earned || 0), 0),
                average_points_per_question: 0,
                speed_bonuses_earned: 0,
                streak_bonuses_earned: 0,
                max_streak_achieved: 0,
                perfect_scores: 0,
                difficulty_breakdown: {
                    easy: { answered: 0, correct: 0, points: 0 },
                    medium: { answered: 0, correct: 0, points: 0 },
                    hard: { answered: 0, correct: 0, points: 0 },
                    expert: { answered: 0, correct: 0, points: 0 }
                },
                recent_performance: []
            };

            if (stats.total_questions_answered > 0) {
                stats.average_points_per_question = Math.round(
                    stats.total_points_earned / stats.total_questions_answered
                );
            }

            // Process each question history
            quizHistory.forEach(history => {
                const difficulty = history.Question?.difficulty || 'medium';
                const bonuses = history.bonuses_earned || [];

                // Update difficulty breakdown
                stats.difficulty_breakdown[difficulty].answered++;
                if (history.is_correct) {
                    stats.difficulty_breakdown[difficulty].correct++;
                }
                stats.difficulty_breakdown[difficulty].points += history.points_earned || 0;

                // Count bonuses
                if (bonuses.includes('Lightning Fast') || bonuses.includes('Very Fast') ||
                    bonuses.includes('Fast') || bonuses.includes('Quick')) {
                    stats.speed_bonuses_earned++;
                }

                if (history.streak_at_time > 0) {
                    stats.streak_bonuses_earned++;
                    stats.max_streak_achieved = Math.max(stats.max_streak_achieved, history.streak_at_time);
                }

                // Recent performance (last 10)
                if (stats.recent_performance.length < 10) {
                    stats.recent_performance.push({
                        question_id: history.question_id,
                        is_correct: history.is_correct,
                        points_earned: history.points_earned || 0,
                        response_time: history.response_time,
                        bonuses: bonuses,
                        streak: history.streak_at_time || 0,
                        attempt_date: history.attempt_date
                    });
                }
            });

            return res.status(200).json({
                success: true,
                message: 'Lấy thống kê scoring thành công',
                data: stats
            });

        } catch (error) {
            console.error('Error getting user scoring stats:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thống kê scoring',
                error: error.message
            });
        }
    }

    /**
     * Get quiz scoring leaderboard
     * GET /api/scoring/leaderboard/:quizId
     */
    static async getQuizScoringLeaderboard(req, res) {
        try {
            const { quizId } = req.params;
            const { limit = 10 } = req.query;

            if (!quizId) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu quizId'
                });
            }

            // Get quiz results with detailed scoring
            const results = await QuizResult.findAll({
                where: { quiz_id: quizId, status: 'completed' },
                include: [
                    {
                        model: User,
                        as: 'Student',
                        attributes: ['user_id', 'name', 'email']
                    }
                ],
                order: [['score', 'DESC']],
                limit: parseInt(limit)
            });

            const leaderboard = await Promise.all(results.map(async (result, index) => {
                // Get detailed scoring stats for this user
                const userHistory = await UserQuestionHistory.findAll({
                    where: {
                        user_id: result.user_id,
                        quiz_id: quizId
                    }
                });

                const totalBonusPoints = userHistory.reduce((sum, h) => {
                    const scoring = h.scoring_breakdown || {};
                    return sum + (scoring.speed_bonus || 0) + (scoring.streak_bonus || 0);
                }, 0);

                const maxStreak = Math.max(...userHistory.map(h => h.streak_at_time || 0), 0);

                return {
                    rank: index + 1,
                    user_id: result.Student.user_id,
                    name: result.Student.name,
                    total_score: result.score,
                    base_score: result.score - totalBonusPoints,
                    bonus_score: totalBonusPoints,
                    max_streak: maxStreak,
                    perfect_bonuses: result.perfect_bonuses || [],
                    completion_time: result.completion_time,
                    scoring_details: result.scoring_details || {}
                };
            }));

            return res.status(200).json({
                success: true,
                message: 'Lấy bảng xếp hạng scoring thành công',
                data: {
                    quiz_id: quizId,
                    leaderboard: leaderboard,
                    total_participants: results.length
                }
            });

        } catch (error) {
            console.error('Error getting quiz scoring leaderboard:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy bảng xếp hạng scoring',
                error: error.message
            });
        }
    }

    /**
     * Test dynamic scoring with real data
     * POST /api/scoring/test
     */
    static async testDynamicScoring(req, res) {
        try {
            const userId = req.user.user_id;
            const {
                quizId = 1,
                questionId = 1,
                responseTime = 3000,
                isCorrect = true,
                questionDifficulty = 'medium'
            } = req.body;

            // Test the dynamic scoring calculation
            const scoreResult = await DynamicScoringService.calculateQuestionScore({
                userId,
                questionId,
                quizId,
                isCorrect,
                responseTime,
                attemptNumber: 1,
                questionDifficulty,
                totalQuizTime: 600000, // 10 minutes
                timeRemaining: 300000   // 5 minutes remaining
            });

            return res.status(200).json({
                success: true,
                message: 'Test dynamic scoring thành công',
                data: {
                    input: {
                        userId,
                        quizId,
                        questionId,
                        responseTime,
                        isCorrect,
                        questionDifficulty
                    },
                    scoring_result: scoreResult,
                    explanation: {
                        base_points: `${scoreResult.base_points} điểm cơ bản cho câu trả lời ${isCorrect ? 'đúng' : 'sai'}`,
                        speed_bonus: scoreResult.speed_bonus > 0 ?
                            `+${scoreResult.speed_bonus} điểm bonus tốc độ (${responseTime}ms)` :
                            'Không có bonus tốc độ',
                        streak_bonus: scoreResult.streak_bonus > 0 ?
                            `+${scoreResult.streak_bonus} điểm streak bonus` :
                            'Không có streak bonus',
                        difficulty_multiplier: scoreResult.difficulty_multiplier > 1 ?
                            `x${scoreResult.difficulty_multiplier} multiplier cho độ khó ${questionDifficulty}` :
                            'Không có difficulty multiplier',
                        total: `Tổng cộng: ${scoreResult.total_points} điểm`
                    }
                }
            });

        } catch (error) {
            console.error('Error testing dynamic scoring:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi test dynamic scoring',
                error: error.message
            });
        }
    }

    /**
     * Simulate scoring for testing
     * POST /api/scoring/simulate
     */
    static async simulateScoring(req, res) {
        try {
            const {
                responseTime = 3000,
                isCorrect = true,
                currentStreak = 5,
                questionDifficulty = 'medium',
                totalQuizTime = 600000,
                timeRemaining = 300000
            } = req.body;

            // Simulate scoring calculation
            const speedBonus = DynamicScoringService.calculateSpeedBonus(responseTime);
            const timeBonus = DynamicScoringService.calculateTimeBonus(totalQuizTime, timeRemaining);

            const simulation = {
                input: {
                    responseTime,
                    isCorrect,
                    currentStreak,
                    questionDifficulty,
                    totalQuizTime,
                    timeRemaining
                },
                results: {
                    base_points: isCorrect ? 10 : 0,
                    speed_bonus: speedBonus,
                    time_bonus: timeBonus,
                    difficulty_multiplier: DynamicScoringService.SCORING_CONFIG.DIFFICULTY_MULTIPLIERS[questionDifficulty] || 1.0,
                    estimated_total: Math.round(
                        (10 + speedBonus.bonus + timeBonus.bonus) *
                        (DynamicScoringService.SCORING_CONFIG.DIFFICULTY_MULTIPLIERS[questionDifficulty] || 1.0)
                    )
                }
            };

            return res.status(200).json({
                success: true,
                message: 'Mô phỏng scoring thành công',
                data: simulation
            });

        } catch (error) {
            console.error('Error simulating scoring:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi mô phỏng scoring',
                error: error.message
            });
        }
    }
}

module.exports = DynamicScoringController;
