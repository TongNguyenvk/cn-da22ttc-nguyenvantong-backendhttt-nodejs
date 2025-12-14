const { LeaderboardEntry, UserPerformanceStats, User } = require('../models');
const { Op } = require('sequelize');

// Import Socket.IO for real-time updates
let io = null;

// Initialize Socket.IO instance
const initializeSocket = (socketInstance) => {
    io = socketInstance;
    console.log('LeaderboardService: Socket.IO initialized for real-time updates');
};

class LeaderboardService {
    // =====================================================
    // GLOBAL LEADERBOARDS
    // =====================================================

    static async getGlobalLeaderboard(criteria = 'TOTAL_XP', options = {}) {
        try {
            const { limit = 50, offset = 0, includeUserData = true } = options;

            return await LeaderboardEntry.getLeaderboard('GLOBAL', criteria, {
                limit,
                offset,
                includeUserData
            });
        } catch (error) {
            console.error('Error getting global leaderboard:', error);
            return [];
        }
    }

    static async getTierBasedLeaderboard(tier, criteria = 'TOTAL_XP', options = {}) {
        try {
            const { limit = 50, offset = 0 } = options;

            return await LeaderboardEntry.getLeaderboard('TIER_BASED', criteria, {
                tierFilter: tier,
                limit,
                offset,
                includeUserData: true
            });
        } catch (error) {
            console.error('Error getting tier-based leaderboard:', error);
            return [];
        }
    }

    static async getTimeBasedLeaderboard(timeType, criteria = 'TOTAL_XP', options = {}) {
        try {
            const { limit = 50, offset = 0, date = null } = options;

            let timePeriod = date;
            if (!timePeriod) {
                const currentDate = new Date();
                switch (timeType) {
                    case 'DAILY':
                        timePeriod = currentDate.toISOString().split('T')[0];
                        break;
                    case 'WEEKLY':
                        const monday = new Date(currentDate);
                        monday.setDate(currentDate.getDate() - currentDate.getDay() + 1);
                        timePeriod = monday.toISOString().split('T')[0];
                        break;
                    case 'MONTHLY':
                        timePeriod = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
                            .toISOString().split('T')[0];
                        break;
                }
            }

            return await LeaderboardEntry.getLeaderboard(timeType, criteria, {
                timePeriod,
                limit,
                offset,
                includeUserData: true
            });
        } catch (error) {
            console.error('Error getting time-based leaderboard:', error);
            return [];
        }
    }

    // =====================================================
    // USER RANKING & POSITION
    // =====================================================

    static async getUserRank(userId, leaderboardType = 'GLOBAL', criteria = 'TOTAL_XP', tierFilter = null) {
        try {
            return await LeaderboardEntry.getUserRank(userId, leaderboardType, criteria, tierFilter);
        } catch (error) {
            console.error('Error getting user rank:', error);
            return null;
        }
    }

    static async getUserRankings(userId) {
        try {
            const rankings = await Promise.all([
                // Global rankings
                LeaderboardEntry.getUserRank(userId, 'GLOBAL', 'TOTAL_XP'),
                LeaderboardEntry.getUserRank(userId, 'GLOBAL', 'LEVEL'),
                LeaderboardEntry.getUserRank(userId, 'GLOBAL', 'QUIZ_SCORE'),

                // Get user's tier for tier-based ranking
                User.findByPk(userId, { attributes: ['current_tier'] })
                    .then(user => user ?
                        LeaderboardEntry.getUserRank(userId, 'TIER_BASED', 'TOTAL_XP', user.current_tier) :
                        null
                    )
            ]);

            return {
                global_xp: rankings[0],
                global_level: rankings[1],
                global_quiz_score: rankings[2],
                tier_based: rankings[3]
            };
        } catch (error) {
            console.error('Error getting user rankings:', error);
            return null;
        }
    }

    // =====================================================
    // LEADERBOARD UPDATES
    // =====================================================

    static async updateUserScore(userId, criteria, newScore, leaderboardType = 'GLOBAL', tierFilter = null) {
        try {
            // Get old rank before update
            const oldRank = await LeaderboardEntry.getUserRank(userId, leaderboardType, criteria, tierFilter);

            // Update the score
            const result = await LeaderboardEntry.updateUserScore(userId, leaderboardType, criteria, newScore, tierFilter);

            // Get new rank after update
            const newRank = await LeaderboardEntry.getUserRank(userId, leaderboardType, criteria, tierFilter);

            // Emit socket event if rank changed
            if (oldRank && newRank && oldRank.rank !== newRank.rank) {
                this.emitRankChange(userId, {
                    leaderboard_type: leaderboardType,
                    criteria: criteria,
                    tier_filter: tierFilter,
                    old_rank: oldRank.rank,
                    new_rank: newRank.rank,
                    old_score: oldRank.score_value,
                    new_score: newScore,
                    score_change: newScore - (oldRank.score_value || 0)
                });
            }

            // Emit leaderboard update for real-time refresh
            this.emitLeaderboardUpdate('score_update', {
                user_id: userId,
                leaderboard_type: leaderboardType,
                criteria: criteria,
                tier_filter: tierFilter,
                new_score: newScore,
                new_rank: newRank ? newRank.rank : null
            });

            return result;
        } catch (error) {
            console.error('Error updating user score:', error);
            return {
                success: false,
                message: 'Failed to update user score',
                error: error.message
            };
        }
    }

    static async updateUserFromQuizResult(userId, quizResult) {
        try {
            const {
                totalScore = 0,
                correctAnswers = 0,
                totalQuestions = 15,
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
            } = quizResult;

            // Get user's current data
            const user = await User.findByPk(userId, {
                attributes: ['current_xp', 'current_level', 'current_tier']
            });

            if (!user) {
                return {
                    success: false,
                    message: 'User not found'
                };
            }

            // Update performance stats
            await UserPerformanceStats.updateQuizPerformance(userId, {
                questionsAnswered: totalQuestions,
                correctAnswers,
                totalScore,
                finalRank,
                longestStreak,
                averageAnswerTime,
                fastestAnswerTime,
                speedBonusEarned,
                syncoinEarned,
                kristalEarned,
                xpEarned,
                eggsReceived,
                emojisUsed,
                socialInteractionsSent,
                socialInteractionsReceived
            });

            // Update leaderboard entries
            const updatePromises = [
                // Global leaderboards
                this.updateUserScore(userId, 'TOTAL_XP', user.current_xp, 'GLOBAL'),
                this.updateUserScore(userId, 'LEVEL', user.current_level, 'GLOBAL'),
                this.updateUserScore(userId, 'QUIZ_SCORE', totalScore, 'GLOBAL'),

                // Tier-based leaderboards
                this.updateUserScore(userId, 'TOTAL_XP', user.current_xp, 'TIER_BASED', user.current_tier),
                this.updateUserScore(userId, 'LEVEL', user.current_level, 'TIER_BASED', user.current_tier),
                this.updateUserScore(userId, 'QUIZ_SCORE', totalScore, 'TIER_BASED', user.current_tier),

                // Time-based leaderboards (daily, weekly, monthly)
                this.updateTimeBasedLeaderboards(userId, totalScore, xpEarned)
            ];

            await Promise.all(updatePromises);

            // Emit global leaderboard update event
            this.emitLeaderboardUpdate('quiz_completion', {
                user_id: userId,
                quiz_result: quizResult,
                updated_rankings: ['GLOBAL', 'TIER_BASED', 'TIME_BASED']
            });

            return {
                success: true,
                message: 'Leaderboard updated successfully'
            };
        } catch (error) {
            console.error('Error updating user from quiz result:', error);
            return {
                success: false,
                message: 'Failed to update leaderboard from quiz result',
                error: error.message
            };
        }
    }

    static async updateTimeBasedLeaderboards(userId, quizScore, xpEarned) {
        try {
            const currentDate = new Date();

            // Daily leaderboard
            const dailyDate = currentDate.toISOString().split('T')[0];
            await this.updateUserScore(userId, 'QUIZ_SCORE', quizScore, 'DAILY', null);

            // Weekly leaderboard
            const monday = new Date(currentDate);
            monday.setDate(currentDate.getDate() - currentDate.getDay() + 1);
            const weeklyDate = monday.toISOString().split('T')[0];
            await this.updateUserScore(userId, 'QUIZ_SCORE', quizScore, 'WEEKLY', null);

            // Monthly leaderboard
            const monthlyDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
                .toISOString().split('T')[0];
            await this.updateUserScore(userId, 'QUIZ_SCORE', quizScore, 'MONTHLY', null);

            return {
                success: true,
                message: 'Time-based leaderboards updated successfully'
            };
        } catch (error) {
            console.error('Error updating time-based leaderboards:', error);
            return {
                success: false,
                message: 'Failed to update time-based leaderboards',
                error: error.message
            };
        }
    }

    // =====================================================
    // PERFORMANCE ANALYTICS
    // =====================================================

    static async getTopPerformers(criteria = 'accuracy_rate', timePeriod = 'ALL_TIME', options = {}) {
        try {
            return await UserPerformanceStats.getTopPerformers(criteria, timePeriod, options);
        } catch (error) {
            console.error('Error getting top performers:', error);
            return [];
        }
    }

    static async getUserPerformanceStats(userId, timePeriod = 'ALL_TIME', periodDate = null) {
        try {
            return await UserPerformanceStats.getUserStats(userId, timePeriod, periodDate);
        } catch (error) {
            console.error('Error getting user performance stats:', error);
            return null;
        }
    }

    static async compareUsers(userId, compareUserId, timePeriod = 'ALL_TIME') {
        try {
            return await UserPerformanceStats.getUserComparison(userId, compareUserId, timePeriod);
        } catch (error) {
            console.error('Error comparing users:', error);
            return null;
        }
    }

    // =====================================================
    // LEADERBOARD ANALYTICS
    // =====================================================

    static async getTopMovers(leaderboardType = 'GLOBAL', criteria = 'TOTAL_XP', options = {}) {
        try {
            const { direction = 'up', limit = 10, tierFilter = null } = options;

            return await LeaderboardEntry.getTopMovers(leaderboardType, criteria, {
                direction,
                limit,
                tierFilter
            });
        } catch (error) {
            console.error('Error getting top movers:', error);
            return [];
        }
    }

    static async getLeaderboardStats(leaderboardType = 'GLOBAL', criteria = 'TOTAL_XP', tierFilter = null) {
        try {
            const whereClause = {
                leaderboard_type: leaderboardType,
                ranking_criteria: criteria
            };

            if (tierFilter) {
                whereClause.tier_filter = tierFilter;
            }

            const stats = await LeaderboardEntry.findAll({
                where: whereClause,
                attributes: [
                    [LeaderboardEntry.sequelize.fn('COUNT', LeaderboardEntry.sequelize.col('entry_id')), 'total_participants'],
                    [LeaderboardEntry.sequelize.fn('AVG', LeaderboardEntry.sequelize.col('score_value')), 'average_score'],
                    [LeaderboardEntry.sequelize.fn('MAX', LeaderboardEntry.sequelize.col('score_value')), 'highest_score'],
                    [LeaderboardEntry.sequelize.fn('MIN', LeaderboardEntry.sequelize.col('score_value')), 'lowest_score'],
                    [LeaderboardEntry.sequelize.fn('COUNT', LeaderboardEntry.sequelize.literal('CASE WHEN rank_change > 0 THEN 1 END')), 'movers_up'],
                    [LeaderboardEntry.sequelize.fn('COUNT', LeaderboardEntry.sequelize.literal('CASE WHEN rank_change < 0 THEN 1 END')), 'movers_down'],
                    [LeaderboardEntry.sequelize.fn('COUNT', LeaderboardEntry.sequelize.literal('CASE WHEN rank_change = 0 THEN 1 END')), 'no_change']
                ],
                raw: true
            });

            return stats[0] || {};
        } catch (error) {
            console.error('Error getting leaderboard stats:', error);
            return {};
        }
    }

    // =====================================================
    // UTILITY METHODS
    // =====================================================

    static async initializeUserLeaderboards(userId) {
        try {
            const user = await User.findByPk(userId, {
                attributes: ['current_xp', 'current_level', 'current_tier']
            });

            if (!user) {
                return {
                    success: false,
                    message: 'User not found'
                };
            }

            // Initialize global leaderboards
            const initPromises = [
                this.updateUserScore(userId, 'TOTAL_XP', user.current_xp || 0, 'GLOBAL'),
                this.updateUserScore(userId, 'LEVEL', user.current_level || 1, 'GLOBAL'),
                this.updateUserScore(userId, 'QUIZ_SCORE', 0, 'GLOBAL')
            ];

            // Initialize tier-based leaderboards if user has a tier
            if (user.current_tier) {
                initPromises.push(
                    this.updateUserScore(userId, 'TOTAL_XP', user.current_xp || 0, 'TIER_BASED', user.current_tier),
                    this.updateUserScore(userId, 'LEVEL', user.current_level || 1, 'TIER_BASED', user.current_tier),
                    this.updateUserScore(userId, 'QUIZ_SCORE', 0, 'TIER_BASED', user.current_tier)
                );
            }

            await Promise.all(initPromises);

            return {
                success: true,
                message: 'User leaderboards initialized successfully'
            };
        } catch (error) {
            console.error('Error initializing user leaderboards:', error);
            return {
                success: false,
                message: 'Failed to initialize user leaderboards',
                error: error.message
            };
        }
    }

    static getValidCriteria() {
        return ['TOTAL_XP', 'LEVEL', 'QUIZ_SCORE', 'WIN_RATE', 'STREAK', 'SOCIAL_SCORE'];
    }

    static getValidLeaderboardTypes() {
        return ['GLOBAL', 'TIER_BASED', 'WEEKLY', 'MONTHLY', 'DAILY'];
    }

    static getValidTiers() {
        return ['WOOD', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'ONYX', 'SAPPHIRE', 'RUBY', 'AMETHYST', 'MASTER'];
    }

    static getValidTimePeriods() {
        return ['DAILY', 'WEEKLY', 'MONTHLY', 'ALL_TIME'];
    }

    // =====================================================
    // REAL-TIME SOCKET EVENTS
    // =====================================================

    static emitLeaderboardUpdate(eventType, data) {
        if (io) {
            io.emit('leaderboard_update', {
                type: eventType,
                timestamp: new Date().toISOString(),
                data
            });
        }
    }

    static emitRankChange(userId, rankData) {
        if (io) {
            // Emit to specific user
            io.to(`user_${userId}`).emit('rank_changed', {
                user_id: userId,
                ...rankData,
                timestamp: new Date().toISOString()
            });

            // Emit to all users for live leaderboard updates
            io.emit('user_rank_changed', {
                user_id: userId,
                new_rank: rankData.new_rank,
                old_rank: rankData.old_rank,
                criteria: rankData.criteria,
                score_change: rankData.score_change
            });
        }
    }

    static emitQuizRacingUpdate(quizSessionId, leaderboardData) {
        if (io) {
            // Emit to quiz session room
            io.to(`quiz_${quizSessionId}`).emit('quiz_leaderboard_update', {
                session_id: quizSessionId,
                leaderboard: leaderboardData,
                timestamp: new Date().toISOString()
            });
        }
    }

    static emitSocialRankingReaction(userId, reactionData) {
        if (io) {
            // Emit social reactions to ranking changes
            io.emit('social_ranking_reaction', {
                user_id: userId,
                reaction_type: reactionData.type,
                emoji: reactionData.emoji,
                target_rank: reactionData.target_rank,
                timestamp: new Date().toISOString()
            });
        }
    }
}

// Export both the class and the socket initializer
module.exports = LeaderboardService;
module.exports.initializeSocket = initializeSocket;
