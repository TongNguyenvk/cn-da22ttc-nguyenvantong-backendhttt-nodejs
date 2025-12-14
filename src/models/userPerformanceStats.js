'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class UserPerformanceStats extends Model {
        static associate(models) {
            UserPerformanceStats.belongsTo(models.User, {
                foreignKey: 'user_id',
                as: 'User'
            });
        }

        // Static methods for performance tracking
        static async getUserStats(userId, timePeriod = 'ALL_TIME', periodDate = null) {
            try {
                const whereClause = {
                    user_id: userId,
                    time_period: timePeriod
                };

                if (periodDate) {
                    whereClause.period_date = periodDate;
                } else if (timePeriod !== 'ALL_TIME') {
                    // Get current period date based on time period
                    const currentDate = new Date();
                    switch (timePeriod) {
                        case 'DAILY':
                            whereClause.period_date = currentDate.toISOString().split('T')[0];
                            break;
                        case 'WEEKLY':
                            // Get Monday of current week
                            const monday = new Date(currentDate);
                            monday.setDate(currentDate.getDate() - currentDate.getDay() + 1);
                            whereClause.period_date = monday.toISOString().split('T')[0];
                            break;
                        case 'MONTHLY':
                            // Get first day of current month
                            whereClause.period_date = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
                                .toISOString().split('T')[0];
                            break;
                    }
                }

                const stats = await this.findOne({
                    where: whereClause,
                    include: [{
                        model: sequelize.models.User,
                        as: 'User',
                        attributes: ['username', 'full_name', 'avatar_url', 'current_level', 'current_tier']
                    }]
                });

                return stats;
            } catch (error) {
                console.error('Error getting user stats:', error);
                return null;
            }
        }

        static async updateQuizPerformance(userId, quizData) {
            try {
                const {
                    questionsAnswered = 0,
                    correctAnswers = 0,
                    totalScore = 0,
                    finalRank = 999,
                    longestStreak = 0,
                    averageAnswerTime = 0,
                    fastestAnswerTime = 0,
                    speedBonusEarned = 0,
                    syncoinEarned = 0,
                    kristalEarned = 0,
                    xpEarned = 0,
                    eggsReceived = 0,
                    emojisUsed = 0,
                    socialInteractionsSent = 0,
                    socialInteractionsReceived = 0
                } = quizData;

                const currentDate = new Date();
                const periods = [
                    { period: 'DAILY', date: currentDate.toISOString().split('T')[0] },
                    { 
                        period: 'WEEKLY', 
                        date: (() => {
                            const monday = new Date(currentDate);
                            monday.setDate(currentDate.getDate() - currentDate.getDay() + 1);
                            return monday.toISOString().split('T')[0];
                        })()
                    },
                    { 
                        period: 'MONTHLY', 
                        date: new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
                            .toISOString().split('T')[0]
                    },
                    { period: 'ALL_TIME', date: '1970-01-01' }
                ];

                const updatePromises = periods.map(async ({ period, date }) => {
                    const [stats, created] = await this.findOrCreate({
                        where: {
                            user_id: userId,
                            time_period: period,
                            period_date: date
                        },
                        defaults: {
                            user_id: userId,
                            time_period: period,
                            period_date: date,
                            total_quizzes_played: 0,
                            total_questions_answered: 0,
                            total_correct_answers: 0,
                            accuracy_rate: 0.00,
                            average_score: 0.00,
                            highest_score: 0,
                            total_score_earned: 0,
                            first_place_finishes: 0,
                            top_3_finishes: 0,
                            top_5_finishes: 0,
                            average_rank: 0.00,
                            best_rank: 999,
                            longest_streak: 0,
                            total_streaks_achieved: 0,
                            average_answer_time: 0.000,
                            fastest_answer_time: 0.000,
                            speed_bonus_earned: 0,
                            syncoin_earned: 0,
                            kristal_earned: 0,
                            xp_earned: 0,
                            eggs_received: 0,
                            emojis_used: 0,
                            social_interactions_sent: 0,
                            social_interactions_received: 0
                        }
                    });

                    // Calculate new values
                    const newTotalQuizzes = stats.total_quizzes_played + 1;
                    const newTotalQuestions = stats.total_questions_answered + questionsAnswered;
                    const newTotalCorrect = stats.total_correct_answers + correctAnswers;
                    const newAccuracyRate = newTotalQuestions > 0 ? 
                        (newTotalCorrect / newTotalQuestions * 100) : 0;
                    const newTotalScore = stats.total_score_earned + totalScore;
                    const newAverageScore = newTotalQuizzes > 0 ? 
                        (newTotalScore / newTotalQuizzes) : 0;
                    const newHighestScore = Math.max(stats.highest_score, totalScore);
                    
                    // Ranking stats
                    const newFirstPlace = stats.first_place_finishes + (finalRank === 1 ? 1 : 0);
                    const newTop3 = stats.top_3_finishes + (finalRank <= 3 ? 1 : 0);
                    const newTop5 = stats.top_5_finishes + (finalRank <= 5 ? 1 : 0);
                    const newBestRank = Math.min(stats.best_rank, finalRank);
                    
                    // Calculate new average rank
                    const totalRankSum = (stats.average_rank * (newTotalQuizzes - 1)) + finalRank;
                    const newAverageRank = totalRankSum / newTotalQuizzes;

                    // Streak and speed stats
                    const newLongestStreak = Math.max(stats.longest_streak, longestStreak);
                    const newTotalStreaks = stats.total_streaks_achieved + (longestStreak > 0 ? 1 : 0);
                    
                    // Calculate new average answer time
                    const totalAnswerTimeSum = (stats.average_answer_time * (newTotalQuizzes - 1)) + averageAnswerTime;
                    const newAverageAnswerTime = totalAnswerTimeSum / newTotalQuizzes;
                    const newFastestAnswerTime = stats.fastest_answer_time === 0 ? 
                        fastestAnswerTime : Math.min(stats.fastest_answer_time, fastestAnswerTime);

                    // Update the stats
                    await stats.update({
                        total_quizzes_played: newTotalQuizzes,
                        total_questions_answered: newTotalQuestions,
                        total_correct_answers: newTotalCorrect,
                        accuracy_rate: parseFloat(newAccuracyRate.toFixed(2)),
                        average_score: parseFloat(newAverageScore.toFixed(2)),
                        highest_score: newHighestScore,
                        total_score_earned: newTotalScore,
                        first_place_finishes: newFirstPlace,
                        top_3_finishes: newTop3,
                        top_5_finishes: newTop5,
                        average_rank: parseFloat(newAverageRank.toFixed(2)),
                        best_rank: newBestRank,
                        longest_streak: newLongestStreak,
                        total_streaks_achieved: newTotalStreaks,
                        average_answer_time: parseFloat(newAverageAnswerTime.toFixed(3)),
                        fastest_answer_time: parseFloat(newFastestAnswerTime.toFixed(3)),
                        speed_bonus_earned: stats.speed_bonus_earned + speedBonusEarned,
                        syncoin_earned: stats.syncoin_earned + syncoinEarned,
                        kristal_earned: stats.kristal_earned + kristalEarned,
                        xp_earned: stats.xp_earned + xpEarned,
                        eggs_received: stats.eggs_received + eggsReceived,
                        emojis_used: stats.emojis_used + emojisUsed,
                        social_interactions_sent: stats.social_interactions_sent + socialInteractionsSent,
                        social_interactions_received: stats.social_interactions_received + socialInteractionsReceived,
                        updated_at: new Date()
                    });

                    return stats;
                });

                await Promise.all(updatePromises);

                return {
                    success: true,
                    message: 'Performance stats updated successfully'
                };
            } catch (error) {
                return {
                    success: false,
                    message: 'Failed to update performance stats',
                    error: error.message
                };
            }
        }

        static async getTopPerformers(criteria = 'accuracy_rate', timePeriod = 'ALL_TIME', options = {}) {
            try {
                const { limit = 10, tierFilter = null } = options;
                
                const whereClause = {
                    time_period: timePeriod
                };

                // Add tier filter if specified
                if (tierFilter) {
                    whereClause['$User.current_tier$'] = tierFilter;
                }

                const validCriteria = [
                    'accuracy_rate', 'average_score', 'highest_score', 'total_score_earned',
                    'first_place_finishes', 'top_3_finishes', 'longest_streak', 'average_rank'
                ];

                if (!validCriteria.includes(criteria)) {
                    criteria = 'accuracy_rate';
                }

                const orderDirection = ['average_rank'].includes(criteria) ? 'ASC' : 'DESC';

                const performers = await this.findAll({
                    where: whereClause,
                    include: [{
                        model: sequelize.models.User,
                        as: 'User',
                        attributes: ['user_id', 'username', 'full_name', 'avatar_url', 'current_level', 'current_tier'],
                        where: tierFilter ? { current_tier: tierFilter } : {}
                    }],
                    order: [[criteria, orderDirection]],
                    limit: limit
                });

                return performers.map((performer, index) => ({
                    rank: index + 1,
                    user_id: performer.user_id,
                    username: performer.User?.username,
                    full_name: performer.User?.full_name,
                    avatar_url: performer.User?.avatar_url,
                    current_level: performer.User?.current_level,
                    current_tier: performer.User?.current_tier,
                    criteria_value: performer[criteria],
                    total_quizzes_played: performer.total_quizzes_played,
                    accuracy_rate: performer.accuracy_rate,
                    average_score: performer.average_score,
                    highest_score: performer.highest_score,
                    first_place_finishes: performer.first_place_finishes,
                    longest_streak: performer.longest_streak,
                    time_period: performer.time_period,
                    period_date: performer.period_date
                }));
            } catch (error) {
                console.error('Error getting top performers:', error);
                return [];
            }
        }

        static async getUserComparison(userId, compareUserId, timePeriod = 'ALL_TIME') {
            try {
                const [userStats, compareStats] = await Promise.all([
                    this.getUserStats(userId, timePeriod),
                    this.getUserStats(compareUserId, timePeriod)
                ]);

                if (!userStats || !compareStats) {
                    return null;
                }

                const comparison = {
                    user: {
                        user_id: userStats.user_id,
                        username: userStats.User?.username,
                        stats: userStats
                    },
                    compare_user: {
                        user_id: compareStats.user_id,
                        username: compareStats.User?.username,
                        stats: compareStats
                    },
                    differences: {
                        accuracy_rate: userStats.accuracy_rate - compareStats.accuracy_rate,
                        average_score: userStats.average_score - compareStats.average_score,
                        total_quizzes_played: userStats.total_quizzes_played - compareStats.total_quizzes_played,
                        first_place_finishes: userStats.first_place_finishes - compareStats.first_place_finishes,
                        longest_streak: userStats.longest_streak - compareStats.longest_streak,
                        average_rank: userStats.average_rank - compareStats.average_rank
                    }
                };

                return comparison;
            } catch (error) {
                console.error('Error getting user comparison:', error);
                return null;
            }
        }

        // Instance methods
        getPerformanceGrade() {
            if (this.accuracy_rate >= 90) return 'A+';
            if (this.accuracy_rate >= 85) return 'A';
            if (this.accuracy_rate >= 80) return 'B+';
            if (this.accuracy_rate >= 75) return 'B';
            if (this.accuracy_rate >= 70) return 'C+';
            if (this.accuracy_rate >= 65) return 'C';
            if (this.accuracy_rate >= 60) return 'D+';
            if (this.accuracy_rate >= 55) return 'D';
            return 'F';
        }

        getWinRate() {
            return this.total_quizzes_played > 0 ? 
                (this.first_place_finishes / this.total_quizzes_played * 100) : 0;
        }

        getTop3Rate() {
            return this.total_quizzes_played > 0 ? 
                (this.top_3_finishes / this.total_quizzes_played * 100) : 0;
        }

        getAverageXPPerQuiz() {
            return this.total_quizzes_played > 0 ? 
                (this.xp_earned / this.total_quizzes_played) : 0;
        }

        getSocialEngagementScore() {
            const totalSocialActions = this.emojis_used + 
                this.social_interactions_sent + 
                this.social_interactions_received;
            return this.total_quizzes_played > 0 ? 
                (totalSocialActions / this.total_quizzes_played) : 0;
        }
    }

    UserPerformanceStats.init({
        stats_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'Users',
                key: 'user_id'
            }
        },
        time_period: {
            type: DataTypes.ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'ALL_TIME'),
            allowNull: false
        },
        period_date: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        // Quiz Performance Stats
        total_quizzes_played: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        total_questions_answered: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        total_correct_answers: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        accuracy_rate: {
            type: DataTypes.DECIMAL(5, 2),
            defaultValue: 0.00
        },
        average_score: {
            type: DataTypes.DECIMAL(10, 2),
            defaultValue: 0.00
        },
        highest_score: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        total_score_earned: {
            type: DataTypes.BIGINT,
            defaultValue: 0
        },
        // Ranking Performance
        first_place_finishes: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        top_3_finishes: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        top_5_finishes: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        average_rank: {
            type: DataTypes.DECIMAL(5, 2),
            defaultValue: 0.00
        },
        best_rank: {
            type: DataTypes.INTEGER,
            defaultValue: 999
        },
        // Streak & Speed Stats
        longest_streak: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        total_streaks_achieved: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        average_answer_time: {
            type: DataTypes.DECIMAL(8, 3),
            defaultValue: 0.000
        },
        fastest_answer_time: {
            type: DataTypes.DECIMAL(8, 3),
            defaultValue: 0.000
        },
        speed_bonus_earned: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        // Currency & Rewards
        syncoin_earned: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        kristal_earned: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        xp_earned: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        eggs_received: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        // Social & Interaction
        emojis_used: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        social_interactions_sent: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        social_interactions_received: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        }
    }, {
        sequelize,
        modelName: 'UserPerformanceStats',
        tableName: 'UserPerformanceStats',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            {
                fields: ['user_id', 'time_period', 'period_date'],
                unique: true
            },
            {
                fields: ['time_period', 'period_date']
            },
            {
                fields: ['accuracy_rate']
            },
            {
                fields: ['average_score']
            },
            {
                fields: ['total_score_earned']
            }
        ]
    });

    return UserPerformanceStats;
};
