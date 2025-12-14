'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class EggReward extends Model {
        static associate(models) {
            // Associations
            EggReward.belongsTo(models.EggType, { 
                foreignKey: 'egg_type_id', 
                as: 'EggType' 
            });
        }

        /**
         * Get rewards for specific egg type
         * @param {number} eggTypeId - Egg type ID
         * @returns {Array<EggReward>}
         */
        static async getRewardsForEggType(eggTypeId) {
            return await EggReward.findAll({
                where: { 
                    egg_type_id: eggTypeId,
                    is_active: true
                },
                order: [['drop_rate', 'DESC'], ['rarity_weight', 'DESC']]
            });
        }

        /**
         * Get guaranteed rewards for egg type
         * @param {number} eggTypeId - Egg type ID
         * @returns {Array<EggReward>}
         */
        static async getGuaranteedRewards(eggTypeId) {
            return await EggReward.findAll({
                where: { 
                    egg_type_id: eggTypeId,
                    is_guaranteed: true,
                    is_active: true
                }
            });
        }

        /**
         * Get random rewards based on drop rates
         * @param {number} eggTypeId - Egg type ID
         * @param {number} numRewards - Number of rewards to get (default: 1)
         * @returns {Array<EggReward>}
         */
        static async getRandomRewards(eggTypeId, numRewards = 1) {
            const rewards = await EggReward.getRewardsForEggType(eggTypeId);
            const selectedRewards = [];

            for (let i = 0; i < numRewards; i++) {
                const randomValue = Math.random();
                let cumulativeRate = 0;

                for (const reward of rewards) {
                    cumulativeRate += parseFloat(reward.drop_rate);
                    if (randomValue <= cumulativeRate) {
                        selectedRewards.push(reward);
                        break;
                    }
                }
            }

            return selectedRewards;
        }

        /**
         * Check if reward is currency type
         * @returns {boolean}
         */
        isCurrencyReward() {
            return ['SYNCOIN', 'XP'].includes(this.reward_type);
        }

        /**
         * Check if reward is item type
         * @returns {boolean}
         */
        isItemReward() {
            return ['AVATAR', 'EMOJI'].includes(this.reward_type);
        }

        /**
         * Get reward display name
         * @returns {string}
         */
        getRewardDisplayName() {
            const rewardNames = {
                'AVATAR': 'Avatar',
                'EMOJI': 'Emoji',
                'SYNCOIN': 'SynCoin',
                'XP': 'Điểm Kinh Nghiệm'
            };
            return rewardNames[this.reward_type] || 'Không Xác Định';
        }

        /**
         * Get reward value for display
         * @returns {string}
         */
        getRewardValue() {
            if (this.isCurrencyReward()) {
                return `${this.reward_amount} ${this.getRewardDisplayName()}`;
            } else {
                return this.getRewardDisplayName();
            }
        }

        /**
         * Get drop rate percentage
         * @returns {string}
         */
        getDropRatePercentage() {
            return `${(parseFloat(this.drop_rate) * 100).toFixed(2)}%`;
        }

        /**
         * Get rarity weight display
         * @returns {string}
         */
        getRarityWeightDisplay() {
            const weights = {
                1: 'Thường',
                2: 'Không Thường',
                3: 'Hiếm',
                4: 'Sử Thi',
                5: 'Huyền Thoại'
            };
            return weights[this.rarity_weight] || 'Không Xác Định';
        }

        /**
         * Get formatted reward info
         * @returns {Object}
         */
        getFormattedInfo() {
            return {
                reward_id: this.reward_id,
                egg_type_id: this.egg_type_id,
                reward_type: this.reward_type,
                reward_type_display: this.getRewardDisplayName(),
                reward_item_id: this.reward_item_id,
                reward_amount: this.reward_amount,
                reward_value: this.getRewardValue(),
                drop_rate: this.drop_rate,
                drop_rate_percentage: this.getDropRatePercentage(),
                is_guaranteed: this.is_guaranteed,
                rarity_weight: this.rarity_weight,
                rarity_weight_display: this.getRarityWeightDisplay(),
                is_currency: this.isCurrencyReward(),
                is_item: this.isItemReward(),
                is_active: this.is_active
            };
        }
    }

    EggReward.init({
        reward_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        egg_type_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'EggTypes',
                key: 'egg_type_id'
            }
        },
        reward_type: {
            type: DataTypes.STRING(20),
            allowNull: false,
            validate: {
                isIn: [['AVATAR', 'EMOJI', 'SYNCOIN', 'XP']]
            }
        },
        reward_item_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        reward_amount: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1
        },
        drop_rate: {
            type: DataTypes.DECIMAL(5, 4),
            allowNull: false,
            defaultValue: 0.1000
        },
        is_guaranteed: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        rarity_weight: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        updated_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        sequelize,
        modelName: 'EggReward',
        tableName: 'EggRewards',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

    return EggReward;
};
