'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Title extends Model {
        static associate(models) {
            // Association với UserTitle
            Title.hasMany(models.UserTitle, { 
                foreignKey: 'title_id',
                as: 'UserTitles'
            });
        }

        /**
         * Lấy danh hiệu phù hợp với level của user
         * @param {number} userLevel - Level của user
         * @returns {object|null} - Thông tin danh hiệu
         */
        static async getTitleByLevel(userLevel) {
            return await this.findOne({
                where: {
                    level_range_start: {
                        [sequelize.Sequelize.Op.lte]: userLevel
                    },
                    level_range_end: {
                        [sequelize.Sequelize.Op.gte]: userLevel
                    }
                }
            });
        }

        /**
         * Lấy tất cả danh hiệu theo thứ tự tầng
         * @returns {Array} - Danh sách danh hiệu
         */
        static async getAllTitlesOrdered() {
            return await this.findAll({
                order: [['level_range_start', 'ASC']]
            });
        }

        /**
         * Lấy danh hiệu theo tầng
         * @param {string} tierName - Tên tầng
         * @returns {object|null} - Thông tin danh hiệu
         */
        static async getTitleByTier(tierName) {
            return await this.findOne({
                where: { tier_name: tierName }
            });
        }

        /**
         * Kiểm tra xem user có đủ điều kiện mở khóa danh hiệu mới không
         * @param {number} oldLevel - Level cũ
         * @param {number} newLevel - Level mới
         * @returns {Array} - Danh sách danh hiệu mới được mở khóa
         */
        static async getNewUnlockedTitles(oldLevel, newLevel) {
            if (newLevel <= oldLevel) return [];

            return await this.findAll({
                where: {
                    level_range_start: {
                        [sequelize.Sequelize.Op.gt]: oldLevel,
                        [sequelize.Sequelize.Op.lte]: newLevel
                    }
                },
                order: [['level_range_start', 'ASC']]
            });
        }
    }

    Title.init(
        {
            title_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            tier_name: {
                type: DataTypes.STRING(50),
                allowNull: false,
                comment: 'Tên tầng (Wood, Bronze, etc.)'
            },
            title_name: {
                type: DataTypes.STRING(100),
                allowNull: false,
                comment: 'Tên danh hiệu (Tân Binh Gỗ, Chiến Binh Đồng, etc.)'
            },
            title_display: {
                type: DataTypes.STRING(100),
                allowNull: false,
                comment: 'Tên hiển thị bên cạnh tên người chơi'
            },
            level_range_start: {
                type: DataTypes.INTEGER,
                allowNull: false,
                comment: 'Level bắt đầu của tầng'
            },
            level_range_end: {
                type: DataTypes.INTEGER,
                allowNull: false,
                comment: 'Level kết thúc của tầng'
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true,
                comment: 'Mô tả danh hiệu'
            },
            icon_url: {
                type: DataTypes.STRING(255),
                allowNull: true,
                comment: 'URL icon của danh hiệu'
            },
            color: {
                type: DataTypes.STRING(20),
                allowNull: false,
                comment: 'Màu sắc của danh hiệu'
            }
        },
        {
            sequelize,
            modelName: 'Title',
            tableName: 'Titles',
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at'
        }
    );

    return Title;
};
