const CurrencyService = require('../services/currencyService');
const { Currency, UserCurrency, CurrencyTransaction } = require('../models');



class CurrencyController {

   
    
    static async getUserBalances(req, res) {
        try {
            const userId = req.user.user_id;
            const balances = await CurrencyService.getUserBalances(userId);

            res.status(200).json({
                success: true,
                message: 'Lấy số dư thành công',
                data: balances
            });

        } catch (error) {
            console.error('Error getting user balances:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy số dư',
                error: error.message
            });
        }
    }

    
    
    static async getUserTransactionHistory(req, res) {
        try {
            const userId = req.user.user_id;
            const {
                currency_code,
                transaction_type,
                source_type,
                limit = 50,
                offset = 0,
                start_date,
                end_date
            } = req.query;

            const options = {
                currencyCode: currency_code,
                transactionType: transaction_type,
                sourceType: source_type,
                limit: parseInt(limit),
                offset: parseInt(offset),
                startDate: start_date ? new Date(start_date) : null,
                endDate: end_date ? new Date(end_date) : null
            };

            const history = await CurrencyService.getUserTransactionHistory(userId, options);

            res.status(200).json({
                success: true,
                message: 'Lấy lịch sử giao dịch thành công',
                data: history
            });

        } catch (error) {
            console.error('Error getting transaction history:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy lịch sử giao dịch',
                error: error.message
            });
        }
    }

   
    
    static async awardCurrency(req, res) {
        try {
            const {
                user_id,
                currency_code,
                amount,
                source_type = 'ADMIN_ADJUST',
                source_id = null,
                description = 'Thưởng từ admin'
            } = req.body;

            // Validate required fields
            if (!user_id || !currency_code || !amount) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu thông tin bắt buộc: user_id, currency_code, amount'
                });
            }

            if (amount <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Số tiền phải lớn hơn 0'
                });
            }

            const result = await CurrencyService.awardCurrency(
                user_id,
                currency_code,
                amount,
                source_type,
                source_id,
                description,
                {
                    admin_id: req.user.user_id,
                    admin_name: req.user.name
                }
            );

            res.status(200).json({
                success: true,
                message: result.message,
                data: result
            });

        } catch (error) {
            console.error('Error awarding currency:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi thưởng tiền tệ',
                error: error.message
            });
        }
    }

  
    
    static async spendCurrency(req, res) {
        try {
            const userId = req.user.user_id;
            const {
                currency_code,
                amount,
                source_type,
                source_id = null,
                description = ''
            } = req.body;

            // Validate required fields
            if (!currency_code || !amount || !source_type) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu thông tin bắt buộc: currency_code, amount, source_type'
                });
            }

            if (amount <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Số tiền phải lớn hơn 0'
                });
            }

            const result = await CurrencyService.spendCurrency(
                userId,
                currency_code,
                amount,
                source_type,
                source_id,
                description
            );

            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    message: result.message,
                    data: result
                });
            }

            res.status(200).json({
                success: true,
                message: result.message,
                data: result
            });

        } catch (error) {
            console.error('Error spending currency:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi tiêu tiền tệ',
                error: error.message
            });
        }
    }

    static async earnCurrency(req, res) {
        try {
            const userId = req.user.user_id;
            const { currency_code, amount, source_type, source_id, description } = req.body;

            // Validate required fields
            if (!currency_code || !amount || !source_type) {
                return res.status(400).json({
                    success: false,
                    message: 'Currency code, amount, and source type are required'
                });
            }

            const result = await CurrencyService.earnCurrency(
                userId,
                currency_code,
                amount,
                source_type,
                source_id,
                description
            );

            res.status(200).json({
                success: true,
                message: `Đã nhận ${amount} ${currency_code}`,
                currency_code: currency_code,
                amount_earned: amount,
                new_balance: result.new_balance,
                old_balance: result.old_balance
            });

        } catch (error) {
            console.error('Error earning currency:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi nhận tiền tệ',
                error: error.message
            });
        }
    }


    static async awardDailyLoginBonus(req, res) {
        try {
            const userId = req.user.user_id;
            const { consecutive_days = 1 } = req.body;

            const result = await CurrencyService.awardDailyLoginBonus(userId, consecutive_days);

            res.status(200).json({
                success: true,
                message: result.message,
                data: result
            });

        } catch (error) {
            console.error('Error awarding daily login bonus:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi thưởng đăng nhập hàng ngày',
                error: error.message
            });
        }
    }

    
    static async getCurrencyStatistics(req, res) {
        try {
            const userId = req.user.user_id;
            const { include_user_stats = 'true' } = req.query;

            const includeUserStats = include_user_stats === 'true';
            const stats = await CurrencyService.getCurrencyStatistics(
                includeUserStats ? userId : null
            );

            res.status(200).json({
                success: true,
                message: 'Lấy thống kê thành công',
                data: stats
            });

        } catch (error) {
            console.error('Error getting currency statistics:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thống kê',
                error: error.message
            });
        }
    }

    
    static async getCurrencyList(req, res) {
        try {
            const currencies = await Currency.getActiveCurrencies();

            const currencyList = currencies.map(currency => ({
                currency_id: currency.currency_id,
                currency_code: currency.currency_code,
                currency_name: currency.currency_name,
                description: currency.description,
                icon_path: currency.icon_path,
                is_premium: currency.is_premium,
                exchange_rate: parseFloat(currency.exchange_rate),
                max_daily_earn: currency.max_daily_earn
            }));

            res.status(200).json({
                success: true,
                message: 'Lấy danh sách tiền tệ thành công',
                data: {
                    currencies: currencyList,
                    total_count: currencyList.length
                }
            });

        } catch (error) {
            console.error('Error getting currency list:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách tiền tệ',
                error: error.message
            });
        }
    }

    
    static async initializeUserCurrencies(req, res) {
        try {
            const userId = req.user.user_id;
            const userCurrencies = await CurrencyService.initializeUserCurrencies(userId);

            res.status(200).json({
                success: true,
                message: 'Khởi tạo tài khoản tiền tệ thành công',
                data: {
                    user_id: userId,
                    initialized_currencies: userCurrencies.length,
                    currencies: userCurrencies.map(uc => ({
                        currency_id: uc.currency_id,
                        balance: parseInt(uc.balance)
                    }))
                }
            });

        } catch (error) {
            console.error('Error initializing user currencies:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi khởi tạo tài khoản tiền tệ',
                error: error.message
            });
        }
    }

    
    static async getTopEarningSources(req, res) {
        try {
            const userId = req.user.user_id;
            const { currency_code = 'SYNC', limit = 10 } = req.query;

            const sources = await CurrencyTransaction.getTopEarningSources(
                userId,
                currency_code,
                parseInt(limit)
            );

            res.status(200).json({
                success: true,
                message: 'Lấy nguồn kiếm tiền thành công',
                data: {
                    user_id: userId,
                    currency_code: currency_code,
                    earning_sources: sources.map(source => ({
                        source_type: source.source_type,
                        transaction_count: parseInt(source.transaction_count),
                        total_earned: parseInt(source.total_earned),
                        average_earned: parseFloat(source.average_earned)
                    }))
                }
            });

        } catch (error) {
            console.error('Error getting earning sources:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy nguồn kiếm tiền',
                error: error.message
            });
        }
    }

    
    static async getWealthLeaderboard(req, res) {
        try {
            const { limit = 50, offset = 0 } = req.query;

            // Simplified wealth calculation (SynCoin only, Kristal removed)
            const leaderboard = await Currency.sequelize.query(`
                SELECT 
                    u.user_id,
                    u.name,
                    u.current_level,
                    u.experience_points,
                    COALESCE(uc.balance, 0) AS syncoin,
                    COALESCE(uc.balance, 0) AS total_wealth,
                    RANK() OVER (ORDER BY COALESCE(uc.balance, 0) DESC) AS wealth_rank
                FROM "Users" u
                LEFT JOIN "UserCurrencies" uc ON u.user_id = uc.user_id
                LEFT JOIN "Currencies" c ON uc.currency_id = c.currency_id 
                    AND c.currency_code = 'SYNC'
                WHERE u.is_active = true
                ORDER BY wealth_rank ASC
                LIMIT :limit OFFSET :offset
            `, {
                replacements: {
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                },
                type: Currency.sequelize.QueryTypes.SELECT
            });

            res.status(200).json({
                success: true,
                message: 'Lấy bảng xếp hạng thành công',
                data: {
                    leaderboard: leaderboard.map(entry => ({
                        user_id: entry.user_id,
                        name: entry.name,
                        current_level: entry.current_level,
                        experience_points: entry.experience_points,
                        syncoin: parseInt(entry.syncoin) || 0,
                        total_wealth: parseInt(entry.total_wealth) || 0,
                        wealth_rank: parseInt(entry.wealth_rank)
                    })),
                    total_count: leaderboard.length,
                    pagination: {
                        limit: parseInt(limit),
                        offset: parseInt(offset)
                    }
                }
            });

        } catch (error) {
            console.error('Error getting wealth leaderboard:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy bảng xếp hạng',
                error: error.message
            });
        }
    }

    
    static async syncUserCurrencies(req, res) {
        try {
            const userId = req.user.user_id;
            
            // Initialize currencies if not exists
            await CurrencyService.initializeUserCurrencies(userId);
            
            // Get updated balances
            const balances = await CurrencyService.getUserBalances(userId);

            res.status(200).json({
                success: true,
                message: 'Đồng bộ tài khoản tiền tệ thành công',
                data: balances
            });

        } catch (error) {
            console.error('Error syncing user currencies:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi đồng bộ tài khoản tiền tệ',
                error: error.message
            });
        }
    }
}

module.exports = CurrencyController;
