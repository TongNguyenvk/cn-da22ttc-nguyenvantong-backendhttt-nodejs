'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class UserCurrency extends Model {
        static associate(models) {
            // Associations
            UserCurrency.belongsTo(models.User, {
                foreignKey: 'user_id',
                as: 'User'
            });
            UserCurrency.belongsTo(models.Currency, {
                foreignKey: 'currency_id',
                as: 'Currency'
            });
        }

        /**
         * Get user's currency balance
         * @param {number} userId - User ID
         * @param {string} currencyCode - Currency code (SYNC, KRIS)
         * @returns {UserCurrency|null}
         */
        static async getUserBalance(userId, currencyCode) {
            const { Currency } = sequelize.models;

            return await UserCurrency.findOne({
                where: { user_id: userId },
                include: [{
                    model: Currency,
                    as: 'Currency',
                    where: {
                        currency_code: currencyCode.toUpperCase(),
                        is_active: true
                    }
                }]
            });
        }

        /**
         * Get all user's currency balances
         * @param {number} userId - User ID
         * @returns {Array<UserCurrency>}
         */
        static async getUserBalances(userId) {
            const { Currency } = sequelize.models;

            return await UserCurrency.findAll({
                where: { user_id: userId },
                include: [{
                    model: Currency,
                    as: 'Currency',
                    where: { is_active: true }
                }],
                order: [['Currency', 'is_premium', 'ASC'], ['Currency', 'currency_code', 'ASC']]
            });
        }

        /**
         * Initialize user currencies (create default balances)
         * @param {number} userId - User ID
         * @returns {Array<UserCurrency>}
         */
        static async initializeUserCurrencies(userId) {
            const { Currency } = sequelize.models;
            const currencies = await Currency.getActiveCurrencies();
            const userCurrencies = [];

            for (const currency of currencies) {
                const [userCurrency, created] = await UserCurrency.findOrCreate({
                    where: {
                        user_id: userId,
                        currency_id: currency.currency_id
                    },
                    defaults: {
                        balance: 0,
                        total_earned: 0,
                        total_spent: 0,
                        daily_earned_today: 0,
                        last_earn_date: new Date()
                    }
                });

                userCurrencies.push(userCurrency);
            }

            return userCurrencies;
        }

        /**
         * Add currency to user balance
         * @param {number} amount - Amount to add
         * @param {string} reason - Reason for adding
         * @returns {Object} Transaction result
         */
        async addBalance(amount, reason = 'manual_add') {
            if (amount <= 0) {
                throw new Error('Amount must be positive');
            }

            const oldBalance = parseInt(this.balance);
            const newBalance = oldBalance + parseInt(amount);

            // Update balance and stats
            this.balance = newBalance;
            this.total_earned = parseInt(this.total_earned) + parseInt(amount);

            // Update daily earning if it's today
            const today = new Date().toDateString();
            const lastEarnDate = new Date(this.last_earn_date).toDateString();

            if (today === lastEarnDate) {
                this.daily_earned_today = parseInt(this.daily_earned_today) + parseInt(amount);
            } else {
                this.daily_earned_today = parseInt(amount);
                this.last_earn_date = new Date();
            }

            await this.save();

            return {
                success: true,
                old_balance: oldBalance,
                new_balance: newBalance,
                amount_added: parseInt(amount),
                reason: reason
            };
        }

        /**
         * Subtract currency from user balance
         * @param {number} amount - Amount to subtract
         * @param {string} reason - Reason for subtracting
         * @returns {Object} Transaction result
         */
        async subtractBalance(amount, reason = 'manual_subtract') {
            if (amount <= 0) {
                throw new Error('Amount must be positive');
            }

            if (this.balance < amount) {
                throw new Error('Insufficient balance');
            }

            const oldBalance = this.balance;
            const newBalance = oldBalance - amount;

            // Update balance and stats
            this.balance = newBalance;
            this.total_spent += amount;

            await this.save();

            return {
                success: true,
                old_balance: oldBalance,
                new_balance: newBalance,
                amount_subtracted: amount,
                reason: reason
            };
        }

        /**
         * Check if user has sufficient balance
         * @param {number} amount - Amount to check
         * @returns {boolean}
         */
        hasSufficientBalance(amount) {
            return this.balance >= amount;
        }

        /**
         * Get daily earning progress (limits removed)
         * @returns {Object}
         */
        async getDailyEarningProgress() {
            const currentDaily = this.daily_earned_today;

            return {
                current_daily_earned: currentDaily,
                max_daily_earn: null,
                remaining_capacity: Infinity,
                is_limit_reached: false,
                progress_percentage: 0
            };
        }

        /**
         * Reset daily earning counter (called by daily cron job)
         */
        async resetDailyEarning() {
            this.daily_earned_today = 0;
            this.last_earn_date = new Date();
            await this.save();
        }

        /**
         * Get formatted balance display
         * @returns {string}
         */
        getFormattedBalance() {
            return this.balance.toLocaleString();
        }

        /**
         * Get wealth rank among all users for this currency
         * @returns {number}
         */
        async getWealthRank() {
            const rankResult = await sequelize.query(`
                SELECT COUNT(*) + 1 as rank
                FROM "UserCurrencies" 
                WHERE currency_id = :currencyId 
                AND balance > :balance
            `, {
                replacements: {
                    currencyId: this.currency_id,
                    balance: this.balance
                },
                type: sequelize.QueryTypes.SELECT
            });

            return rankResult[0]?.rank || 1;
        }
    }

    UserCurrency.init(
        {
            user_currency_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            user_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Users',
                    key: 'user_id'
                },
                comment: 'ID của user'
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
            balance: {
                type: DataTypes.BIGINT,
                allowNull: false,
                defaultValue: 0,
                validate: {
                    min: 0
                },
                comment: 'Số dư hiện tại'
            },
            total_earned: {
                type: DataTypes.BIGINT,
                allowNull: false,
                defaultValue: 0,
                validate: {
                    min: 0
                },
                comment: 'Tổng số tiền đã kiếm được'
            },
            total_spent: {
                type: DataTypes.BIGINT,
                allowNull: false,
                defaultValue: 0,
                validate: {
                    min: 0
                },
                comment: 'Tổng số tiền đã tiêu'
            },
            daily_earned_today: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
                validate: {
                    min: 0
                },
                comment: 'Số tiền kiếm được hôm nay'
            },
            last_earn_date: {
                type: DataTypes.DATEONLY,
                allowNull: false,
                defaultValue: DataTypes.NOW,
                comment: 'Ngày kiếm tiền gần nhất'
            }
        },
        {
            sequelize,
            modelName: 'UserCurrency',
            tableName: 'UserCurrencies',
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            indexes: [
                {
                    unique: true,
                    fields: ['user_id', 'currency_id']
                },
                {
                    fields: ['user_id']
                },
                {
                    fields: ['currency_id']
                },
                {
                    fields: ['balance']
                },
                {
                    fields: ['last_earn_date']
                }
            ]
        }
    );

    return UserCurrency;
};
