'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class LeaderboardEntry extends Model {
        static associate(models) {
            LeaderboardEntry.belongsTo(models.User, {
                foreignKey: 'user_id',
                as: 'User'
            });
        }

        // Static methods for leaderboard management
        static async getLeaderboard(leaderboardType, rankingCriteria, options = {}) {
            try {
                const {
                    tierFilter = null,
                    timePeriod = null,
                    limit = 50,
                    offset = 0,
                    includeUserData = true
                } = options;

                const whereClause = {
                    leaderboard_type: leaderboardType,
                    ranking_criteria: rankingCriteria
                };

                if (tierFilter) {
                    whereClause.tier_filter = tierFilter;
                }

                if (timePeriod) {
                    whereClause.time_period = timePeriod;
                }

                const includeClause = includeUserData ? [{
                    model: sequelize.models.User,
                    as: 'User',
                    attributes: [
                        'user_id', 'username', 'full_name', 'avatar_url',
                        'current_level', 'current_tier', 'current_xp'
                    ]
                }] : [];

                const entries = await this.findAll({
                    where: whereClause,
                    include: includeClause,
                    order: [['current_rank', 'ASC']],
                    limit: limit,
                    offset: offset
                });

                return entries.map(entry => ({
                    entry_id: entry.entry_id,
                    user_id: entry.user_id,
                    current_rank: entry.current_rank,
                    previous_rank: entry.previous_rank,
                    rank_change: entry.rank_change,
                    score_value: entry.score_value,
                    tier_filter: entry.tier_filter,
                    last_updated: entry.last_updated,
                    user: entry.User ? {
                        user_id: entry.User.user_id,
                        username: entry.User.username,
                        full_name: entry.User.full_name,
                        avatar_url: entry.User.avatar_url,
                        current_level: entry.User.current_level,
                        current_tier: entry.User.current_tier,
                        current_xp: entry.User.current_xp
                    } : null
                }));
            } catch (error) {
                console.error('Error getting leaderboard:', error);
                return [];
            }
        }

        static async getUserRank(userId, leaderboardType, rankingCriteria, tierFilter = null) {
            try {
                const whereClause = {
                    user_id: userId,
                    leaderboard_type: leaderboardType,
                    ranking_criteria: rankingCriteria
                };

                if (tierFilter) {
                    whereClause.tier_filter = tierFilter;
                }

                const entry = await this.findOne({
                    where: whereClause,
                    include: [{
                        model: sequelize.models.User,
                        as: 'User',
                        attributes: ['username', 'full_name', 'avatar_url', 'current_level', 'current_tier']
                    }]
                });

                if (!entry) {
                    return null;
                }

                // Get total participants for percentage calculation
                const totalParticipants = await this.count({
                    where: {
                        leaderboard_type: leaderboardType,
                        ranking_criteria: rankingCriteria,
                        ...(tierFilter && { tier_filter: tierFilter })
                    }
                });

                return {
                    user_id: entry.user_id,
                    current_rank: entry.current_rank,
                    previous_rank: entry.previous_rank,
                    rank_change: entry.rank_change,
                    score_value: entry.score_value,
                    total_participants: totalParticipants,
                    percentile: totalParticipants > 0 ?
                        Math.round((1 - (entry.current_rank - 1) / totalParticipants) * 100) : 0,
                    user: entry.User
                };
            } catch (error) {
                console.error('Error getting user rank:', error);
                return null;
            }
        }

        static async updateUserScore(userId, leaderboardType, rankingCriteria, newScore, tierFilter = null) {
            try {
                // Find or create entry
                const [entry, created] = await this.findOrCreate({
                    where: {
                        user_id: userId,
                        leaderboard_type: leaderboardType,
                        ranking_criteria: rankingCriteria,
                        ...(tierFilter && { tier_filter: tierFilter })
                    },
                    defaults: {
                        user_id: userId,
                        leaderboard_type: leaderboardType,
                        ranking_criteria: rankingCriteria,
                        score_value: newScore,
                        tier_filter: tierFilter,
                        current_rank: 999999 // Will be recalculated
                    }
                });

                if (!created) {
                    // Update existing entry
                    await entry.update({
                        previous_rank: entry.current_rank,
                        score_value: newScore,
                        last_updated: new Date()
                    });
                }

                // Recalculate ranks for this leaderboard
                await this.recalculateRanks(leaderboardType, rankingCriteria, tierFilter);

                return {
                    success: true,
                    message: 'User score updated successfully',
                    data: entry
                };
            } catch (error) {
                return {
                    success: false,
                    message: 'Failed to update user score',
                    error: error.message
                };
            }
        }

        static async recalculateRanks(leaderboardType, rankingCriteria, tierFilter = null) {
            try {
                const whereClause = {
                    leaderboard_type: leaderboardType,
                    ranking_criteria: rankingCriteria
                };

                if (tierFilter) {
                    whereClause.tier_filter = tierFilter;
                }

                // Get all entries sorted by score
                const entries = await this.findAll({
                    where: whereClause,
                    order: [['score_value', 'DESC']],
                    attributes: ['entry_id', 'user_id', 'current_rank', 'score_value']
                });

                // Update ranks
                const updatePromises = entries.map((entry, index) => {
                    const newRank = index + 1;
                    const rankChange = entry.current_rank ? entry.current_rank - newRank : 0;

                    return entry.update({
                        current_rank: newRank,
                        rank_change: rankChange,
                        updated_at: new Date()
                    });
                });

                await Promise.all(updatePromises);

                return {
                    success: true,
                    message: 'Ranks recalculated successfully',
                    updated_count: entries.length
                };
            } catch (error) {
                console.error('Error recalculating ranks:', error);
                return {
                    success: false,
                    message: 'Failed to recalculate ranks',
                    error: error.message
                };
            }
        }

        static async getTopMovers(leaderboardType, rankingCriteria, options = {}) {
            try {
                const { limit = 10, direction = 'up', tierFilter = null } = options;

                const whereClause = {
                    leaderboard_type: leaderboardType,
                    ranking_criteria: rankingCriteria,
                    rank_change: direction === 'up' ?
                        { [sequelize.Sequelize.Op.gt]: 0 } :
                        { [sequelize.Sequelize.Op.lt]: 0 }
                };

                if (tierFilter) {
                    whereClause.tier_filter = tierFilter;
                }

                const entries = await this.findAll({
                    where: whereClause,
                    include: [{
                        model: sequelize.models.User,
                        as: 'User',
                        attributes: ['username', 'full_name', 'avatar_url', 'current_level', 'current_tier']
                    }],
                    order: [
                        direction === 'up' ?
                            ['rank_change', 'DESC'] :
                            ['rank_change', 'ASC']
                    ],
                    limit: limit
                });

                return entries.map(entry => ({
                    user_id: entry.user_id,
                    username: entry.User?.username,
                    full_name: entry.User?.full_name,
                    avatar_url: entry.User?.avatar_url,
                    current_rank: entry.current_rank,
                    previous_rank: entry.previous_rank,
                    rank_change: entry.rank_change,
                    score_value: entry.score_value,
                    movement_type: direction
                }));
            } catch (error) {
                console.error('Error getting top movers:', error);
                return [];
            }
        }

        // Instance methods
        getRankChangeDescription() {
            if (this.rank_change > 0) {
                return `Moved up ${this.rank_change} position${this.rank_change > 1 ? 's' : ''}`;
            } else if (this.rank_change < 0) {
                return `Moved down ${Math.abs(this.rank_change)} position${Math.abs(this.rank_change) > 1 ? 's' : ''}`;
            } else {
                return 'No change in position';
            }
        }

        isTopTier() {
            return this.current_rank <= 10;
        }

        getPerformanceLevel() {
            if (this.current_rank === 1) return 'Champion';
            if (this.current_rank <= 3) return 'Elite';
            if (this.current_rank <= 10) return 'Expert';
            if (this.current_rank <= 50) return 'Advanced';
            if (this.current_rank <= 100) return 'Intermediate';
            return 'Beginner';
        }
    }

    LeaderboardEntry.init({
        entry_id: {
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
        leaderboard_type: {
            type: DataTypes.ENUM('GLOBAL', 'TIER_BASED', 'WEEKLY', 'MONTHLY', 'DAILY'),
            allowNull: false
        },
        ranking_criteria: {
            type: DataTypes.ENUM('TOTAL_XP', 'LEVEL', 'QUIZ_SCORE', 'WIN_RATE', 'STREAK', 'SOCIAL_SCORE'),
            allowNull: false
        },
        score_value: {
            type: DataTypes.BIGINT,
            allowNull: false,
            defaultValue: 0
        },
        current_rank: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        previous_rank: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        rank_change: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        tier_filter: {
            type: DataTypes.ENUM('WOOD', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'ONYX', 'SAPPHIRE', 'RUBY', 'AMETHYST', 'MASTER'),
            allowNull: true
        },
        time_period: {
            type: DataTypes.DATEONLY,
            allowNull: true
        },
        last_updated: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        }
    }, {
        sequelize,
        modelName: 'LeaderboardEntry',
        tableName: 'LeaderboardEntries',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            {
                fields: ['user_id', 'leaderboard_type', 'ranking_criteria'],
                unique: false
            },
            {
                fields: ['leaderboard_type', 'ranking_criteria', 'current_rank']
            },
            {
                fields: ['tier_filter', 'score_value']
            },
            {
                fields: ['time_period', 'leaderboard_type']
            },
            {
                unique: true,
                fields: ['user_id', 'leaderboard_type', 'ranking_criteria'],
                name: 'unique_global_leaderboard_entry',
                where: {
                    tier_filter: null
                }
            },
            {
                unique: true,
                fields: ['user_id', 'leaderboard_type', 'ranking_criteria', 'tier_filter'],
                name: 'unique_tier_leaderboard_entry',
                where: {
                    tier_filter: {
                        [sequelize.Sequelize.Op.ne]: null
                    }
                }
            }
        ]
    });

    return LeaderboardEntry;
};
