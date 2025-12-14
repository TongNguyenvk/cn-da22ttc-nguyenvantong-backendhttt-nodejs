'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class UserSocialStats extends Model {
        static associate(models) {
            UserSocialStats.belongsTo(models.User, {
                foreignKey: 'user_id',
                as: 'User'
            });
            UserSocialStats.belongsTo(models.EmojiType, {
                foreignKey: 'favorite_emoji_id',
                as: 'FavoriteEmoji'
            });
        }

        // Static methods
        static async initializeUserStats(userId) {
            try {
                const existingStats = await this.findOne({
                    where: { user_id: userId }
                });

                if (existingStats) {
                    return {
                        success: true,
                        message: 'User social stats already exist',
                        data: existingStats
                    };
                }

                const newStats = await this.create({
                    user_id: userId,
                    total_emojis_unlocked: 0,
                    total_emoji_usage: 0,
                    positive_interactions_sent: 0,
                    positive_interactions_received: 0,
                    social_reputation_score: 0.00
                });

                return {
                    success: true,
                    message: 'User social stats initialized successfully',
                    data: newStats
                };
            } catch (error) {
                return {
                    success: false,
                    message: 'Failed to initialize user social stats',
                    error: error.message
                };
            }
        }

        static async updateEmojiUsage(userId, incrementBy = 1) {
            try {
                const [stats, created] = await this.findOrCreate({
                    where: { user_id: userId },
                    defaults: {
                        user_id: userId,
                        total_emojis_unlocked: 0,
                        total_emoji_usage: 0,
                        positive_interactions_sent: 0,
                        positive_interactions_received: 0,
                        social_reputation_score: 0.00
                    }
                });

                await stats.increment('total_emoji_usage', { by: incrementBy });
                await stats.update({ last_social_activity: new Date() });

                return {
                    success: true,
                    message: 'Emoji usage updated successfully'
                };
            } catch (error) {
                return {
                    success: false,
                    message: 'Failed to update emoji usage',
                    error: error.message
                };
            }
        }

        static async updateSocialInteractions(userId, type, incrementBy = 1) {
            try {
                const [stats, created] = await this.findOrCreate({
                    where: { user_id: userId },
                    defaults: {
                        user_id: userId,
                        total_emojis_unlocked: 0,
                        total_emoji_usage: 0,
                        positive_interactions_sent: 0,
                        positive_interactions_received: 0,
                        social_reputation_score: 0.00
                    }
                });

                const field = type === 'sent' ? 'positive_interactions_sent' : 'positive_interactions_received';
                await stats.increment(field, { by: incrementBy });
                await stats.update({ last_social_activity: new Date() });

                // Update reputation score based on interactions
                const reputationBonus = type === 'received' ? 0.1 : 0.05;
                const newScore = Math.min(100, stats.social_reputation_score + reputationBonus);
                await stats.update({ social_reputation_score: newScore });

                return {
                    success: true,
                    message: 'Social interactions updated successfully'
                };
            } catch (error) {
                return {
                    success: false,
                    message: 'Failed to update social interactions',
                    error: error.message
                };
            }
        }

        static async getUserStats(userId) {
            try {
                const stats = await this.findOne({
                    where: { user_id: userId },
                    include: [{
                        model: sequelize.models.EmojiType,
                        as: 'FavoriteEmoji',
                        attributes: ['emoji_name', 'emoji_code', 'emoji_image_path']
                    }]
                });

                if (!stats) {
                    return {
                        user_id: userId,
                        total_emojis_unlocked: 0,
                        total_emoji_usage: 0,
                        positive_interactions_sent: 0,
                        positive_interactions_received: 0,
                        social_reputation_score: 0.00,
                        social_level: 'Social Newcomer',
                        favorite_emoji: null,
                        most_used_context: null,
                        last_social_activity: null
                    };
                }

                return {
                    ...stats.toJSON(),
                    social_level: stats.getSocialLevel()
                };
            } catch (error) {
                console.error('Error getting user social stats:', error);
                return null;
            }
        }

        static async getTopUsers(criteria = 'reputation', limit = 10) {
            try {
                let orderField;
                let orderDirection = 'DESC';

                switch (criteria.toLowerCase()) {
                    case 'reputation':
                        orderField = 'social_reputation_score';
                        break;
                    case 'interactions_sent':
                        orderField = 'positive_interactions_sent';
                        break;
                    case 'interactions_received':
                        orderField = 'positive_interactions_received';
                        break;
                    case 'emoji_usage':
                        orderField = 'total_emoji_usage';
                        break;
                    case 'emojis_unlocked':
                        orderField = 'total_emojis_unlocked';
                        break;
                    default:
                        orderField = 'social_reputation_score';
                }

                const topUsers = await this.findAll({
                    include: [{
                        model: sequelize.models.User,
                        as: 'User',
                        attributes: ['user_id', 'username', 'full_name', 'avatar_url']
                    }, {
                        model: sequelize.models.EmojiType,
                        as: 'FavoriteEmoji',
                        attributes: ['emoji_name', 'emoji_code', 'emoji_image_path'],
                        required: false
                    }],
                    order: [[orderField, orderDirection]],
                    limit: limit
                });

                return topUsers.map((user, index) => ({
                    rank: index + 1,
                    user_id: user.user_id,
                    username: user.User?.username,
                    full_name: user.User?.full_name,
                    avatar_url: user.User?.avatar_url,
                    social_reputation_score: parseFloat(user.social_reputation_score),
                    total_emojis_unlocked: user.total_emojis_unlocked,
                    total_emoji_usage: user.total_emoji_usage,
                    positive_interactions_sent: user.positive_interactions_sent,
                    positive_interactions_received: user.positive_interactions_received,
                    social_level: user.getSocialLevel(),
                    favorite_emoji: user.FavoriteEmoji ? {
                        name: user.FavoriteEmoji.emoji_name,
                        code: user.FavoriteEmoji.emoji_code,
                        image: user.FavoriteEmoji.emoji_image_path
                    } : null,
                    last_social_activity: user.last_social_activity
                }));
            } catch (error) {
                console.error('Error getting top users:', error);
                return [];
            }
        }

        static async setFavoriteEmoji(userId, emojiTypeId) {
            try {
                const [stats, created] = await this.findOrCreate({
                    where: { user_id: userId },
                    defaults: {
                        user_id: userId,
                        total_emojis_unlocked: 0,
                        total_emoji_usage: 0,
                        positive_interactions_sent: 0,
                        positive_interactions_received: 0,
                        social_reputation_score: 0.00
                    }
                });

                await stats.update({ favorite_emoji_id: emojiTypeId });

                return {
                    success: true,
                    message: 'Favorite emoji updated successfully',
                    data: stats
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
        getSocialLevel() {
            const score = this.social_reputation_score;
            if (score >= 80) return 'Social Master';
            if (score >= 60) return 'Social Expert';
            if (score >= 40) return 'Social Enthusiast';
            if (score >= 20) return 'Social Participant';
            return 'Social Newcomer';
        }
    }

    UserSocialStats.init({
        user_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
            references: {
                model: 'Users',
                key: 'user_id'
            }
        },
        total_emojis_unlocked: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        total_emoji_usage: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        positive_interactions_sent: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        positive_interactions_received: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        social_reputation_score: {
            type: DataTypes.DECIMAL(5, 2),
            defaultValue: 0.00
        },
        favorite_emoji_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'EmojiTypes',
                key: 'emoji_type_id'
            }
        },
        most_used_context: {
            type: DataTypes.STRING(30),
            allowNull: true
        },
        last_social_activity: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'UserSocialStats',
        tableName: 'UserSocialStats',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            {
                fields: ['social_reputation_score']
            },
            {
                fields: ['last_social_activity']
            },
            {
                fields: ['favorite_emoji_id']
            }
        ]
    });

    return UserSocialStats;
};
