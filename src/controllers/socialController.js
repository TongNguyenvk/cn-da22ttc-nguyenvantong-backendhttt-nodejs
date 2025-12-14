const EmojiSocialService = require('../services/emojiSocialService');
const { SocialInteraction, UserSocialStats } = require('../models');

class SocialController {

    // =====================================================
    // SOCIAL INTERACTION ENDPOINTS
    // =====================================================

    static async sendEmojiReaction(req, res) {
        try {
            const fromUserId = req.user.user_id;
            const { to_user_id, emoji_type_id, context, context_id, metadata } = req.body;

            if (!to_user_id || !emoji_type_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Target user ID and emoji type ID are required'
                });
            }

            // Prevent self-interaction
            if (fromUserId === to_user_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot send emoji reaction to yourself'
                });
            }

            const result = await EmojiSocialService.recordSocialInteraction(
                fromUserId,
                to_user_id,
                'EMOJI_REACTION',
                {
                    emojiTypeId: emoji_type_id,
                    context: context,
                    contextId: context_id,
                    metadata: metadata || {}
                }
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
            console.error('Error in sendEmojiReaction:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    static async sendEncouragement(req, res) {
        try {
            const fromUserId = req.user.user_id;
            const { to_user_id, context, context_id, message } = req.body;

            if (!to_user_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Target user ID is required'
                });
            }

            // Prevent self-interaction
            if (fromUserId === to_user_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot send encouragement to yourself'
                });
            }

            const result = await EmojiSocialService.recordSocialInteraction(
                fromUserId,
                to_user_id,
                'ENCOURAGEMENT',
                {
                    context: context,
                    contextId: context_id,
                    metadata: { message: message || 'Keep going!' }
                }
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
            console.error('Error in sendEncouragement:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    static async celebrateAchievement(req, res) {
        try {
            const fromUserId = req.user.user_id;
            const { to_user_id, achievement_type, emoji_type_id, message } = req.body;

            if (!to_user_id || !achievement_type) {
                return res.status(400).json({
                    success: false,
                    message: 'Target user ID and achievement type are required'
                });
            }

            // Prevent self-interaction
            if (fromUserId === to_user_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot celebrate your own achievement'
                });
            }

            const result = await EmojiSocialService.recordSocialInteraction(
                fromUserId,
                to_user_id,
                'CELEBRATION',
                {
                    emojiTypeId: emoji_type_id,
                    context: 'achievement',
                    contextId: achievement_type,
                    metadata: {
                        achievement_type: achievement_type,
                        message: message || 'Congratulations!'
                    }
                }
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
            console.error('Error in celebrateAchievement:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // =====================================================
    // SOCIAL STATS ENDPOINTS
    // =====================================================

    static async getUserSocialStats(req, res) {
        try {
            const userId = req.user.user_id;
            const { timeframe } = req.query;

            const result = await EmojiSocialService.getUserSocialStats(userId, timeframe || '7d');

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
            console.error('Error in getUserSocialStats:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    static async getSocialInteractionHistory(req, res) {
        try {
            const userId = req.user.user_id;
            const { type, interaction_type, limit } = req.query;

            const options = {};
            if (type) options.type = type; // 'sent', 'received', or 'both'
            if (interaction_type) options.interactionType = interaction_type.toUpperCase();
            if (limit) options.limit = parseInt(limit);

            const history = await SocialInteraction.getUserInteractionHistory(userId, options);

            res.status(200).json({
                success: true,
                message: 'Social interaction history retrieved successfully',
                data: history
            });
        } catch (error) {
            console.error('Error in getSocialInteractionHistory:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    static async getTopSocialUsers(req, res) {
        try {
            const { timeframe, limit } = req.query;

            const topUsers = await SocialInteraction.getTopSocialUsers(
                timeframe || '7d',
                parseInt(limit) || 10
            );

            res.status(200).json({
                success: true,
                message: 'Top social users retrieved successfully',
                data: topUsers
            });
        } catch (error) {
            console.error('Error in getTopSocialUsers:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // =====================================================
    // SOCIAL LEADERBOARD ENDPOINTS
    // =====================================================

    static async getSocialLeaderboard(req, res) {
        try {
            const { criteria, limit } = req.query;

            const leaderboard = await UserSocialStats.getTopUsers(
                criteria || 'reputation',
                parseInt(limit) || 10
            );

            res.status(200).json({
                success: true,
                message: 'Social leaderboard retrieved successfully',
                data: {
                    leaderboard: leaderboard,
                    criteria: criteria || 'reputation',
                    limit: parseInt(limit) || 10
                }
            });
        } catch (error) {
            console.error('Error in getSocialLeaderboard:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    static async getUserSocialRank(req, res) {
        try {
            const userId = req.user.user_id;
            const { criteria } = req.query;

            const userStats = await UserSocialStats.getUserStats(userId);

            if (!userStats) {
                return res.status(404).json({
                    success: false,
                    message: 'User social stats not found'
                });
            }

            // Get user's rank among all users
            const allUsers = await UserSocialStats.getTopUsers(criteria || 'reputation', 1000);
            const userRank = allUsers.findIndex(user => user.user_id === userId) + 1;

            res.status(200).json({
                success: true,
                message: 'User social rank retrieved successfully',
                data: {
                    user_stats: userStats,
                    rank: userRank,
                    total_users: allUsers.length,
                    criteria: criteria || 'reputation'
                }
            });
        } catch (error) {
            console.error('Error in getUserSocialRank:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // =====================================================
    // SOCIAL PROFILE ENDPOINTS
    // =====================================================

    static async setFavoriteEmoji(req, res) {
        try {
            const userId = req.user.user_id;
            const { emoji_type_id } = req.body;

            if (!emoji_type_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Emoji type ID is required'
                });
            }

            const result = await UserSocialStats.setFavoriteEmoji(userId, emoji_type_id);

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
            console.error('Error in setFavoriteEmoji:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    static async getUserSocialProfile(req, res) {
        try {
            const { user_id } = req.params;
            const targetUserId = user_id || req.user.user_id;

            const userStats = await UserSocialStats.getUserStats(targetUserId);
            const recentInteractions = await SocialInteraction.getUserInteractionHistory(
                targetUserId,
                { type: 'both', limit: 10 }
            );

            if (!userStats) {
                return res.status(404).json({
                    success: false,
                    message: 'User social profile not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'User social profile retrieved successfully',
                data: {
                    stats: userStats,
                    recent_interactions: recentInteractions
                }
            });
        } catch (error) {
            console.error('Error in getUserSocialProfile:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }
}

module.exports = SocialController;
