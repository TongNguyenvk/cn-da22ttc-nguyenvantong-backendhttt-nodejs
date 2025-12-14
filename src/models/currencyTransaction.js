'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class CurrencyTransaction extends Model {
        static associate(models) {
            // Associations
            CurrencyTransaction.belongsTo(models.User, { 
                foreignKey: 'user_id', 
                as: 'User' 
            });
            CurrencyTransaction.belongsTo(models.Currency, { 
                foreignKey: 'currency_id', 
                as: 'Currency' 
            });
        }

        /**
         * Create a new currency transaction
         * @param {Object} transactionData - Transaction data
         * @returns {CurrencyTransaction}
         */
        static async createTransaction({
            userId,
            currencyId,
            transactionType,
            amount,
            balanceBefore,
            balanceAfter,
            sourceType,
            sourceId = null,
            description = '',
            metadata = {}
        }) {
            return await CurrencyTransaction.create({
                user_id: userId,
                currency_id: currencyId,
                transaction_type: transactionType,
                amount: parseInt(amount),
                balance_before: parseInt(balanceBefore),
                balance_after: parseInt(balanceAfter),
                source_type: sourceType,
                source_id: sourceId,
                description: description,
                metadata: metadata
            });
        }

        /**
         * Get user's transaction history
         * @param {number} userId - User ID
         * @param {Object} options - Query options
         * @returns {Array<CurrencyTransaction>}
         */
        static async getUserTransactionHistory(userId, options = {}) {
            const {
                currencyCode = null,
                transactionType = null,
                sourceType = null,
                limit = 50,
                offset = 0,
                startDate = null,
                endDate = null
            } = options;

            const { Currency } = sequelize.models;
            const whereClause = { user_id: userId };
            const includeClause = [{
                model: Currency,
                as: 'Currency',
                attributes: ['currency_code', 'currency_name', 'icon_path']
            }];

            // Add currency filter
            if (currencyCode) {
                includeClause[0].where = { currency_code: currencyCode.toUpperCase() };
            }

            // Add transaction type filter
            if (transactionType) {
                whereClause.transaction_type = transactionType;
            }

            // Add source type filter
            if (sourceType) {
                whereClause.source_type = sourceType;
            }

            // Add date range filter
            if (startDate || endDate) {
                whereClause.created_at = {};
                if (startDate) whereClause.created_at[sequelize.Op.gte] = startDate;
                if (endDate) whereClause.created_at[sequelize.Op.lte] = endDate;
            }

            return await CurrencyTransaction.findAll({
                where: whereClause,
                include: includeClause,
                order: [['created_at', 'DESC']],
                limit: limit,
                offset: offset
            });
        }

        /**
         * Get transaction statistics for user
         * @param {number} userId - User ID
         * @param {string} currencyCode - Currency code
         * @param {string} period - Period (today, week, month, all)
         * @returns {Object}
         */
        static async getUserTransactionStats(userId, currencyCode, period = 'all') {
            const { Currency } = sequelize.models;
            
            // Get currency
            const currency = await Currency.getByCurrencyCode(currencyCode);
            if (!currency) {
                throw new Error('Currency not found');
            }

            // Calculate date range
            let startDate = null;
            const now = new Date();
            
            switch (period) {
                case 'today':
                    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    break;
                case 'week':
                    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case 'month':
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    break;
                default:
                    startDate = null;
            }

            const whereClause = {
                user_id: userId,
                currency_id: currency.currency_id
            };

            if (startDate) {
                whereClause.created_at = { [sequelize.Op.gte]: startDate };
            }

            // Get statistics
            const stats = await CurrencyTransaction.findAll({
                where: whereClause,
                attributes: [
                    'transaction_type',
                    [sequelize.fn('COUNT', sequelize.col('transaction_id')), 'count'],
                    [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount'],
                    [sequelize.fn('AVG', sequelize.col('amount')), 'average_amount']
                ],
                group: ['transaction_type'],
                raw: true
            });

            // Format results
            const result = {
                period: period,
                currency_code: currencyCode,
                total_transactions: 0,
                earned: { count: 0, total: 0, average: 0 },
                spent: { count: 0, total: 0, average: 0 },
                transfers: { count: 0, total: 0, average: 0 },
                admin_adjustments: { count: 0, total: 0, average: 0 }
            };

            stats.forEach(stat => {
                const type = stat.transaction_type.toLowerCase();
                const count = parseInt(stat.count);
                const total = parseInt(stat.total_amount) || 0;
                const average = parseFloat(stat.average_amount) || 0;

                result.total_transactions += count;

                switch (stat.transaction_type) {
                    case 'EARN':
                        result.earned = { count, total, average };
                        break;
                    case 'SPEND':
                        result.spent = { count, total, average };
                        break;
                    case 'TRANSFER':
                        result.transfers = { count, total, average };
                        break;
                    case 'ADMIN_ADJUST':
                        result.admin_adjustments = { count, total, average };
                        break;
                }
            });

            return result;
        }

        /**
         * Get top earning sources for user
         * @param {number} userId - User ID
         * @param {string} currencyCode - Currency code
         * @param {number} limit - Number of top sources
         * @returns {Array}
         */
        static async getTopEarningSources(userId, currencyCode, limit = 10) {
            const { Currency } = sequelize.models;
            
            const currency = await Currency.getByCurrencyCode(currencyCode);
            if (!currency) {
                throw new Error('Currency not found');
            }

            return await CurrencyTransaction.findAll({
                where: {
                    user_id: userId,
                    currency_id: currency.currency_id,
                    transaction_type: 'EARN'
                },
                attributes: [
                    'source_type',
                    [sequelize.fn('COUNT', sequelize.col('transaction_id')), 'transaction_count'],
                    [sequelize.fn('SUM', sequelize.col('amount')), 'total_earned'],
                    [sequelize.fn('AVG', sequelize.col('amount')), 'average_earned']
                ],
                group: ['source_type'],
                order: [[sequelize.fn('SUM', sequelize.col('amount')), 'DESC']],
                limit: limit,
                raw: true
            });
        }

        /**
         * Get formatted transaction description
         * @returns {string}
         */
        getFormattedDescription() {
            if (this.description) {
                return this.description;
            }

            // Generate description based on source type
            const sourceDescriptions = {
                'QUIZ_COMPLETION': 'Hoàn thành quiz',
                'DAILY_LOGIN': 'Đăng nhập hàng ngày',
                'ACHIEVEMENT_UNLOCK': 'Mở khóa thành tích',
                'LEVEL_UP': 'Lên cấp',
                'ITEM_DECOMPOSE': 'Phân giải vật phẩm',
                'TITLE_UNLOCK': 'Mở khóa danh hiệu',
                'LEADERBOARD_REWARD': 'Thưởng bảng xếp hạng',
                'PERFECT_QUIZ_STREAK': 'Chuỗi quiz hoàn hảo',
                'SHOP_PURCHASE': 'Mua sắm trong cửa hàng',
                'ADMIN_ADJUST': 'Điều chỉnh bởi admin'
            };

            return sourceDescriptions[this.source_type] || this.source_type;
        }

        /**
         * Get transaction type display name
         * @returns {string}
         */
        getTransactionTypeDisplay() {
            const typeNames = {
                'EARN': 'Kiếm được',
                'SPEND': 'Tiêu',
                'TRANSFER': 'Chuyển',
                'ADMIN_ADJUST': 'Điều chỉnh'
            };

            return typeNames[this.transaction_type] || this.transaction_type;
        }

        /**
         * Check if transaction is positive (increases balance)
         * @returns {boolean}
         */
        isPositive() {
            return ['EARN', 'ADMIN_ADJUST'].includes(this.transaction_type) && this.amount > 0;
        }

        /**
         * Check if transaction is negative (decreases balance)
         * @returns {boolean}
         */
        isNegative() {
            return ['SPEND', 'TRANSFER'].includes(this.transaction_type) || 
                   (this.transaction_type === 'ADMIN_ADJUST' && this.amount < 0);
        }

        /**
         * Get formatted amount with sign
         * @returns {string}
         */
        getFormattedAmount() {
            const sign = this.isPositive() ? '+' : '-';
            return `${sign}${Math.abs(this.amount).toLocaleString()}`;
        }
    }

    CurrencyTransaction.init(
        {
            transaction_id: {
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
            transaction_type: {
                type: DataTypes.STRING(20),
                allowNull: false,
                validate: {
                    isIn: [['EARN', 'SPEND', 'TRANSFER', 'ADMIN_ADJUST']]
                },
                comment: 'Loại giao dịch'
            },
            amount: {
                type: DataTypes.BIGINT,
                allowNull: false,
                comment: 'Số tiền giao dịch'
            },
            balance_before: {
                type: DataTypes.BIGINT,
                allowNull: false,
                comment: 'Số dư trước giao dịch'
            },
            balance_after: {
                type: DataTypes.BIGINT,
                allowNull: false,
                comment: 'Số dư sau giao dịch'
            },
            source_type: {
                type: DataTypes.STRING(30),
                allowNull: false,
                comment: 'Nguồn giao dịch'
            },
            source_id: {
                type: DataTypes.INTEGER,
                allowNull: true,
                comment: 'ID của nguồn giao dịch'
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true,
                comment: 'Mô tả giao dịch'
            },
            metadata: {
                type: DataTypes.JSONB,
                allowNull: false,
                defaultValue: {},
                comment: 'Thông tin bổ sung dạng JSON'
            }
        },
        {
            sequelize,
            modelName: 'CurrencyTransaction',
            tableName: 'CurrencyTransactions',
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: false,
            indexes: [
                {
                    fields: ['user_id']
                },
                {
                    fields: ['currency_id']
                },
                {
                    fields: ['transaction_type']
                },
                {
                    fields: ['source_type', 'source_id']
                },
                {
                    fields: ['created_at']
                },
                {
                    fields: ['user_id', 'currency_id', 'created_at']
                }
            ]
        }
    );

    return CurrencyTransaction;
};
