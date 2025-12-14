'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class EmojiType extends Model {
        static associate(models) {
            EmojiType.hasMany(models.UserEmoji, {
                foreignKey: 'emoji_type_id',
                as: 'UserEmojis'
            });
            EmojiType.hasMany(models.EmojiUsageHistory, {
                foreignKey: 'emoji_type_id',
                as: 'UsageHistory'
            });
        }

        // Static methods for emoji management
        static async getEmojisByCategory(category) {
            return await this.findAll({
                where: { category: category },
                order: [['tier_requirement', 'ASC'], ['emoji_name', 'ASC']]
            });
        }

        static async getEmojisByTier(tierName) {
            return await this.findAll({
                where: { tier_requirement: tierName },
                order: [['category', 'ASC'], ['emoji_name', 'ASC']]
            });
        }

        static async getAvailableEmojisForUser(userTier) {
            const tierOrder = ['WOOD', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'ONYX', 'SAPPHIRE', 'RUBY', 'AMETHYST', 'MASTER'];
            const userTierIndex = tierOrder.indexOf(userTier.toUpperCase());

            if (userTierIndex === -1) return [];

            const availableTiers = tierOrder.slice(0, userTierIndex + 1);

            return await this.findAll({
                where: {
                    tier_requirement: availableTiers
                },
                order: [['tier_requirement', 'ASC'], ['category', 'ASC'], ['emoji_name', 'ASC']]
            });
        }

        static async getShopEmojis() {
            return await this.findAll({
                where: {
                    kristal_price: { [sequelize.Sequelize.Op.gt]: 0 }
                },
                order: [['kristal_price', 'ASC'], ['tier_requirement', 'ASC']]
            });
        }

        // Alias for getAvailableEmojisForUser
        static async getAvailableEmojis(userTier) {
            return await this.getAvailableEmojisForUser(userTier);
        }

        static async getEggDropEmojis(eggRarity) {
            // Map egg rarity to emoji rarity
            const rarityMapping = {
                'common': 'COMMON',
                'rare': 'RARE',
                'epic': 'EPIC',
                'legendary': 'LEGENDARY'
            };

            const emojiRarity = rarityMapping[eggRarity.toLowerCase()] || 'COMMON';

            return await this.findAll({
                where: {
                    unlock_method: 'EGG_DROP',
                    rarity: emojiRarity,
                    is_active: true
                },
                order: [['sort_order', 'ASC'], ['emoji_name', 'ASC']]
            });
        }

        static async getPurchasableEmojis(userTier) {
            const tierOrder = ['WOOD', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'ONYX', 'SAPPHIRE', 'RUBY', 'AMETHYST', 'MASTER'];
            const userTierIndex = tierOrder.indexOf(userTier.toUpperCase());

            if (userTierIndex === -1) return [];

            const availableTiers = tierOrder.slice(0, userTierIndex + 1);

            return await this.findAll({
                where: {
                    is_purchasable: true,
                    is_active: true,
                    tier_requirement: { [sequelize.Sequelize.Op.in]: availableTiers },
                    syncoin_price: { [sequelize.Sequelize.Op.gt]: 0 }
                },
                order: [['syncoin_price', 'ASC'], ['tier_requirement', 'ASC'], ['emoji_name', 'ASC']]
            });
        }

        // Instance methods
        isUnlockedByTier(userTier) {
            const tierOrder = ['WOOD', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'ONYX', 'SAPPHIRE', 'RUBY', 'AMETHYST', 'MASTER'];
            const userTierIndex = tierOrder.indexOf(userTier.toUpperCase());
            const requiredTierIndex = tierOrder.indexOf(this.tier_requirement);

            return userTierIndex >= requiredTierIndex;
        }

        getFormattedInfo() {
            return {
                emoji_type_id: this.emoji_type_id,
                name: this.emoji_name,
                code: this.emoji_code,
                image_path: this.emoji_image_path,
                category: this.category,
                tier_requirement: this.tier_requirement,
                rarity: this.rarity,
                unlock_method: this.unlock_method,
                syncoin_price: this.syncoin_price || 0,
                is_purchasable: this.is_purchasable,
                description: this.description
            };
        }

        formatEmojiForShop() {
            return {
                id: this.emoji_type_id,
                name: this.emoji_name,
                code: this.emoji_code,
                asset: this.emoji_image_path,  // Changed from image_url to asset for frontend compatibility
                category: this.category,
                tier_requirement: this.tier_requirement,
                rarity: this.rarity.toLowerCase(),
                price: this.syncoin_price || 0,
                currency: 'syncoin',
                unlock_method: this.unlock_method,
                description: this.description || `${this.emoji_name} emoji`,
                is_limited: false,
                discount_percentage: 0
            };
        }

        canBePurchasedWithKristal() {
            return this.kristal_price > 0;
        }

        canBeUnlockedFromEgg() {
            return this.egg_unlock_chance > 0;
        }

        /**
         * Check if emoji can be unlocked by user
         * @param {number} userLevel - User's current level
         * @param {string} userTier - User's current tier
         * @returns {boolean}
         */
        canBeUnlockedBy(userLevel, userTier = null) {
            if (!this.is_active) return false;

            const tierOrder = ['WOOD', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'ONYX', 'SAPPHIRE', 'RUBY', 'AMETHYST', 'MASTER'];
            
            switch (this.unlock_method) {
                case 'TIER_PROGRESSION':
                    if (userTier) {
                        const userTierIndex = tierOrder.indexOf(userTier.toUpperCase());
                        const requiredTierIndex = tierOrder.indexOf(this.tier_requirement);
                        return userTierIndex >= requiredTierIndex;
                    }
                    return false;
                
                case 'KRISTAL_PURCHASE':
                    return this.is_purchasable && this.kristal_price > 0;
                
                case 'EGG_DROP':
                    return false; // Egg drops are random, not level-based
                
                case 'ACHIEVEMENT':
                    return false; // Achievement unlocks are handled separately
                
                case 'SPECIAL_EVENT':
                    return false; // Special events are handled separately
                
                default:
                    return false;
            }
        }

        getRarityLevel() {
            const rarityLevels = {
                'Common': 1,
                'Uncommon': 2,
                'Rare': 3,
                'Epic': 4,
                'Legendary': 5
            };
            return rarityLevels[this.rarity] || 1;
        }
    }

    EmojiType.init({
        emoji_type_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        emoji_name: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        emoji_code: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true
        },
        emoji_image_path: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        category: {
            type: DataTypes.ENUM('BASIC', 'REACTION', 'EMOTION', 'SPECIAL', 'PREMIUM'),
            allowNull: false,
            defaultValue: 'BASIC'
        },
        tier_requirement: {
            type: DataTypes.ENUM('WOOD', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'ONYX', 'SAPPHIRE', 'RUBY', 'AMETHYST', 'MASTER'),
            allowNull: false,
            defaultValue: 'WOOD'
        },
        unlock_method: {
            type: DataTypes.ENUM('TIER_PROGRESSION', 'EGG_DROP', 'ACHIEVEMENT', 'KRISTAL_PURCHASE', 'SYNCOIN_PURCHASE', 'SPECIAL_EVENT'),
            allowNull: false,
            defaultValue: 'TIER_PROGRESSION'
        },
        kristal_price: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
            comment: 'DEPRECATED: Use syncoin_price instead'
        },
        syncoin_price: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
            comment: 'Price in SynCoin currency'
        },
        rarity: {
            type: DataTypes.ENUM('COMMON', 'RARE', 'EPIC', 'LEGENDARY'),
            allowNull: false,
            defaultValue: 'COMMON'
        },
        is_purchasable: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        sort_order: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'EmojiType',
        tableName: 'EmojiTypes',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            {
                fields: ['category']
            },
            {
                fields: ['tier_requirement']
            },
            {
                fields: ['unlock_method']
            },
            {
                fields: ['rarity']
            },
            {
                fields: ['is_active']
            }
        ]
    });

    return EmojiType;
};
