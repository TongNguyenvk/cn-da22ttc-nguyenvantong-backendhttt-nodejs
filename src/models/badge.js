'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Badge extends Model {
        static associate(models) {
            // Association với UserBadge
            Badge.hasMany(models.UserBadge, {
                foreignKey: 'badge_id',
                as: 'UserBadges'
            });
        }

        /**
         * Lấy huy hiệu có thể mở khóa ở level cụ thể
         * @param {number} level - Level của user
         * @returns {Array} - Danh sách huy hiệu
         */
        static async getBadgesByLevel(level) {
            return await this.findAll({
                where: {
                    unlock_level: {
                        [sequelize.Sequelize.Op.lte]: level
                    }
                },
                order: [['unlock_level', 'ASC']]
            });
        }

        /**
         * Lấy huy hiệu theo tầng
         * @param {string} tierName - Tên tầng
         * @returns {object|null} - Thông tin huy hiệu
         */
        static async getBadgeByTier(tierName) {
            return await this.findOne({
                where: { tier_name: tierName }
            });
        }

        /**
         * Lấy huy hiệu mới được mở khóa khi level up
         * @param {number} oldLevel - Level cũ
         * @param {number} newLevel - Level mới
         * @returns {Array} - Danh sách huy hiệu mới
         */
        static async getNewUnlockedBadges(oldLevel, newLevel) {
            if (newLevel <= oldLevel) return [];

            return await this.findAll({
                where: {
                    unlock_level: {
                        [sequelize.Sequelize.Op.gt]: oldLevel,
                        [sequelize.Sequelize.Op.lte]: newLevel
                    }
                },
                order: [['unlock_level', 'ASC']]
            });
        }

        /**
         * Lấy tất cả huy hiệu theo độ hiếm
         * @param {string} rarity - Độ hiếm (common, rare, epic, legendary)
         * @returns {Array} - Danh sách huy hiệu
         */
        static async getBadgesByRarity(rarity) {
            return await this.findAll({
                where: { rarity },
                order: [['unlock_level', 'ASC']]
            });
        }

        /**
         * Lấy thống kê huy hiệu theo độ hiếm
         * @returns {Array} - Thống kê
         */
        static async getBadgeRarityStats() {
            return await this.findAll({
                attributes: [
                    'rarity',
                    [sequelize.fn('COUNT', sequelize.col('badge_id')), 'count']
                ],
                group: ['rarity'],
                order: [
                    [sequelize.literal("CASE rarity WHEN 'common' THEN 1 WHEN 'rare' THEN 2 WHEN 'epic' THEN 3 WHEN 'legendary' THEN 4 END"), 'ASC']
                ]
            });
        }

        /**
         * Lấy achievement badges theo loại
         * @param {string} badgeType - Loại badge
         * @returns {Array} - Danh sách badges
         */
        static async getBadgesByType(badgeType) {
            return await this.findAll({
                where: {
                    badge_type: badgeType,
                    is_active: true
                },
                order: [['unlock_level', 'ASC'], ['rarity', 'ASC']]
            });
        }

        /**
         * Lấy event badges đang active
         * @returns {Array} - Danh sách event badges
         */
        static async getActiveEventBadges() {
            const now = new Date();
            return await this.findAll({
                where: {
                    badge_type: 'event',
                    is_active: true,
                    [sequelize.Sequelize.Op.or]: [
                        { valid_from: null },
                        { valid_from: { [sequelize.Sequelize.Op.lte]: now } }
                    ],
                    [sequelize.Sequelize.Op.or]: [
                        { valid_until: null },
                        { valid_until: { [sequelize.Sequelize.Op.gte]: now } }
                    ]
                },
                order: [['valid_until', 'ASC']]
            });
        }

        /**
         * Check xem badge có thể unlock không dựa trên criteria
         * @param {object} userStats - Stats của user
         * @param {number} userLevel - Level của user
         * @returns {boolean} - Có thể unlock không
         */
        canUnlock(userStats, userLevel) {
            // Check level requirement
            if (userLevel < this.unlock_level) {
                return false;
            }

            // Check if badge is active
            if (!this.is_active) {
                return false;
            }

            // Check event validity
            if (this.badge_type === 'event') {
                const now = new Date();
                if (this.valid_from && now < this.valid_from) return false;
                if (this.valid_until && now > this.valid_until) return false;
            }

            // Check criteria for achievement badges
            if (this.badge_type === 'achievement' && this.unlock_criteria) {
                const criteria = this.unlock_criteria;

                switch (criteria.type) {
                    case 'speed_answers':
                        const speedKey = `speed_answers_${criteria.max_time / 1000}s`;
                        return (userStats[speedKey] || 0) >= criteria.count;

                    case 'streak':
                        return (userStats.best_streak || 0) >= criteria.count;

                    case 'perfect_quiz':
                        return (userStats.perfect_scores || 0) >= criteria.count;

                    case 'quiz_completed':
                        return (userStats.total_quizzes_completed || 0) >= criteria.count;

                    case 'subject_mastery':
                        const subjectPoints = userStats.subject_points?.[criteria.subject] || 0;
                        return subjectPoints >= criteria.points;

                    case 'multi_subject':
                        const subjectPoints2 = userStats.subject_points || {};
                        const qualifiedSubjects = Object.values(subjectPoints2)
                            .filter(points => points >= criteria.min_points).length;
                        return qualifiedSubjects >= criteria.subjects;

                    case 'daily_streak':
                        return (userStats.login_streak || 0) >= criteria.days;

                    case 'total_points':
                        return (userStats.total_points || 0) >= criteria.points;

                    case 'first_correct_answer':
                        return (userStats.total_correct_answers || 0) >= 1;

                    default:
                        return false;
                }
            }

            return true;
        }
    }

    Badge.init(
        {
            badge_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            tier_name: {
                type: DataTypes.STRING(50),
                allowNull: false,
                comment: 'Tên tầng tương ứng'
            },
            badge_name: {
                type: DataTypes.STRING(100),
                allowNull: false,
                comment: 'Tên huy hiệu'
            },
            badge_description: {
                type: DataTypes.TEXT,
                allowNull: true,
                comment: 'Mô tả huy hiệu'
            },
            icon_url: {
                type: DataTypes.STRING(255),
                allowNull: true,
                comment: 'URL icon của huy hiệu'
            },
            unlock_level: {
                type: DataTypes.INTEGER,
                allowNull: false,
                comment: 'Level cần thiết để mở khóa'
            },
            rarity: {
                type: DataTypes.STRING(20),
                allowNull: false,
                defaultValue: 'common',
                validate: {
                    isIn: [['common', 'rare', 'epic', 'legendary']]
                },
                comment: 'Độ hiếm (common, rare, epic, legendary)'
            },
            badge_type: {
                type: DataTypes.STRING(20),
                allowNull: false,
                defaultValue: 'level',
                validate: {
                    isIn: [['level', 'achievement', 'event', 'milestone', 'social']]
                },
                comment: 'Loại badge (level, achievement, event, milestone, social)'
            },
            unlock_criteria: {
                type: DataTypes.JSONB,
                allowNull: true,
                defaultValue: {},
                comment: 'Điều kiện unlock dạng JSON'
            },
            is_active: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
                comment: 'Badge có đang active không'
            },
            event_type: {
                type: DataTypes.STRING(50),
                allowNull: true,
                comment: 'Loại sự kiện (nếu là event badge)'
            },
            valid_from: {
                type: DataTypes.DATE,
                allowNull: true,
                comment: 'Thời gian bắt đầu hiệu lực (cho event badges)'
            },
            valid_until: {
                type: DataTypes.DATE,
                allowNull: true,
                comment: 'Thời gian kết thúc hiệu lực (cho event badges)'
            }
        },
        {
            sequelize,
            modelName: 'Badge',
            tableName: 'Badges',
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at'
        }
    );

    return Badge;
};
