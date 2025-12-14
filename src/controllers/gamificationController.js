const GamificationService = require('../services/gamificationService');
const { User, LevelRequirement, Title, Badge, UserTitle, UserBadge } = require('../models');
const { Op } = require('sequelize');

class GamificationController {

    // Lấy thông tin gamification của user hiện tại - Updated với hệ thống level mới
    static async getUserGamificationInfo(req, res) {
        try {
            const userId = req.user.user_id;

            const user = await User.findByPk(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Sử dụng method mới để lấy thông tin gamification đầy đủ
            const gamificationInfo = await user.getGamificationInfo();

            return res.status(200).json({
                success: true,
                message: 'Lấy thông tin gamification thành công',
                data: gamificationInfo
            });
        } catch (error) {
            console.error('Error getting user gamification info:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thông tin gamification',
                error: error.message
            });
        }
    }

    // Lấy tiến độ level của user hiện tại
    static async getUserLevelProgress(req, res) {
        try {
            const userId = req.user.user_id;

            const user = await User.findByPk(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Lấy thông tin gamification đầy đủ
            const gamificationInfo = await user.getGamificationInfo();

            // Trích xuất thông tin level progress
            const levelProgress = {
                user_id: userId,
                current_level: gamificationInfo.current_level,
                experience_points: gamificationInfo.experience_points,
                experience_to_next_level: gamificationInfo.experience_to_next_level,
                tier_info: gamificationInfo.tier_info,
                next_level_info: gamificationInfo.next_level_info,
                progress_percentage: Math.round(
                    (gamificationInfo.experience_points /
                     (gamificationInfo.experience_points + gamificationInfo.experience_to_next_level)) * 100
                )
            };

            return res.status(200).json({
                success: true,
                message: 'Lấy tiến độ level thành công',
                data: levelProgress
            });
        } catch (error) {
            console.error('Error getting user level progress:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy tiến độ level',
                error: error.message
            });
        }
    }

    // Lấy bảng xếp hạng theo điểm
    static async getPointsLeaderboard(req, res) {
        try {
            const { limit = 10, timeframe = 'all' } = req.query;
            const leaderboard = await GamificationService.getPointsLeaderboard(
                parseInt(limit),
                timeframe
            );

            return res.status(200).json({
                success: true,
                message: 'Lấy bảng xếp hạng thành công',
                data: {
                    leaderboard,
                    total_users: leaderboard.length,
                    timeframe
                }
            });
        } catch (error) {
            console.error('Error getting points leaderboard:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy bảng xếp hạng',
                error: error.message
            });
        }
    }

    // Lấy thông tin gamification của user cụ thể (cho admin/teacher)
    static async getUserGamificationInfoById(req, res) {
        try {
            const { userId } = req.params;
            const gamificationInfo = await GamificationService.getUserGamificationInfo(userId);

            return res.status(200).json({
                success: true,
                message: 'Lấy thông tin gamification thành công',
                data: gamificationInfo
            });
        } catch (error) {
            console.error('Error getting user gamification info by id:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thông tin gamification',
                error: error.message
            });
        }
    }

    // Thêm điểm thủ công (cho admin)
    static async addPointsManually(req, res) {
        try {
            const { userId, points, reason } = req.body;

            if (!userId || !points) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu thông tin userId hoặc points'
                });
            }

            const user = await User.findByPk(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy người dùng'
                });
            }

            const result = await user.addPoints(points, reason || 'manual_addition');

            return res.status(200).json({
                success: true,
                message: 'Thêm điểm thành công',
                data: result
            });
        } catch (error) {
            console.error('Error adding points manually:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi thêm điểm',
                error: error.message
            });
        }
    }

    // Lấy thống kê tổng quan gamification (cho admin)
    static async getGamificationStats(req, res) {
        try {
            // Thống kê cơ bản
            const totalUsers = await User.count();
            const activeUsers = await User.count({
                where: {
                    total_points: { [require('sequelize').Op.gt]: 0 }
                }
            });

            // Top performers
            const topPerformers = await GamificationService.getPointsLeaderboard(5);

            // Level distribution
            const levelDistribution = await User.findAll({
                attributes: [
                    'current_level',
                    [require('sequelize').fn('COUNT', require('sequelize').col('user_id')), 'count']
                ],
                group: ['current_level'],
                order: [['current_level', 'ASC']]
            });

            return res.status(200).json({
                success: true,
                message: 'Lấy thống kê gamification thành công',
                data: {
                    overview: {
                        total_users: totalUsers,
                        active_users: activeUsers,
                        engagement_rate: totalUsers > 0 ? (activeUsers / totalUsers * 100).toFixed(2) : 0
                    },
                    top_performers: topPerformers,
                    level_distribution: levelDistribution
                }
            });
        } catch (error) {
            console.error('Error getting gamification stats:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thống kê gamification',
                error: error.message
            });
        }
    }

    // Test endpoint để add points và test level up
    static async addPointsTest(req, res) {
        try {
            const userId = req.user.user_id;
            const { points = 100, reason = 'test' } = req.body;

            const user = await User.findByPk(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Sử dụng method addPoints mới
            const result = await user.addPoints(points, reason);

            return res.status(200).json({
                success: true,
                message: 'Points added successfully',
                data: result
            });
        } catch (error) {
            console.error('Error adding points:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi thêm points',
                error: error.message
            });
        }
    }

    // Sync titles và badges cho user dựa trên level hiện tại
    static async syncUserGamification(req, res) {
        try {
            const userId = req.user.user_id;
            const { Title, Badge, UserTitle, UserBadge, LevelRequirement } = require('../models');

            const user = await User.findByPk(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Tính level từ total_points
            const levelInfo = await LevelRequirement.calculateLevelFromXP(user.total_points);
            const currentLevel = levelInfo.current_level;

            // Tìm tất cả titles user nên có (dựa trên level_range)
            const availableTitles = await Title.findAll({
                where: {
                    level_range_start: {
                        [require('sequelize').Op.lte]: currentLevel
                    },
                    level_range_end: {
                        [require('sequelize').Op.gte]: currentLevel
                    }
                }
            });

            // Tìm tất cả badges user nên có (dựa trên unlock_level)
            const availableBadges = await Badge.findAll({
                where: {
                    unlock_level: {
                        [require('sequelize').Op.lte]: currentLevel
                    }
                }
            });

            let newTitles = [];
            let newBadges = [];

            // Unlock titles
            for (const title of availableTitles) {
                const [userTitle, created] = await UserTitle.findOrCreate({
                    where: {
                        user_id: userId,
                        title_id: title.title_id
                    },
                    defaults: {
                        is_active: availableTitles.length === 1, // Set active nếu là title đầu tiên
                        unlocked_at: new Date()
                    }
                });

                if (created) {
                    newTitles.push({
                        user_title_id: userTitle.user_title_id,
                        title_id: title.title_id,
                        Title: title
                    });
                }
            }

            // Unlock badges
            for (const badge of availableBadges) {
                const [userBadge, created] = await UserBadge.findOrCreate({
                    where: {
                        user_id: userId,
                        badge_id: badge.badge_id
                    },
                    defaults: {
                        unlocked_at: new Date()
                    }
                });

                if (created) {
                    newBadges.push({
                        user_badge_id: userBadge.user_badge_id,
                        badge_id: badge.badge_id,
                        Badge: badge
                    });
                }
            }

            return res.status(200).json({
                success: true,
                message: 'Gamification synced successfully',
                data: {
                    user_level: currentLevel,
                    total_points: user.total_points,
                    new_titles: newTitles,
                    new_badges: newBadges,
                    titles_unlocked: newTitles.length,
                    badges_unlocked: newBadges.length
                }
            });

        } catch (error) {
            console.error('Error syncing user gamification:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi sync gamification',
                error: error.message
            });
        }
    }
}

module.exports = GamificationController;
