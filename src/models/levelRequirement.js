'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class LevelRequirement extends Model {
        static associate(models) {
            // Không có association trực tiếp, đây là bảng lookup
        }

        /**
         * Tính level dựa trên total XP
         * @param {number} totalXP - Tổng XP của user
         * @returns {object} - Thông tin level hiện tại
         */
        static async calculateLevelFromXP(totalXP) {
            const levelData = await this.findAll({
                where: {
                    cumulative_xp: {
                        [sequelize.Sequelize.Op.lte]: totalXP
                    }
                },
                order: [['level', 'DESC']],
                limit: 1
            });

            if (levelData.length === 0) {
                // Nếu không tìm thấy, trả về level 1
                const level1 = await this.findOne({ where: { level: 1 } });
                return {
                    current_level: 1,
                    current_xp_in_level: totalXP,
                    xp_to_next_level: level1 ? level1.xp_required - totalXP : 100 - totalXP,
                    tier_info: level1 || { tier_name: 'Wood', tier_color: '#8B4513' }
                };
            }

            const currentLevel = levelData[0];
            const nextLevel = await this.findOne({ 
                where: { level: currentLevel.level + 1 } 
            });

            const currentXPInLevel = totalXP - currentLevel.cumulative_xp;
            const xpToNextLevel = nextLevel ? 
                nextLevel.cumulative_xp - totalXP : 
                0; // Đã đạt max level

            return {
                current_level: currentLevel.level,
                current_xp_in_level: currentXPInLevel,
                xp_to_next_level: xpToNextLevel,
                tier_info: {
                    tier_name: currentLevel.tier_name,
                    tier_color: currentLevel.tier_color
                },
                next_level_info: nextLevel ? {
                    level: nextLevel.level,
                    tier_name: nextLevel.tier_name,
                    tier_color: nextLevel.tier_color,
                    xp_required: nextLevel.xp_required
                } : null
            };
        }

        /**
         * Lấy thông tin tất cả các tầng
         * @returns {Array} - Danh sách các tầng
         */
        static async getAllTiers() {
            const tiers = await this.findAll({
                attributes: [
                    'tier_name',
                    'tier_color',
                    [sequelize.fn('MIN', sequelize.col('level')), 'min_level'],
                    [sequelize.fn('MAX', sequelize.col('level')), 'max_level'],
                    [sequelize.fn('MIN', sequelize.col('cumulative_xp')), 'min_xp'],
                    [sequelize.fn('MAX', sequelize.col('cumulative_xp')), 'max_xp']
                ],
                group: ['tier_name', 'tier_color'],
                order: [[sequelize.fn('MIN', sequelize.col('level')), 'ASC']]
            });

            return tiers;
        }

        /**
         * Lấy thông tin level trong một tầng cụ thể
         * @param {string} tierName - Tên tầng
         * @returns {Array} - Danh sách levels trong tầng
         */
        static async getLevelsByTier(tierName) {
            return await this.findAll({
                where: { tier_name: tierName },
                order: [['level', 'ASC']]
            });
        }

        /**
         * Kiểm tra xem có level up không khi thêm XP
         * @param {number} currentTotalXP - XP hiện tại
         * @param {number} addedXP - XP được thêm
         * @returns {object} - Thông tin level up
         */
        static async checkLevelUp(currentTotalXP, addedXP) {
            const oldLevelInfo = await this.calculateLevelFromXP(currentTotalXP);
            const newLevelInfo = await this.calculateLevelFromXP(currentTotalXP + addedXP);

            return {
                level_up: newLevelInfo.current_level > oldLevelInfo.current_level,
                old_level: oldLevelInfo.current_level,
                new_level: newLevelInfo.current_level,
                levels_gained: newLevelInfo.current_level - oldLevelInfo.current_level,
                old_tier: oldLevelInfo.tier_info.tier_name,
                new_tier: newLevelInfo.tier_info.tier_name,
                tier_up: newLevelInfo.tier_info.tier_name !== oldLevelInfo.tier_info.tier_name,
                new_level_info: newLevelInfo
            };
        }
    }

    LevelRequirement.init(
        {
            level: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                allowNull: false,
                comment: 'Cấp độ (1-120+)'
            },
            xp_required: {
                type: DataTypes.INTEGER,
                allowNull: false,
                comment: 'XP cần thiết để lên level này từ level trước'
            },
            cumulative_xp: {
                type: DataTypes.INTEGER,
                allowNull: false,
                comment: 'Tổng XP tích lũy cần thiết để đạt level này'
            },
            tier_name: {
                type: DataTypes.STRING(50),
                allowNull: false,
                comment: 'Tên tầng (Wood, Bronze, Silver, etc.)'
            },
            tier_color: {
                type: DataTypes.STRING(20),
                allowNull: false,
                comment: 'Màu sắc đại diện cho tầng'
            }
        },
        {
            sequelize,
            modelName: 'LevelRequirement',
            tableName: 'LevelRequirements',
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at'
        }
    );

    return LevelRequirement;
};
