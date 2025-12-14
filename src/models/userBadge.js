'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class UserBadge extends Model {
        static associate(models) {
            // Association với User
            UserBadge.belongsTo(models.User, { 
                foreignKey: 'user_id',
                as: 'User'
            });

            // Association với Badge
            UserBadge.belongsTo(models.Badge, { 
                foreignKey: 'badge_id',
                as: 'Badge'
            });
        }

        /**
         * Lấy tất cả huy hiệu của user
         * @param {number} userId - ID của user
         * @returns {Array} - Danh sách huy hiệu
         */
        static async getUserBadges(userId) {
            return await this.findAll({
                where: { user_id: userId },
                include: [{
                    model: sequelize.models.Badge,
                    as: 'Badge'
                }],
                order: [['unlocked_at', 'DESC']]
            });
        }

        /**
         * Lấy huy hiệu của user theo độ hiếm
         * @param {number} userId - ID của user
         * @param {string} rarity - Độ hiếm
         * @returns {Array} - Danh sách huy hiệu
         */
        static async getUserBadgesByRarity(userId, rarity) {
            return await this.findAll({
                where: { user_id: userId },
                include: [{
                    model: sequelize.models.Badge,
                    as: 'Badge',
                    where: { rarity }
                }],
                order: [['unlocked_at', 'DESC']]
            });
        }

        /**
         * Mở khóa huy hiệu mới cho user
         * @param {number} userId - ID của user
         * @param {number} badgeId - ID của huy hiệu
         * @returns {object|null} - Thông tin huy hiệu vừa mở khóa hoặc null nếu đã có
         */
        static async unlockBadge(userId, badgeId) {
            try {
                // Kiểm tra đã có chưa
                const existing = await this.findOne({
                    where: { 
                        user_id: userId,
                        badge_id: badgeId 
                    }
                });

                if (existing) {
                    return null; // Đã có rồi
                }

                // Tạo mới
                const newUserBadge = await this.create({
                    user_id: userId,
                    badge_id: badgeId,
                    unlocked_at: new Date()
                });

                // Lấy thông tin đầy đủ
                return await this.findByPk(newUserBadge.user_badge_id, {
                    include: [{
                        model: sequelize.models.Badge,
                        as: 'Badge'
                    }]
                });

            } catch (error) {
                // Nếu lỗi unique constraint, có nghĩa là đã có rồi
                if (error.name === 'SequelizeUniqueConstraintError') {
                    return null;
                }
                throw error;
            }
        }

        /**
         * Mở khóa nhiều huy hiệu cùng lúc
         * @param {number} userId - ID của user
         * @param {Array} badgeIds - Danh sách ID huy hiệu
         * @returns {Array} - Danh sách huy hiệu mới được mở khóa
         */
        static async unlockMultipleBadges(userId, badgeIds) {
            const newBadges = [];
            
            for (const badgeId of badgeIds) {
                const newBadge = await this.unlockBadge(userId, badgeId);
                if (newBadge) {
                    newBadges.push(newBadge);
                }
            }

            return newBadges;
        }

        /**
         * Lấy thống kê huy hiệu của user
         * @param {number} userId - ID của user
         * @returns {object} - Thống kê
         */
        static async getUserBadgeStats(userId) {
            const totalBadges = await sequelize.models.Badge.count();
            const userBadges = await this.count({
                where: { user_id: userId }
            });

            // Thống kê theo độ hiếm
            const rarityStats = await this.findAll({
                where: { user_id: userId },
                include: [{
                    model: sequelize.models.Badge,
                    as: 'Badge',
                    attributes: ['rarity']
                }],
                attributes: [
                    [sequelize.col('Badge.rarity'), 'rarity'],
                    [sequelize.fn('COUNT', sequelize.col('user_badge_id')), 'count']
                ],
                group: ['Badge.rarity'],
                raw: true
            });

            // Huy hiệu mới nhất
            const latestBadge = await this.findOne({
                where: { user_id: userId },
                include: [{
                    model: sequelize.models.Badge,
                    as: 'Badge'
                }],
                order: [['unlocked_at', 'DESC']]
            });

            return {
                total_available: totalBadges,
                unlocked: userBadges,
                completion_rate: totalBadges > 0 ? ((userBadges / totalBadges) * 100).toFixed(2) : 0,
                rarity_breakdown: rarityStats.reduce((acc, stat) => {
                    acc[stat.rarity] = parseInt(stat.count);
                    return acc;
                }, {}),
                latest_badge: latestBadge ? {
                    badge_id: latestBadge.badge_id,
                    badge_name: latestBadge.Badge.badge_name,
                    tier_name: latestBadge.Badge.tier_name,
                    rarity: latestBadge.Badge.rarity,
                    unlocked_at: latestBadge.unlocked_at
                } : null
            };
        }

        /**
         * Kiểm tra user có huy hiệu cụ thể không
         * @param {number} userId - ID của user
         * @param {number} badgeId - ID của huy hiệu
         * @returns {boolean} - Có hay không
         */
        static async hasBadge(userId, badgeId) {
            const count = await this.count({
                where: { 
                    user_id: userId,
                    badge_id: badgeId 
                }
            });
            return count > 0;
        }
    }

    UserBadge.init(
        {
            user_badge_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            user_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Users',
                    key: 'user_id'
                }
            },
            badge_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Badges',
                    key: 'badge_id'
                }
            },
            unlocked_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
                comment: 'Thời điểm mở khóa huy hiệu'
            }
        },
        {
            sequelize,
            modelName: 'UserBadge',
            tableName: 'UserBadges',
            timestamps: false,
            indexes: [
                {
                    unique: true,
                    fields: ['user_id', 'badge_id']
                }
            ]
        }
    );

    return UserBadge;
};
