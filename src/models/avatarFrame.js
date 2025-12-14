'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class AvatarFrame extends Model {
        static associate(models) {
            // Associations
            AvatarFrame.hasMany(models.UserInventory, { 
                foreignKey: 'item_id',
                scope: { item_type: 'FRAME' },
                as: 'UserInventories' 
            });
            // Note: equipped_frame_id column removed from UserCustomization table
            // Frame system deprecated - users only equip avatars now
        }

        /**
         * Get all available frames
         * @returns {Array<AvatarFrame>}
         */
        static async getAvailableFrames() {
            return await AvatarFrame.findAll({
                where: { is_active: true },
                order: [['sort_order', 'ASC'], ['frame_id', 'ASC']]
            });
        }

        /**
         * Get frames by unlock type
         * @param {string} unlockType - Unlock type (DEFAULT, TIER, EGG, etc.)
         * @returns {Array<AvatarFrame>}
         */
        static async getFramesByUnlockType(unlockType) {
            return await AvatarFrame.findAll({
                where: { 
                    unlock_type: unlockType,
                    is_active: true 
                },
                order: [['sort_order', 'ASC']]
            });
        }

        /**
         * Get frames by tier
         * @param {string} tierName - Tier name (Wood, Bronze, Silver, etc.)
         * @returns {Array<AvatarFrame>}
         */
        static async getFramesByTier(tierName) {
            return await AvatarFrame.findAll({
                where: { 
                    tier_name: tierName,
                    is_active: true 
                },
                order: [['sort_order', 'ASC']]
            });
        }

        /**
         * Get default frame
         * @returns {AvatarFrame|null}
         */
        static async getDefaultFrame() {
            return await AvatarFrame.findOne({
                where: { 
                    is_default: true,
                    is_active: true 
                },
                order: [['sort_order', 'ASC']]
            });
        }

        /**
         * Get frames unlockable by user level
         * @param {number} userLevel - User's current level
         * @returns {Array<AvatarFrame>}
         */
        static async getUnlockableFramesByLevel(userLevel) {
            return await AvatarFrame.findAll({
                where: { 
                    unlock_type: 'TIER',
                    is_active: true,
                    unlock_condition: {
                        level_range: {
                            [sequelize.Sequelize.Op.contains]: [userLevel]
                        }
                    }
                },
                order: [['sort_order', 'ASC']]
            });
        }

        /**
         * Get frames from specific egg types
         * @param {Array<string>} eggTypes - Array of egg type names
         * @returns {Array<AvatarFrame>}
         */
        static async getFramesFromEggTypes(eggTypes) {
            return await AvatarFrame.findAll({
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
         * Check if frame can be unlocked by user
         * @param {number} userLevel - User's current level
         * @param {string} userTier - User's current tier
         * @returns {boolean}
         */
        canBeUnlockedBy(userLevel, userTier = null) {
            if (!this.is_active) return false;

            switch (this.unlock_type) {
                case 'DEFAULT':
                    return true;
                
                case 'TIER':
                    if (this.tier_name && userTier) {
                        return this.tier_name === userTier;
                    }
                    // Check by level range
                    const levelRange = this.unlock_condition?.level_range || [];
                    if (levelRange.length === 2) {
                        return userLevel >= levelRange[0] && userLevel <= levelRange[1];
                    }
                    return false;
                
                case 'EGG':
                case 'SHOP':
                case 'ACHIEVEMENT':
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
                
                case 'TIER':
                    if (this.tier_name) {
                        return `Mở khóa khi đạt tầng ${this.tier_name}`;
                    }
                    const levelRange = this.unlock_condition?.level_range || [];
                    if (levelRange.length === 2) {
                        return `Mở khóa từ cấp ${levelRange[0]} đến ${levelRange[1]}`;
                    }
                    return 'Mở khóa theo cấp độ';
                
                case 'EGG':
                    const eggTypes = this.unlock_condition?.egg_types || [];
                    return `Có thể nhận từ: ${eggTypes.join(', ')}`;
                
                case 'SHOP':
                    return 'Có thể mua trong cửa hàng';
                
                case 'ACHIEVEMENT':
                    return 'Mở khóa qua thành tích';
                
                case 'SPECIAL':
                    return 'Khung đặc biệt';
                
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
         * Get tier color
         * @returns {string}
         */
        getTierColor() {
            const tierColors = {
                'Wood': '#8b4513',      // Brown
                'Bronze': '#cd7f32',    // Bronze
                'Silver': '#c0c0c0',    // Silver
                'Gold': '#ffd700',      // Gold
                'Platinum': '#e5e4e2',  // Platinum
                'Onyx': '#353839',      // Dark Gray
                'Sapphire': '#0f52ba',  // Sapphire Blue
                'Ruby': '#e0115f',      // Ruby Red
                'Amethyst': '#9966cc',  // Amethyst Purple
                'Master': '#ff6347'     // Master Orange-Red
            };
            return tierColors[this.tier_name] || '#9ca3af';
        }

        /**
         * Get decomposition value in Kristal
         * @returns {number}
         */
        getDecompositionValue() {
            const decompositionValues = {
                'COMMON': 3,
                'UNCOMMON': 10,
                'RARE': 30,
                'EPIC': 100,
                'LEGENDARY': 300
            };
            return decompositionValues[this.rarity] || 0;
        }

        /**
         * Check if this is a premium frame
         * @returns {boolean}
         */
        isPremium() {
            return ['EPIC', 'LEGENDARY'].includes(this.rarity);
        }

        /**
         * Check if this is a tier frame
         * @returns {boolean}
         */
        isTierFrame() {
            return this.unlock_type === 'TIER' && this.tier_name !== null;
        }

        /**
         * Get formatted frame info
         * @returns {Object}
         */
        getFormattedInfo() {
            return {
                frame_id: this.frame_id,
                frame_name: this.frame_name,
                frame_code: this.frame_code,
                description: this.description,
                image_path: this.image_path,
                rarity: this.rarity,
                rarity_display: this.getRarityDisplayName(),
                rarity_color: this.getRarityColor(),
                unlock_type: this.unlock_type,
                unlock_description: this.getUnlockDescription(),
                tier_name: this.tier_name,
                tier_color: this.getTierColor(),
                decomposition_value: this.getDecompositionValue(),
                is_premium: this.isPremium(),
                is_tier_frame: this.isTierFrame(),
                is_default: this.is_default,
                sort_order: this.sort_order
            };
        }
    }

    AvatarFrame.init(
        {
            frame_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            frame_name: {
                type: DataTypes.STRING(50),
                allowNull: false,
                comment: 'Tên khung avatar'
            },
            frame_code: {
                type: DataTypes.STRING(20),
                allowNull: false,
                unique: true,
                comment: 'Mã định danh khung'
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true,
                comment: 'Mô tả khung avatar'
            },
            image_path: {
                type: DataTypes.STRING(255),
                allowNull: false,
                comment: 'Đường dẫn hình ảnh khung'
            },
            rarity: {
                type: DataTypes.STRING(20),
                allowNull: false,
                defaultValue: 'COMMON',
                validate: {
                    isIn: [['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY']]
                },
                comment: 'Độ hiếm của khung'
            },
            unlock_type: {
                type: DataTypes.STRING(30),
                allowNull: false,
                defaultValue: 'TIER',
                validate: {
                    isIn: [['DEFAULT', 'TIER', 'EGG', 'SHOP', 'ACHIEVEMENT', 'SPECIAL']]
                },
                comment: 'Cách thức mở khóa khung'
            },
            unlock_condition: {
                type: DataTypes.JSONB,
                allowNull: false,
                defaultValue: {},
                comment: 'Điều kiện mở khóa dạng JSON'
            },
            tier_name: {
                type: DataTypes.STRING(20),
                allowNull: true,
                comment: 'Tên tầng cấp độ'
            },
            is_default: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
                comment: 'Khung mặc định'
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
            modelName: 'AvatarFrame',
            tableName: 'AvatarFrames',
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
                    fields: ['tier_name']
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
                    fields: ['frame_code'],
                    unique: true
                }
            ]
        }
    );

    return AvatarFrame;
};
