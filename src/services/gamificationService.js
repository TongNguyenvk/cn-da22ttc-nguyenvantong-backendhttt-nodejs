const { User, QuizResult, UserQuestionHistory, LevelRequirement, Title, Badge, UserTitle, UserBadge } = require('../models');
const { Op } = require('sequelize');

class GamificationService {

    // Cấu hình điểm số - Updated theo kế hoạch gamification
    static POINTS_CONFIG = {
        CORRECT_ANSWER: 10,           // Điểm cơ bản cho câu trả lời đúng
        SPEED_BONUS_THRESHOLD: 5000,  // 5 giây cho speed bonus
        SPEED_BONUS_POINTS: 5,        // Điểm thưởng tốc độ
        PERFECT_QUIZ_BONUS: 20,       // Bonus cho điểm tuyệt đối (100%)
        STREAK_BONUS_PER_QUESTION: 2, // Bonus cho chuỗi thắng
        LEVEL_UP_BONUS: 50,           // Bonus khi lên level
        DAILY_LOGIN_BONUS: 5,         // Bonus đăng nhập hàng ngày
        QUIZ_COMPLETION_BONUS: 15     // Bonus hoàn thành quiz
    };

    // Tính điểm cho một câu trả lời
    static calculateQuestionPoints(isCorrect, responseTime, isStreak = false) {
        if (!isCorrect) return 0;

        let points = this.POINTS_CONFIG.CORRECT_ANSWER;

        // Bonus tốc độ (trả lời nhanh dưới 5 giây)
        if (responseTime < this.POINTS_CONFIG.SPEED_BONUS_THRESHOLD) {
            points += this.POINTS_CONFIG.SPEED_BONUS_POINTS;
        }

        // Bonus streak (trả lời đúng liên tiếp)
        if (isStreak) {
            points += this.POINTS_CONFIG.STREAK_BONUS_PER_QUESTION;
        }

        return points;
    }

    // Cập nhật điểm và stats sau khi trả lời câu hỏi
    static async updateUserPointsAfterAnswer(userId, questionId, isCorrect, responseTime, quizId) {
        try {
            const user = await User.findByPk(userId);
            if (!user) throw new Error('User not found');

            // Kiểm tra streak hiện tại
            const recentAnswers = await UserQuestionHistory.findAll({
                where: {
                    user_id: userId,
                    quiz_id: quizId
                },
                order: [['attempt_date', 'DESC']],
                limit: 10
            });

            // Tính streak hiện tại
            let currentStreak = 0;
            for (const answer of recentAnswers) {
                if (answer.is_correct) {
                    currentStreak++;
                } else {
                    break;
                }
            }

            const isStreak = currentStreak >= 2; // Streak từ câu thứ 3 trở đi

            // Tính điểm cho câu hỏi này
            const questionPoints = this.calculateQuestionPoints(isCorrect, responseTime, isStreak);

            // Cập nhật stats
            const currentStats = user.gamification_stats || {};
            const updatedStats = {
                ...currentStats,
                total_questions_answered: (currentStats.total_questions_answered || 0) + 1,
                total_correct_answers: (currentStats.total_correct_answers || 0) + (isCorrect ? 1 : 0),
                current_streak: isCorrect ? currentStreak + 1 : 0,
                best_streak: Math.max(currentStats.best_streak || 0, isCorrect ? currentStreak + 1 : 0),
                average_response_time: this.calculateAverageResponseTime(
                    currentStats.average_response_time || 0,
                    currentStats.total_questions_answered || 0,
                    responseTime
                )
            };

            if (responseTime < this.POINTS_CONFIG.SPEED_BONUS_THRESHOLD && isCorrect) {
                updatedStats.speed_bonus_earned = (updatedStats.speed_bonus_earned || 0) + 1;
            }

            await user.updateGamificationStats(updatedStats);

            // Thêm điểm
            const pointsResult = await user.addPoints(questionPoints, 'correct_answer');

            return {
                points_earned: questionPoints,
                total_points: pointsResult.total_points,
                level_info: {
                    current_level: pointsResult.new_level,
                    experience_points: pointsResult.experience_points,
                    level_up: pointsResult.level_up
                },
                streak_info: {
                    current_streak: updatedStats.current_streak,
                    is_streak_bonus: isStreak
                },
                speed_bonus: responseTime < this.POINTS_CONFIG.SPEED_BONUS_THRESHOLD && isCorrect,
                stats: updatedStats
            };

        } catch (error) {
            console.error('Error updating user points:', error);
            throw error;
        }
    }

    // Cập nhật điểm sau khi hoàn thành quiz
    static async updateUserPointsAfterQuiz(userId, quizId, finalScore, totalQuestions) {
        try {
            const user = await User.findByPk(userId);
            if (!user) throw new Error('User not found');

            let bonusPoints = 0;
            const currentStats = user.gamification_stats || {};

            // Perfect score bonus
            if (finalScore === totalQuestions) {
                bonusPoints += this.POINTS_CONFIG.PERFECT_QUIZ_BONUS;
                currentStats.perfect_scores = (currentStats.perfect_scores || 0) + 1;
            }

            // Cập nhật stats quiz completion
            currentStats.total_quizzes_completed = (currentStats.total_quizzes_completed || 0) + 1;

            await user.updateGamificationStats(currentStats);

            if (bonusPoints > 0) {
                const pointsResult = await user.addPoints(bonusPoints, 'quiz_completion_bonus');
                return {
                    bonus_points: bonusPoints,
                    total_points: pointsResult.total_points,
                    level_info: {
                        current_level: pointsResult.new_level,
                        level_up: pointsResult.level_up
                    },
                    perfect_score: finalScore === totalQuestions
                };
            }

            return null;
        } catch (error) {
            console.error('Error updating quiz completion points:', error);
            throw error;
        }
    }

    // Tính average response time
    static calculateAverageResponseTime(currentAverage, totalQuestions, newResponseTime) {
        if (totalQuestions === 0) return newResponseTime;
        return Math.round(((currentAverage * totalQuestions) + newResponseTime) / (totalQuestions + 1));
    }

    // Lấy leaderboard theo điểm
    static async getPointsLeaderboard(limit = 10, timeframe = 'all') {
        try {
            let whereClause = {};

            if (timeframe !== 'all') {
                // Có thể thêm filter theo thời gian sau
            }

            const users = await User.findAll({
                where: whereClause,
                attributes: ['user_id', 'name', 'total_points', 'current_level', 'gamification_stats'],
                include: [
                    {
                        model: require('../models').UserCustomization,
                        as: 'UserCustomization',
                        attributes: ['equipped_avatar_id'],
                        required: false,
                        include: [
                            {
                                model: require('../models').Avatar,
                                as: 'EquippedAvatar',
                                attributes: ['image_path'],
                                required: false
                            }
                        ]
                    }
                ],
                order: [['total_points', 'DESC']],
                limit: limit
            });

            return users.map((user, index) => ({
                position: index + 1,
                user_id: user.user_id,
                name: user.name,
                total_points: user.total_points,
                current_level: user.current_level,
                stats: user.gamification_stats,
                avatar_url: user.UserCustomization?.EquippedAvatar?.image_path || '/assets/avatars/default.png'
            }));

        } catch (error) {
            console.error('Error getting points leaderboard:', error);
            throw error;
        }
    }

    // Lấy thông tin gamification của user
    static async getUserGamificationInfo(userId) {
        try {
            const user = await User.findByPk(userId, {
                attributes: ['user_id', 'name', 'total_points', 'current_level', 'experience_points', 'gamification_stats']
            });

            if (!user) throw new Error('User not found');

            return {
                user_id: user.user_id,
                name: user.name,
                total_points: user.total_points,
                current_level: user.current_level,
                experience_points: user.experience_points,
                experience_to_next_level: 100 - user.experience_points,
                stats: user.gamification_stats
            };

        } catch (error) {
            console.error('Error getting user gamification info:', error);
            throw error;
        }
    }
}

module.exports = GamificationService;
