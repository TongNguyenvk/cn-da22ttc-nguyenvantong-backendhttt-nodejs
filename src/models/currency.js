'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Currency extends Model {
        static associate(models) {
            // Associations
            Currency.hasMany(models.UserCurrency, { 
                foreignKey: 'currency_id', 
                as: 'UserCurrencies' 
            });
            Currency.hasMany(models.CurrencyTransaction, { 
                foreignKey: 'currency_id', 
                as: 'Transactions' 
            });
            Currency.hasMany(models.CurrencyEarningRule, { 
                foreignKey: 'currency_id', 
                as: 'EarningRules' 
            });
        }

        /**
         * Get currency by code
         * @param {string} currencyCode - Currency code (SYNC, KRIS)
         * @returns {Currency|null}
         */
        static async getByCurrencyCode(currencyCode) {
            return await Currency.findOne({
                where: { 
                    currency_code: currencyCode.toUpperCase(),
                    is_active: true 
                }
            });
        }

        /**
         * Get all active currencies
         * @returns {Array<Currency>}
         */
        static async getActiveCurrencies() {
            return await Currency.findAll({
                where: { is_active: true },
                order: [['is_premium', 'ASC'], ['currency_code', 'ASC']]
            });
        }

        /**
         * Get SynCoin currency
         * @returns {Currency|null}
         */
        static async getSynCoin() {
            return await Currency.getByCurrencyCode('SYNC');
        }

        /**
         * Get Kristal currency
         * @returns {Currency|null}
         */
        static async getKristal() {
            return await Currency.getByCurrencyCode('KRIS');
        }

        /**
         * Check if currency is premium
         * @returns {boolean}
         */
        isPremium() {
            return this.is_premium;
        }

        /**
         * Get exchange rate to SynCoin
         * @returns {number}
         */
        getExchangeRate() {
            return parseFloat(this.exchange_rate);
        }

        /**
         * Convert amount to SynCoin equivalent
         * @param {number} amount - Amount in this currency
         * @returns {number}
         */
        toSynCoinValue(amount) {
            return Math.round(amount * this.getExchangeRate());
        }

        /**
         * Convert SynCoin amount to this currency
         * @param {number} synCoinAmount - Amount in SynCoin
         * @returns {number}
         */
        fromSynCoinValue(synCoinAmount) {
            return Math.round(synCoinAmount / this.getExchangeRate());
        }

        /**
         * Check if daily earning limit is reached (always false - limits removed)
         * @param {number} currentDailyEarned - Current daily earned amount
         * @returns {boolean}
         */
        isDailyLimitReached(currentDailyEarned) {
            return false; // No more daily limits
        }

        /**
         * Get remaining daily earning capacity (always infinite - limits removed)
         * @param {number} currentDailyEarned - Current daily earned amount
         * @returns {number}
         */
        getRemainingDailyCapacity(currentDailyEarned) {
            return Infinity; // No more daily limits
        }
    }

    Currency.init(
        {
            currency_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            currency_code: {
                type: DataTypes.STRING(10),
                allowNull: false,
                unique: true,
                validate: {
                    isUppercase: true,
                    len: [3, 10]
                },
                comment: 'Mã tiền tệ (SYNC, KRIS)'
            },
            currency_name: {
                type: DataTypes.STRING(50),
                allowNull: false,
                comment: 'Tên tiền tệ (SynCoin, Kristal)'
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true,
                comment: 'Mô tả chi tiết về tiền tệ'
            },
            icon_path: {
                type: DataTypes.STRING(255),
                allowNull: true,
                comment: 'Đường dẫn đến icon của tiền tệ'
            },
            is_premium: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
                comment: 'Có phải tiền tệ cao cấp không'
            },
            exchange_rate: {
                type: DataTypes.DECIMAL(10, 4),
                allowNull: false,
                defaultValue: 1.0000,
                validate: {
                    min: 0.0001
                },
                comment: 'Tỷ giá quy đổi so với SynCoin'
            },
            max_daily_earn: {
                type: DataTypes.INTEGER,
                allowNull: true,
                validate: {
                    min: 1
                },
                comment: 'Giới hạn kiếm tối đa mỗi ngày'
            },
            is_active: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
                comment: 'Trạng thái hoạt động của tiền tệ'
            }
        },
        {
            sequelize,
            modelName: 'Currency',
            tableName: 'Currencies',
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            indexes: [
                {
                    unique: true,
                    fields: ['currency_code']
                },
                {
                    fields: ['is_active']
                },
                {
                    fields: ['is_premium']
                }
            ]
        }
    );

    return Currency;
};
