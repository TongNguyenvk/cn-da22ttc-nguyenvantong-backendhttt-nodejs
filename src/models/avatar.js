'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Avatar extends Model {
        static associate(models) {
            // Associations
            Avatar.hasMany(models.UserInventory, { 
                foreignKey: 'item_id',
                scope: { item_type: 'AVATAR' },
                as: 'UserInventories' 
            });
            Avatar.hasMany(models.UserCustomization, { 
                foreignKey: 'equipped_avatar_id', 
                as: 'EquippedByUsers' 
            });
        }

        /**
         * Get all available avatars
         * @returns {Array<Avatar>}
         */
        static async getAvailableAvatars() {
            return await Avatar.findAll({
                where: { is_active: true },
                order: [['sort_order', 'ASC'], ['avatar_id', 'ASC']]
            });
        }

        /**
         * Get avatars by unlock type
         * @param {string} unlockType - Unlock type (DEFAULT, LEVEL, EGG, etc.)
         * @returns {Array<Avatar>}
         */
        static async getAvatarsByUnlockType(unlockType) {
            return await Avatar.findAll({
                where: { 
                    unlock_type: unlockType,
                    is_active: true 
                },
                order: [['sort_order', 'ASC']]
            });
        }

        /**
         * Get avatars by rarity
         * @param {string} rarity - Rarity level
         * @returns {Array<Avatar>}
         */
        static async getAvatarsByRarity(rarity) {
            return await Avatar.findAll({
                where: { 
                    rarity: rarity,
                    is_active: true 
                },
                order: [['sort_order', 'ASC']]
            });
        }

        /**
         * Get default avatars
         * @returns {Array<Avatar>}
         */
        static async getDefaultAvatars() {
            return await Avatar.findAll({
                where: { 
                    is_default: true,
                    is_active: true 
                },
                order: [['sort_order', 'ASC']]
            });
        }

        /**
         * Get avatars unlockable by level
         * @param {number} userLevel - User's current level
         * @returns {Array<Avatar>}
         */
        static async getUnlockableAvatarsByLevel(userLevel) {
            return await Avatar.findAll({
                where: { 
                    unlock_type: 'LEVEL',
                    is_active: true,
                    unlock_condition: {
                        required_level: {
                            [sequelize.Sequelize.Op.lte]: userLevel
                        }
                    }
                },
                order: [['sort_order', 'ASC']]
            });
        }

        /**
         * Get avatars from specific egg types
         * @param {Array<string>} eggTypes - Array of egg type names
         * @returns {Array<Avatar>}
         */
        static async getAvatarsFromEggTypes(eggTypes) {
            return await Avatar.findAll({
                where: { 
                    unlock_type: 'EGG',
                    is_active: true,
                    [sequelize.Sequelize.Op.or]: eggTypes.map(eggType => ({
                        unlock_condition: {
                            egg_types: {
                                [sequelize.Sequelize.Op.contains]: [eggType]
                            }
                        }
                    }))
                },
                order: [['rarity', 'DESC'], ['sort_order', 'ASC']]
            });
        }

        /**
         * Check if avatar can be unlocked by user
         * @param {number} userLevel - User's current level
         * @param {Array<string>} userAchievements - User's achievements
         * @returns {boolean}
         */
        canBeUnlockedBy(userLevel, userAchievements = []) {
            if (!this.is_active) return false;

            switch (this.unlock_type) {
                case 'DEFAULT':
                    return true;
                
                case 'LEVEL':
                    const requiredLevel = this.unlock_condition?.required_level || 0;
                    return userLevel >= requiredLevel;
                
                case 'ACHIEVEMENT':
                    const requiredAchievements = this.unlock_condition?.required_achievements || [];
                    return requiredAchievements.every(achievement => 
                        userAchievements.includes(achievement)
                    );
                
                case 'EGG':
                case 'SHOP':
                case 'SPECIAL':
                default:
                    return false; // These require special unlock methods
            }
        }

        /**
         * Get unlock description
         * @returns {string}
         */
        getUnlockDescription() {
            switch (this.unlock_type) {
                case 'DEFAULT':
                    return 'Có sẵn từ đầu';
                
                case 'LEVEL':
                    const requiredLevel = this.unlock_condition?.required_level || 0;
                    return `Mở khóa ở cấp độ ${requiredLevel}`;
                
                case 'EGG':
                    const eggTypes = this.unlock_condition?.egg_types || [];
                    return `Có thể nhận từ: ${eggTypes.join(', ')}`;
                
                case 'SHOP':
                    return 'Có thể mua trong cửa hàng';
                
                case 'ACHIEVEMENT':
                    return 'Mở khóa qua thành tích';
                
                case 'SPECIAL':
                    return 'Avatar đặc biệt';
                
                default:
                    return 'Cách mở khóa không xác định';
            }
        }

        /**
         * Get rarity color
         * @returns {string}
         */
        getRarityColor() {
            const rarityColors = {
                'COMMON': '#9ca3af',      // Gray
                'UNCOMMON': '#10b981',    // Green
                'RARE': '#3b82f6',       // Blue
                'EPIC': '#8b5cf6',       // Purple
                'LEGENDARY': '#f59e0b'   // Orange/Gold
            };
            return rarityColors[this.rarity] || rarityColors['COMMON'];
        }

        /**
         * Get rarity display name
         * @returns {string}
         */
        getRarityDisplayName() {
            const rarityNames = {
                'COMMON': 'Phổ Biến',
                'UNCOMMON': 'Không Phổ Biến',
                'RARE': 'Hiếm',
                'EPIC': 'Sử Thi',
                'LEGENDARY': 'Huyền Thoại'
            };
            return rarityNames[this.rarity] || 'Không Xác Định';
        }

        /**
         * Get decomposition value in Kristal
         * @returns {number}
         */
        getDecompositionValue() {
            const decompositionValues = {
                'COMMON': 5,
                'UNCOMMON': 15,
                'RARE': 50,
                'EPIC': 150,
                'LEGENDARY': 500
            };
            return decompositionValues[this.rarity] || 0;
        }

        /**
         * Check if this is a premium avatar
         * @returns {boolean}
         */
        isPremium() {
            return ['EPIC', 'LEGENDARY'].includes(this.rarity);
        }

        /**
         * Get formatted avatar info
         * @returns {Object}
         */
        getFormattedInfo() {
            return {
                avatar_id: this.avatar_id,
                avatar_name: this.avatar_name,
                avatar_code: this.avatar_code,
                description: this.description,
                image_path: this.image_path,
                rarity: this.rarity,
                rarity_display: this.getRarityDisplayName(),
                rarity_color: this.getRarityColor(),
                unlock_type: this.unlock_type,
                unlock_description: this.getUnlockDescription(),
                decomposition_value: this.getDecompositionValue(),
                is_premium: this.isPremium(),
                is_default: this.is_default,
                sort_order: this.sort_order
            };
        }

        /**
         * Format avatar for shop display
         * @returns {Object}
         */
        formatAvatarForShop() {
            return {
                id: this.avatar_code,
                name: this.avatar_name,
                price: this.getShopPrice(),
                asset: this.image_path,
                rarity: this.rarity.toLowerCase(),
                description: this.description
            };
        }

        /**
         * Get shop price for avatar
         * @returns {number}
         */
        getShopPrice() {
            const basePrices = {
                'COMMON': 180,
                'UNCOMMON': 220,
                'RARE': 300,
                'EPIC': 400,
                'LEGENDARY': 500
            };
            return basePrices[this.rarity] || 200;
        }

        /**
         * Get avatar reward for specific level
         * @param {number} level - Level to check
         * @returns {Object|null}
         */
        static async getAvatarRewardForLevel(level) {
            const avatar = await Avatar.findOne({
                where: { 
                    unlock_type: 'LEVEL',
                    unlock_condition: {
                        required_level: level
                    },
                    is_active: true
                }
            });

            if (!avatar) return null;

            return {
                level: level,
                avatar_code: avatar.avatar_code,
                avatar_name: avatar.avatar_name,
                avatar_path: avatar.image_path,
                description: avatar.description
            };
        }

        /**
         * Get avatars available for shop
         * @returns {Array<Object>}
         */
        static async getShopAvatars() {
            const { Op } = require('sequelize');
            const avatars = await Avatar.findAll({
                where: { 
                    unlock_type: {
                        [Op.in]: ['SHOP', 'LEVEL', 'EGG']
                    },
                    is_active: true
                },
                order: [['sort_order', 'ASC']]
            });

            return avatars.map(avatar => avatar.formatAvatarForShop());
        }
    }

    Avatar.init(
        {
            avatar_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            avatar_name: {
                type: DataTypes.STRING(50),
                allowNull: false,
                comment: 'Tên avatar'
            },
            avatar_code: {
                type: DataTypes.STRING(20),
                allowNull: false,
                unique: true,
                comment: 'Mã định danh avatar'
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true,
                comment: 'Mô tả avatar'
            },
            image_path: {
                type: DataTypes.STRING(255),
                allowNull: false,
                comment: 'Đường dẫn hình ảnh avatar'
            },
            rarity: {
                type: DataTypes.STRING(20),
                allowNull: false,
                defaultValue: 'COMMON',
                validate: {
                    isIn: [['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY']]
                },
                comment: 'Độ hiếm của avatar'
            },
            unlock_type: {
                type: DataTypes.STRING(30),
                allowNull: false,
                defaultValue: 'LEVEL',
                validate: {
                    isIn: [['DEFAULT', 'LEVEL', 'EGG', 'SHOP', 'ACHIEVEMENT', 'SPECIAL']]
                },
                comment: 'Cách thức mở khóa avatar'
            },
            unlock_condition: {
                type: DataTypes.JSONB,
                allowNull: false,
                defaultValue: {},
                comment: 'Điều kiện mở khóa dạng JSON'
            },
            is_default: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
                comment: 'Avatar mặc định'
            },
            is_active: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
                comment: 'Trạng thái hoạt động'
            },
            sort_order: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
                comment: 'Thứ tự sắp xếp'
            }
        },
        {
            sequelize,
            modelName: 'Avatar',
            tableName: 'Avatars',
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            indexes: [
                {
                    fields: ['rarity']
                },
                {
                    fields: ['unlock_type']
                },
                {
                    fields: ['is_active']
                },
                {
                    fields: ['is_default']
                },
                {
                    fields: ['sort_order']
                },
                {
                    fields: ['avatar_code'],
                    unique: true
                }
            ]
        }
    );

    return Avatar;
};
