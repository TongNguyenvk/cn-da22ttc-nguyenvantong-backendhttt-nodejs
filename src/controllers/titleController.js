const { Title, Badge, UserTitle, UserBadge, User } = require('../models');
const { Op } = require('sequelize');

class TitleController {

    /**
     * Lấy tất cả danh hiệu
     */
    static async getAllTitles(req, res) {
        try {
            const titles = await Title.getAllTitlesOrdered();

            res.json({
                success: true,
                data: {
                    titles,
                    total_titles: titles.length
                }
            });
        } catch (error) {
            console.error('Error getting all titles:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách danh hiệu',
                error: error.message
            });
        }
    }

    /**
     * Lấy tất cả huy hiệu
     */
    static async getAllBadges(req, res) {
        try {
            const { rarity } = req.query;
            
            let badges;
            if (rarity) {
                badges = await Badge.getBadgesByRarity(rarity);
            } else {
                badges = await Badge.findAll({
                    order: [['unlock_level', 'ASC']]
                });
            }

            // Thống kê theo độ hiếm
            const rarityStats = await Badge.getBadgeRarityStats();

            res.json({
                success: true,
                data: {
                    badges,
                    total_badges: badges.length,
                    rarity_stats: rarityStats
                }
            });
        } catch (error) {
            console.error('Error getting all badges:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách huy hiệu',
                error: error.message
            });
        }
    }

    /**
     * Lấy danh hiệu của user hiện tại
     */
    static async getUserTitles(req, res) {
        try {
            const userId = req.user.user_id;

            const userTitles = await UserTitle.getUserTitles(userId);
            const titleStats = await UserTitle.getUserTitleStats(userId);

            res.json({
                success: true,
                data: {
                    user_titles: userTitles,
                    stats: titleStats
                }
            });
        } catch (error) {
            console.error('Error getting user titles:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh hiệu của user',
                error: error.message
            });
        }
    }

    /**
     * Lấy huy hiệu của user hiện tại
     */
    static async getUserBadges(req, res) {
        try {
            const userId = req.user.user_id;
            const { rarity } = req.query;

            let userBadges;
            if (rarity) {
                userBadges = await UserBadge.getUserBadgesByRarity(userId, rarity);
            } else {
                userBadges = await UserBadge.getUserBadges(userId);
            }

            const badgeStats = await UserBadge.getUserBadgeStats(userId);

            res.json({
                success: true,
                data: {
                    user_badges: userBadges,
                    stats: badgeStats
                }
            });
        } catch (error) {
            console.error('Error getting user badges:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy huy hiệu của user',
                error: error.message
            });
        }
    }

    /**
     * Đặt danh hiệu active cho user
     */
    static async setActiveTitle(req, res) {
        try {
            const userId = req.user.user_id;
            const { title_id } = req.body;

            if (!title_id) {
                return res.status(400).json({
                    success: false,
                    message: 'title_id là bắt buộc'
                });
            }

            const success = await UserTitle.setActiveTitle(userId, title_id);

            if (!success) {
                return res.status(400).json({
                    success: false,
                    message: 'Không thể đặt danh hiệu này làm active. User có thể chưa sở hữu danh hiệu này.'
                });
            }

            // Lấy thông tin danh hiệu vừa đặt
            const activeTitle = await UserTitle.getActiveTitle(userId);

            res.json({
                success: true,
                message: 'Đã đặt danh hiệu active thành công',
                data: {
                    active_title: activeTitle
                }
            });
        } catch (error) {
            console.error('Error setting active title:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi đặt danh hiệu active',
                error: error.message
            });
        }
    }

    /**
     * Lấy danh hiệu active của user
     */
    static async getActiveTitle(req, res) {
        try {
            const userId = req.user.user_id;

            const activeTitle = await UserTitle.getActiveTitle(userId);

            res.json({
                success: true,
                data: {
                    active_title: activeTitle
                }
            });
        } catch (error) {
            console.error('Error getting active title:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh hiệu active',
                error: error.message
            });
        }
    }

    /**
     * Lấy thông tin danh hiệu và huy hiệu có thể mở khóa ở level cụ thể
     */
    static async getUnlockableAtLevel(req, res) {
        try {
            const { level } = req.params;
            const levelNum = parseInt(level);

            if (isNaN(levelNum)) {
                return res.status(400).json({
                    success: false,
                    message: 'Level không hợp lệ'
                });
            }

            // Lấy danh hiệu có thể mở khóa
            const title = await Title.getTitleByLevel(levelNum);
            
            // Lấy huy hiệu có thể mở khóa
            const badges = await Badge.getBadgesByLevel(levelNum);

            res.json({
                success: true,
                data: {
                    level: levelNum,
                    unlockable_title: title,
                    unlockable_badges: badges
                }
            });
        } catch (error) {
            console.error('Error getting unlockable at level:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thông tin có thể mở khóa',
                error: error.message
            });
        }
    }

    /**
     * Admin: Mở khóa danh hiệu cho user
     */
    static async unlockTitleForUser(req, res) {
        try {
            const { user_id, title_id, set_as_active = false } = req.body;

            if (!user_id || !title_id) {
                return res.status(400).json({
                    success: false,
                    message: 'user_id và title_id là bắt buộc'
                });
            }

            // Kiểm tra user tồn tại
            const user = await User.findByPk(user_id);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy user'
                });
            }

            // Kiểm tra title tồn tại
            const title = await Title.findByPk(title_id);
            if (!title) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy danh hiệu'
                });
            }

            const newUserTitle = await UserTitle.unlockTitle(user_id, title_id, set_as_active);

            res.json({
                success: true,
                message: newUserTitle ? 'Đã mở khóa danh hiệu thành công' : 'User đã có danh hiệu này rồi',
                data: {
                    user_title: newUserTitle
                }
            });
        } catch (error) {
            console.error('Error unlocking title for user:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi mở khóa danh hiệu',
                error: error.message
            });
        }
    }

    /**
     * Admin: Mở khóa huy hiệu cho user
     */
    static async unlockBadgeForUser(req, res) {
        try {
            const { user_id, badge_id } = req.body;

            if (!user_id || !badge_id) {
                return res.status(400).json({
                    success: false,
                    message: 'user_id và badge_id là bắt buộc'
                });
            }

            // Kiểm tra user tồn tại
            const user = await User.findByPk(user_id);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy user'
                });
            }

            // Kiểm tra badge tồn tại
            const badge = await Badge.findByPk(badge_id);
            if (!badge) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy huy hiệu'
                });
            }

            const newUserBadge = await UserBadge.unlockBadge(user_id, badge_id);

            res.json({
                success: true,
                message: newUserBadge ? 'Đã mở khóa huy hiệu thành công' : 'User đã có huy hiệu này rồi',
                data: {
                    user_badge: newUserBadge
                }
            });
        } catch (error) {
            console.error('Error unlocking badge for user:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi mở khóa huy hiệu',
                error: error.message
            });
        }
    }
}

module.exports = TitleController;
