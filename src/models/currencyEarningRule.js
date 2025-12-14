'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class CurrencyEarningRule extends Model {
        static associate(models) {
            // Associations
            CurrencyEarningRule.belongsTo(models.Currency, { 
                foreignKey: 'currency_id', 
                as: 'Currency' 
            });
        }

        /**
         * Get earning rules for a currency
         * @param {number} currencyId - Currency ID
         * @returns {Array<CurrencyEarningRule>}
         */
        static async getRulesForCurrency(currencyId) {
            return await CurrencyEarningRule.findAll({
                where: { 
                    currency_id: currencyId,
                    is_active: true 
                },
                order: [['priority', 'DESC'], ['rule_id', 'ASC']]
            });
        }

        /**
         * Get earning rule by source type
         * @param {number} currencyId - Currency ID
         * @param {string} sourceType - Source type
         * @returns {CurrencyEarningRule|null}
         */
        static async getRuleBySourceType(currencyId, sourceType) {
            return await CurrencyEarningRule.findOne({
                where: { 
                    currency_id: currencyId,
                    source_type: sourceType,
                    is_active: true 
                }
            });
        }

        /**
         * Get all active earning rules
         * @returns {Array<CurrencyEarningRule>}
         */
        static async getActiveRules() {
            return await CurrencyEarningRule.findAll({
                where: { is_active: true },
                include: [{
                    model: sequelize.models.Currency,
                    as: 'Currency',
                    where: { is_active: true }
                }],
                order: [['Currency', 'currency_code', 'ASC'], ['priority', 'DESC']]
            });
        }

        /**
         * Calculate earning amount based on rule and conditions
         * @param {Object} conditions - Conditions for bonus calculation
         * @returns {number}
         */
        calculateEarningAmount(conditions = {}) {
            let amount = this.base_amount;
            
            if (!this.bonus_conditions || Object.keys(this.bonus_conditions).length === 0) {
                return amount;
            }

            // Apply bonus conditions
            const bonusConditions = this.bonus_conditions;

            // Handle different types of bonus conditions
            if (bonusConditions.correct_answer_bonus && conditions.correct_answers) {
                amount += conditions.correct_answers * bonusConditions.correct_answer_bonus;
            }

            if (bonusConditions.perfect_score_bonus && conditions.is_perfect_score) {
                amount += bonusConditions.perfect_score_bonus;
            }

            if (bonusConditions.speed_bonus && conditions.has_speed_bonus) {
                amount += bonusConditions.speed_bonus;
            }

            if (bonusConditions.consecutive_days && conditions.consecutive_days) {
                const consecutiveDays = conditions.consecutive_days;
                const dayBonuses = bonusConditions.consecutive_days;
                
                // Apply highest applicable consecutive day bonus
                for (const [days, bonus] of Object.entries(dayBonuses).sort((a, b) => parseInt(b[0]) - parseInt(a[0]))) {
                    if (consecutiveDays >= parseInt(days)) {
                        amount += bonus;
                        break;
                    }
                }
            }

            if (bonusConditions.rarity_multiplier && conditions.rarity) {
                const multiplier = bonusConditions.rarity_multiplier[conditions.rarity] || 1;
                amount *= multiplier;
            }

            if (bonusConditions.level_multiplier && conditions.level) {
                amount += conditions.level * bonusConditions.level_multiplier;
            }

            if (bonusConditions.tier_multiplier && conditions.tier) {
                const multiplier = bonusConditions.tier_multiplier[conditions.tier] || 1;
                amount *= multiplier;
            }

            if (bonusConditions.position_bonus && conditions.position) {
                const positionBonuses = bonusConditions.position_bonus;
                const position = conditions.position;
                
                if (positionBonuses[position.toString()]) {
                    amount += positionBonuses[position.toString()];
                } else if (position <= 10 && positionBonuses.top10) {
                    amount += positionBonuses.top10;
                }
            }

            if (bonusConditions.streak_multiplier && conditions.streak_count) {
                amount *= (1 + (conditions.streak_count - 1) * bonusConditions.streak_multiplier);
            }

            if (bonusConditions.base_by_rarity && conditions.rarity) {
                amount = bonusConditions.base_by_rarity[conditions.rarity] || amount;
            }

            return Math.round(amount);
        }

        /**
         * Check if daily limit is applicable (always false - limits removed)
         * @returns {boolean}
         */
        hasDailyLimit() {
            return false; // No more daily limits
        }

        /**
         * Check if earning amount exceeds daily limit (always false - limits removed)
         * @param {number} currentDailyEarned - Current daily earned amount for this rule
         * @param {number} earningAmount - Amount to be earned
         * @returns {boolean}
         */
        exceedsDailyLimit(currentDailyEarned, earningAmount) {
            return false; // No more daily limits
        }

        /**
         * Get remaining daily capacity for this rule (always infinite - limits removed)
         * @param {number} currentDailyEarned - Current daily earned amount for this rule
         * @returns {number}
         */
        getRemainingDailyCapacity(currentDailyEarned) {
            return Infinity; // No more daily limits
        }

        /**
         * Get formatted description
         * @returns {string}
         */
        getFormattedDescription() {
            return this.description || `Kiếm tiền từ ${this.source_type}`;
        }
    }

    CurrencyEarningRule.init(
        {
            rule_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            currency_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Currencies',
                    key: 'currency_id'
                },
                comment: 'ID của loại tiền tệ'
            },
            source_type: {
                type: DataTypes.STRING(30),
                allowNull: false,
                comment: 'Loại hoạt động kiếm tiền'
            },
            base_amount: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
                validate: {
                    min: 0
                },
                comment: 'Số tiền cơ bản nhận được'
            },
            bonus_conditions: {
                type: DataTypes.JSONB,
                allowNull: false,
                defaultValue: {},
                comment: 'Điều kiện bonus dạng JSON'
            },
            daily_limit: {
                type: DataTypes.INTEGER,
                allowNull: true,
                validate: {
                    min: 1
                },
                comment: 'Giới hạn kiếm mỗi ngày cho rule này'
            },
            is_active: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
                comment: 'Trạng thái hoạt động của rule'
            },
            priority: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
                comment: 'Độ ưu tiên của rule'
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true,
                comment: 'Mô tả rule'
            }
        },
        {
            sequelize,
            modelName: 'CurrencyEarningRule',
            tableName: 'CurrencyEarningRules',
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            indexes: [
                {
                    fields: ['currency_id']
                },
                {
                    fields: ['source_type']
                },
                {
                    fields: ['is_active']
                },
                {
                    fields: ['currency_id', 'source_type']
                },
                {
                    fields: ['priority']
                }
            ]
        }
    );

    return CurrencyEarningRule;
};
