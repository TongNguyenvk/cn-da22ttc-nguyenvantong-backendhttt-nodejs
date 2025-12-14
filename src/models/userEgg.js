'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class UserEgg extends Model {
        static associate(models) {
            // Associations
            UserEgg.belongsTo(models.User, { 
                foreignKey: 'user_id', 
                as: 'User' 
            });
            UserEgg.belongsTo(models.EggType, { 
                foreignKey: 'egg_type_id', 
                as: 'EggType' 
            });
        }

        /**
         * Get user's egg inventory
         * @param {number} userId - User ID
         * @param {boolean} unopenedOnly - Get only unopened eggs
         * @returns {Array<UserEgg>}
         */
        static async getUserEggInventory(userId, unopenedOnly = true) {
            const whereClause = { user_id: userId };
            if (unopenedOnly) {
                whereClause.is_opened = false;
            }

            return await UserEgg.findAll({
                where: whereClause,
                include: [{
                    model: sequelize.models.EggType,
                    as: 'EggType',
                    attributes: ['egg_name', 'egg_code', 'image_path', 'rarity', 'description']
                }],
                order: [
                    [{ model: sequelize.models.EggType, as: 'EggType' }, 'rarity', 'DESC'],
                    ['obtained_at', 'DESC']
                ]
            });
        }

        /**
         * Get user's egg inventory grouped by type
         * @param {number} userId - User ID
         * @returns {Array<Object>}
         */
        static async getUserEggInventoryGrouped(userId) {
            const eggs = await UserEgg.findAll({
                where: { 
                    user_id: userId,
                    is_opened: false
                },
                include: [{
                    model: sequelize.models.EggType,
                    as: 'EggType'
                }],
                order: [
                    [{ model: sequelize.models.EggType, as: 'EggType' }, 'sort_order', 'ASC']
                ]
            });

            // Group by egg type
            const grouped = {};
            eggs.forEach(egg => {
                const eggTypeId = egg.egg_type_id;
                if (!grouped[eggTypeId]) {
                    grouped[eggTypeId] = {
                        egg_type: egg.EggType.getFormattedInfo(),
                        quantity: 0,
                        eggs: [],
                        latest_obtained: null
                    };
                }
                grouped[eggTypeId].quantity += egg.quantity;
                grouped[eggTypeId].eggs.push(egg);
                
                if (!grouped[eggTypeId].latest_obtained || 
                    egg.obtained_at > grouped[eggTypeId].latest_obtained) {
                    grouped[eggTypeId].latest_obtained = egg.obtained_at;
                }
            });

            return Object.values(grouped);
        }

        /**
         * Add egg to user inventory
         * @param {number} userId - User ID
         * @param {number} eggTypeId - Egg type ID
         * @param {string} obtainedFrom - Source of egg
         * @param {number} quantity - Quantity to add
         * @returns {UserEgg}
         */
        static async addEggToInventory(userId, eggTypeId, obtainedFrom = 'UNKNOWN', quantity = 1) {
            // Check if user already has this egg type (unopened)
            const existingEgg = await UserEgg.findOne({
                where: {
                    user_id: userId,
                    egg_type_id: eggTypeId,
                    is_opened: false
                }
            });

            if (existingEgg) {
                // Update quantity
                existingEgg.quantity += quantity;
                existingEgg.obtained_at = new Date();
                await existingEgg.save();
                return existingEgg;
            } else {
                // Create new egg entry
                return await UserEgg.create({
                    user_id: userId,
                    egg_type_id: eggTypeId,
                    quantity: quantity,
                    obtained_from: obtainedFrom,
                    obtained_at: new Date()
                });
            }
        }

        /**
         * Open egg and mark as opened
         * @returns {boolean}
         */
        async openEgg() {
            if (this.is_opened || this.quantity <= 0) {
                return false;
            }

            if (this.quantity > 1) {
                // Reduce quantity by 1
                this.quantity -= 1;
                await this.save();
                
                // Create a new record for the opened egg
                await UserEgg.create({
                    user_id: this.user_id,
                    egg_type_id: this.egg_type_id,
                    quantity: 1,
                    obtained_from: this.obtained_from,
                    obtained_at: this.obtained_at,
                    is_opened: true,
                    opened_at: new Date()
                });
            } else {
                // Mark this egg as opened
                this.is_opened = true;
                this.opened_at = new Date();
                await this.save();
            }

            return true;
        }

        /**
         * Get obtained from display name
         * @returns {string}
         */
        getObtainedFromDisplayName() {
            const obtainedFromNames = {
                'QUIZ_COMPLETION': 'Hoàn Thành Quiz',
                'STREAK_BONUS': 'Chuỗi Thắng',
                'PERFECT_SCORE': 'Điểm Tuyệt Đối',
                'LEVEL_UP': 'Lên Cấp',
                'SHOP_PURCHASE': 'Mua Từ Cửa Hàng',
                'DAILY_LOGIN': 'Đăng Nhập Hàng Ngày',
                'ACHIEVEMENT': 'Thành Tích',
                'ADMIN': 'Quản Trị Viên',
                'UNKNOWN': 'Không Xác Định'
            };
            return obtainedFromNames[this.obtained_from] || 'Không Xác Định';
        }

        /**
         * Check if egg can be opened
         * @returns {boolean}
         */
        canBeOpened() {
            return !this.is_opened && this.quantity > 0;
        }

        /**
         * Get formatted egg info
         * @returns {Object}
         */
        getFormattedInfo() {
            return {
                user_egg_id: this.user_egg_id,
                user_id: this.user_id,
                egg_type_id: this.egg_type_id,
                quantity: this.quantity,
                obtained_from: this.obtained_from,
                obtained_from_display: this.getObtainedFromDisplayName(),
                obtained_at: this.obtained_at,
                is_opened: this.is_opened,
                opened_at: this.opened_at,
                can_be_opened: this.canBeOpened(),
                created_at: this.created_at
            };
        }
    }

    UserEgg.init({
        user_egg_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'Users',
                key: 'user_id'
            }
        },
        egg_type_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'EggTypes',
                key: 'egg_type_id'
            }
        },
        quantity: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1
        },
        obtained_from: {
            type: DataTypes.STRING(50),
            allowNull: false,
            defaultValue: 'UNKNOWN',
            validate: {
                isIn: [['QUIZ_COMPLETION', 'STREAK_BONUS', 'PERFECT_SCORE', 'LEVEL_UP', 'SHOP_PURCHASE', 'DAILY_LOGIN', 'ACHIEVEMENT', 'ADMIN', 'UNKNOWN']]
            }
        },
        obtained_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        is_opened: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        opened_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        updated_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        sequelize,
        modelName: 'UserEgg',
        tableName: 'UserEggs',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

    return UserEgg;
};
