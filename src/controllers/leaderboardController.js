const LeaderboardService = require('../services/leaderboardService');

class LeaderboardController {
    // =====================================================
    // GLOBAL LEADERBOARDS
    // =====================================================

    static async getGlobalLeaderboard(req, res) {
        try {
            const { 
                criteria = 'TOTAL_XP', 
                limit = 50, 
                offset = 0 
            } = req.query;

            // Validate criteria
            if (!LeaderboardService.getValidCriteria().includes(criteria)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid ranking criteria',
                    valid_criteria: LeaderboardService.getValidCriteria()
                });
            }

            const leaderboard = await LeaderboardService.getGlobalLeaderboard(criteria, {
                limit: parseInt(limit),
                offset: parseInt(offset)
            });

            res.status(200).json({
                success: true,
                message: 'Global leaderboard retrieved successfully',
                data: {
                    leaderboard_type: 'GLOBAL',
                    ranking_criteria: criteria,
                    entries: leaderboard,
                    pagination: {
                        limit: parseInt(limit),
                        offset: parseInt(offset),
                        total_entries: leaderboard.length
                    }
                }
            });
        } catch (error) {
            console.error('Error in getGlobalLeaderboard:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    static async getTierBasedLeaderboard(req, res) {
        try {
            const { 
                tier,
                criteria = 'TOTAL_XP', 
                limit = 50, 
                offset = 0 
            } = req.query;

            // Validate tier
            if (!tier || !LeaderboardService.getValidTiers().includes(tier)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid or missing tier',
                    valid_tiers: LeaderboardService.getValidTiers()
                });
            }

            // Validate criteria
            if (!LeaderboardService.getValidCriteria().includes(criteria)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid ranking criteria',
                    valid_criteria: LeaderboardService.getValidCriteria()
                });
            }

            const leaderboard = await LeaderboardService.getTierBasedLeaderboard(tier, criteria, {
                limit: parseInt(limit),
                offset: parseInt(offset)
            });

            res.status(200).json({
                success: true,
                message: 'Tier-based leaderboard retrieved successfully',
                data: {
                    leaderboard_type: 'TIER_BASED',
                    tier_filter: tier,
                    ranking_criteria: criteria,
                    entries: leaderboard,
                    pagination: {
                        limit: parseInt(limit),
                        offset: parseInt(offset),
                        total_entries: leaderboard.length
                    }
                }
            });
        } catch (error) {
            console.error('Error in getTierBasedLeaderboard:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    static async getTimeBasedLeaderboard(req, res) {
        try {
            const { 
                time_type,
                criteria = 'QUIZ_SCORE', 
                limit = 50, 
                offset = 0,
                date = null
            } = req.query;

            // Validate time type
            const validTimeTypes = ['DAILY', 'WEEKLY', 'MONTHLY'];
            if (!time_type || !validTimeTypes.includes(time_type)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid or missing time type',
                    valid_time_types: validTimeTypes
                });
            }

            // Validate criteria
            if (!LeaderboardService.getValidCriteria().includes(criteria)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid ranking criteria',
                    valid_criteria: LeaderboardService.getValidCriteria()
                });
            }

            const leaderboard = await LeaderboardService.getTimeBasedLeaderboard(time_type, criteria, {
                limit: parseInt(limit),
                offset: parseInt(offset),
                date
            });

            res.status(200).json({
                success: true,
                message: 'Time-based leaderboard retrieved successfully',
                data: {
                    leaderboard_type: time_type,
                    ranking_criteria: criteria,
                    time_period: date || 'current',
                    entries: leaderboard,
                    pagination: {
                        limit: parseInt(limit),
                        offset: parseInt(offset),
                        total_entries: leaderboard.length
                    }
                }
            });
        } catch (error) {
            console.error('Error in getTimeBasedLeaderboard:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // =====================================================
    // USER RANKING & POSITION
    // =====================================================

    static async getUserRank(req, res) {
        try {
            const userId = req.user.user_id;
            const { 
                leaderboard_type = 'GLOBAL',
                criteria = 'TOTAL_XP',
                tier = null
            } = req.query;

            // Validate leaderboard type
            if (!LeaderboardService.getValidLeaderboardTypes().includes(leaderboard_type)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid leaderboard type',
                    valid_types: LeaderboardService.getValidLeaderboardTypes()
                });
            }

            // Validate criteria
            if (!LeaderboardService.getValidCriteria().includes(criteria)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid ranking criteria',
                    valid_criteria: LeaderboardService.getValidCriteria()
                });
            }

            const userRank = await LeaderboardService.getUserRank(userId, leaderboard_type, criteria, tier);

            if (!userRank) {
                return res.status(404).json({
                    success: false,
                    message: 'User rank not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'User rank retrieved successfully',
                data: userRank
            });
        } catch (error) {
            console.error('Error in getUserRank:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    static async getUserRankings(req, res) {
        try {
            const userId = req.user.user_id;

            const rankings = await LeaderboardService.getUserRankings(userId);

            if (!rankings) {
                return res.status(404).json({
                    success: false,
                    message: 'User rankings not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'User rankings retrieved successfully',
                data: rankings
            });
        } catch (error) {
            console.error('Error in getUserRankings:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // =====================================================
    // PERFORMANCE ANALYTICS
    // =====================================================

    static async getTopPerformers(req, res) {
        try {
            const { 
                criteria = 'accuracy_rate',
                time_period = 'ALL_TIME',
                limit = 10,
                tier = null
            } = req.query;

            // Validate time period
            if (!LeaderboardService.getValidTimePeriods().includes(time_period)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid time period',
                    valid_periods: LeaderboardService.getValidTimePeriods()
                });
            }

            const performers = await LeaderboardService.getTopPerformers(criteria, time_period, {
                limit: parseInt(limit),
                tierFilter: tier
            });

            res.status(200).json({
                success: true,
                message: 'Top performers retrieved successfully',
                data: {
                    criteria,
                    time_period,
                    tier_filter: tier,
                    performers
                }
            });
        } catch (error) {
            console.error('Error in getTopPerformers:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    static async getUserPerformanceStats(req, res) {
        try {
            const userId = req.user.user_id;
            const { 
                time_period = 'ALL_TIME',
                period_date = null
            } = req.query;

            // Validate time period
            if (!LeaderboardService.getValidTimePeriods().includes(time_period)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid time period',
                    valid_periods: LeaderboardService.getValidTimePeriods()
                });
            }

            const stats = await LeaderboardService.getUserPerformanceStats(userId, time_period, period_date);

            if (!stats) {
                return res.status(404).json({
                    success: false,
                    message: 'User performance stats not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'User performance stats retrieved successfully',
                data: {
                    ...stats.toJSON(),
                    performance_grade: stats.getPerformanceGrade(),
                    win_rate: stats.getWinRate(),
                    top_3_rate: stats.getTop3Rate(),
                    average_xp_per_quiz: stats.getAverageXPPerQuiz(),
                    social_engagement_score: stats.getSocialEngagementScore()
                }
            });
        } catch (error) {
            console.error('Error in getUserPerformanceStats:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    static async compareUsers(req, res) {
        try {
            const userId = req.user.user_id;
            const { 
                compare_user_id,
                time_period = 'ALL_TIME'
            } = req.query;

            if (!compare_user_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Compare user ID is required'
                });
            }

            // Validate time period
            if (!LeaderboardService.getValidTimePeriods().includes(time_period)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid time period',
                    valid_periods: LeaderboardService.getValidTimePeriods()
                });
            }

            const comparison = await LeaderboardService.compareUsers(userId, parseInt(compare_user_id), time_period);

            if (!comparison) {
                return res.status(404).json({
                    success: false,
                    message: 'User comparison data not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'User comparison retrieved successfully',
                data: comparison
            });
        } catch (error) {
            console.error('Error in compareUsers:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // =====================================================
    // LEADERBOARD ANALYTICS
    // =====================================================

    static async getTopMovers(req, res) {
        try {
            const { 
                leaderboard_type = 'GLOBAL',
                criteria = 'TOTAL_XP',
                direction = 'up',
                limit = 10,
                tier = null
            } = req.query;

            // Validate parameters
            if (!LeaderboardService.getValidLeaderboardTypes().includes(leaderboard_type)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid leaderboard type',
                    valid_types: LeaderboardService.getValidLeaderboardTypes()
                });
            }

            if (!LeaderboardService.getValidCriteria().includes(criteria)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid ranking criteria',
                    valid_criteria: LeaderboardService.getValidCriteria()
                });
            }

            if (!['up', 'down'].includes(direction)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid direction. Must be "up" or "down"'
                });
            }

            const movers = await LeaderboardService.getTopMovers(leaderboard_type, criteria, {
                direction,
                limit: parseInt(limit),
                tierFilter: tier
            });

            res.status(200).json({
                success: true,
                message: 'Top movers retrieved successfully',
                data: {
                    leaderboard_type,
                    criteria,
                    direction,
                    tier_filter: tier,
                    movers
                }
            });
        } catch (error) {
            console.error('Error in getTopMovers:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    static async getLeaderboardStats(req, res) {
        try {
            const { 
                leaderboard_type = 'GLOBAL',
                criteria = 'TOTAL_XP',
                tier = null
            } = req.query;

            // Validate parameters
            if (!LeaderboardService.getValidLeaderboardTypes().includes(leaderboard_type)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid leaderboard type',
                    valid_types: LeaderboardService.getValidLeaderboardTypes()
                });
            }

            if (!LeaderboardService.getValidCriteria().includes(criteria)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid ranking criteria',
                    valid_criteria: LeaderboardService.getValidCriteria()
                });
            }

            const stats = await LeaderboardService.getLeaderboardStats(leaderboard_type, criteria, tier);

            res.status(200).json({
                success: true,
                message: 'Leaderboard statistics retrieved successfully',
                data: {
                    leaderboard_type,
                    criteria,
                    tier_filter: tier,
                    statistics: stats
                }
            });
        } catch (error) {
            console.error('Error in getLeaderboardStats:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // =====================================================
    // ADMIN ENDPOINTS
    // =====================================================

    static async initializeUserLeaderboards(req, res) {
        try {
            const { user_id } = req.body;

            if (!user_id) {
                return res.status(400).json({
                    success: false,
                    message: 'User ID is required'
                });
            }

            const result = await LeaderboardService.initializeUserLeaderboards(user_id);

            if (result.success) {
                res.status(200).json({
                    success: true,
                    message: result.message
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: result.message,
                    error: result.error
                });
            }
        } catch (error) {
            console.error('Error in initializeUserLeaderboards:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    static async updateUserScore(req, res) {
        try {
            const { 
                user_id,
                criteria,
                score,
                leaderboard_type = 'GLOBAL',
                tier = null
            } = req.body;

            if (!user_id || !criteria || score === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'User ID, criteria, and score are required'
                });
            }

            // Validate parameters
            if (!LeaderboardService.getValidLeaderboardTypes().includes(leaderboard_type)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid leaderboard type',
                    valid_types: LeaderboardService.getValidLeaderboardTypes()
                });
            }

            if (!LeaderboardService.getValidCriteria().includes(criteria)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid ranking criteria',
                    valid_criteria: LeaderboardService.getValidCriteria()
                });
            }

            const result = await LeaderboardService.updateUserScore(
                user_id, 
                criteria, 
                parseInt(score), 
                leaderboard_type, 
                tier
            );

            if (result.success) {
                res.status(200).json({
                    success: true,
                    message: result.message,
                    data: result.data
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: result.message,
                    error: result.error
                });
            }
        } catch (error) {
            console.error('Error in updateUserScore:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }
}

module.exports = LeaderboardController;
