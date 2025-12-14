'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class SocialInteraction extends Model {
        static associate(models) {
            SocialInteraction.belongsTo(models.User, {
                foreignKey: 'sender_user_id',
                as: 'Sender'
            });
            SocialInteraction.belongsTo(models.User, {
                foreignKey: 'receiver_user_id',
                as: 'Receiver'
            });
            SocialInteraction.belongsTo(models.EmojiType, {
                foreignKey: 'emoji_type_id',
                as: 'EmojiType'
            });
        }

        // Static methods for social interaction management
        static async sendEmojiReaction(senderUserId, receiverUserId, emojiTypeId, context, metadata = {}) {
            try {
                const interaction = await this.create({
                    sender_user_id: senderUserId,
                    receiver_user_id: receiverUserId,
                    emoji_type_id: emojiTypeId,
                    interaction_type: 'EMOJI_REACTION',
                    interaction_context: context,
                    interaction_metadata: metadata
                });

                return {
                    success: true,
                    message: 'Emoji reaction sent successfully',
                    data: interaction
                };
            } catch (error) {
                return {
                    success: false,
                    message: 'Failed to send emoji reaction',
                    error: error.message
                };
            }
        }

        static async recordInteraction(fromUserId, toUserId, interactionType, options = {}) {
            try {
                const interaction = await this.create({
                    sender_user_id: fromUserId,
                    receiver_user_id: toUserId,
                    emoji_type_id: options.emojiTypeId || null,
                    interaction_type: interactionType,
                    interaction_context: options.context || 'GENERAL',
                    interaction_metadata: options.metadata || {}
                });

                return {
                    success: true,
                    message: 'Social interaction recorded successfully',
                    data: interaction
                };
            } catch (error) {
                return {
                    success: false,
                    message: 'Failed to record social interaction',
                    error: error.message
                };
            }
        }

        static async getUserSocialStats(userId, timeframe = '7d') {
            try {
                const timeframeDate = new Date();
                timeframeDate.setDate(timeframeDate.getDate() - parseInt(timeframe.replace('d', '')));

                const sentStats = await this.findAll({
                    where: {
                        sender_user_id: userId,
                        created_at: { [sequelize.Sequelize.Op.gte]: timeframeDate }
                    },
                    attributes: [
                        'interaction_type',
                        [sequelize.fn('COUNT', sequelize.col('interaction_id')), 'count']
                    ],
                    group: ['interaction_type'],
                    raw: true
                });

                const receivedStats = await this.findAll({
                    where: {
                        receiver_user_id: userId,
                        created_at: { [sequelize.Sequelize.Op.gte]: timeframeDate }
                    },
                    attributes: [
                        'interaction_type',
                        [sequelize.fn('COUNT', sequelize.col('interaction_id')), 'count']
                    ],
                    group: ['interaction_type'],
                    raw: true
                });

                return {
                    sent: sentStats.reduce((acc, stat) => {
                        acc[stat.interaction_type] = parseInt(stat.count);
                        return acc;
                    }, {}),
                    received: receivedStats.reduce((acc, stat) => {
                        acc[stat.interaction_type] = parseInt(stat.count);
                        return acc;
                    }, {})
                };
            } catch (error) {
                console.error('Error getting user social stats:', error);
                return { sent: {}, received: {} };
            }
        }

        static async getUserInteractionHistory(userId, options = {}) {
            try {
                const { type = 'both', limit = 20 } = options;
                let whereClause = {};

                if (type === 'sent') {
                    whereClause.sender_user_id = userId;
                } else if (type === 'received') {
                    whereClause.receiver_user_id = userId;
                } else {
                    // both
                    whereClause = {
                        [sequelize.Sequelize.Op.or]: [
                            { sender_user_id: userId },
                            { receiver_user_id: userId }
                        ]
                    };
                }

                const interactions = await this.findAll({
                    where: whereClause,
                    include: [{
                        model: sequelize.models.User,
                        as: 'Sender',
                        attributes: ['user_id', 'username', 'full_name', 'avatar_url']
                    }, {
                        model: sequelize.models.User,
                        as: 'Receiver',
                        attributes: ['user_id', 'username', 'full_name', 'avatar_url']
                    }, {
                        model: sequelize.models.EmojiType,
                        as: 'EmojiType',
                        attributes: ['emoji_name', 'emoji_code', 'emoji_image_path'],
                        required: false
                    }],
                    order: [['created_at', 'DESC']],
                    limit: limit
                });

                return interactions.map(interaction => ({
                    interaction_id: interaction.interaction_id,
                    interaction_type: interaction.interaction_type,
                    interaction_context: interaction.interaction_context,
                    sender: {
                        user_id: interaction.Sender.user_id,
                        username: interaction.Sender.username,
                        full_name: interaction.Sender.full_name,
                        avatar_url: interaction.Sender.avatar_url
                    },
                    receiver: {
                        user_id: interaction.Receiver.user_id,
                        username: interaction.Receiver.username,
                        full_name: interaction.Receiver.full_name,
                        avatar_url: interaction.Receiver.avatar_url
                    },
                    emoji: interaction.EmojiType ? {
                        name: interaction.EmojiType.emoji_name,
                        code: interaction.EmojiType.emoji_code,
                        image: interaction.EmojiType.emoji_image_path
                    } : null,
                    metadata: interaction.interaction_metadata,
                    created_at: interaction.created_at
                }));
            } catch (error) {
                console.error('Error getting user interaction history:', error);
                return [];
            }
        }

        // Instance methods
        getInteractionDescription() {
            const descriptions = {
                'EMOJI_REACTION': 'Emoji reaction',
                'ENCOURAGEMENT': 'Encouragement message',
                'ACHIEVEMENT_CELEBRATION': 'Achievement celebration'
            };
            return descriptions[this.interaction_type] || 'Unknown interaction';
        }
    }

    SocialInteraction.init({
        interaction_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        sender_user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'Users',
                key: 'user_id'
            }
        },
        receiver_user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'Users',
                key: 'user_id'
            }
        },
        emoji_type_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'EmojiTypes',
                key: 'emoji_type_id'
            }
        },
        interaction_type: {
            type: DataTypes.ENUM('EMOJI_REACTION', 'ENCOURAGEMENT', 'ACHIEVEMENT_CELEBRATION'),
            allowNull: false
        },
        interaction_context: {
            type: DataTypes.ENUM('PRE_QUIZ', 'DURING_QUIZ', 'POST_QUIZ', 'PROFILE', 'ACHIEVEMENT', 'GENERAL'),
            allowNull: false
        },
        interaction_metadata: {
            type: DataTypes.JSONB,
            defaultValue: {}
        }
    }, {
        sequelize,
        modelName: 'SocialInteraction',
        tableName: 'SocialInteractions',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            {
                fields: ['sender_user_id']
            },
            {
                fields: ['receiver_user_id']
            },
            {
                fields: ['interaction_type']
            },
            {
                fields: ['created_at']
            }
        ]
    });

    return SocialInteraction;
};
