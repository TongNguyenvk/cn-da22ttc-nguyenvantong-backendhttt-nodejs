'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class EmojiUsageHistory extends Model {
        static associate(models) {
            EmojiUsageHistory.belongsTo(models.User, {
                foreignKey: 'user_id',
                as: 'User'
            });
            EmojiUsageHistory.belongsTo(models.EmojiType, {
                foreignKey: 'emoji_type_id',
                as: 'EmojiType'
            });
            EmojiUsageHistory.belongsTo(models.User, {
                foreignKey: 'target_user_id',
                as: 'TargetUser'
            });
        }

        // Static methods for emoji usage analytics
        static async recordEmojiUsage(userId, emojiTypeId, context, options = {}) {
            try {
                const usageRecord = await this.create({
                    user_id: userId,
                    emoji_type_id: emojiTypeId,
                    usage_context: context,
                    target_user_id: options.targetUserId || null,
                    quiz_session_id: options.quizSessionId || null,
                    metadata: options.metadata || {}
                });

                return {
                    success: true,
                    message: 'Emoji usage recorded successfully',
                    data: usageRecord
                };
            } catch (error) {
                return {
                    success: false,
                    message: 'Failed to record emoji usage',
                    error: error.message
                };
            }
        }

        static async getUserUsageHistory(userId, options = {}) {
            const queryOptions = {
                where: { user_id: userId },
                include: [{
                    model: sequelize.models.EmojiType,
                    as: 'EmojiType',
                    attributes: ['emoji_name', 'emoji_code', 'emoji_image_path', 'category', 'rarity']
                }],
                order: [['created_at', 'DESC']]
            };

            if (options.context) {
                queryOptions.where.usage_context = options.context;
            }

            if (options.limit) {
                queryOptions.limit = options.limit;
            }

            return await this.findAll(queryOptions);
        }

        static async getUsageStatsByContext(userId, timeframe = '7d') {
            const { Op } = require('sequelize');

            const now = new Date();
            let startDate;

            switch (timeframe) {
                case '1d':
                    startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    break;
                case '7d':
                    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case '30d':
                    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    break;
                default:
                    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            }

            const stats = await this.findAll({
                where: {
                    user_id: userId,
                    created_at: { [Op.gte]: startDate }
                },
                attributes: [
                    'usage_context',
                    [sequelize.fn('COUNT', sequelize.col('usage_id')), 'usage_count']
                ],
                group: ['usage_context'],
                order: [[sequelize.fn('COUNT', sequelize.col('usage_id')), 'DESC']]
            });

            return stats.reduce((acc, stat) => {
                acc[stat.usage_context] = parseInt(stat.dataValues.usage_count);
                return acc;
            }, {});
        }

        // Instance methods
        getContextDescription() {
            const contextDescriptions = {
                'PRE_QUIZ': 'Before quiz started',
                'DURING_QUIZ': 'During quiz session',
                'POST_QUIZ': 'After quiz completed',
                'PROFILE': 'On user profile',
                'SOCIAL_REACTION': 'Social interaction',
                'ACHIEVEMENT_CELEBRATION': 'Achievement celebration'
            };

            return contextDescriptions[this.usage_context] || 'Unknown context';
        }

        isSocialInteraction() {
            return this.target_user_id !== null;
        }
    }

    EmojiUsageHistory.init({
        usage_id: {
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
        usage_context: {
            type: DataTypes.ENUM('PRE_QUIZ', 'DURING_QUIZ', 'POST_QUIZ', 'PROFILE', 'SOCIAL_REACTION', 'ACHIEVEMENT_CELEBRATION'),
            allowNull: false
        },
        target_user_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'Users',
                key: 'user_id'
            }
        },
        quiz_session_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        metadata: {
            type: DataTypes.JSONB,
            defaultValue: {}
        }
    }, {
        sequelize,
        modelName: 'EmojiUsageHistory',
        tableName: 'EmojiUsageHistory',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: false,
        indexes: [
            {
                fields: ['user_id']
            },
            {
                fields: ['emoji_type_id']
            },
            {
                fields: ['usage_context']
            },
            {
                fields: ['created_at']
            }
        ]
    });

    return EmojiUsageHistory;
};
