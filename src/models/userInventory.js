'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class UserInventory extends Model {
        static associate(models) {
            // Associations
            UserInventory.belongsTo(models.User, { 
                foreignKey: 'user_id', 
                as: 'User' 
            });
            
            // Polymorphic associations for different item types
            // NOTE: No scope needed - item_type is on UserInventory, not on Avatar/EmojiType tables
            UserInventory.belongsTo(models.Avatar, { 
                foreignKey: 'item_id',
                constraints: false,
                as: 'Avatar' 
            });
            
            UserInventory.belongsTo(models.EmojiType, { 
                foreignKey: 'item_id',
                constraints: false,
                as: 'EmojiType' 
            });
        }

        /**
         * Get user's inventory by item type
         * @param {number} userId - User ID
         * @param {string} itemType - Item type (AVATAR, EMOJI)
         * @returns {Array<UserInventory>}
         */
        static async getUserInventoryByType(userId, itemType) {
            const includeMap = {
                'AVATAR': { model: sequelize.models.Avatar, as: 'Avatar' },
                'EMOJI': { model: sequelize.models.EmojiType, as: 'EmojiType' }
            };

            return await UserInventory.findAll({
                where: { 
                    user_id: userId,
                    item_type: itemType 
                },
                include: [includeMap[itemType]],
                order: [['obtained_at', 'DESC']]
            });
        }

        /**
         * Get user's complete inventory
         * @param {number} userId - User ID
         * @returns {Object} Inventory grouped by item type
         */
        static async getUserCompleteInventory(userId) {
            const inventory = await UserInventory.findAll({
                where: { user_id: userId },
                include: [
                    { model: sequelize.models.Avatar, as: 'Avatar', required: false },
                    { model: sequelize.models.EmojiType, as: 'EmojiType', required: false }
                ],
                order: [['item_type', 'ASC'], ['obtained_at', 'DESC']]
            });

            // Group by item type
            const groupedInventory = {
                avatars: [],
                emojis: []
            };

            inventory.forEach(item => {
                switch (item.item_type) {
                    case 'AVATAR':
                        if (item.Avatar) {
                            groupedInventory.avatars.push({
                                ...item.toJSON(),
                                item_details: item.Avatar.getFormattedInfo()
                            });
                        }
                        break;
                    case 'EMOJI':
                        if (item.EmojiType) {
                            groupedInventory.emojis.push({
                                ...item.toJSON(),
                                item_details: item.EmojiType.getFormattedInfo()
                            });
                        }
                        break;
                }
            });

            return groupedInventory;
        }

        /**
         * Check if user owns specific item
         * @param {number} userId - User ID
         * @param {string} itemType - Item type
         * @param {number} itemId - Item ID
         * @returns {UserInventory|null}
         */
        static async checkUserOwnsItem(userId, itemType, itemId) {
            return await UserInventory.findOne({
                where: { 
                    user_id: userId,
                    item_type: itemType,
                    item_id: itemId 
                }
            });
        }

        /**
         * Add item to user inventory
         * @param {number} userId - User ID
         * @param {string} itemType - Item type
         * @param {number} itemId - Item ID
         * @param {string} obtainedFrom - How the item was obtained
         * @param {Object} metadata - Additional metadata
         * @returns {UserInventory}
         */
        static async addItemToInventory(userId, itemType, itemId, obtainedFrom = 'SHOP', metadata = {}) {
            // Check if item already exists
            const existingItem = await UserInventory.checkUserOwnsItem(userId, itemType, itemId);
            
            if (existingItem) {
                // If item exists, increase quantity
                existingItem.quantity += 1;
                existingItem.metadata = { ...existingItem.metadata, ...metadata };
                await existingItem.save();
                return existingItem;
            } else {
                // Create new inventory item
                return await UserInventory.create({
                    user_id: userId,
                    item_type: itemType,
                    item_id: itemId,
                    quantity: 1,
                    obtained_from: obtainedFrom,
                    metadata: metadata
                });
            }
        }

        /**
         * Remove item from user inventory
         * @param {number} userId - User ID
         * @param {string} itemType - Item type
         * @param {number} itemId - Item ID
         * @param {number} quantity - Quantity to remove (default: 1)
         * @returns {boolean} Success status
         */
        static async removeItemFromInventory(userId, itemType, itemId, quantity = 1) {
            const item = await UserInventory.checkUserOwnsItem(userId, itemType, itemId);
            
            if (!item) {
                return false; // Item not found
            }

            if (item.quantity <= quantity) {
                // Remove item completely
                await item.destroy();
            } else {
                // Decrease quantity
                item.quantity -= quantity;
                await item.save();
            }

            return true;
        }

        /**
         * Get user's equipped items
         * @param {number} userId - User ID
         * @returns {Array<UserInventory>}
         */
        static async getUserEquippedItems(userId) {
            return await UserInventory.findAll({
                where: { 
                    user_id: userId,
                    is_equipped: true 
                },
                include: [
                    { model: sequelize.models.Avatar, as: 'Avatar', required: false },
                    { model: sequelize.models.EmojiType, as: 'EmojiType', required: false }
                ]
            });
        }

        /**
         * Get inventory statistics
         * @param {number} userId - User ID
         * @returns {Object} Statistics
         */
        static async getInventoryStatistics(userId) {
            const stats = await UserInventory.findAll({
                where: { user_id: userId },
                attributes: [
                    'item_type',
                    [sequelize.fn('COUNT', sequelize.col('inventory_id')), 'total_items'],
                    [sequelize.fn('SUM', sequelize.col('quantity')), 'total_quantity']
                ],
                group: ['item_type'],
                raw: true
            });

            const formattedStats = {
                total_items: 0,
                total_quantity: 0,
                by_type: {
                    avatars: { count: 0, quantity: 0 },
                    emojis: { count: 0, quantity: 0 }
                }
            };

            stats.forEach(stat => {
                const count = parseInt(stat.total_items);
                const quantity = parseInt(stat.total_quantity);
                
                formattedStats.total_items += count;
                formattedStats.total_quantity += quantity;

                switch (stat.item_type) {
                    case 'AVATAR':
                        formattedStats.by_type.avatars = { count, quantity };
                        break;
                    case 'EMOJI':
                        formattedStats.by_type.emojis = { count, quantity };
                        break;
                }
            });

            return formattedStats;
        }

        /**
         * Get obtained from display name
         * @returns {string}
         */
        getObtainedFromDisplayName() {
            const obtainedFromNames = {
                'DEFAULT': 'Mặc Định',
                'LEVEL_UP': 'Lên Cấp',
                'EGG': 'Trứng Thưởng',
                'SHOP': 'Cửa Hàng',
                'ACHIEVEMENT': 'Thành Tích',
                'ADMIN': 'Quản Trị Viên',
                'TIER_UNLOCK': 'Mở Khóa Tầng',
                'SPECIAL': 'Đặc Biệt'
            };
            return obtainedFromNames[this.obtained_from] || 'Không Xác Định';
        }

        /**
         * Get formatted inventory item info
         * @returns {Object}
         */
        getFormattedInfo() {
            const baseInfo = {
                inventory_id: this.inventory_id,
                user_id: this.user_id,
                item_type: this.item_type,
                item_id: this.item_id,
                quantity: this.quantity,
                obtained_from: this.obtained_from,
                obtained_from_display: this.getObtainedFromDisplayName(),
                obtained_at: this.obtained_at,
                is_equipped: this.is_equipped,
                metadata: this.metadata
            };

            // Include item details if available
            if (this.EmojiType) {
                baseInfo.emoji = {
                    emoji_type_id: this.EmojiType.emoji_type_id,
                    emoji_name: this.EmojiType.emoji_name,
                    emoji_code: this.EmojiType.emoji_code,
                    emoji_image_path: this.EmojiType.emoji_image_path,
                    category: this.EmojiType.category,
                    rarity: this.EmojiType.rarity,
                    tier_requirement: this.EmojiType.tier_requirement
                };
            }

            if (this.Avatar) {
                baseInfo.avatar = {
                    avatar_id: this.Avatar.avatar_id,
                    name: this.Avatar.name,
                    image_path: this.Avatar.image_path,
                    rarity: this.Avatar.rarity,
                    tier_requirement: this.Avatar.tier_requirement
                };
            }

            return baseInfo;
        }
    }

    UserInventory.init(
        {
            inventory_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            user_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                comment: 'ID người dùng'
            },
            item_type: {
                type: DataTypes.STRING(20),
                allowNull: false,
                validate: {
                    isIn: [['AVATAR', 'EMOJI']]
                },
                comment: 'Loại vật phẩm'
            },
            item_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                comment: 'ID vật phẩm'
            },
            quantity: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 1,
                validate: {
                    min: 1
                },
                comment: 'Số lượng'
            },
            obtained_from: {
                type: DataTypes.STRING(30),
                allowNull: false,
                defaultValue: 'SHOP',
                validate: {
                    isIn: [['DEFAULT', 'LEVEL_UP', 'EGG', 'SHOP', 'ACHIEVEMENT', 'ADMIN', 'TIER_UNLOCK', 'SPECIAL']]
                },
                comment: 'Nguồn gốc vật phẩm'
            },
            obtained_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
                comment: 'Thời gian nhận được'
            },
            is_equipped: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
                comment: 'Đang trang bị'
            },
            metadata: {
                type: DataTypes.JSONB,
                allowNull: false,
                defaultValue: {},
                comment: 'Metadata bổ sung'
            }
        },
        {
            sequelize,
            modelName: 'UserInventory',
            tableName: 'UserInventory',
            timestamps: false, // Using custom obtained_at field
            indexes: [
                {
                    fields: ['user_id']
                },
                {
                    fields: ['item_type']
                },
                {
                    fields: ['is_equipped']
                },
                {
                    fields: ['user_id', 'item_type']
                },
                {
                    fields: ['obtained_from']
                },
                {
                    fields: ['user_id', 'item_type', 'item_id'],
                    unique: true
                }
            ]
        }
    );

    return UserInventory;
};
