const { LevelRequirement, Title, Badge, UserTitle, UserBadge, User } = require('../models');
const { Op } = require('sequelize');

class GamificationLevelController {

    /**
     * Lấy thông tin tất cả các level requirements
     */
    static async getAllLevels(req, res) {
        try {
            const levels = await LevelRequirement.findAll({
                order: [['level', 'ASC']]
            });

            res.json({
                success: true,
                data: {
                    levels,
                    total_levels: levels.length
                }
            });
        } catch (error) {
            console.error('Error getting all levels:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thông tin levels',
                error: error.message
            });
        }
    }

    /**
     * Lấy thông tin các tầng (tiers)
     */
    static async getAllTiers(req, res) {
        try {
            const tiers = await LevelRequirement.getAllTiers();

            res.json({
                success: true,
                data: {
                    tiers,
                    total_tiers: tiers.length
                }
            });
        } catch (error) {
            console.error('Error getting all tiers:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thông tin tiers',
                error: error.message
            });
        }
    }

    /**
     * Lấy thông tin level cụ thể
     */
    static async getLevelInfo(req, res) {
        try {
            const { level } = req.params;
            
            const levelInfo = await LevelRequirement.findOne({
                where: { level: parseInt(level) }
            });

            if (!levelInfo) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy level'
                });
            }

            // Lấy thông tin title và badge tương ứng
            const title = await Title.getTitleByLevel(parseInt(level));
            const badge = await Badge.getBadgeByTier(levelInfo.tier_name);

            res.json({
                success: true,
                data: {
                    level_info: levelInfo,
                    title: title,
                    badge: badge
                }
            });
        } catch (error) {
            console.error('Error getting level info:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thông tin level',
                error: error.message
            });
        }
    }

    /**
     * Tính toán level từ XP
     */
    static async calculateLevelFromXP(req, res) {
        try {
            const { xp } = req.query;
            
            if (!xp || isNaN(xp)) {
                return res.status(400).json({
                    success: false,
                    message: 'XP không hợp lệ'
                });
            }

            const levelInfo = await LevelRequirement.calculateLevelFromXP(parseInt(xp));

            res.json({
                success: true,
                data: levelInfo
            });
        } catch (error) {
            console.error('Error calculating level from XP:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi tính toán level',
                error: error.message
            });
        }
    }

    /**
     * Lấy thống kê phân bố level của users
     */
    static async getLevelDistribution(req, res) {
        try {
            const distribution = await User.findAll({
                attributes: [
                    'current_level',
                    [require('sequelize').fn('COUNT', require('sequelize').col('user_id')), 'user_count']
                ],
                group: ['current_level'],
                order: [['current_level', 'ASC']],
                raw: true
            });

            // Lấy thông tin tier cho mỗi level
            const distributionWithTiers = await Promise.all(
                distribution.map(async (item) => {
                    const levelInfo = await LevelRequirement.findOne({
                        where: { level: item.current_level },
                        attributes: ['tier_name', 'tier_color']
                    });

                    return {
                        level: item.current_level,
                        user_count: parseInt(item.user_count),
                        tier_name: levelInfo?.tier_name || 'Unknown',
                        tier_color: levelInfo?.tier_color || '#000000'
                    };
                })
            );

            // Thống kê theo tier
            const tierStats = {};
            distributionWithTiers.forEach(item => {
                if (!tierStats[item.tier_name]) {
                    tierStats[item.tier_name] = {
                        tier_name: item.tier_name,
                        tier_color: item.tier_color,
                        total_users: 0,
                        levels: []
                    };
                }
                tierStats[item.tier_name].total_users += item.user_count;
                tierStats[item.tier_name].levels.push({
                    level: item.level,
                    user_count: item.user_count
                });
            });

            res.json({
                success: true,
                data: {
                    level_distribution: distributionWithTiers,
                    tier_distribution: Object.values(tierStats),
                    total_active_users: distributionWithTiers.reduce((sum, item) => sum + item.user_count, 0)
                }
            });
        } catch (error) {
            console.error('Error getting level distribution:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thống kê phân bố level',
                error: error.message
            });
        }
    }

    /**
     * Lấy top users theo level
     */
    static async getTopUsersByLevel(req, res) {
        try {
            const { limit = 10 } = req.query;

            const topUsers = await User.findAll({
                attributes: ['user_id', 'name', 'total_points', 'current_level'],
                order: [
                    ['current_level', 'DESC'],
                    ['total_points', 'DESC']
                ],
                limit: parseInt(limit),
                include: [
                    {
                        model: UserTitle,
                        as: 'UserTitles',
                        where: { is_active: true },
                        required: false,
                        include: [{
                            model: Title,
                            as: 'Title',
                            attributes: ['title_name', 'title_display', 'tier_name', 'color']
                        }]
                    }
                ]
            });

            // Format dữ liệu
            const formattedUsers = await Promise.all(
                topUsers.map(async (user, index) => {
                    const levelInfo = await LevelRequirement.calculateLevelFromXP(user.total_points);
                    const activeTitle = user.UserTitles.find(ut => ut.is_active);

                    return {
                        rank: index + 1,
                        user_id: user.user_id,
                        name: user.name,
                        total_points: user.total_points,
                        current_level: user.current_level,
                        tier_info: levelInfo.tier_info,
                        active_title: activeTitle ? {
                            title_name: activeTitle.Title.title_name,
                            title_display: activeTitle.Title.title_display,
                            tier_name: activeTitle.Title.tier_name,
                            color: activeTitle.Title.color
                        } : null
                    };
                })
            );

            res.json({
                success: true,
                data: {
                    top_users: formattedUsers,
                    total_count: formattedUsers.length
                }
            });
        } catch (error) {
            console.error('Error getting top users by level:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy top users theo level',
                error: error.message
            });
        }
    }

    /**
     * Lấy progress của user hiện tại trong hệ thống level
     */
    static async getUserLevelProgress(req, res) {
        try {
            const userId = req.user.user_id;
            
            const user = await User.findByPk(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy user'
                });
            }

            const gamificationInfo = await user.getGamificationInfo();

            res.json({
                success: true,
                data: gamificationInfo
            });
        } catch (error) {
            console.error('Error getting user level progress:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thông tin tiến độ level',
                error: error.message
            });
        }
    }
}

module.exports = GamificationLevelController;
