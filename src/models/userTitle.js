'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class UserTitle extends Model {
        static associate(models) {
            // Association với User
            UserTitle.belongsTo(models.User, { 
                foreignKey: 'user_id',
                as: 'User'
            });

            // Association với Title
            UserTitle.belongsTo(models.Title, { 
                foreignKey: 'title_id',
                as: 'Title'
            });
        }

        /**
         * Lấy danh hiệu đang active của user
         * @param {number} userId - ID của user
         * @returns {object|null} - Thông tin danh hiệu active
         */
        static async getActiveTitle(userId) {
            return await this.findOne({
                where: { 
                    user_id: userId,
                    is_active: true 
                },
                include: [{
                    model: sequelize.models.Title,
                    as: 'Title'
                }]
            });
        }

        /**
         * Lấy tất cả danh hiệu của user
         * @param {number} userId - ID của user
         * @returns {Array} - Danh sách danh hiệu
         */
        static async getUserTitles(userId) {
            return await this.findAll({
                where: { user_id: userId },
                include: [{
                    model: sequelize.models.Title,
                    as: 'Title'
                }],
                order: [['unlocked_at', 'DESC']]
            });
        }

        /**
         * Đặt danh hiệu active cho user
         * @param {number} userId - ID của user
         * @param {number} titleId - ID của danh hiệu
         * @returns {boolean} - Thành công hay không
         */
        static async setActiveTitle(userId, titleId) {
            const transaction = await sequelize.transaction();
            
            try {
                // Kiểm tra user có sở hữu danh hiệu này không
                const userTitle = await this.findOne({
                    where: { 
                        user_id: userId,
                        title_id: titleId 
                    },
                    transaction
                });

                if (!userTitle) {
                    await transaction.rollback();
                    return false;
                }

                // Bỏ active tất cả danh hiệu khác
                await this.update(
                    { is_active: false },
                    { 
                        where: { 
                            user_id: userId,
                            is_active: true 
                        },
                        transaction
                    }
                );

                // Đặt danh hiệu mới thành active
                await userTitle.update(
                    { is_active: true },
                    { transaction }
                );

                await transaction.commit();
                return true;

            } catch (error) {
                await transaction.rollback();
                throw error;
            }
        }

        /**
         * Mở khóa danh hiệu mới cho user
         * @param {number} userId - ID của user
         * @param {number} titleId - ID của danh hiệu
         * @param {boolean} setAsActive - Có đặt làm active không
         * @returns {object} - Thông tin danh hiệu vừa mở khóa
         */
        static async unlockTitle(userId, titleId, setAsActive = false) {
            const transaction = await sequelize.transaction();
            
            try {
                // Kiểm tra đã có chưa
                const existing = await this.findOne({
                    where: { 
                        user_id: userId,
                        title_id: titleId 
                    },
                    transaction
                });

                if (existing) {
                    await transaction.rollback();
                    return existing;
                }

                // Nếu setAsActive = true, bỏ active các danh hiệu khác
                if (setAsActive) {
                    await this.update(
                        { is_active: false },
                        { 
                            where: { 
                                user_id: userId,
                                is_active: true 
                            },
                            transaction
                        }
                    );
                }

                // Tạo mới
                const newUserTitle = await this.create({
                    user_id: userId,
                    title_id: titleId,
                    is_active: setAsActive,
                    unlocked_at: new Date()
                }, { transaction });

                await transaction.commit();

                // Lấy thông tin đầy đủ
                return await this.findByPk(newUserTitle.user_title_id, {
                    include: [{
                        model: sequelize.models.Title,
                        as: 'Title'
                    }]
                });

            } catch (error) {
                await transaction.rollback();
                throw error;
            }
        }

        /**
         * Lấy thống kê danh hiệu của user
         * @param {number} userId - ID của user
         * @returns {object} - Thống kê
         */
        static async getUserTitleStats(userId) {
            const totalTitles = await sequelize.models.Title.count();
            const userTitles = await this.count({
                where: { user_id: userId }
            });

            const activeTitle = await this.getActiveTitle(userId);

            return {
                total_available: totalTitles,
                unlocked: userTitles,
                completion_rate: totalTitles > 0 ? ((userTitles / totalTitles) * 100).toFixed(2) : 0,
                active_title: activeTitle ? {
                    title_id: activeTitle.title_id,
                    title_name: activeTitle.Title.title_name,
                    title_display: activeTitle.Title.title_display,
                    tier_name: activeTitle.Title.tier_name,
                    color: activeTitle.Title.color
                } : null
            };
        }
    }

    UserTitle.init(
        {
            user_title_id: {
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
            title_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Titles',
                    key: 'title_id'
                }
            },
            unlocked_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
                comment: 'Thời điểm mở khóa danh hiệu'
            },
            is_active: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
                comment: 'Danh hiệu đang được sử dụng'
            }
        },
        {
            sequelize,
            modelName: 'UserTitle',
            tableName: 'UserTitles',
            timestamps: false,
            indexes: [
                {
                    unique: true,
                    fields: ['user_id', 'title_id']
                },
                {
                    fields: ['user_id', 'is_active'],
                    where: {
                        is_active: true
                    }
                }
            ]
        }
    );

    return UserTitle;
};
