const { sequelize } = require('../models');
const { Op } = require('sequelize');
const { User, Quiz, Question, Answer, QuizResult, UserQuestionHistory, UserCurrency, UserInventory, CurrencyTransaction } = require('../models');
const CurrencyService = require('../services/currencyService');
const GamificationService = require('../services/gamificationService');
const EggOpeningService = require('../services/eggOpeningService');

/**
 * Practice Session Controller
 * Xử lý các API liên quan đến phiên luyện tập quiz
 */
class PracticeSessionController {

    /**
     * Submit practice session results
     * POST /api/practice/submit-session-results
     * 
     * Xử lý toàn bộ kết quả phiên luyện tập trong một request duy nhất
     */
    static async submitSessionResults(req, res) {
        const transaction = await sequelize.transaction();

        try {
            const userId = req.user.user_id;
            // Support both camelCase (documented) and snake_case (legacy/test) payload shapes
            let { quizInfo, performanceData, rewardsSummary, itemsFromEggs = [] } = req.body;
            console.log('[practice][submit] raw body keys:', Object.keys(req.body));
            // Legacy keys mapping (test_reward_bug.ps1 uses session_info, performance_data, rewards_summary)
            if (!quizInfo && req.body.session_info) {
                const s = req.body.session_info;
                quizInfo = {
                    quiz_id: s.quiz_id,
                    session_start_time: s.session_start_time,
                    session_end_time: s.session_end_time
                };
            }
            if (!performanceData && req.body.performance_data) {
                performanceData = req.body.performance_data.map(p => ({
                    question_id: p.question_id,
                    is_correct: p.is_correct,
                    response_time_ms: p.response_time_ms,
                    attempts: p.attempts
                }));
            }
            if (!rewardsSummary && req.body.rewards_summary) {
                rewardsSummary = {
                    total_exp_earned: req.body.rewards_summary.total_exp_earned,
                    total_syncoin_earned: req.body.rewards_summary.total_syncoin_earned
                };
            }
            if ((!itemsFromEggs || itemsFromEggs.length === 0) && Array.isArray(req.body.itemsFromEggs)) {
                itemsFromEggs = req.body.itemsFromEggs; // already camelCase
            }
            if ((!itemsFromEggs || itemsFromEggs.length === 0) && Array.isArray(req.body.items_from_eggs)) {
                itemsFromEggs = req.body.items_from_eggs; // snake_case variant just in case
            }

            // ================== VALIDATION ==================
            
            // Validate required fields
            if (!quizInfo || !quizInfo.quiz_id || !quizInfo.session_start_time || !quizInfo.session_end_time) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Lỗi xác thực dữ liệu đầu vào',
                    error: 'Trường quizInfo (quiz_id, session_start_time, session_end_time) là bắt buộc.'
                });
            }

            if (!performanceData || !Array.isArray(performanceData) || performanceData.length === 0) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Lỗi xác thực dữ liệu đầu vào',
                    error: 'Trường performanceData là bắt buộc và không được rỗng.'
                });
            }

            if (!rewardsSummary || typeof rewardsSummary.total_exp_earned !== 'number' || typeof rewardsSummary.total_syncoin_earned !== 'number') {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Lỗi xác thực dữ liệu đầu vào',
                    error: 'Trường rewardsSummary (total_exp_earned, total_syncoin_earned) là bắt buộc.'
                });
            }

            // Validate performance data structure
            for (const [index, performance] of performanceData.entries()) {
                if (!performance.question_id || typeof performance.is_correct !== 'boolean' || 
                    !performance.response_time_ms || !performance.attempts) {
                    await transaction.rollback();
                    return res.status(400).json({
                        success: false,
                        message: 'Lỗi xác thực dữ liệu đầu vào',
                        error: `PerformanceData[${index}] thiếu trường bắt buộc (question_id, is_correct, response_time_ms, attempts).`
                    });
                }
            }

            // ================== QUIZ VALIDATION ==================
            
            const quiz = await Quiz.findByPk(quizInfo.quiz_id, { transaction });
            console.log('[practice][submit] quizInfo:', quizInfo);
            if (!quiz) {
                await transaction.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Quiz không tồn tại'
                });
            }

            // Check if quiz is in practice mode
            if (quiz.quiz_mode !== 'practice') {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'API này chỉ dành cho quiz ở chế độ luyện tập'
                });
            }

            // ================== USER VALIDATION ==================
            
            const user = await User.findByPk(userId, { transaction });
            console.log('[practice][submit] user found:', !!user);
            if (!user) {
                await transaction.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Người dùng không tồn tại'
                });
            }

            // ================== CALCULATE SESSION METRICS ==================
            
            const sessionStartTime = new Date(quizInfo.session_start_time);
            const sessionEndTime = new Date(quizInfo.session_end_time);
            const totalSessionTime = sessionEndTime - sessionStartTime; // milliseconds
            
            const correctAnswers = performanceData.filter(p => p.is_correct).length;
            const totalQuestions = performanceData.length;
            const accuracy = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;
            const finalScore = Math.round(accuracy);

            // ================== CREATE/UPDATE QUIZ RESULT ==================
            
            console.log('[practice][submit] creating/updating quizResult');
            let quizResult = await QuizResult.findOne({
                where: { quiz_id: quizInfo.quiz_id, user_id: userId },
                transaction
            });

            if (quizResult) {
                // Update existing result
                await quizResult.update({
                    score: finalScore,
                    status: 'completed',
                    completion_time: totalSessionTime,
                    update_time: sessionEndTime
                }, { transaction });
            } else {
                // Create new result
                quizResult = await QuizResult.create({
                    quiz_id: quizInfo.quiz_id,
                    user_id: userId,
                    score: finalScore,
                    status: 'completed',
                    completion_time: totalSessionTime,
                    update_time: sessionEndTime
                }, { transaction });
            }

            // ================== VALIDATE QUESTION IDS BELONG TO QUIZ ==================
            const performanceQuestionIds = performanceData.map(p => p.question_id).filter(id => Number.isInteger(id));
            const uniqueQuestionIds = [...new Set(performanceQuestionIds)];
            let quizQuestionsRows = [];
            if (uniqueQuestionIds.length > 0) {
                // Build parameter list dynamically for IN clause
                const placeholders = uniqueQuestionIds.map((_, idx) => `:q${idx}`).join(',');
                const replacements = { quiz_id: quizInfo.quiz_id };
                uniqueQuestionIds.forEach((id, idx) => { replacements[`q${idx}`] = id; });
                const sql = `SELECT qq.question_id FROM "QuizQuestions" qq WHERE qq.quiz_id = :quiz_id AND qq.question_id IN (${placeholders})`;
                quizQuestionsRows = await sequelize.query(sql, {
                    replacements,
                    type: sequelize.QueryTypes.SELECT,
                    transaction
                });
            }
            const validIdsSet = new Set(quizQuestionsRows.map(r => r.question_id));
            const invalidIds = uniqueQuestionIds.filter(id => !validIdsSet.has(id));
            if (invalidIds.length > 0) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Lỗi xác thực dữ liệu đầu vào',
                    error: `Các question_id sau không thuộc quiz ${quizInfo.quiz_id}: ${invalidIds.join(', ')}`
                });
            }

            // ================== SAVE PERFORMANCE DATA ==================
            
            console.log('[practice][submit] saving performance count:', performanceData.length);
            for (const performance of performanceData) {
                // Check if this question history already exists
                const existingHistory = await UserQuestionHistory.findOne({
                    where: {
                        user_id: userId,
                        quiz_id: quizInfo.quiz_id,
                        question_id: performance.question_id
                    },
                    transaction
                });

                if (existingHistory) {
                    // Update existing history
                    await existingHistory.update({
                        is_correct: performance.is_correct,
                        time_spent: performance.response_time_ms,
                        attempt_date: sessionEndTime,
                        attempt_index: performance.attempts
                    }, { transaction });
                } else {
                    // Create new history
                    await UserQuestionHistory.create({
                        user_id: userId,
                        quiz_id: quizInfo.quiz_id,
                        question_id: performance.question_id,
                        is_correct: performance.is_correct,
                        time_spent: performance.response_time_ms,
                        attempt_date: sessionEndTime,
                        attempt_index: performance.attempts
                    }, { transaction });
                }
            }

            // ================== UPDATE GAMIFICATION (EXP & LEVEL) ==================
            
            let levelUpInfo = { level_up: false };
            if (rewardsSummary.total_exp_earned > 0) {
                console.log('[practice][submit] applying EXP:', rewardsSummary.total_exp_earned);
                const currentTotalPoints = user.total_points || 0;
                const newTotalPoints = currentTotalPoints + rewardsSummary.total_exp_earned;
                
                // Calculate old and new levels
                const oldLevel = user.current_level || 1;
                const newLevel = Math.floor(newTotalPoints / 100) + 1;
                const newExperiencePoints = newTotalPoints % 100;
                
                levelUpInfo = {
                    level_up: newLevel > oldLevel,
                    old_level: oldLevel,
                    new_level: newLevel
                };

                // Update user's gamification stats
                await user.update({
                    total_points: newTotalPoints,
                    current_level: newLevel,
                    experience_points: newExperiencePoints
                }, { transaction });
            }

            // ================== UPDATE CURRENCY (SYNCOIN) ==================
            
            let newSyncoinBalance = 0;
            if (rewardsSummary.total_syncoin_earned > 0) {
                console.log('[practice][submit] awarding currency:', rewardsSummary.total_syncoin_earned);
                // Note: CurrencyService.awardCurrency doesn't support transaction parameter
                // We'll commit the transaction first, then handle currency separately
                await transaction.commit();
                
                try {
                    const currencyResult = await CurrencyService.awardCurrency(
                        userId,
                        'SYNC',
                        rewardsSummary.total_syncoin_earned,
                        'QUIZ_PRACTICE_COMPLETION',
                        quizInfo.quiz_id,
                        'Hoàn thành phiên luyện tập quiz'
                    );

                    if (currencyResult.success) {
                        newSyncoinBalance = currencyResult.new_balance;
                    } else {
                        console.error('Error updating SynCoin:', currencyResult.message);
                        // Don't fail the entire operation, just log the error
                    }
                } catch (currencyError) {
                    console.error('Currency service error:', currencyError);
                    // Don't fail the entire operation
                }
            } else {
                await transaction.commit();
            }

            // ================== ADD ITEMS TO INVENTORY ==================
            
            const newInventoryItems = [];
            if (itemsFromEggs && itemsFromEggs.length > 0) {
                console.log('[practice][submit] adding inventory items count:', itemsFromEggs.length);
                for (const item of itemsFromEggs) {
                    if (!item.item_type || !item.item_id) {
                        continue; // Skip invalid items
                    }

                    try {
                        const inventoryItem = await UserInventory.addItemToInventory(
                            userId,
                            item.item_type,
                            item.item_id,
                            'EGG_REWARD',
                            { quiz_id: quizInfo.quiz_id, session_end_time: sessionEndTime }
                        );

                        newInventoryItems.push({
                            item_type: item.item_type,
                            item_id: item.item_id,
                            inventory_item: inventoryItem
                        });
                    } catch (error) {
                        console.error(`Error adding item ${item.item_type}:${item.item_id} to inventory:`, error);
                        // Continue with other items instead of failing completely
                    }
                }
            }

            // ================== TRANSACTION ALREADY COMMITTED ==================

            // ================== PREPARE RESPONSE ==================
            
            const response = {
                success: true,
                message: 'Kết quả phiên luyện tập đã được ghi nhận thành công!',
                data: {
                    updates_summary: {
                        exp_added: rewardsSummary.total_exp_earned,
                        syncoin_added: rewardsSummary.total_syncoin_earned,
                        new_items_added: newInventoryItems.length,
                        quiz_result_created: true
                    },
                    new_gamification_state: {
                        user_id: userId,
                        total_points: user.total_points + rewardsSummary.total_exp_earned,
                        current_level: Math.floor((user.total_points + rewardsSummary.total_exp_earned) / 100) + 1,
                        level_up: levelUpInfo.level_up,
                        experience_points: (user.total_points + rewardsSummary.total_exp_earned) % 100,
                        experience_to_next_level: 100 - ((user.total_points + rewardsSummary.total_exp_earned) % 100)
                    },
                    new_currency_balances: {
                        SYNC: newSyncoinBalance
                    },
                    new_inventory_items: newInventoryItems.map(item => ({
                        item_type: item.item_type,
                        item_id: item.item_id
                    })),
                    session_summary: {
                        quiz_id: quizInfo.quiz_id,
                        quiz_name: quiz.name,
                        total_questions: totalQuestions,
                        correct_answers: correctAnswers,
                        accuracy: Math.round(accuracy * 100) / 100,
                        final_score: finalScore,
                        session_duration_ms: totalSessionTime
                    }
                }
            };

            console.log('[practice][submit] success response summary:', response.data?.updates_summary);
            return res.status(200).json(response);

        } catch (error) {
            await transaction.rollback();
            console.error('Error in submitSessionResults:', error);
            console.error('Stack:', error.stack);
            
            return res.status(500).json({
                success: false,
                message: 'Lỗi server nội bộ',
                error: error.message
            });
        }
    }

    /**
     * Get practice session history for a user
     * GET /api/practice/session-history?quiz_id=123&limit=10
     */
    static async getSessionHistory(req, res) {
        try {
            const userId = req.user.user_id;
            const { quiz_id, limit = 10, page = 1 } = req.query;

            const whereClause = { user_id: userId };
            if (quiz_id) {
                whereClause.quiz_id = parseInt(quiz_id);
            }

            const offset = (parseInt(page) - 1) * parseInt(limit);

            const results = await QuizResult.findAndCountAll({
                where: whereClause,
                include: [{
                    model: Quiz,
                    as: 'Quiz',
                    attributes: ['quiz_id', 'name', 'quiz_mode'],
                    where: { quiz_mode: 'practice' }
                }],
                order: [['update_time', 'DESC']],
                limit: parseInt(limit),
                offset: offset
            });

            // Transform the results to add quiz_result_id field for consistency
            const transformedSessions = results.rows.map(session => ({
                ...session.toJSON(),
                quiz_result_id: session.result_id  // Add alias for frontend compatibility
            }));

            return res.status(200).json({
                success: true,
                message: 'Lấy lịch sử phiên luyện tập thành công',
                data: {
                    sessions: transformedSessions,
                    pagination: {
                        current_page: parseInt(page),
                        total_pages: Math.ceil(results.count / parseInt(limit)),
                        total_items: results.count,
                        items_per_page: parseInt(limit)
                    }
                }
            });

        } catch (error) {
            console.error('Error in getSessionHistory:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy lịch sử phiên luyện tập',
                error: error.message
            });
        }
    }

    /**
     * Get detailed performance data for a specific practice session
     * GET /api/practice/session-details/:quizResultId
     */
    static async getSessionDetails(req, res) {
        try {
            const userId = req.user.user_id;
            const { quizResultId } = req.params;

            const quizResult = await QuizResult.findOne({
                where: { 
                    result_id: quizResultId,
                    user_id: userId 
                },
                include: [{
                    model: Quiz,
                    as: 'Quiz',
                    attributes: ['quiz_id', 'name', 'quiz_mode'],
                    where: { quiz_mode: 'practice' }
                }]
            });

            if (!quizResult) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy phiên luyện tập'
                });
            }

            // Get question performance details
            const questionHistory = await UserQuestionHistory.findAll({
                where: {
                    user_id: userId,
                    quiz_id: quizResult.quiz_id
                },
                include: [{
                    model: Question,
                    as: 'Question',
                    attributes: ['question_id', 'question_text', 'level_id']
                }],
                order: [['attempt_date', 'ASC']]
            });

            return res.status(200).json({
                success: true,
                message: 'Lấy chi tiết phiên luyện tập thành công',
                data: {
                    session_info: quizResult,
                    question_performance: questionHistory
                }
            });

        } catch (error) {
            console.error('Error in getSessionDetails:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy chi tiết phiên luyện tập',
                error: error.message
            });
        }
    }

    /**
     * End individual practice session immediately
     * POST /api/practice/end-session
     * 
     * Kết thúc ngay phiên luyện tập cá nhân khi người dùng muốn dừng
     * NOTE: This endpoint should only be used for early termination.
     * For completed sessions, use submit-session-results which handles rewards.
     */
    static async endIndividualSession(req, res) {
        const transaction = await sequelize.transaction();

        try {
            const userId = req.user.user_id;
            const { session_id, quiz_id, reason = 'user_terminated' } = req.body;

            // ================== VALIDATION ==================
            
            if (!session_id && !quiz_id) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu thông tin phiên luyện tập',
                    error: 'Cần cung cấp session_id hoặc quiz_id để kết thúc phiên'
                });
            }

            // ================== FIND ACTIVE SESSION ==================
            
            let quizResult;
            if (session_id) {
                quizResult = await QuizResult.findOne({
                    where: { 
                        result_id: session_id,
                        user_id: userId,
                        status: { [Op.in]: ['in_progress', 'completed'] }
                    },
                    include: [{
                        model: Quiz,
                        as: 'Quiz',
                        attributes: ['quiz_id', 'name', 'quiz_mode']
                    }],
                    transaction
                });
            } else if (quiz_id) {
                quizResult = await QuizResult.findOne({
                    where: { 
                        quiz_id: quiz_id,
                        user_id: userId,
                        status: { [Op.in]: ['in_progress', 'completed'] }
                    },
                    include: [{
                        model: Quiz,
                        as: 'Quiz',
                        attributes: ['quiz_id', 'name', 'quiz_mode']
                    }],
                    transaction
                });
            }

            if (!quizResult) {
                await transaction.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy phiên luyện tập đang diễn ra'
                });
            }

            // ================== CHECK IF ALREADY COMPLETED ==================
            // If session was completed via submit-session-results, don't interfere
            if (quizResult.status === 'completed') {
                await transaction.rollback();
                return res.status(200).json({
                    success: true,
                    message: 'Phiên luyện tập đã được hoàn thành trước đó',
                    data: {
                        session_info: {
                            session_id: quizResult.result_id,
                            quiz_id: quizResult.quiz_id,
                            quiz_name: quizResult.Quiz.name,
                            status: 'completed',
                            end_reason: 'already_completed',
                            note: 'Session was completed via submit-session-results'
                        }
                    }
                });
            }

            // Check if this is individual practice mode
            if (quizResult.Quiz.quiz_mode !== 'practice') {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'API này chỉ dành cho phiên luyện tập cá nhân'
                });
            }

            // ================== END SESSION ==================
            // NOTE: Strengthen reliability with verification & fallback raw SQL
            const endTime = new Date();
            const startTimeValue = new Date(quizResult.start_time || quizResult.created_at || endTime);
            const sessionDuration = Math.max(0, endTime - startTimeValue);

            let updateOk = false;
            try {
                await quizResult.update({
                    status: 'terminated',
                    completion_time: sessionDuration,
                    update_time: endTime,
                    end_reason: reason
                }, { transaction });
                updateOk = true;
            } catch (e) {
                console.error('[practice][end-session] ORM update failed, will fallback:', e.message);
            }

            // Re-fetch inside the same transaction to verify
            let verification = await QuizResult.findOne({
                where: { result_id: quizResult.result_id },
                transaction,
                attributes: ['result_id','status','update_time']
            });

            if (!updateOk || !verification || verification.status !== 'terminated') {
                // Fallback raw SQL
                await sequelize.query(`
                    UPDATE "QuizResults"
                    SET status = 'terminated', completion_time = :completion_time, update_time = :update_time, end_reason = :end_reason
                    WHERE result_id = :result_id
                `, {
                    replacements: {
                        completion_time: sessionDuration,
                        update_time: endTime,
                        end_reason: reason,
                        result_id: quizResult.result_id
                    },
                    type: sequelize.QueryTypes.UPDATE,
                    transaction
                });
                verification = await QuizResult.findOne({
                    where: { result_id: quizResult.result_id },
                    transaction,
                    attributes: ['result_id','status','update_time']
                });
                console.log('[practice][end-session] Fallback applied. Status after fallback:', verification?.status);
            }

            // Get current progress
            const completedQuestions = await UserQuestionHistory.count({
                where: {
                    user_id: userId,
                    quiz_id: quizResult.quiz_id
                },
                transaction
            });

            const totalQuestions = await sequelize.query(`
                SELECT COUNT(*) as count 
                FROM "QuizQuestions" 
                WHERE quiz_id = :quiz_id
            `, {
                replacements: { quiz_id: quizResult.quiz_id },
                type: sequelize.QueryTypes.SELECT,
                transaction
            });

            const questionCount = parseInt(totalQuestions[0]?.count || 0);

            await transaction.commit();

            // Post-commit verification (non-blocking)
            setImmediate(async () => {
                try {
                    const post = await QuizResult.findByPk(quizResult.result_id, { attributes: ['result_id','status'] });
                    if (!post || post.status !== 'terminated') {
                        console.error('[practice][end-session] Post-commit status anomaly', { result_id: quizResult.result_id, status: post?.status });
                    }
                } catch (e) {
                    console.error('[practice][end-session] Post-commit verify error', e.message);
                }
            });

            // ================== PREPARE RESPONSE ==================
            
            const response = {
                success: true,
                message: 'Phiên luyện tập đã được kết thúc thành công',
                data: {
                    session_info: {
                        session_id: quizResult.result_id,
                        quiz_id: quizResult.quiz_id,
                        quiz_name: quizResult.Quiz.name,
                        status: 'terminated',
                        end_reason: reason,
                        session_duration_ms: sessionDuration,
                        progress: {
                            completed_questions: completedQuestions,
                            total_questions: questionCount,
                            completion_percentage: questionCount > 0 ? Math.round((completedQuestions / questionCount) * 100) : 0
                        }
                    },
                    recommendations: {
                        can_resume: false,
                        next_action: completedQuestions === 0 ? 'restart_session' : 'review_progress',
                        message: completedQuestions === 0 
                            ? 'Bạn có thể bắt đầu lại phiên luyện tập này'
                            : `Bạn đã hoàn thành ${completedQuestions}/${questionCount} câu hỏi. Bạn có thể xem lại kết quả hoặc tiếp tục luyện tập.`
                    }
                }
            };

            return res.status(200).json(response);

        } catch (error) {
            await transaction.rollback();
            console.error('Error in endIndividualSession:', error);
            
            return res.status(500).json({
                success: false,
                message: 'Lỗi server khi kết thúc phiên luyện tập',
                error: error.message
            });
        }
    }

    /**
     * Start individual practice session
     * POST /api/practice/start-session
     * 
     * Bắt đầu phiên luyện tập cá nhân mới
     */
    static async startIndividualSession(req, res) {
        const transaction = await sequelize.transaction();

        try {
            const userId = req.user.user_id;
            const { quiz_id, session_type = 'individual' } = req.body;

            // ================== VALIDATION ==================
            
            if (!quiz_id) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu thông tin quiz',
                    error: 'quiz_id là bắt buộc'
                });
            }

            // ================== QUIZ VALIDATION ==================
            
            const quiz = await Quiz.findByPk(quiz_id, { transaction });
            if (!quiz) {
                await transaction.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Quiz không tồn tại'
                });
            }

            // Check if quiz is in practice mode
            if (quiz.quiz_mode !== 'practice') {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Quiz này không phải ở chế độ luyện tập'
                });
            }

            // ================== CHECK & CLEAN STALE SESSION ==================
            // A session might be stuck if status in_progress but last update older than 12h (configurable)
            const STALE_MS = 1000 * 60 * 60 * 12; // 12h
            const now = Date.now();
            const existingSession = await QuizResult.findOne({
                where: { quiz_id: quiz_id, user_id: userId, status: 'in_progress' },
                transaction
            });

            if (existingSession) {
                const lastUpdate = new Date(existingSession.update_time || existingSession.start_time || existingSession.created_at).getTime();
                const age = now - lastUpdate;
                if (age > STALE_MS) {
                    console.warn('[practice][start-session] Found stale in_progress session. Auto-terminating.', { result_id: existingSession.result_id, ageMs: age });
                    await existingSession.update({ status: 'terminated', end_reason: 'stale_auto_cleanup', update_time: new Date(), completion_time: 0 }, { transaction });
                } else {
                    await transaction.rollback();
                    return res.status(400).json({
                        success: false,
                        message: 'Bạn đã có phiên luyện tập đang diễn ra cho quiz này',
                        data: {
                            existing_session_id: existingSession.result_id,
                            suggestion: 'Hãy kết thúc phiên hiện tại trước khi bắt đầu phiên mới'
                        }
                    });
                }
            }

            // ================== CREATE NEW SESSION ==================
            
            const startTime = new Date();
            const quizResult = await QuizResult.create({
                quiz_id: quiz_id,
                user_id: userId,
                score: 0,
                status: 'in_progress',
                start_time: startTime,
                session_type: session_type,
                completion_time: null,
                update_time: startTime
            }, { transaction });

            // Get quiz questions count
            const totalQuestions = await sequelize.query(`
                SELECT COUNT(*) as count 
                FROM "QuizQuestions" 
                WHERE quiz_id = :quiz_id
            `, {
                replacements: { quiz_id: quiz_id },
                type: sequelize.QueryTypes.SELECT,
                transaction
            });

            const questionCount = parseInt(totalQuestions[0]?.count || 0);

            await transaction.commit();

            // ================== PREPARE RESPONSE ==================
            
            const response = {
                success: true,
                message: 'Phiên luyện tập cá nhân đã được khởi tạo thành công',
                data: {
                    session_info: {
                        session_id: quizResult.result_id,
                        quiz_id: quiz_id,
                        quiz_name: quiz.name,
                        status: 'in_progress',
                        session_type: session_type,
                        start_time: startTime,
                        total_questions: questionCount
                    },
                    next_actions: {
                        start_quiz: `GET /api/quizzes/${quiz_id}/questions`,
                        submit_answer: 'POST /api/practice/submit-answer',
                        end_session: 'POST /api/practice/end-session'
                    }
                }
            };

            return res.status(201).json(response);

        } catch (error) {
            await transaction.rollback();
            console.error('Error in startIndividualSession:', error);
            
            return res.status(500).json({
                success: false,
                message: 'Lỗi server khi khởi tạo phiên luyện tập',
                error: error.message
            });
        }
    }

    /**
     * Submit practice session results WITH EGG OPENING (Backend-side)
     * POST /api/practice-sessions/submit-with-eggs
     * 
     * Thay thế endpoint submit cũ - Nhận danh sách trứng chưa đập và xử lý logic đập trứng ở backend
     * Đảm bảo tính bảo mật và tính toàn vẹn dữ liệu
     */
    static async submitSessionWithEggs(req, res) {
        const transaction = await sequelize.transaction();

        try {
            const userId = req.user.user_id;
            const { quizInfo, performanceData, baseRewards, eggsToOpen = [] } = req.body;

            // ================== VALIDATION ==================
            
            // Validate required fields
            if (!quizInfo || !quizInfo.quiz_id || !quizInfo.session_start_time || !quizInfo.session_end_time) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Lỗi xác thực dữ liệu đầu vào',
                    error: 'Trường quizInfo (quiz_id, session_start_time, session_end_time) là bắt buộc.'
                });
            }

            if (!performanceData) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Lỗi xác thực dữ liệu đầu vào',
                    error: 'Trường performanceData là bắt buộc.'
                });
            }

            if (!baseRewards || typeof baseRewards.syncoin_collected !== 'number') {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Lỗi xác thực dữ liệu đầu vào',
                    error: 'Trường baseRewards.syncoin_collected là bắt buộc.'
                });
            }

            // Validate eggs
            if (!Array.isArray(eggsToOpen)) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Lỗi xác thực dữ liệu đầu vào',
                    error: 'Trường eggsToOpen phải là một mảng.'
                });
            }

            // Giới hạn số trứng tối đa
            if (eggsToOpen.length > 50) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Vượt quá giới hạn số trứng',
                    error: 'Tối đa 50 trứng mỗi phiên.'
                });
            }

            // Validate egg structure
            const validEggTypes = ['BASIC', 'CAT', 'DRAGON', 'RAINBOW', 'LEGENDARY'];
            for (const [index, egg] of eggsToOpen.entries()) {
                if (!egg.egg_type || !validEggTypes.includes(egg.egg_type)) {
                    await transaction.rollback();
                    return res.status(400).json({
                        success: false,
                        message: 'Lỗi xác thực dữ liệu trứng',
                        error: `eggsToOpen[${index}]: egg_type không hợp lệ. Phải là: ${validEggTypes.join(', ')}`
                    });
                }
                if (typeof egg.is_golden !== 'boolean') {
                    await transaction.rollback();
                    return res.status(400).json({
                        success: false,
                        message: 'Lỗi xác thực dữ liệu trứng',
                        error: `eggsToOpen[${index}]: is_golden phải là boolean`
                    });
                }
            }

            // ================== QUIZ VALIDATION ==================
            
            const quiz = await Quiz.findByPk(quizInfo.quiz_id, { transaction });
            if (!quiz) {
                await transaction.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy quiz',
                    error: `Quiz với ID ${quizInfo.quiz_id} không tồn tại.`
                });
            }

            // Validate quiz mode là practice
            if (quiz.quiz_mode !== 'practice') {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Loại quiz không hợp lệ',
                    error: 'Endpoint này chỉ hỗ trợ practice mode.'
                });
            }

            // ================== CALCULATE RESULTS ==================
            
            const {
                total_questions,
                correct_answers,
                incorrect_answers,
                total_time_seconds,
                score
            } = performanceData;

            // Calculate accuracy
            const accuracy = total_questions > 0 
                ? Math.round((correct_answers / total_questions) * 100) 
                : 0;

            // Calculate base EXP (từ quiz performance)
            const baseExp = Math.floor(correct_answers * 10 + (accuracy >= 80 ? 50 : 0));

            // ================== SAVE QUIZ RESULT ==================
            
            const quizResult = await QuizResult.create({
                quiz_id: quizInfo.quiz_id,
                user_id: userId,
                score: score,
                status: 'completed',
                completion_time: total_time_seconds,
                update_time: new Date()
            }, { transaction });

            const sessionId = quizResult.result_id;

            // ================== EGG OPENING (BACKEND) ==================
            
            let eggOpeningResults = [];
            let syncoinFromDuplicates = 0;

            if (eggsToOpen.length > 0) {
                const eggResults = await EggOpeningService.openMultipleEggs(
                    eggsToOpen,
                    userId,
                    sessionId,
                    transaction
                );

                eggOpeningResults = eggResults.results;
                syncoinFromDuplicates = eggResults.summary.total_syncoin_from_duplicates;
            }

            // Commit transaction after database operations
            await transaction.commit();

            // ================== CURRENCY & EXP ==================
            // NOTE: CurrencyService and User.addPoints() manage their own transactions
            
            // Tổng SynCoin = SynCoin từ gameplay + SynCoin từ trứng trùng
            const totalSyncoin = baseRewards.syncoin_collected + syncoinFromDuplicates;

            // Add SynCoin to user
            if (totalSyncoin > 0) {
                await CurrencyService.awardCurrency(
                    userId,
                    'SYNC',
                    totalSyncoin,
                    'PRACTICE_SESSION',
                    sessionId,
                    `Practice quiz #${quizInfo.quiz_id} session #${sessionId}`,
                    {}
                );
            }

            // Add EXP and check level up
            const user = await User.findByPk(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User không tồn tại',
                    error: `User với ID ${userId} không tồn tại.`
                });
            }

            const oldLevel = user.current_level;
            const levelUpResult = await user.addPoints(baseExp, 'practice_session');
            const newLevel = user.current_level;

            const levelUpInfo = oldLevel < newLevel ? {
                level_up: true,
                old_level: oldLevel,
                new_level: newLevel,
                new_titles: levelUpResult.new_titles || [],
                new_badges: levelUpResult.new_badges || [],
                new_avatar_items: levelUpResult.new_avatar_items || []
            } : null;

            // ================== RESPONSE ==================

            const response = {
                success: true,
                message: 'Phiên luyện tập đã được lưu thành công',
                data: {
                    session_id: sessionId,

                    rewards_summary: {
                        total_exp_earned: baseExp,
                        total_syncoin_earned: totalSyncoin,
                        syncoin_from_gameplay: baseRewards.syncoin_collected,
                        syncoin_from_duplicates: syncoinFromDuplicates
                    },

                    egg_opening_results: eggOpeningResults,

                    level_up: levelUpInfo.leveledUp ? {
                        old_level: levelUpInfo.oldLevel,
                        new_level: levelUpInfo.newLevel,
                        new_tier: levelUpInfo.newTier
                    } : null
                }
            };

            return res.status(200).json(response);

        } catch (error) {
            // Only rollback if transaction is still active
            if (transaction && !transaction.finished) {
                await transaction.rollback();
            }
            console.error('[PracticeSessionController] Error in submitSessionWithEggs:', error);
            
            return res.status(500).json({
                success: false,
                message: 'Lỗi server khi xử lý phiên luyện tập',
                error: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }
}

module.exports = PracticeSessionController;
