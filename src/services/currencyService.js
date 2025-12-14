const { 
    Currency, 
    UserCurrency, 
    CurrencyTransaction, 
    CurrencyEarningRule,
    User 
} = require('../models');
const { Op } = require('sequelize');

/**
 * Currency Service
 * Handles all currency-related operations including earning, spending, and transactions
 */
class CurrencyService {
    
    /**
     * Initialize user currencies (create default balances)
     * @param {number} userId - User ID
     * @returns {Array<UserCurrency>}
     */
    static async initializeUserCurrencies(userId) {
        try {
            return await UserCurrency.initializeUserCurrencies(userId);
        } catch (error) {
            console.error('Error initializing user currencies:', error);
            throw error;
        }
    }

    /**
     * Get user's currency balances
     * @param {number} userId - User ID
     * @returns {Object}
     */
    static async getUserBalances(userId) {
        try {
            const balances = await UserCurrency.getUserBalances(userId);
            
            const result = {
                user_id: userId,
                currencies: {},
                total_wealth_in_syncoin: 0
            };

            for (const balance of balances) {
                const currencyCode = balance.Currency.currency_code;
                const currencyData = {
                    currency_id: balance.currency_id,
                    currency_code: currencyCode,
                    currency_name: balance.Currency.currency_name,
                    balance: parseInt(balance.balance),
                    total_earned: parseInt(balance.total_earned),
                    total_spent: parseInt(balance.total_spent),
                    daily_earned_today: balance.daily_earned_today,
                    is_premium: balance.Currency.is_premium,
                    icon_path: balance.Currency.icon_path
                };

                result.currencies[currencyCode] = currencyData;

                // Calculate total wealth in SynCoin equivalent
                const synCoinValue = balance.Currency.toSynCoinValue(balance.balance);
                result.total_wealth_in_syncoin += synCoinValue;
            }

            return result;
        } catch (error) {
            console.error('Error getting user balances:', error);
            throw error;
        }
    }

    /**
     * Award currency to user
     * @param {number} userId - User ID
     * @param {string} currencyCode - Currency code (SYNC)
     * @param {number} amount - Amount to award
     * @param {string} sourceType - Source of earning
     * @param {number} sourceId - Source ID (optional)
     * @param {string} description - Description (optional)
     * @param {Object} metadata - Additional metadata (optional)
     * @returns {Object}
     */
    static async awardCurrency(userId, currencyCode, amount, sourceType, sourceId = null, description = '', metadata = {}) {
        try {
            // Get currency
            const currency = await Currency.getByCurrencyCode(currencyCode);
            if (!currency) {
                throw new Error(`Currency ${currencyCode} not found`);
            }

            // Get or create user currency
            const [userCurrency] = await UserCurrency.findOrCreate({
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

            // Daily limit check removed - no more restrictions
            let finalAmount = parseInt(amount);

            // Record balance before transaction
            const balanceBefore = parseInt(userCurrency.balance);

            // Add currency to user balance
            const addResult = await userCurrency.addBalance(finalAmount, sourceType);

            // Create transaction record
            await CurrencyTransaction.createTransaction({
                userId: userId,
                currencyId: currency.currency_id,
                transactionType: 'EARN',
                amount: finalAmount,
                balanceBefore: balanceBefore,
                balanceAfter: addResult.new_balance,
                sourceType: sourceType,
                sourceId: sourceId,
                description: description,
                metadata: {
                    ...metadata,
                    original_amount: parseInt(amount),
                    adjusted_for_daily_limit: finalAmount !== parseInt(amount)
                }
            });

            return {
                success: true,
                message: `Đã thêm ${finalAmount} ${currency.currency_name}`,
                currency_code: currencyCode,
                amount_awarded: finalAmount,
                original_amount: parseInt(amount),
                new_balance: addResult.new_balance,
                old_balance: balanceBefore,
                daily_limit_applied: false
            };

        } catch (error) {
            console.error('Error awarding currency:', error);
            throw error;
        }
    }

    /**
     * Spend currency from user
     * @param {number} userId - User ID
     * @param {string} currencyCode - Currency code (SYNC)
     * @param {number} amount - Amount to spend
     * @param {string} sourceType - Source of spending
     * @param {number} sourceId - Source ID (optional)
     * @param {string} description - Description (optional)
     * @param {Object} metadata - Additional metadata (optional)
     * @returns {Object}
     */
    static async spendCurrency(userId, currencyCode, amount, sourceType, sourceId = null, description = '', metadata = {}) {
        try {
            // Get currency
            const currency = await Currency.getByCurrencyCode(currencyCode);
            if (!currency) {
                throw new Error(`Currency ${currencyCode} not found`);
            }

            // Get user currency
            const userCurrency = await UserCurrency.getUserBalance(userId, currencyCode);
            if (!userCurrency) {
                return {
                    success: false,
                    message: `Không tìm thấy tài khoản ${currency.currency_name}`,
                    insufficient_balance: true,
                    current_balance: 0,
                    required_amount: parseInt(amount)
                };
            }

            // Check sufficient balance
            const spendAmount = parseInt(amount);
            if (!userCurrency.hasSufficientBalance(spendAmount)) {
                return {
                    success: false,
                    message: `Không đủ ${currency.currency_name}`,
                    insufficient_balance: true,
                    current_balance: parseInt(userCurrency.balance),
                    required_amount: spendAmount,
                    shortage: spendAmount - parseInt(userCurrency.balance)
                };
            }

            // Record balance before transaction
            const balanceBefore = parseInt(userCurrency.balance);

            // Subtract currency from user balance
            const subtractResult = await userCurrency.subtractBalance(spendAmount, sourceType);

            // Create transaction record
            await CurrencyTransaction.createTransaction({
                userId: userId,
                currencyId: currency.currency_id,
                transactionType: 'SPEND',
                amount: spendAmount,
                balanceBefore: balanceBefore,
                balanceAfter: subtractResult.new_balance,
                sourceType: sourceType,
                sourceId: sourceId,
                description: description,
                metadata: metadata
            });

            return {
                success: true,
                message: `Đã tiêu ${spendAmount} ${currency.currency_name}`,
                currency_code: currencyCode,
                amount_spent: spendAmount,
                new_balance: subtractResult.new_balance,
                old_balance: balanceBefore
            };

        } catch (error) {
            console.error('Error spending currency:', error);
            throw error;
        }
    }

    /**
     * Award currency based on quiz completion
     * @param {number} userId - User ID
     * @param {Object} quizData - Quiz completion data
     * @returns {Object}
     */
    static async awardQuizCompletionCurrency(userId, quizData) {
        try {
            const {
                quiz_id,
                correct_answers = 0,
                total_questions = 0,
                is_perfect_score = false,
                average_response_time = 0,
                has_speed_bonus = false
            } = quizData;

            const results = {
                syncoin: null,
                total_awarded: {
                    syncoin: 0
                }
            };

            // Calculate SynCoin reward
            let synCoinAmount = 10; // Base amount
            
            // Bonus for correct answers
            synCoinAmount += correct_answers * 2;
            
            // Perfect score bonus
            if (is_perfect_score) {
                synCoinAmount += 20;
            }
            
            // Speed bonus
            if (has_speed_bonus) {
                synCoinAmount += 5;
            }

            // Award SynCoin
            const synCoinResult = await this.awardCurrency(
                userId,
                'SYNC',
                synCoinAmount,
                'QUIZ_COMPLETION',
                quiz_id,
                `Hoàn thành quiz - ${correct_answers}/${total_questions} câu đúng`,
                {
                    quiz_id,
                    correct_answers,
                    total_questions,
                    is_perfect_score,
                    has_speed_bonus,
                    score_percentage: total_questions > 0 ? (correct_answers / total_questions) * 100 : 0
                }
            );

            results.syncoin = synCoinResult;
            if (synCoinResult.success) {
                results.total_awarded.syncoin = synCoinResult.amount_awarded;
            }

            return results;

        } catch (error) {
            console.error('Error awarding quiz completion currency:', error);
            throw error;
        }
    }

    /**
     * Award daily login bonus
     * @param {number} userId - User ID
     * @param {number} consecutiveDays - Number of consecutive login days
     * @returns {Object}
     */
    static async awardDailyLoginBonus(userId, consecutiveDays = 1) {
        try {
            let synCoinAmount = 50; // Base daily login bonus
            
            // Consecutive days bonus
            if (consecutiveDays >= 30) {
                synCoinAmount += 50;
            } else if (consecutiveDays >= 7) {
                synCoinAmount += 25;
            } else if (consecutiveDays >= 3) {
                synCoinAmount += 10;
            }

            const result = await this.awardCurrency(
                userId,
                'SYNC',
                synCoinAmount,
                'DAILY_LOGIN',
                null,
                `Thưởng đăng nhập hàng ngày - ${consecutiveDays} ngày liên tiếp`,
                {
                    consecutive_days: consecutiveDays,
                    base_amount: 50,
                    bonus_amount: synCoinAmount - 50
                }
            );

            return result;

        } catch (error) {
            console.error('Error awarding daily login bonus:', error);
            throw error;
        }
    }

    /**
     * Get user's transaction history
     * @param {number} userId - User ID
     * @param {Object} options - Query options
     * @returns {Object}
     */
    static async getUserTransactionHistory(userId, options = {}) {
        try {
            const transactions = await CurrencyTransaction.getUserTransactionHistory(userId, options);
            
            return {
                user_id: userId,
                transactions: transactions.map(transaction => ({
                    transaction_id: transaction.transaction_id,
                    currency_code: transaction.Currency.currency_code,
                    currency_name: transaction.Currency.currency_name,
                    transaction_type: transaction.transaction_type,
                    transaction_type_display: transaction.getTransactionTypeDisplay(),
                    amount: parseInt(transaction.amount),
                    formatted_amount: transaction.getFormattedAmount(),
                    balance_before: parseInt(transaction.balance_before),
                    balance_after: parseInt(transaction.balance_after),
                    source_type: transaction.source_type,
                    source_id: transaction.source_id,
                    description: transaction.getFormattedDescription(),
                    metadata: transaction.metadata,
                    created_at: transaction.created_at,
                    is_positive: transaction.isPositive(),
                    is_negative: transaction.isNegative()
                })),
                total_count: transactions.length,
                options: options
            };

        } catch (error) {
            console.error('Error getting user transaction history:', error);
            throw error;
        }
    }

    /**
     * Get currency statistics
     * @param {number} userId - User ID (optional, for user-specific stats)
     * @returns {Object}
     */
    static async getCurrencyStatistics(userId = null) {
        try {
            const stats = {
                system_stats: {},
                user_stats: null
            };

            // System-wide statistics
            const currencies = await Currency.getActiveCurrencies();
            for (const currency of currencies) {
                const currencyStats = await this.getCurrencySystemStats(currency.currency_code);
                stats.system_stats[currency.currency_code] = currencyStats;
            }

            // User-specific statistics
            if (userId) {
                stats.user_stats = await this.getUserCurrencyStats(userId);
            }

            return stats;

        } catch (error) {
            console.error('Error getting currency statistics:', error);
            throw error;
        }
    }

    /**
     * Get system-wide currency statistics
     * @param {string} currencyCode - Currency code
     * @returns {Object}
     */
    static async getCurrencySystemStats(currencyCode) {
        try {
            const currency = await Currency.getByCurrencyCode(currencyCode);
            if (!currency) {
                throw new Error(`Currency ${currencyCode} not found`);
            }

            // Get total circulation
            const circulationResult = await UserCurrency.findAll({
                where: { currency_id: currency.currency_id },
                attributes: [
                    [UserCurrency.sequelize.fn('SUM', UserCurrency.sequelize.col('balance')), 'total_circulation'],
                    [UserCurrency.sequelize.fn('SUM', UserCurrency.sequelize.col('total_earned')), 'total_earned'],
                    [UserCurrency.sequelize.fn('SUM', UserCurrency.sequelize.col('total_spent')), 'total_spent'],
                    [UserCurrency.sequelize.fn('COUNT', UserCurrency.sequelize.col('user_id')), 'active_users']
                ],
                raw: true
            });

            const circulation = circulationResult[0] || {};

            return {
                currency_code: currencyCode,
                currency_name: currency.currency_name,
                total_circulation: parseInt(circulation.total_circulation) || 0,
                total_earned: parseInt(circulation.total_earned) || 0,
                total_spent: parseInt(circulation.total_spent) || 0,
                active_users: parseInt(circulation.active_users) || 0,
                is_premium: currency.is_premium,
                max_daily_earn: currency.max_daily_earn
            };

        } catch (error) {
            console.error('Error getting currency system stats:', error);
            throw error;
        }
    }

    /**
     * Check if user has sufficient balance
     * @param {number} userId - User ID
     * @param {string} currencyCode - Currency code
     * @param {number} amount - Amount to check
     * @returns {Object}
     */
    static async checkUserBalance(userId, currencyCode, amount) {
        try {
            const userCurrency = await UserCurrency.getUserBalance(userId, currencyCode);

            if (!userCurrency) {
                return {
                    success: false,
                    sufficient: false,
                    current_balance: 0,
                    required_amount: parseInt(amount),
                    shortage: parseInt(amount)
                };
            }

            const currentBalance = parseInt(userCurrency.balance);
            const requiredAmount = parseInt(amount);
            const sufficient = currentBalance >= requiredAmount;

            return {
                success: true,
                sufficient: sufficient,
                current_balance: currentBalance,
                required_amount: requiredAmount,
                shortage: sufficient ? 0 : requiredAmount - currentBalance
            };

        } catch (error) {
            console.error('Error checking user balance:', error);
            throw error;
        }
    }

    /**
     * Get user-specific currency statistics
     * @param {number} userId - User ID
     * @returns {Object}
     */
    static async getUserCurrencyStats(userId) {
        try {
            const balances = await this.getUserBalances(userId);
            const stats = {
                user_id: userId,
                currencies: {},
                total_wealth_in_syncoin: balances.total_wealth_in_syncoin
            };

            for (const [currencyCode, currencyData] of Object.entries(balances.currencies)) {
                // Get transaction stats for each currency
                const transactionStats = await CurrencyTransaction.getUserTransactionStats(userId, currencyCode, 'all');
                
                stats.currencies[currencyCode] = {
                    ...currencyData,
                    transaction_stats: transactionStats
                };
            }

            return stats;

        } catch (error) {
            console.error('Error getting user currency stats:', error);
            throw error;
        }
    }
}

module.exports = CurrencyService;
