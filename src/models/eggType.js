'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class EggType extends Model {
        static associate(models) {
            // Associations
            EggType.hasMany(models.EggReward, { 
                foreignKey: 'egg_type_id', 
                as: 'Rewards' 
            });
            EggType.hasMany(models.UserEgg, { 
                foreignKey: 'egg_type_id', 
                as: 'UserEggs' 
            });
            EggType.hasMany(models.EggDropRule, { 
                foreignKey: 'egg_type_id', 
                as: 'DropRules' 
            });
            EggType.hasMany(models.EggOpeningHistory, { 
                foreignKey: 'egg_type_id', 
                as: 'OpeningHistory' 
            });
        }

        /**
         * Get all available egg types
         * @returns {Array<EggType>}
         */
        static async getAvailableEggTypes() {
            return await EggType.findAll({
                where: { is_active: true },
                order: [['sort_order', 'ASC'], ['egg_type_id', 'ASC']]
            });
        }

        /**
         * Get purchasable egg types
         * @returns {Array<EggType>}
         */
        static async getPurchasableEggTypes() {
            return await EggType.findAll({
                where: { 
                    is_active: true,
                    is_purchasable: true
                },
                order: [['sort_order', 'ASC']]
            });
        }

        /**
         * Get egg types by rarity
         * @param {string} rarity - Rarity level
         * @returns {Array<EggType>}
         */
        static async getEggTypesByRarity(rarity) {
            return await EggType.findAll({
                where: { 
                    is_active: true,
                    rarity: rarity
                },
                order: [['sort_order', 'ASC']]
            });
        }

        /**
         * Get egg type with rewards
         * @param {number} eggTypeId - Egg type ID
         * @returns {EggType|null}
         */
        static async getEggTypeWithRewards(eggTypeId) {
            return await EggType.findByPk(eggTypeId, {
                include: [{
                    model: sequelize.models.EggReward,
                    as: 'Rewards',
                    where: { is_active: true },
                    required: false
                }]
            });
        }

        /**
         * Check if egg type is purchasable
         * @returns {boolean}
         */
        isPurchasable() {
            return this.is_active && this.is_purchasable;
        }

        /**
         * Get rarity color
         * @returns {string}
         */
        getRarityColor() {
            const rarityColors = {
                'COMMON': '#9CA3AF',      // Gray
                'UNCOMMON': '#10B981',    // Green
                'RARE': '#3B82F6',        // Blue
                'EPIC': '#8B5CF6',        // Purple
                'LEGENDARY': '#F59E0B',   // Orange
                'MYTHICAL': '#EF4444'     // Red
            };
            return rarityColors[this.rarity] || '#9CA3AF';
        }

        /**
         * Get rarity display name
         * @returns {string}
         */
        getRarityDisplayName() {
            const rarityNames = {
                'COMMON': 'Phổ Thông',
                'UNCOMMON': 'Không Phổ Biến',
                'RARE': 'Hiếm',
                'EPIC': 'Sử Thi',
                'LEGENDARY': 'Huyền Thoại',
                'MYTHICAL': 'Thần Thoại'
            };
            return rarityNames[this.rarity] || 'Không Xác Định';
        }

        /**
         * Get purchase price info
         * @returns {Object}
         */
        getPurchaseInfo() {
            return {
                can_purchase: this.isPurchasable(),
                syncoin_price: this.base_price_syncoin,
                currency_type: 'SYNCOIN',
                main_price: this.base_price_syncoin
            };
        }

        /**
         * Get formatted egg type info
         * @returns {Object}
         */
        getFormattedInfo() {
            return {
                egg_type_id: this.egg_type_id,
                egg_name: this.egg_name,
                egg_code: this.egg_code,
                description: this.description,
                image_path: this.image_path,
                rarity: this.rarity,
                rarity_display: this.getRarityDisplayName(),
                rarity_color: this.getRarityColor(),
                purchase_info: this.getPurchaseInfo(),
                is_active: this.is_active,
                sort_order: this.sort_order
            };
        }

        /**
         * Get egg type for shop display
         * @returns {Object}
         */
        getShopDisplayInfo() {
            const purchaseInfo = this.getPurchaseInfo();
            return {
                egg_type_id: this.egg_type_id,
                egg_name: this.egg_name,
                description: this.description,
                image_path: this.image_path,
                rarity: this.rarity,
                rarity_display: this.getRarityDisplayName(),
                rarity_color: this.getRarityColor(),
                can_purchase: purchaseInfo.can_purchase,
                price: purchaseInfo.main_price,
                currency: purchaseInfo.currency_type,
                syncoin_price: this.base_price_syncoin
            };
        }
    }

    EggType.init({
        egg_type_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        egg_name: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true
        },
        egg_code: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        image_path: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        rarity: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'COMMON',
            validate: {
                isIn: [['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHICAL']]
            }
        },
        base_price_syncoin: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        is_purchasable: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        sort_order: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
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
        modelName: 'EggType',
        tableName: 'EggTypes',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

    return EggType;
};
