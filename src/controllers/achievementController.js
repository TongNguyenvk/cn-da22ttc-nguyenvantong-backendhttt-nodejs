const AchievementService = require('../services/achievementService');
const { Badge, UserBadge, User, sequelize } = require('../models');
const { Op } = require('sequelize');

class AchievementController {

    // =====================================================
    // ACHIEVEMENT PROGRESS ENDPOINTS
    // =====================================================

    /**
     * Lấy tiến độ achievements của user hiện tại
     */
    static async getUserAchievementProgress(req, res) {
        try {
            const userId = req.user.user_id;

            const progress = await AchievementService.getUserAchievementProgress(userId);

            return res.status(200).json({
                success: true,
                message: 'Lấy tiến độ achievements thành công',
                data: progress
            });

        } catch (error) {
            console.error('Error getting achievement progress:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy tiến độ achievements',
                error: error.message
            });
        }
    }

    /**
     * Lấy tất cả achievement badges (public)
     */
    static async getAllAchievementBadges(req, res) {
        try {
            const { rarity, badge_type = 'achievement' } = req.query;

            const whereClause = {
                badge_type: badge_type,
                is_active: true
            };

            if (rarity) {
                whereClause.rarity = rarity;
            }

            const badges = await Badge.findAll({
                where: whereClause,
                order: [
                    ['unlock_level', 'ASC'],
                    ['rarity', 'ASC'],
                    ['badge_name', 'ASC']
                ]
            });

            // Group by rarity for better display
            const groupedBadges = badges.reduce((acc, badge) => {
                if (!acc[badge.rarity]) {
                    acc[badge.rarity] = [];
                }
                acc[badge.rarity].push(badge);
                return acc;
            }, {});

            return res.status(200).json({
                success: true,
                message: 'Lấy danh sách achievement badges thành công',
                data: {
                    total_badges: badges.length,
                    badges: badges,
                    grouped_by_rarity: groupedBadges,
                    rarity_stats: {
                        common: badges.filter(b => b.rarity === 'common').length,
                        rare: badges.filter(b => b.rarity === 'rare').length,
                        epic: badges.filter(b => b.rarity === 'epic').length,
                        legendary: badges.filter(b => b.rarity === 'legendary').length
                    }
                }
            });

        } catch (error) {
            console.error('Error getting achievement badges:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách achievement badges',
                error: error.message
            });
        }
    }

    /**
     * Track user action để check achievements
     */
    static async trackUserAction(req, res) {
        try {
            const userId = req.user.user_id;
            const { action_type, action_data = {} } = req.body;

            if (!action_type) {
                return res.status(400).json({
                    success: false,
                    message: 'action_type là bắt buộc'
                });
            }

            const result = await AchievementService.trackUserAction(userId, action_type, action_data);

            return res.status(200).json({
                success: true,
                message: 'Track action thành công',
                data: result
            });

        } catch (error) {
            console.error('Error tracking user action:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi track action',
                error: error.message
            });
        }
    }

    // =====================================================
    // EVENT BADGE ENDPOINTS
    // =====================================================

    /**
     * Lấy event badges đang active
     */
    static async getActiveEventBadges(req, res) {
        try {
            const eventBadges = await AchievementService.getActiveEventBadges();

            return res.status(200).json({
                success: true,
                message: 'Lấy event badges thành công',
                data: {
                    total_events: eventBadges.length,
                    event_badges: eventBadges
                }
            });

        } catch (error) {
            console.error('Error getting event badges:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy event badges',
                error: error.message
            });
        }
    }

    /**
     * Participate in event và check event badges
     */
    static async participateInEvent(req, res) {
        try {
            const userId = req.user.user_id;
            const { event_type, event_data = {} } = req.body;

            if (!event_type) {
                return res.status(400).json({
                    success: false,
                    message: 'event_type là bắt buộc'
                });
            }

            const newBadges = await AchievementService.checkEventBadges(userId, event_type, event_data);

            return res.status(200).json({
                success: true,
                message: 'Tham gia event thành công',
                data: {
                    event_type: event_type,
                    new_badges: newBadges,
                    badges_unlocked: newBadges.length
                }
            });

        } catch (error) {
            console.error('Error participating in event:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi tham gia event',
                error: error.message
            });
        }
    }

    // =====================================================
    // BADGE STATISTICS ENDPOINTS
    // =====================================================

    /**
     * Lấy thống kê badges của user
     */
    static async getUserBadgeStats(req, res) {
        try {
            const userId = req.user.user_id;

            // Get user's badges grouped by type and rarity
            const userBadges = await UserBadge.findAll({
                where: { user_id: userId },
                include: [{
                    model: Badge,
                    as: 'Badge',
                    attributes: ['badge_id', 'badge_name', 'badge_type', 'rarity', 'tier_name']
                }]
            });

            // Get total available badges
            const totalBadges = await Badge.count({
                where: { is_active: true }
            });

            // Group statistics
            const stats = {
                total_unlocked: userBadges.length,
                total_available: totalBadges,
                completion_rate: ((userBadges.length / totalBadges) * 100).toFixed(2),
                by_type: {},
                by_rarity: {},
                by_tier: {},
                recent_badges: []
            };

            // Group by type, rarity, tier
            userBadges.forEach(userBadge => {
                const badge = userBadge.Badge;

                // By type
                if (!stats.by_type[badge.badge_type]) {
                    stats.by_type[badge.badge_type] = 0;
                }
                stats.by_type[badge.badge_type]++;

                // By rarity
                if (!stats.by_rarity[badge.rarity]) {
                    stats.by_rarity[badge.rarity] = 0;
                }
                stats.by_rarity[badge.rarity]++;

                // By tier
                if (!stats.by_tier[badge.tier_name]) {
                    stats.by_tier[badge.tier_name] = 0;
                }
                stats.by_tier[badge.tier_name]++;
            });

            // Recent badges (last 10)
            stats.recent_badges = userBadges
                .sort((a, b) => new Date(b.unlocked_at) - new Date(a.unlocked_at))
                .slice(0, 10)
                .map(ub => ({
                    badge_id: ub.badge_id,
                    badge_name: ub.Badge.badge_name,
                    rarity: ub.Badge.rarity,
                    unlocked_at: ub.unlocked_at
                }));

            return res.status(200).json({
                success: true,
                message: 'Lấy thống kê badges thành công',
                data: stats
            });

        } catch (error) {
            console.error('Error getting badge stats:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thống kê badges',
                error: error.message
            });
        }
    }

    /**
     * Sync badges cho user dựa trên level hiện tại
     */
    static async syncUserBadges(req, res) {
        try {
            const userId = req.user.user_id;

            // Get user info
            const user = await User.findByPk(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy user'
                });
            }

            const userLevel = user.current_level;

            // Get all level-based badges that user should have
            const eligibleBadges = await Badge.findAll({
                where: {
                    badge_type: 'level',
                    unlock_level: {
                        [Op.lte]: userLevel
                    },
                    is_active: true
                }
            });

            // Get badges user already has
            const existingBadges = await UserBadge.findAll({
                where: { user_id: userId },
                include: [{
                    model: Badge,
                    as: 'Badge',
                    where: { badge_type: 'level' }
                }]
            });

            const existingBadgeIds = existingBadges.map(ub => ub.badge_id);

            // Find badges to unlock
            const badgesToUnlock = eligibleBadges.filter(badge =>
                !existingBadgeIds.includes(badge.badge_id)
            );

            // Unlock missing badges
            const newBadges = [];
            for (const badge of badgesToUnlock) {
                const userBadge = await UserBadge.create({
                    user_id: userId,
                    badge_id: badge.badge_id,
                    unlocked_at: new Date()
                });

                newBadges.push({
                    badge_id: badge.badge_id,
                    badge_name: badge.badge_name,
                    rarity: badge.rarity,
                    tier_name: badge.tier_name
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Sync badges thành công',
                data: {
                    user_level: userLevel,
                    eligible_badges: eligibleBadges.length,
                    existing_badges: existingBadges.length,
                    new_badges_unlocked: newBadges.length,
                    new_badges: newBadges
                }
            });

        } catch (error) {
            console.error('Error syncing user badges:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi sync badges',
                error: error.message
            });
        }
    }

    /**
     * Lấy leaderboard theo badges
     */
    static async getBadgeLeaderboard(req, res) {
        try {
            const { limit = 10, badge_type = 'all' } = req.query;

            let whereClause = {};
            if (badge_type !== 'all') {
                whereClause = {
                    '$Badge.badge_type$': badge_type
                };
            }

            const leaderboard = await UserBadge.findAll({
                where: whereClause,
                include: [
                    {
                        model: User,
                        as: 'User',
                        attributes: ['user_id', 'name', 'current_level']
                    },
                    {
                        model: Badge,
                        as: 'Badge',
                        attributes: ['badge_type', 'rarity']
                    }
                ],
                attributes: [
                    'user_id',
                    [sequelize.fn('COUNT', sequelize.col('UserBadge.badge_id')), 'badge_count'],
                    [sequelize.fn('COUNT', sequelize.literal("CASE WHEN \"Badge\".\"rarity\" = 'legendary' THEN 1 END")), 'legendary_count'],
                    [sequelize.fn('COUNT', sequelize.literal("CASE WHEN \"Badge\".\"rarity\" = 'epic' THEN 1 END")), 'epic_count']
                ],
                group: ['UserBadge.user_id', 'User.user_id', 'User.name', 'User.current_level'],
                order: [
                    [sequelize.literal('legendary_count'), 'DESC'],
                    [sequelize.literal('epic_count'), 'DESC'],
                    [sequelize.literal('badge_count'), 'DESC']
                ],
                limit: parseInt(limit),
                raw: false
            });

            return res.status(200).json({
                success: true,
                message: 'Lấy bảng xếp hạng badges thành công',
                data: {
                    leaderboard: leaderboard,
                    total_users: leaderboard.length,
                    badge_type: badge_type
                }
            });

        } catch (error) {
            console.error('Error getting badge leaderboard:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy bảng xếp hạng badges',
                error: error.message
            });
        }
    }
}

module.exports = AchievementController;
