'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class UserEmoji extends Model {
        static associate(models) {
            UserEmoji.belongsTo(models.User, {
                foreignKey: 'user_id',
                as: 'User'
            });
            UserEmoji.belongsTo(models.EmojiType, {
                foreignKey: 'emoji_type_id',
                as: 'EmojiType'
            });
        }

        // Static methods for user emoji management
        static async getUserEmojiCollection(userId, options = {}) {
            const whereClause = { user_id: userId };
            const includeClause = [{
                model: sequelize.models.EmojiType,
                as: 'EmojiType',
                attributes: ['emoji_name', 'emoji_code', 'emoji_image_path', 'category', 'rarity', 'tier_requirement'],
                where: {}
            }];

            // Apply filters based on options
            if (options.category) {
                includeClause[0].where.category = options.category;
            }
            if (options.rarity) {
                includeClause[0].where.rarity = options.rarity;
            }
            if (options.is_favorite !== undefined) {
                whereClause.is_favorite = options.is_favorite;
            }

            return await this.findAll({
                where: whereClause,
                include: includeClause,
                order: [
                    [{ model: sequelize.models.EmojiType, as: 'EmojiType' }, 'category', 'ASC'],
                    [{ model: sequelize.models.EmojiType, as: 'EmojiType' }, 'emoji_name', 'ASC']
                ]
            });
        }

        static async hasEmoji(userId, emojiTypeId) {
            const userEmoji = await this.findOne({
                where: {
                    user_id: userId,
                    emoji_type_id: emojiTypeId
                }
            });
            return userEmoji !== null;
        }

        static async unlockEmoji(userId, emojiTypeId, unlockMethod, metadata = {}) {
            try {
                const existingEmoji = await this.findOne({
                    where: {
                        user_id: userId,
                        emoji_type_id: emojiTypeId
                    }
                });

                if (existingEmoji) {
                    return {
                        success: false,
                        message: 'Emoji already unlocked',
                        data: existingEmoji
                    };
                }

                const newUserEmoji = await this.create({
                    user_id: userId,
                    emoji_type_id: emojiTypeId,
                    unlock_source: unlockMethod,
                    unlock_metadata: metadata
                });

                return {
                    success: true,
                    message: 'Emoji unlocked successfully',
                    data: newUserEmoji
                };
            } catch (error) {
                return {
                    success: false,
                    message: 'Failed to unlock emoji',
                    error: error.message
                };
            }
        }

        // Alias for unlockEmoji
        static async unlockEmojiForUser(userId, emojiTypeId, unlockMethod, metadata = {}) {
            return await this.unlockEmoji(userId, emojiTypeId, unlockMethod, metadata);
        }

        static async getUserEmojiStats(userId) {
            try {
                const stats = await this.findAll({
                    where: { user_id: userId },
                    attributes: [
                        [sequelize.fn('COUNT', sequelize.col('user_emoji_id')), 'total_unlocked'],
                        [sequelize.fn('SUM', sequelize.col('usage_count')), 'total_usage'],
                        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN is_favorite = true THEN 1 END')), 'favorites_count']
                    ],
                    raw: true
                });

                const categoryStats = await this.findAll({
                    where: { user_id: userId },
                    include: [{
                        model: sequelize.models.EmojiType,
                        as: 'EmojiType',
                        attributes: ['category']
                    }],
                    attributes: [
                        [sequelize.col('EmojiType.category'), 'category'],
                        [sequelize.fn('COUNT', sequelize.col('user_emoji_id')), 'count']
                    ],
                    group: ['EmojiType.category'],
                    raw: true
                });

                return {
                    total_unlocked: parseInt(stats[0]?.total_unlocked || 0),
                    total_usage: parseInt(stats[0]?.total_usage || 0),
                    favorites_count: parseInt(stats[0]?.favorites_count || 0),
                    by_category: categoryStats.reduce((acc, stat) => {
                        acc[stat.category] = parseInt(stat.count);
                        return acc;
                    }, {})
                };
            } catch (error) {
                console.error('Error getting user emoji stats:', error);
                return {
                    total_unlocked: 0,
                    total_usage: 0,
                    favorites_count: 0,
                    by_category: {}
                };
            }
        }

        static async setFavoriteEmoji(userId, emojiTypeId) {
            try {
                const userEmoji = await this.findOne({
                    where: {
                        user_id: userId,
                        emoji_type_id: emojiTypeId
                    }
                });

                if (!userEmoji) {
                    return {
                        success: false,
                        message: 'User does not have this emoji'
                    };
                }

                // First, unset all other favorite emojis for this user
                await this.update(
                    { is_favorite: false },
                    { where: { user_id: userId } }
                );

                // Set this emoji as favorite
                await userEmoji.update({ is_favorite: true });

                return {
                    success: true,
                    message: 'Favorite emoji updated successfully',
                    data: userEmoji
                };
            } catch (error) {
                return {
                    success: false,
                    message: 'Failed to set favorite emoji',
                    error: error.message
                };
            }
        }

        // Instance methods
        async incrementUsage() {
            try {
                await this.increment('usage_count', { by: 1 });
                await this.update({ last_used_at: new Date() });
                return {
                    success: true,
                    message: 'Usage count incremented successfully'
                };
            } catch (error) {
                return {
                    success: false,
                    message: 'Failed to increment usage count',
                    error: error.message
                };
            }
        }

        getUnlockMethodDescription() {
            const descriptions = {
                'TIER_PROGRESSION': 'Unlocked by reaching tier',
                'EGG_REWARD': 'Found in egg reward',
                'KRISTAL_PURCHASE': 'Purchased with Kristal',
                'SPECIAL_EVENT': 'Special event reward'
            };
            return descriptions[this.unlock_source] || 'Unknown unlock method';
        }
    }

    UserEmoji.init({
        user_emoji_id: {
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
        emoji_type_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'EmojiTypes',
                key: 'emoji_type_id'
            }
        },
        unlocked_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        unlock_source: {
            type: DataTypes.ENUM('TIER_PROGRESSION', 'EGG_DROP', 'ACHIEVEMENT', 'KRISTAL_PURCHASE', 'ADMIN_GRANT', 'SPECIAL_EVENT'),
            allowNull: false,
            defaultValue: 'TIER_PROGRESSION'
        },
        unlock_metadata: {
            type: DataTypes.JSONB,
            defaultValue: {}
        },
        is_favorite: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        usage_count: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        }
    }, {
        sequelize,
        modelName: 'UserEmoji',
        tableName: 'UserEmojis',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            {
                fields: ['user_id']
            },
            {
                fields: ['emoji_type_id']
            },
            {
                fields: ['user_id', 'emoji_type_id'],
                unique: true
            },
            {
                fields: ['unlock_source']
            },
            {
                fields: ['is_favorite']
            }
        ]
    });

    return UserEmoji;
};
