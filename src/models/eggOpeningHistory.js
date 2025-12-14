'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class EggOpeningHistory extends Model {
        static associate(models) {
            // Associations
            EggOpeningHistory.belongsTo(models.User, { 
                foreignKey: 'user_id', 
                as: 'User' 
            });
            EggOpeningHistory.belongsTo(models.EggType, { 
                foreignKey: 'egg_type_id', 
                as: 'EggType' 
            });
        }

        /**
         * Get user's opening history
         * @param {number} userId - User ID
         * @param {number} limit - Number of records to return
         * @returns {Array<EggOpeningHistory>}
         */
        static async getUserOpeningHistory(userId, limit = 50) {
            return await EggOpeningHistory.findAll({
                where: { user_id: userId },
                include: [{
                    model: sequelize.models.EggType,
                    as: 'EggType',
                    attributes: ['egg_name', 'egg_code', 'image_path', 'rarity']
                }],
                order: [['opened_at', 'DESC']],
                limit: limit
            });
        }

        /**
         * Get opening statistics for user
         * @param {number} userId - User ID
         * @returns {Object}
         */
        static async getUserOpeningStats(userId) {
            const stats = await EggOpeningHistory.findAll({
                where: { user_id: userId },
                attributes: [
                    [sequelize.fn('COUNT', sequelize.col('opening_id')), 'total_openings'],
                    [sequelize.fn('SUM', sequelize.col('total_value_syncoin')), 'total_syncoin_earned'],
                    [sequelize.fn('SUM', sequelize.col('total_value_kristal')), 'total_kristal_earned'],
                    [sequelize.fn('SUM', sequelize.col('kristal_from_duplicates')), 'total_kristal_from_duplicates'],
                    [sequelize.fn('COUNT', sequelize.literal('CASE WHEN was_duplicate = true THEN 1 END')), 'openings_with_duplicates']
                ],
                raw: true
            });

            return stats[0] || {
                total_openings: 0,
                total_syncoin_earned: 0,
                total_kristal_earned: 0,
                total_kristal_from_duplicates: 0,
                openings_with_duplicates: 0
            };
        }

        /**
         * Get rewards received as array
         * @returns {Array}
         */
        getRewardsReceivedArray() {
            try {
                return Array.isArray(this.rewards_received) 
                    ? this.rewards_received 
                    : JSON.parse(this.rewards_received || '[]');
            } catch (error) {
                console.error('Error parsing rewards received:', error);
                return [];
            }
        }

        /**
         * Get total value in SynCoin equivalent
         * @returns {number}
         */
        getTotalValueInSynCoin() {
            // Convert Kristal to SynCoin equivalent (1 Kristal = 100 SynCoin)
            return this.total_value_syncoin + (this.total_value_kristal * 100);
        }

        /**
         * Check if opening had duplicates
         * @returns {boolean}
         */
        hadDuplicates() {
            return this.was_duplicate === true;
        }

        /**
         * Get formatted opening info
         * @returns {Object}
         */
        getFormattedInfo() {
            return {
                opening_id: this.opening_id,
                user_id: this.user_id,
                egg_type_id: this.egg_type_id,
                rewards_received: this.getRewardsReceivedArray(),
                total_rewards: this.getRewardsReceivedArray().length,
                total_value_syncoin: this.total_value_syncoin,
                total_value_kristal: this.total_value_kristal,
                total_value_syncoin_equivalent: this.getTotalValueInSynCoin(),
                was_duplicate: this.was_duplicate,
                kristal_from_duplicates: this.kristal_from_duplicates,
                opened_at: this.opened_at
            };
        }
    }

    EggOpeningHistory.init({
        opening_id: {
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
        egg_type_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'EggTypes',
                key: 'egg_type_id'
            }
        },
        rewards_received: {
            type: DataTypes.JSONB,
            allowNull: false,
            defaultValue: []
        },
        total_value_syncoin: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        total_value_kristal: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        was_duplicate: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        kristal_from_duplicates: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        opened_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        sequelize,
        modelName: 'EggOpeningHistory',
        tableName: 'EggOpeningHistory',
        timestamps: false
    });

    return EggOpeningHistory;
};
