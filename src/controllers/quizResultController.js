const { QuizResult, User, Quiz, Question, Level, LO, UserQuestionHistory, ChapterLO, Chapter, ChapterSection, Subject, Course } = require('../models');
const { Op } = require('sequelize');
const analyticsDataFlowService = require('../services/analyticsDataFlowService');
const LeaderboardService = require('../services/leaderboardService');
const {
    analyzeLOStrengthsWeaknesses,
    analyzeDifficultyStrengthsWeaknesses,
    calculateQuestionDistribution,
    generateLearningImprovementSuggestions,
    analyzeChapterStrengthsWeaknesses,
    calculateChapterQuestionDistribution,
    generateChapterBasedImprovementSuggestions,
    analyzeLOCompletionPercentage,
    createPersonalizedStudyPlan
} = require('../utils/learningAnalysisHelpers');
const {
    analyzeLearningProgress,
    calculateFinalAccuracy,
    calculateFirstAttemptAccuracy,
    generateLearningRecommendations,
    groupByQuestion
} = require('../utils/multipleAttemptAnalysis');

// =====================================================
// HELPER FUNCTIONS
// =====================================================
/**
 * Đảm bảo tất cả câu hỏi trong quiz có UserQuestionHistory cho user
 * @param {number} user_id - ID của user
 * @param {number} quiz_id - ID của quiz
 */
async function ensureUserQuestionHistoryCompleteness(user_id, quiz_id) {
    try {
        // Lấy tất cả câu hỏi trong quiz
        const quizWithQuestions = await Quiz.findByPk(quiz_id, {
            include: [{
                model: Question,
                as: 'Questions',
                through: { attributes: [] },
                attributes: ['question_id']
            }],
            attributes: ['quiz_id']
        });

        const quizQuestions = quizWithQuestions?.Questions || [];

        console.log(`📝 Quiz ${quiz_id} has ${quizQuestions.length} questions total: [${quizQuestions.map(q => q.question_id).join(', ')}]`);

        // Lấy UserQuestionHistory hiện có
        const existingHistory = await UserQuestionHistory.findAll({
            where: { user_id, quiz_id },
            attributes: ['question_id']
        });

        const existingQuestionIds = existingHistory.map(h => h.question_id);
        console.log(`📝 User ${user_id} has history for ${existingQuestionIds.length} questions: [${existingQuestionIds.join(', ')}]`);

        // Tạo UserQuestionHistory cho những câu hỏi chưa có
        const missingQuestions = quizQuestions.filter(q => !existingQuestionIds.includes(q.question_id));

        if (missingQuestions.length > 0) {
            console.log(`📝 Creating UserQuestionHistory for ${missingQuestions.length} unanswered questions: [${missingQuestions.map(q => q.question_id).join(', ')}]`);

            const historyRecords = missingQuestions.map(question => ({
                user_id,
                question_id: question.question_id,
                quiz_id,
                selected_answer: null, // Không trả lời
                is_correct: false, // Đánh dấu là sai vì không trả lời
                time_spent: 0, // Không có thời gian
                attempt_date: new Date(),
                difficulty_level: null,
                points_earned: 0,
                scoring_breakdown: { unanswered: true },
                bonuses_earned: [],
                streak_at_time: 0,
                attempt_index: 1, // CRITICAL: Set attempt_index = 1 cho unanswered questions
            }));

            await UserQuestionHistory.bulkCreate(historyRecords);
            console.log(`✅ Created UserQuestionHistory for ${missingQuestions.length} unanswered questions`);
        } else {
            console.log(`✅ All questions already have UserQuestionHistory`);
        }

    } catch (historyError) {
        console.error(`❌ Error ensuring UserQuestionHistory completeness:`, historyError);
        // Don't fail the operation if this fails
    }
}

exports.getAllQuizResults = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const quizResults = await QuizResult.findAndCountAll({
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                { model: User, as: 'Student', attributes: ['user_id', 'name'] },
                { model: Quiz, as: 'Quiz', attributes: ['quiz_id', 'name'] },
            ],
        });

        res.status(200).json({
            success: true,
            data: {
                totalItems: quizResults.count,
                totalPages: Math.ceil(quizResults.count / limit),
                currentPage: parseInt(page),
                quizResults: quizResults.rows,
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách QuizResult',
            error: error.message
        });
    }
};

exports.getQuizResultById = async (req, res) => {
    try {
        const quizResult = await QuizResult.findByPk(req.params.id, {
            include: [
                { model: User, as: 'Student', attributes: ['user_id', 'name'] },
                { model: Quiz, as: 'Quiz', attributes: ['quiz_id', 'name'] },
            ],
        });

        if (!quizResult) return res.status(404).json({ message: 'QuizResult không tồn tại' });
        res.status(200).json(quizResult);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi lấy thông tin QuizResult', error: error.message });
    }
};

exports.createQuizResult = async (req, res) => {
    try {
        const { user_id, quiz_id, score, status, update_time, completion_time } = req.body;

        if (!user_id || !quiz_id || !score || !status) {
            return res.status(400).json({ message: 'Thiếu các trường bắt buộc' });
        }

        const user = await User.findByPk(user_id);
        const quiz = await Quiz.findByPk(quiz_id);

        if (!user) return res.status(400).json({ message: 'Người dùng không tồn tại' });
        if (!quiz) return res.status(400).json({ message: 'Quiz không tồn tại' });

        const newQuizResult = await QuizResult.create({
            user_id,
            quiz_id,
            score,
            status,
            update_time,
            completion_time,
        });

        // Đảm bảo tất cả câu hỏi trong quiz có UserQuestionHistory
        await ensureUserQuestionHistoryCompleteness(user_id, quiz_id);

        // =====================================================
        // TRIGGER ANALYTICS DATA FLOW
        // =====================================================

        // Only trigger analytics for completed quizzes
        if (status === 'completed' || status === 'finished') {
            try {
                console.log(`🔄 Triggering analytics for quiz completion: User ${user_id}, Quiz ${quiz_id}, Score ${score}`);

        // Trigger analytics processing (non-blocking)
        analyticsDataFlowService.processQuizCompletion({
            user_id,
            quiz_id,
            score,
            quiz_result_id: newQuizResult.result_id
        }).then(result => {
            if (result.success) {
                console.log(`✅ Analytics processing completed for user ${user_id}`);
            } else {
                console.error(`❌ Analytics processing failed for user ${user_id}:`, result.error);
            }
        }).catch(error => {
            console.error(`❌ Analytics processing error for user ${user_id}:`, error);
        });

        // Tính toán thống kê từ UserQuestionHistory để dùng cho currency và analytics
        try {
            const userHistory = await UserQuestionHistory.findAll({
                where: { user_id, quiz_id },
                attributes: ['is_correct', 'time_spent']
            });

            const correct_answers = userHistory.filter(h => h.is_correct).length;
            const total_questions = userHistory.length;
            const average_response_time = userHistory.length > 0
                ? userHistory.reduce((sum, h) => sum + (h.time_spent || 0), 0) / userHistory.length
                : 0;

            console.log(`📊 Quiz completion stats: ${correct_answers}/${total_questions} correct, avg time: ${average_response_time}ms`);

            // Award currency for quiz completion (non-blocking)
            const CurrencyService = require('../services/currencyService');

            // Calculate quiz completion data for currency rewards
            const quizCompletionData = {
                quiz_id: quiz_id,
                correct_answers: correct_answers,
                total_questions: total_questions,
                is_perfect_score: score === 100,
                average_response_time: average_response_time,
                has_speed_bonus: average_response_time && average_response_time < 5000 // Less than 5 seconds average
            };

            console.log(`💰 Awarding currency for quiz completion: User ${user_id}, Quiz ${quiz_id}`);

            CurrencyService.awardQuizCompletionCurrency(user_id, quizCompletionData)
                .then(currencyResult => {
                    if (currencyResult) {
                        console.log(`✅ Currency awarded for user ${user_id}:`, {
                            syncoin: currencyResult.total_awarded.syncoin,
                            kristal: currencyResult.total_awarded.kristal
                        });
                    }
                })
                .catch(error => {
                    console.error(`❌ Currency award error for user ${user_id}:`, error);
                });

        } catch (statsError) {
            console.error(`❌ Error calculating quiz stats for user ${user_id}:`, statsError);
        }

            } catch (error) {
                // Don't fail the quiz result creation if analytics fails
                console.error('❌ Error triggering analytics:', error);
            }
        }

        // Update leaderboard with total quiz score
        try {
            const totalScoreResult = await QuizResult.sum('score', {
                where: {
                    user_id: user_id,
                    status: { [Op.in]: ['completed', 'finished'] }
                }
            });
            const totalScore = totalScoreResult || 0;

            console.log(`🏆 Updating leaderboard for user ${user_id} with total score ${totalScore}`);

            // Update leaderboard (non-blocking)
            LeaderboardService.updateUserScore(user_id, 'QUIZ_SCORE', totalScore, 'GLOBAL')
                .then(() => console.log(`✅ Leaderboard updated for user ${user_id}`))
                .catch(error => console.error(`❌ Leaderboard update error for user ${user_id}:`, error));

            // Get user tier for tier-based leaderboard
            const user = await User.findByPk(user_id, { attributes: ['current_tier'] });
            if (user && user.current_tier) {
                LeaderboardService.updateUserScore(user_id, 'QUIZ_SCORE', totalScore, 'TIER_BASED', user.current_tier)
                    .then(() => console.log(`✅ Tier leaderboard updated for user ${user_id}`))
                    .catch(error => console.error(`❌ Tier leaderboard update error for user ${user_id}:`, error));
            }

        } catch (error) {
            console.error(`❌ Error updating leaderboard for user ${user_id}:`, error);
        }

        res.status(201).json(newQuizResult);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi tạo QuizResult', error: error.message });
    }
};

exports.updateQuizResult = async (req, res) => {
    try {
        const { user_id, quiz_id, score, status, update_time, completion_time } = req.body;

        const quizResult = await QuizResult.findByPk(req.params.id);
        if (!quizResult) return res.status(404).json({ message: 'QuizResult không tồn tại' });

        if (user_id) {
            const user = await User.findByPk(user_id);
            if (!user) return res.status(400).json({ message: 'Người dùng không tồn tại' });
        }
        if (quiz_id) {
            const quiz = await Quiz.findByPk(quiz_id);
            if (!quiz) return res.status(400).json({ message: 'Quiz không tồn tại' });
        }

        await quizResult.update({
            user_id: user_id || quizResult.user_id,
            quiz_id: quiz_id || quizResult.quiz_id,
            score: score || quizResult.score,
            status: status || quizResult.status,
            update_time: update_time || quizResult.update_time,
            completion_time: completion_time || quizResult.completion_time,
        });

        res.status(200).json(quizResult);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi cập nhật QuizResult', error: error.message });
    }
};

exports.deleteQuizResult = async (req, res) => {
    try {
        const quizResult = await QuizResult.findByPk(req.params.id);
        if (!quizResult) return res.status(404).json({ message: 'QuizResult không tồn tại' });

        await quizResult.destroy();
        res.status(200).json({ message: 'Xóa QuizResult thành công' });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi xóa QuizResult', error: error.message });
    }
};

// Lấy kết quả quiz theo user_id (chỉ cho student, chỉ lấy kết quả của chính mình)
exports.getQuizResultsByUserId = async (req, res) => {
    try {
        const { user_id } = req.params;
        // Chỉ cho phép student lấy kết quả của chính mình
        if (req.roleName !== 'student' || req.user.user_id !== parseInt(user_id)) {
            return res.status(403).json({ message: 'Bạn chỉ có thể xem kết quả của chính mình' });
        }
        const results = await QuizResult.findAll({
            where: { user_id },
            include: [
                { model: User, as: 'Student', attributes: ['user_id', 'name'] },
                { model: Quiz, as: 'Quiz', attributes: ['quiz_id', 'name', 'quiz_mode'] },
            ],
            order: [['update_time', 'DESC'], ['result_id', 'DESC']]
        });
        // Với mỗi kết quả, lấy lo_chapters tương ứng quiz_id
        const resultsWithChapters = [];
        const { QuizQuestion } = require('../models');
        for (const r of results) {
            const quiz_id = r.quiz_id;
            // Lấy tất cả question_id của quiz này qua bảng trung gian
            const quizQuestions = await QuizQuestion.findAll({ where: { quiz_id } });
            const questionIds = quizQuestions.map(q => q.question_id);
            // Lấy tất cả câu hỏi theo danh sách id
            const questions = await Question.findAll({
                where: { question_id: questionIds },
                include: [
                    { model: LO, as: 'LO', attributes: ['lo_id', 'name'] }
                ]
            });
            // Lấy tất cả LO duy nhất
            const loMap = {};
            questions.forEach(q => {
                if (q.lo_id && q.LO) {
                    loMap[q.lo_id] = q.LO.name;
                }
            });
            const loIds = Object.keys(loMap);
            // Với mỗi LO, lấy chương và section
            const loChapters = [];
            for (const loId of loIds) {
                const chapterLOs = await ChapterLO.findAll({ where: { lo_id: loId } });
                const chapterIds = chapterLOs.map(clo => clo.chapter_id);
                const chapters = await Chapter.findAll({
                    where: { chapter_id: chapterIds },
                    include: [
                        {
                            model: ChapterSection,
                            as: 'Sections',
                            attributes: ['section_id', 'title', 'content', 'order']
                        }
                    ]
                });
                loChapters.push({
                    lo_id: loId,
                    lo_name: loMap[loId],
                    chapters: chapters.map(chap => ({
                        chapter_id: chap.chapter_id,
                        chapter_name: chap.name,
                        sections: chap.Sections
                    }))
                });
            }
            resultsWithChapters.push({
                ...r.toJSON(),
                lo_chapters: loChapters
            });
        }
        res.status(200).json(resultsWithChapters);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi lấy kết quả QuizResult theo user', error: error.message });
    }
};

// Lấy kết quả quiz theo quiz_id (chỉ cho admin và teacher)
exports.getQuizResultsByQuizId = async (req, res) => {
    try {
        const { quiz_id } = req.params;
        if (!["admin", "teacher"].includes(req.roleName)) {
            return res.status(403).json({ message: 'Chỉ admin hoặc giáo viên mới có quyền xem kết quả theo quiz' });
        }
        const results = await QuizResult.findAll({
            where: { quiz_id },
            include: [
                { model: User, as: 'Student', attributes: ['user_id', 'name', 'email'] },
                { model: Quiz, as: 'Quiz', attributes: ['quiz_id', 'name'] },
            ],
        });

        // Lấy tất cả question_id của quiz này qua bảng trung gian
        const quizQuestions = await require('../models').QuizQuestion.findAll({ where: { quiz_id } });
        const questionIds = quizQuestions.map(q => q.question_id);
        // Lấy tất cả câu hỏi theo danh sách id
        const questions = await Question.findAll({
            where: { question_id: questionIds },
            include: [
                { model: LO, as: 'LO', attributes: ['lo_id', 'name'] }
            ]
        });
        // Lấy tất cả LO duy nhất
        const loMap = {};
        questions.forEach(q => {
            if (q.lo_id && q.LO) {
                loMap[q.lo_id] = q.LO.name;
            }
        });
        const loIds = Object.keys(loMap);
        // Với mỗi LO, lấy chương và section
        const loChapters = [];
        for (const loId of loIds) {
            const chapterLOs = await ChapterLO.findAll({ where: { lo_id: loId } });
            const chapterIds = chapterLOs.map(clo => clo.chapter_id);
            const chapters = await Chapter.findAll({
                where: { chapter_id: chapterIds },
                include: [
                    {
                        model: ChapterSection,
                        as: 'Sections',
                        attributes: ['section_id', 'title', 'content', 'order']
                    }
                ]
            });
            loChapters.push({
                lo_id: loId,
                lo_name: loMap[loId],
                chapters: chapters.map(chap => ({
                    chapter_id: chap.chapter_id,
                    chapter_name: chap.name,
                    sections: chap.Sections
                }))
            });
        }
        // Gắn thêm vào mỗi kết quả
        const resultsWithChapters = results.map(r => ({
            ...r.toJSON(),
            lo_chapters: loChapters
        }));
        res.status(200).json(resultsWithChapters);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi lấy kết quả QuizResult theo quiz', error: error.message });
    }
};

// API lấy dữ liệu radar chart cho người dùng hiện tại
exports.getCurrentUserRadarData = async (req, res) => {
    try {
        const { quizId } = req.params;
        const userId = req.user.user_id;

        // Kiểm tra quyền truy cập
        if (req.roleName !== 'student') {
            return res.status(403).json({ error: 'Chỉ học viên mới có thể xem dữ liệu radar của mình' });
        }

        console.log(`🔍 Getting radar data for user ${userId}, quiz ${quizId}`);

        // Lấy thông tin quiz và câu hỏi
        const quiz = await Quiz.findByPk(quizId, {
            include: [
                {
                    model: Question,
                    as: 'Questions',
                    through: { attributes: [] },
                    attributes: ['question_id', 'question_text', 'level_id', 'lo_id'],
                    include: [
                        {
                            model: Level,
                            as: 'Level',
                            attributes: ['level_id', 'name']
                        },
                        {
                            model: LO,
                            as: 'LO',
                            attributes: ['lo_id', 'name', 'description']
                        }
                    ]
                }
            ]
        });

        if (!quiz) {
            return res.status(404).json({ error: 'Không tìm thấy quiz' });
        }

        console.log(`✅ Quiz found: ${quiz.name} with ${quiz.Questions.length} questions`);

        // Lấy lịch sử trả lời câu hỏi của user
        const questionHistory = await UserQuestionHistory.findAll({
            where: {
                quiz_id: quizId,
                user_id: userId
            },
            attributes: ['question_id', 'is_correct', 'time_spent', 'attempt_date', 'attempt_index'],
            include: [
                {
                    model: Question,
                    as: 'Question',
                    attributes: ['question_id', 'level_id', 'lo_id'],
                    include: [
                        {
                            model: Level,
                            as: 'Level',
                            attributes: ['level_id', 'name']
                        },
                        {
                            model: LO,
                            as: 'LO',
                            attributes: ['lo_id', 'name', 'description']
                        }
                    ]
                }
            ],
            order: [['attempt_date', 'ASC']]
        });

        console.log(`✅ Found ${questionHistory.length} question history records for user ${userId}, quiz ${quizId}`);

        // Nếu không có lịch sử, trả về dữ liệu mặc định
        if (questionHistory.length === 0) {
            console.log(`⚠️ No question history found for user ${userId}`);

            // Tạo dữ liệu mặc định dựa trên questions của quiz
            const defaultRadarData = {
                difficulty_levels: {},
                learning_outcomes: {},
                performance_metrics: {
                    average_response_time: 0,
                    completion_rate: 0,
                    first_attempt_accuracy: 0,
                    overall_accuracy: 0
                }
            };

            // Khởi tạo với 0 cho tất cả levels và LOs
            quiz.Questions.forEach(question => {
                const levelName = question.Level.name.toLowerCase();
                const loName = question.LO.name;

                if (!defaultRadarData.difficulty_levels[levelName]) {
                    defaultRadarData.difficulty_levels[levelName] = {
                        accuracy: 0,
                        questions_count: 0,
                        average_response_time: 0
                    };
                }

                if (!defaultRadarData.learning_outcomes[loName]) {
                    defaultRadarData.learning_outcomes[loName] = {
                        description: question.LO.description || '',
                        accuracy: 0,
                        questions_count: 0,
                        average_response_time: 0
                    };
                }
            });

            return res.status(200).json({
                user_id: userId,
                quiz_id: quizId,
                radar_data: defaultRadarData,
                message: 'Chưa có dữ liệu trả lời câu hỏi'
            });
        }

        // Tính toán dữ liệu radar
        const radarData = calculateRadarData(quiz.Questions, questionHistory);

        // === Bổ sung: Tìm LO yếu nhất và độ khó yếu nhất ===
        // 1. LO yếu nhất
        let weakestLO = null;
        Object.entries(radarData.learning_outcomes).forEach(([lo, data]) => {
            if (!weakestLO || data.accuracy < weakestLO.accuracy) {
                weakestLO = { lo_name: lo, accuracy: data.accuracy };
            }
        });
        // 2. Độ khó yếu nhất
        let weakestDifficulty = null;
        Object.entries(radarData.difficulty_levels).forEach(([level, data]) => {
            if (!weakestDifficulty || data.accuracy < weakestDifficulty.accuracy) {
                weakestDifficulty = { level, accuracy: data.accuracy };
            }
        });

        // === Bổ sung: Chỉ thêm chương vào LO yếu nhất ===
        if (weakestLO) {
            const { ChapterLO, Chapter, ChapterSection } = require('../models');
            const loObj = quiz.Questions.find(q => q.LO && q.LO.name === weakestLO.lo_name)?.LO;
            if (loObj) {
                weakestLO.lo_id = loObj.lo_id;
                // Lấy chương liên quan
                const chapterLOs = await ChapterLO.findAll({ where: { lo_id: loObj.lo_id } });
                const chapterIds = chapterLOs.map(clo => clo.chapter_id);
                const chapters = await Chapter.findAll({
                    where: { chapter_id: chapterIds },
                    include: [
                        {
                            model: ChapterSection,
                            as: 'Sections',
                            attributes: ['section_id', 'title', 'content', 'order']
                        }
                    ]
                });
                weakestLO.chapters = chapters.map(chap => ({
                    chapter_id: chap.chapter_id,
                    chapter_name: chap.name,
                    description: chap.description,
                    sections: chap.Sections
                }));
            }
        }
        // === Kết thúc bổ sung ===

        res.status(200).json({
            user_id: userId,
            quiz_id: quizId,
            radar_data: radarData,
            weakest_lo: weakestLO,
            weakest_difficulty: weakestDifficulty
        });
    } catch (error) {
        console.error('Lỗi trong getCurrentUserRadarData:', error);
        res.status(500).json({ error: 'Lỗi khi lấy dữ liệu radar', details: error.message });
    }
};

// API lấy dữ liệu radar chart trung bình của tất cả người tham gia
exports.getAverageRadarData = async (req, res) => {
    try {
        const { quizId } = req.params;


        // Lấy thông tin quiz và câu hỏi
        const quiz = await Quiz.findByPk(quizId, {
            include: [
                {
                    model: Question,
                    as: 'Questions',
                    through: { attributes: [] },
                    attributes: ['question_id', 'question_text', 'level_id', 'lo_id'],
                    include: [
                        {
                            model: Level,
                            as: 'Level',
                            attributes: ['level_id', 'name']
                        },
                        {
                            model: LO,
                            as: 'LO',
                            attributes: ['lo_id', 'name', 'description']
                        }
                    ]
                }
            ]
        });

        if (!quiz) {
            return res.status(404).json({ error: 'Không tìm thấy quiz' });
        }

        // Lấy tất cả lịch sử trả lời câu hỏi của quiz này
        const allQuestionHistory = await UserQuestionHistory.findAll({
            where: { quiz_id: quizId },
            attributes: ['question_id', 'is_correct', 'time_spent', 'attempt_date', 'attempt_index', 'user_id'],
            include: [
                {
                    model: Question,
                    as: 'Question',
                    attributes: ['question_id', 'level_id', 'lo_id'],
                    include: [
                        {
                            model: Level,
                            as: 'Level',
                            attributes: ['level_id', 'name']
                        },
                        {
                            model: LO,
                            as: 'LO',
                            attributes: ['lo_id', 'name', 'description']
                        }
                    ]
                },
                {
                    model: User,
                    as: 'User',
                    attributes: ['user_id', 'name']
                }
            ],
            order: [['attempt_date', 'ASC']]
        });

        // Tính toán dữ liệu radar trung bình
        const radarData = calculateAverageRadarData(quiz.Questions, allQuestionHistory);

        res.status(200).json({
            quiz_id: quizId,
            radar_data: radarData
        });
    } catch (error) {
        console.error('Lỗi trong getAverageRadarData:', error);
        res.status(500).json({ error: 'Lỗi khi lấy dữ liệu radar trung bình', details: error.message });
    }
};

// API lấy dữ liệu radar chart của người xếp hạng 1
exports.getTopPerformerRadarData = async (req, res) => {
    try {
        const { quizId } = req.params;

        // Lấy leaderboard từ Firebase
        const QuizRealtimeService = require('../services/quizRealtimeService');
        const quizRealtimeService = new QuizRealtimeService();
        let leaderboard = await quizRealtimeService.getRealtimeLeaderboard(quizId);

        // Nếu không có leaderboard, fallback sang DB
        if (!leaderboard || leaderboard.length === 0) {
            // Lấy top scorer từ QuizResult
            const topResult = await QuizResult.findOne({
                where: { quiz_id: quizId },
                include: [{ model: User, as: 'Student', attributes: ['user_id', 'name'] }],
                order: [['score', 'DESC']]
            });
            if (!topResult) {
                return res.status(404).json({ error: 'Chưa có dữ liệu xếp hạng' });
            }
            leaderboard = [{
                user_id: topResult.user_id,
                name: topResult.Student?.name,
                score: topResult.score
            }];
        }

        const topPerformer = leaderboard[0];
        const topUserId = topPerformer.user_id;

        // Lấy lịch sử trả lời câu hỏi của người xếp hạng 1
        const topPerformerHistory = await UserQuestionHistory.findAll({
            where: {
                quiz_id: quizId,
                user_id: topUserId
            },
            attributes: ['question_id', 'is_correct', 'time_spent', 'attempt_date', 'attempt_index'],
            include: [
                {
                    model: Question,
                    as: 'Question',
                    attributes: ['question_id', 'level_id', 'lo_id'],
                    include: [
                        { model: Level, as: 'Level', attributes: ['level_id', 'name'] },
                        { model: LO, as: 'LO', attributes: ['lo_id', 'name', 'description'] }
                    ]
                },
                {
                    model: User,
                    as: 'User',
                    attributes: ['user_id', 'name']
                }
            ],
            order: [['attempt_date', 'ASC']]
        });

        // Tính toán dữ liệu radar cho top performer
        const quiz = await Quiz.findByPk(quizId, {
            include: [{
                model: Question,
                as: 'Questions',
                through: { attributes: [] },
                attributes: ['question_id', 'question_text', 'level_id', 'lo_id'],
                include: [
                    { model: Level, as: 'Level', attributes: ['level_id', 'name'] },
                    { model: LO, as: 'LO', attributes: ['lo_id', 'name', 'description'] }
                ]
            }]
        });

        const radarData = calculateRadarData(quiz.Questions, topPerformerHistory);

        res.status(200).json({
            success: true,
            data: {
                quiz_id: quizId,
                top_performer: {
                    user_id: topUserId,
                    name: topPerformer.name,
                    score: topPerformer.score
                },
                radar_data: radarData
            }
        });
    } catch (error) {
        console.error('Lỗi trong getTopPerformerRadarData:', error);
        res.status(500).json({ error: 'Lỗi khi lấy dữ liệu radar top performer', details: error.message });
    }
};

// Hàm tính toán dữ liệu radar cho một user
function calculateRadarData(questions, questionHistory) {
    console.log(`🔧 Calculating radar data for ${questionHistory.length} history records`);

    const totalQuestionsInQuiz = questions.length;

    // Phân tích theo mức độ khó
    const difficultyAnalysis = {};
    const loAnalysis = {};
    let totalResponseTime = 0;
    let totalQuestions = 0;
    let correctAnswers = 0;
    let firstAttemptCorrect = 0;
    let totalAttempts = 0;

    // Khởi tạo cấu trúc dữ liệu từ questions thực tế và đếm tổng số câu hỏi
    questions.forEach(question => {
        const levelName = question.Level ? question.Level.name.toLowerCase() : 'unknown';
        const loName = question.LO ? question.LO.name : 'unknown';

        console.log(`📋 Question ${question.question_id}: level="${levelName}", lo="${loName}"`);

        if (!difficultyAnalysis[levelName]) {
            difficultyAnalysis[levelName] = {
                correct: 0,
                answered: 0,
                response_time: 0,
                total_questions_in_quiz: 0,
                first_attempt_correct: 0,
                total_attempts: 0
            };
        }

        if (!loAnalysis[loName]) {
            loAnalysis[loName] = {
                correct: 0,
                answered: 0,
                response_time: 0,
                total_questions_in_quiz: 0,
                description: question.LO ? question.LO.description || '' : '',
                first_attempt_correct: 0,
                total_attempts: 0
            };
        }

        // Đếm tổng số câu hỏi trong quiz cho từng mức độ và LO
        difficultyAnalysis[levelName].total_questions_in_quiz++;
        loAnalysis[loName].total_questions_in_quiz++;
    });

    console.log(`📋 Initialized analysis for ${Object.keys(difficultyAnalysis).length} difficulty levels and ${Object.keys(loAnalysis).length} LOs`);

    // Group questionHistory by question_id
    const questionAttempts = {};
    questionHistory.forEach((history) => {
        const questionId = history.question_id;
        if (!questionAttempts[questionId]) {
            questionAttempts[questionId] = [];
        }
        questionAttempts[questionId].push(history);
    });

    console.log(`📋 Questions with history records: ${Object.keys(questionAttempts).length}`);
    Object.keys(questionAttempts).forEach(qId => {
        console.log(`  Question ${qId}: ${questionAttempts[qId].length} attempts`);
    });

    // Xử lý từng question
    Object.values(questionAttempts).forEach((attempts) => {
        if (attempts.length === 0) return;

        const questionId = attempts[0].question_id;
        // Tìm question từ quiz.Questions thay vì từ history association
        const question = questions.find(q => q.question_id === questionId);
        if (!question) {
            console.log(`⚠️ Question ${questionId} not found in quiz questions - available questions: [${questions.map(q => q.question_id).join(', ')}]`);
            return;
        }

        if (!question.Level || !question.LO) {
            console.log(`⚠️ Question ${questionId} missing Level or LO association - skipping`);
            return;
        }

        const levelName = question.Level.name.toLowerCase();
        const loName = question.LO.name;

        console.log(`✅ Processing question ${question.question_id}: level="${levelName}", lo="${loName}", attempts=${attempts.length}`);

        // Lấy lần cuối cùng và lần đầu tiên
        const lastAttempt = attempts[attempts.length - 1];
        const firstAttempt = attempts[0];

        // Cập nhật thống kê tổng thể
        totalQuestions++;
        totalResponseTime += lastAttempt.time_spent || 0;
        totalAttempts += attempts.length;

        if (lastAttempt.is_correct) {
            correctAnswers++;
            if (difficultyAnalysis[levelName]) {
                difficultyAnalysis[levelName].correct++;
            }
            if (loAnalysis[loName]) {
                loAnalysis[loName].correct++;
            }
        }

        // Kiểm tra first attempt
        if (firstAttempt.is_correct) {
            firstAttemptCorrect++;
            if (difficultyAnalysis[levelName]) {
                difficultyAnalysis[levelName].first_attempt_correct++;
            }
            if (loAnalysis[loName]) {
                loAnalysis[loName].first_attempt_correct++;
            }
        }

        // Cộng dồn attempts
        if (difficultyAnalysis[levelName]) {
            difficultyAnalysis[levelName].answered++;
            difficultyAnalysis[levelName].response_time += lastAttempt.time_spent || 0;
            difficultyAnalysis[levelName].total_attempts += attempts.length;
        }
        if (loAnalysis[loName]) {
            loAnalysis[loName].answered++;
            loAnalysis[loName].response_time += lastAttempt.time_spent || 0;
            loAnalysis[loName].total_attempts += attempts.length;
        }
    });

    console.log(`📊 Processed ${totalQuestions} unique questions (${correctAnswers} correct, ${firstAttemptCorrect} first attempt correct, ${totalAttempts} total attempts)`);

    // Tính toán accuracy cho từng mức độ khó
    const difficultyLevels = {};
    Object.keys(difficultyAnalysis).forEach(level => {
        const data = difficultyAnalysis[level];
        // Nếu không có câu hỏi nào được trả lời, hiển thị 0 cho tất cả metrics
        if (data.answered === 0) {
            difficultyLevels[level] = {
                accuracy: 0,
                questions_count: data.total_questions_in_quiz,
                average_response_time: 0,
                first_attempt_accuracy: 0,
                average_attempts_per_question: 0
            };
        } else {
            // FIX: Dùng first_attempt_accuracy làm accuracy chính (có penalty cho retry)
            // Nếu retry → first_attempt_correct < correct → accuracy thấp hơn
            difficultyLevels[level] = {
                accuracy: Math.round((data.first_attempt_correct / data.answered) * 100), // FIX: Dùng first_attempt thay vì lastAttempt
                questions_count: data.total_questions_in_quiz,
                average_response_time: Math.round(data.response_time / data.answered),
                first_attempt_accuracy: Math.round((data.first_attempt_correct / data.answered) * 100),
                average_attempts_per_question: Math.round((data.total_attempts / data.answered) * 100) / 100
            };
        }

        console.log(`📊 Difficulty "${level}": answered=${data.answered}/${data.total_questions_in_quiz}, first_correct=${data.first_attempt_correct}, accuracy=${difficultyLevels[level].accuracy}%, questions_count=${data.total_questions_in_quiz}`);
    });

    // Tính toán accuracy cho từng LO
    const learningOutcomes = {};
    Object.keys(loAnalysis).forEach(lo => {
        const data = loAnalysis[lo];
        // FIX: Dùng first_attempt_accuracy làm accuracy chính (có penalty cho retry)
        learningOutcomes[lo] = {
            accuracy: data.answered > 0 ? Math.round((data.first_attempt_correct / data.answered) * 100) : 0, // FIX: Dùng first_attempt
            questions_count: data.total_questions_in_quiz,
            average_response_time: data.answered > 0 ? Math.round(data.response_time / data.answered) : 0,
            description: data.description || '',
            first_attempt_accuracy: data.answered > 0 ? Math.round((data.first_attempt_correct / data.answered) * 100) : 0,
            average_attempts_per_question: data.answered > 0 ? Math.round((data.total_attempts / data.answered) * 100) / 100 : 0
        };
    });

    // Tính toán các metrics tổng thể
    const performanceMetrics = {
        average_response_time: totalQuestions > 0 ? Math.round(totalResponseTime / totalQuestions) : 0,
        completion_rate: totalQuestionsInQuiz > 0 ? Math.round((totalQuestions / totalQuestionsInQuiz) * 100) : 0,
        first_attempt_accuracy: totalQuestions > 0 ? Math.round((firstAttemptCorrect / totalQuestions) * 100) : 0,
        overall_accuracy: totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0,
        average_attempts_per_question: totalQuestions > 0 ? Math.round((totalAttempts / totalQuestions) * 100) / 100 : 0
    };

    console.log(`✅ Radar data calculation completed:`, {
        difficulty_levels: Object.keys(difficultyLevels).length,
        learning_outcomes: Object.keys(learningOutcomes).length,
        overall_accuracy: performanceMetrics.overall_accuracy
    });

    return {
        difficulty_levels: difficultyLevels,
        learning_outcomes: learningOutcomes,
        performance_metrics: performanceMetrics
    };
}

// Hàm tính toán dữ liệu radar trung bình
function calculateAverageRadarData(questions, allQuestionHistory) {
    // Nhóm dữ liệu theo user
    const userGroups = {};
    allQuestionHistory.forEach(history => {
        const userId = history.user_id;
        if (!userGroups[userId]) {
            userGroups[userId] = [];
        }
        userGroups[userId].push(history);
    });

    console.log(`Calculating average for ${Object.keys(userGroups).length} users`);

    // Tính toán radar data cho từng user
    const allUserRadarData = Object.values(userGroups).map(userHistory => {
        return calculateRadarData(questions, userHistory);
    });

    // Tính trung bình
    const averageRadarData = {
        difficulty_levels: {},
        learning_outcomes: {},
        performance_metrics: {}
    };

    // Tính trung bình cho difficulty levels
    const difficultyKeys = Object.keys(allUserRadarData[0]?.difficulty_levels || {});
    difficultyKeys.forEach(level => {
        const accuracies = allUserRadarData.map(data => data.difficulty_levels[level]?.accuracy || 0);
        const avgAccuracy = accuracies.length > 0 ? Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length) : 0;

        const responseTimes = allUserRadarData.map(data => data.difficulty_levels[level]?.average_response_time || 0);
        const avgResponseTime = responseTimes.length > 0 ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : 0;

        const firstAttemptAccuracies = allUserRadarData.map(data => data.difficulty_levels[level]?.first_attempt_accuracy || 0);
        const avgFirstAttemptAccuracy = firstAttemptAccuracies.length > 0 ? Math.round(firstAttemptAccuracies.reduce((a, b) => a + b, 0) / firstAttemptAccuracies.length) : 0;

        const avgAttempts = allUserRadarData.map(data => data.difficulty_levels[level]?.average_attempts_per_question || 0);
        const avgAttemptsPerQuestion = avgAttempts.length > 0 ? Math.round((avgAttempts.reduce((a, b) => a + b, 0) / avgAttempts.length) * 100) / 100 : 0;

        // Lấy questions_count từ bất kỳ user nào (vì tất cả đều có cùng giá trị - tổng số câu hỏi trong quiz)
        const questionsCount = allUserRadarData.find(data => data.difficulty_levels[level])?.difficulty_levels[level]?.questions_count || 0;

        averageRadarData.difficulty_levels[level] = {
            accuracy: avgAccuracy,
            questions_count: questionsCount,
            average_response_time: avgResponseTime,
            first_attempt_accuracy: avgFirstAttemptAccuracy,
            average_attempts_per_question: avgAttemptsPerQuestion
        };
    });

    // Tính trung bình cho learning outcomes
    const loKeys = Object.keys(allUserRadarData[0]?.learning_outcomes || {});
    loKeys.forEach(lo => {
        const accuracies = allUserRadarData.map(data => data.learning_outcomes[lo]?.accuracy || 0);
        const avgAccuracy = accuracies.length > 0 ? Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length) : 0;

        const responseTimes = allUserRadarData.map(data => data.learning_outcomes[lo]?.average_response_time || 0);
        const avgResponseTime = responseTimes.length > 0 ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : 0;

        const firstAttemptAccuracies = allUserRadarData.map(data => data.learning_outcomes[lo]?.first_attempt_accuracy || 0);
        const avgFirstAttemptAccuracy = firstAttemptAccuracies.length > 0 ? Math.round(firstAttemptAccuracies.reduce((a, b) => a + b, 0) / firstAttemptAccuracies.length) : 0;

        const avgAttempts = allUserRadarData.map(data => data.learning_outcomes[lo]?.average_attempts_per_question || 0);
        const avgAttemptsPerQuestion = avgAttempts.length > 0 ? Math.round((avgAttempts.reduce((a, b) => a + b, 0) / avgAttempts.length) * 100) / 100 : 0;

        const descriptions = allUserRadarData.map(data => data.learning_outcomes[lo]?.description || '');
        const description = descriptions.find(d => d) || ''; // Lấy description đầu tiên không rỗng

        // Lấy questions_count từ bất kỳ user nào (vì tất cả đều có cùng giá trị - tổng số câu hỏi trong quiz)
        const questionsCount = allUserRadarData.find(data => data.learning_outcomes[lo])?.learning_outcomes[lo]?.questions_count || 0;

        averageRadarData.learning_outcomes[lo] = {
            accuracy: avgAccuracy,
            questions_count: questionsCount,
            average_response_time: avgResponseTime,
            description: description,
            first_attempt_accuracy: avgFirstAttemptAccuracy,
            average_attempts_per_question: avgAttemptsPerQuestion
        };
    });

    // Tính toán performance metrics trung bình
    const performanceMetrics = {};
    
    // Lấy tất cả keys của performance metrics từ user đầu tiên
    const metricsKeys = Object.keys(allUserRadarData[0]?.performance_metrics || {});
    metricsKeys.forEach(key => {
        const values = allUserRadarData.map(data => data.performance_metrics[key] || 0);
        const avgValue = values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
        performanceMetrics[key] = avgValue;
    });

    averageRadarData.performance_metrics = performanceMetrics;

    console.log(`✅ Average radar data calculation completed:`, {
        difficulty_levels: Object.keys(averageRadarData.difficulty_levels).length,
        learning_outcomes: Object.keys(averageRadarData.learning_outcomes).length,
        overall_accuracy: performanceMetrics.overall_accuracy || 0
    });

    return averageRadarData;
}

// API tổng hợp lấy tất cả dữ liệu radar chart
exports.getAllRadarData = async (req, res) => {
    try {
        const { quizId } = req.params;
        const userId = req.user?.user_id;
        const userRole = req.roleName;

        // Kiểm tra quyền truy cập
        if (!['admin', 'teacher', 'student'].includes(userRole)) {
            return res.status(403).json({ error: 'Không có quyền truy cập' });
        }

        // Lấy thông tin quiz và câu hỏi với join đầy đủ
        const quiz = await Quiz.findByPk(quizId, {
            include: [
                {
                    model: Question,
                    as: 'Questions',
                    through: { attributes: [] },
                    attributes: ['question_id', 'question_text', 'level_id', 'lo_id'],
                    include: [
                        {
                            model: Level,
                            as: 'Level',
                            attributes: ['level_id', 'name']
                        },
                        {
                            model: LO,
                            as: 'LO',
                            attributes: ['lo_id', 'name', 'description']
                        }
                    ]
                }
            ]
        });

        if (!quiz) {
            return res.status(404).json({ error: 'Không tìm thấy quiz' });
        }

        // Lấy tất cả lịch sử trả lời câu hỏi của quiz này với join đầy đủ
        const allQuestionHistory = await UserQuestionHistory.findAll({
            where: { quiz_id: quizId },
            attributes: ['question_id', 'is_correct', 'time_spent', 'attempt_date', 'attempt_index', 'user_id'],
            include: [
                {
                    model: Question,
                    as: 'Question',
                    attributes: ['question_id', 'question_text', 'level_id', 'lo_id'],
                    include: [
                        {
                            model: Level,
                            as: 'Level',
                            attributes: ['level_id', 'name']
                        },
                        {
                            model: LO,
                            as: 'LO',
                            attributes: ['lo_id', 'name', 'description']
                        }
                    ]
                },
                {
                    model: User,
                    as: 'User',
                    attributes: ['user_id', 'name']
                }
            ],
            order: [['attempt_date', 'ASC']]
        });

        // Debug: Log số lượng records
        console.log(`Quiz ${quizId}: Found ${allQuestionHistory.length} question history records`);
        console.log(`Quiz ${quizId}: Found ${quiz.Questions.length} questions`);

        const result = {
            quiz_id: quizId,
            quiz_name: quiz.name,
            total_questions: quiz.Questions.length,
            radar_data: {}
        };

        // 1. Dữ liệu trung bình của tất cả người tham gia (cho admin/teacher)
        if (['admin', 'teacher'].includes(userRole)) {
            result.radar_data.average = calculateAverageRadarData(quiz.Questions, allQuestionHistory);
        }

        // 2. Dữ liệu của người xếp hạng 1 (cho admin/teacher)
        if (['admin', 'teacher'].includes(userRole)) {
            try {
                const QuizRealtimeService = require('../services/quizRealtimeService');
                const quizRealtimeService = new QuizRealtimeService();
                const leaderboard = await quizRealtimeService.getRealtimeLeaderboard(quizId);

                if (leaderboard && leaderboard.length > 0) {
                    const topPerformer = leaderboard[0];
                    const topUserId = topPerformer.user_id;

                    const topPerformerHistory = allQuestionHistory.filter(history =>
                        history.user_id === topUserId
                    );

                    result.radar_data.top_performer = {
                        user_info: {
                            user_id: topUserId,
                            name: topPerformer.name,
                            score: topPerformer.score
                        },
                        data: calculateRadarData(quiz.Questions, topPerformerHistory)
                    };
                }
            } catch (error) {
                console.error('Lỗi khi lấy dữ liệu top performer:', error);
                result.radar_data.top_performer = null;
            }
        }

        // 3. Dữ liệu của người dùng hiện tại (cho student hoặc admin/teacher xem dữ liệu của mình)
        if (userId) {
            const currentUserHistory = allQuestionHistory.filter(history =>
                history.user_id === userId
            );

            console.log(`User ${userId}: Found ${currentUserHistory.length} history records`);

            if (currentUserHistory.length > 0) {
                result.radar_data.current_user = {
                    user_id: userId,
                    data: calculateRadarData(quiz.Questions, currentUserHistory)
                };
            }
        }

        // 4. Thêm thông tin tổng quan
        const uniqueUsers = [...new Set(allQuestionHistory.map(h => h.user_id))];

        // Tạo map learning outcomes với description
        const learningOutcomesMap = {};
        quiz.Questions.forEach(q => {
            if (!learningOutcomesMap[q.LO.name]) {
                learningOutcomesMap[q.LO.name] = {
                    name: q.LO.name,
                    description: q.LO.description || ''
                };
            }
        });

        result.summary = {
            total_participants: uniqueUsers.length,
            total_answers: allQuestionHistory.length,
            average_score: 0, // Có thể tính thêm nếu cần
            difficulty_levels: Object.keys(quiz.Questions.reduce((acc, q) => {
                acc[q.Level.name.toLowerCase()] = true;
                return acc;
            }, {})),
            learning_outcomes: Object.values(learningOutcomesMap)
        };

        // Debug: Log kết quả
        console.log('Radar data result:', JSON.stringify(result, null, 2));

        res.status(200).json(result);
    } catch (error) {
        console.error('Lỗi trong getAllRadarData:', error);
        res.status(500).json({ error: 'Lỗi khi lấy dữ liệu radar tổng hợp', details: error.message });
    }
};

// API: Lấy quiz result kèm chương và section theo từng LO
exports.getQuizResultWithChapters = async (req, res) => {
    try {
        const resultId = req.params.id;
        // Lấy quiz result và quiz
        const quizResult = await QuizResult.findByPk(resultId, {
            include: [
                { model: User, as: 'Student', attributes: ['user_id', 'name'] },
                { model: Quiz, as: 'Quiz', attributes: ['quiz_id', 'name'] }
            ]
        });
        if (!quizResult) return res.status(404).json({ message: 'QuizResult không tồn tại' });

        // Lấy tất cả câu hỏi của quiz này
        const quizQuestions = await Question.findAll({
            include: [
                { model: LO, as: 'LO', attributes: ['lo_id', 'name'] }
            ],
            where: { quiz_id: quizResult.quiz_id }
        });

        // Lấy tất cả LO duy nhất
        const loMap = {};
        quizQuestions.forEach(q => {
            if (q.lo_id && q.LO) {
                loMap[q.lo_id] = q.LO.name;
            }
        });
        const loIds = Object.keys(loMap);

        // Với mỗi LO, lấy chương và section
        const loChapters = [];
        for (const loId of loIds) {
            // Lấy các chương liên kết với LO này
            const chapterLOs = await ChapterLO.findAll({ where: { lo_id: loId } });
            const chapterIds = chapterLOs.map(clo => clo.chapter_id);

            // Lấy thông tin chương và section
            const chapters = await Chapter.findAll({
                where: { chapter_id: chapterIds },
                include: [
                    {
                        model: ChapterSection,
                        as: 'Sections',
                        attributes: ['section_id', 'title', 'content', 'order']
                    }
                ]
            });

            loChapters.push({
                lo_id: loId,
                lo_name: loMap[loId],
                chapters: chapters.map(chap => ({
                    chapter_id: chap.chapter_id,
                    chapter_name: chap.name,
                    sections: chap.Sections
                }))
            });
        }

        res.status(200).json({
            quiz_result: quizResult,
            lo_chapters: loChapters
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi lấy quiz result kèm chương/section', error: error.message });
    }
};

// API: Lấy quiz result theo quiz_id và user_id
exports.getQuizResultByQuizAndUser = async (req, res) => {
    try {
        const { quiz_id, user_id } = req.query;
        if (!quiz_id || !user_id) {
            return res.status(400).json({ message: 'Thiếu quiz_id hoặc user_id' });
        }
        const quizResult = await QuizResult.findOne({
            where: { quiz_id, user_id },
            include: [
                { model: User, as: 'Student', attributes: ['user_id', 'name'] },
                { model: Quiz, as: 'Quiz', attributes: ['quiz_id', 'name'] }
            ]
        });
        if (!quizResult) return res.status(404).json({ message: 'QuizResult không tồn tại' });
        res.status(200).json(quizResult);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi lấy quiz result theo quiz_id và user_id', error: error.message });
    }
};

// API: Lấy quiz result chi tiết kèm chương/section theo quiz_id và user_id
exports.getQuizResultWithChaptersByQuizAndUser = async (req, res) => {
    try {
        const { quiz_id, user_id } = req.query;
        if (!quiz_id || !user_id) {
            return res.status(400).json({ message: 'Thiếu quiz_id hoặc user_id' });
        }
        // Lấy quiz result
        const quizResult = await QuizResult.findOne({
            where: { quiz_id, user_id },
            include: [
                { model: User, as: 'Student', attributes: ['user_id', 'name'] },
                { model: Quiz, as: 'Quiz', attributes: ['quiz_id', 'name'] }
            ]
        });
        if (!quizResult) return res.status(404).json({ message: 'QuizResult không tồn tại' });

        // Lấy tất cả câu hỏi của quiz này
        const quizQuestions = await Question.findAll({
            include: [
                { model: LO, as: 'LO', attributes: ['lo_id', 'name'] }
            ],
            where: { quiz_id }
        });
        // Lấy tất cả LO duy nhất
        const loMap = {};
        quizQuestions.forEach(q => {
            if (q.lo_id && q.LO) {
                loMap[q.lo_id] = q.LO.name;
            }
        });
        const loIds = Object.keys(loMap);
        // Với mỗi LO, lấy chương và section
        const loChapters = [];
        for (const loId of loIds) {
            const chapterLOs = await ChapterLO.findAll({ where: { lo_id: loId } });
            const chapterIds = chapterLOs.map(clo => clo.chapter_id);
            const chapters = await Chapter.findAll({
                where: { chapter_id: chapterIds },
                include: [
                    {
                        model: ChapterSection,
                        as: 'Sections',
                        attributes: ['section_id', 'title', 'content', 'order']
                    }
                ]
            });
            loChapters.push({
                lo_id: loId,
                lo_name: loMap[loId],
                chapters: chapters.map(chap => ({
                    chapter_id: chap.chapter_id,
                    chapter_name: chap.name,
                    sections: chap.Sections
                }))
            });
        }
        res.status(200).json({
            success: true,
            data: {
                quiz_result: quizResult,
                lo_chapters: loChapters
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy quiz result kèm chương/section theo quiz_id và user_id',
            error: error.message
        });
    }
};

// API: Đề xuất điểm yếu theo LO và hiển thị chương liên quan
exports.getWeakestLOWithChapters = async (req, res) => {
    try {
        const { quiz_id, user_id } = req.query;
        if (!quiz_id || !user_id) {
            return res.status(400).json({ message: 'Thiếu quiz_id hoặc user_id' });
        }
        const { UserQuestionHistory, Question, LO, ChapterLO, Chapter, ChapterSection } = require('../models');
        // Lấy lịch sử trả lời của user trong quiz
        const histories = await UserQuestionHistory.findAll({
            where: { quiz_id, user_id },
            include: [
                { model: Question, as: 'Question', attributes: ['lo_id'], include: [{ model: LO, as: 'LO', attributes: ['lo_id', 'name'] }] }
            ]
        });
        // Gom nhóm theo lo_id
        const loStats = {};
        histories.forEach(h => {
            const lo_id = h.Question?.lo_id;
            const lo_name = h.Question?.LO?.name || '';
            if (!lo_id) return;
            if (!loStats[lo_id]) {
                loStats[lo_id] = { total: 0, correct: 0, name: lo_name };
            }
            loStats[lo_id].total++;
            if (h.is_correct) loStats[lo_id].correct++;
        });
        // Tìm LO yếu nhất (tỉ lệ đúng thấp nhất, nhưng phải có ít nhất 1 câu)
        let weakest = null;
        Object.entries(loStats).forEach(([lo_id, stat]) => {
            const accuracy = stat.total > 0 ? (stat.correct / stat.total) * 100 : 0;
            if (!weakest || accuracy < weakest.accuracy) {
                weakest = { lo_id, lo_name: stat.name, accuracy };
            }
        });
        if (!weakest) {
            return res.status(200).json({ message: 'Không có dữ liệu LO cho user này.' });
        }
        // Lấy chương và section liên quan đến LO yếu nhất
        const chapterLOs = await ChapterLO.findAll({ where: { lo_id: weakest.lo_id } });
        const chapterIds = chapterLOs.map(clo => clo.chapter_id);
        const chapters = await Chapter.findAll({
            where: { chapter_id: chapterIds },
            include: [
                {
                    model: ChapterSection,
                    as: 'Sections',
                    attributes: ['section_id', 'title', 'content', 'order']
                }
            ]
        });
        weakest.chapters = chapters.map(chap => ({
            chapter_id: chap.chapter_id,
            chapter_name: chap.name,
            sections: chap.Sections
        }));
        res.status(200).json({
            user_id,
            quiz_id,
            weakest_lo: weakest
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi đề xuất điểm yếu theo LO', error: error.message });
    }
};

// API endpoint để phân tích cấp độ và chương cần cải thiện
exports.getImprovementAnalysis = async (req, res) => {
    try {
        const { quiz_id, user_id, course_id } = req.query;

        if (!quiz_id && !course_id) {
            return res.status(400).json({
                message: 'Cần cung cấp quiz_id hoặc course_id để phân tích'
            });
        }

        let analysisResult;

        if (quiz_id) {
            // Phân tích cho một quiz cụ thể
            analysisResult = await analyzeQuizImprovement(quiz_id, user_id);
        } else {
            // Phân tích cho toàn bộ course
            analysisResult = await analyzeCourseImprovement(course_id, user_id);
        }

        res.status(200).json({
            success: true,
            data: analysisResult,
            generated_at: new Date()
        });

    } catch (error) {
        console.error('Lỗi khi phân tích cải thiện:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi phân tích dữ liệu cải thiện',
            error: error.message
        });
    }
};

// Hàm phân tích cải thiện cho một quiz cụ thể
async function analyzeQuizImprovement(quizId, userId = null) {
    const quiz = await Quiz.findByPk(quizId, {
        include: [{
            model: Question,
            as: 'Questions',
            through: { attributes: [] },
            attributes: ['question_id', 'question_text', 'level_id', 'lo_id'],
            include: [
                { model: Level, as: 'Level', attributes: ['level_id', 'name'] },
                {
                    model: LO,
                    as: 'LO',
                    attributes: ['lo_id', 'name', 'description'],
                    include: [{
                        model: Chapter,
                        as: 'Chapters',
                        through: { attributes: [] },
                        attributes: ['chapter_id', 'name', 'description', 'subject_id'],
                        include: [{
                            model: Subject,
                            as: 'Subject',
                            attributes: ['subject_id', 'name']
                        }]
                    }]
                }
            ]
        }]
    });

    if (!quiz) {
        throw new Error('Quiz không tồn tại');
    }

    // Lấy lịch sử trả lời câu hỏi
    const whereCondition = { quiz_id: quizId };
    if (userId) {
        whereCondition.user_id = userId;
    }

    const questionHistory = await UserQuestionHistory.findAll({
        where: whereCondition,
        include: [
            {
                model: Question,
                as: 'Question',
                attributes: ['question_id', 'level_id', 'lo_id'],
                include: [
                    { model: Level, as: 'Level', attributes: ['level_id', 'name'] },
                    { model: LO, as: 'LO', attributes: ['lo_id', 'name', 'description'] }
                ]
            },
            {
                model: User,
                as: 'User',
                attributes: ['user_id', 'name']
            }
        ],
        order: [['attempt_date', 'ASC']]
    });

    // Phân tích cấp độ yếu
    const weakLevelsAnalysis = calculateWeakLevelsAnalysis(quiz.Questions, questionHistory);

    // Phân tích chương cần cải thiện
    const chapterAnalysis = calculateChapterImprovementAnalysis(quiz.Questions, questionHistory);

    // Tạo gợi ý cải thiện - nếu không có chapters, tạo gợi ý chung
    let suggestions;
    if (chapterAnalysis && chapterAnalysis.chapters_need_improvement && chapterAnalysis.chapters_need_improvement.length > 0) {
        suggestions = generateImprovementSuggestions(weakLevelsAnalysis, chapterAnalysis);
    } else {
        // Tạo gợi ý chung khi không có chapter data
        console.log('No chapter weaknesses found, generating general improvement suggestions');
        suggestions = {
            priority_recommendations: [],
            study_plan: {
                focus_areas: weakLevelsAnalysis.weak_levels?.slice(0, 3).map(level => ({
                    area: level.level,
                    reason: `Accuracy ${level.accuracy}% - needs improvement`,
                    suggested_actions: [
                        'Review questions at this difficulty level',
                        'Practice with similar problems',
                        'Study fundamental concepts'
                    ]
                })) || [],
                estimated_time: '2-4 hours per week'
            },
            next_steps: [
                'Focus on weak difficulty levels identified above',
                'Review incorrect answers and understand mistakes',
                'Practice regularly with targeted exercises'
            ]
        };
    }

    return {
        quiz_info: {
            quiz_id: quizId,
            quiz_name: quiz.name,
            total_questions: quiz.Questions.length
        },
        weak_levels: weakLevelsAnalysis,
        chapters_need_improvement: chapterAnalysis,
        improvement_suggestions: suggestions,
        analysis_scope: userId ? 'individual' : 'all_participants'
    };
}

// Hàm tạo gợi ý cải thiện
function generateImprovementSuggestions(weakLevelsAnalysis, chapterAnalysis) {
    const suggestions = {
        priority_recommendations: [],
        study_plan: {
            focus_areas: [],
            estimated_time: ''
        },
        next_steps: []
    };

    // Tạo priority recommendations từ chapters
    if (chapterAnalysis && chapterAnalysis.chapters_need_improvement) {
        chapterAnalysis.chapters_need_improvement.forEach((chapter, index) => {
            if (index < 3) { // Top 3 chapters
                suggestions.priority_recommendations.push({
                    priority: index + 1,
                    chapter: chapter.chapter_name,
                    subject: chapter.subject_name,
                    reason: `Accuracy ${chapter.accuracy}% with ${chapter.total_questions} questions`,
                    suggested_actions: [
                        `Review chapter materials: ${chapter.chapter_name}`,
                        'Practice more questions on weak topics',
                        'Seek additional resources or tutoring'
                    ]
                });

                suggestions.study_plan.focus_areas.push({
                    area: chapter.chapter_name,
                    subject: chapter.subject_name,
                    estimated_hours: Math.ceil(chapter.total_questions * 0.5) // 30 min per question
                });
            }
        });
    }

    // Tạo next steps
    suggestions.next_steps = [
        'Start with highest priority recommendations',
        'Practice weak chapters regularly',
        'Review mistakes and understand concepts',
        'Take practice quizzes to track improvement'
    ];

    // Tính estimated time
    const totalHours = suggestions.study_plan.focus_areas.reduce((sum, area) => sum + (area.estimated_hours || 0), 0);
    suggestions.study_plan.estimated_time = `${totalHours}-${totalHours + 2} hours total`;

    return suggestions;
}

// Hàm phân tích cấp độ yếu
function calculateWeakLevelsAnalysis(questions, questionHistory) {
    const levelStats = {};

    // Khởi tạo thống kê cho tất cả levels có trong quiz
    questions.forEach(question => {
        const levelName = question.Level.name.toLowerCase();
        if (!levelStats[levelName]) {
            levelStats[levelName] = {
                level_name: question.Level.name,
                total_questions: 0,
                total_attempts: 0,
                correct_attempts: 0,
                total_time: 0,
                questions_list: []
            };
        }
        levelStats[levelName].total_questions++;
        levelStats[levelName].questions_list.push({
            question_id: question.question_id,
            question_text: question.question_text
        });
    });

    // Phân tích lịch sử trả lời
    questionHistory.forEach(history => {
        const question = history.Question;
        if (!question || !question.Level) return;

        const levelName = question.Level.name.toLowerCase();
        if (levelStats[levelName]) {
            levelStats[levelName].total_attempts++;
            levelStats[levelName].total_time += history.time_spent || 0;

            if (history.is_correct) {
                levelStats[levelName].correct_attempts++;
            }
        }
    });

    // Tính toán accuracy và xếp hạng
    const levelAnalysis = Object.keys(levelStats).map(levelKey => {
        const stats = levelStats[levelKey];
        const accuracy = stats.total_attempts > 0 ?
            Math.round((stats.correct_attempts / stats.total_attempts) * 100) : 0;
        const avgTime = stats.total_attempts > 0 ?
            Math.round(stats.total_time / stats.total_attempts) : 0;

        return {
            level: stats.level_name,
            accuracy: accuracy,
            total_questions: stats.total_questions,
            total_attempts: stats.total_attempts,
            correct_attempts: stats.correct_attempts,
            average_time: avgTime,
            questions_list: stats.questions_list,
            improvement_priority: accuracy < 50 ? 'high' : accuracy < 70 ? 'medium' : 'low'
        };
    });

    // Sắp xếp theo accuracy tăng dần (yếu nhất trước)
    levelAnalysis.sort((a, b) => a.accuracy - b.accuracy);

    return {
        levels_analysis: levelAnalysis,
        weakest_level: levelAnalysis[0] || null,
        summary: {
            total_levels: levelAnalysis.length,
            levels_need_improvement: levelAnalysis.filter(l => l.improvement_priority !== 'low').length
        }
    };
}

// Hàm phân tích chương cần cải thiện dựa trên LO performance
function calculateChapterImprovementAnalysis(questions, questionHistory) {
    const loStats = {};
    const chapterStats = {};

    // Khởi tạo thống kê cho tất cả LOs và Chapters
    questions.forEach(question => {
        const loName = question.LO.name;
        const loId = question.LO.lo_id;

        // Thống kê LO
        if (!loStats[loName]) {
            loStats[loName] = {
                lo_id: loId,
                lo_name: loName,
                description: question.LO.description || '',
                total_questions: 0,
                total_attempts: 0,
                correct_attempts: 0,
                total_time: 0,
                chapters: new Set()
            };
        }
        loStats[loName].total_questions++;

        // Thêm chapters liên quan đến LO này
        if (question.LO.Chapters) {
            question.LO.Chapters.forEach(chapter => {
                loStats[loName].chapters.add(chapter.chapter_id);

                // Thống kê Chapter
                if (!chapterStats[chapter.chapter_id]) {
                    chapterStats[chapter.chapter_id] = {
                        chapter_id: chapter.chapter_id,
                        chapter_name: chapter.name,
                        description: chapter.description || '',
                        subject_id: chapter.subject_id,
                        subject_name: chapter.Subject ? chapter.Subject.name : '',
                        los: new Set(),
                        total_questions: 0,
                        total_attempts: 0,
                        correct_attempts: 0,
                        total_time: 0
                    };
                }
                chapterStats[chapter.chapter_id].los.add(loName);
                chapterStats[chapter.chapter_id].total_questions++;
            });
        }
    });

    // Phân tích lịch sử trả lời
    questionHistory.forEach(history => {
        const question = history.Question;
        if (!question || !question.LO) return;

        const loName = question.LO.name;
        if (loStats[loName]) {
            loStats[loName].total_attempts++;
            loStats[loName].total_time += history.time_spent || 0;

            if (history.is_correct) {
                loStats[loName].correct_attempts++;
            }
        }
    });

    // Tính toán accuracy cho LOs
    const loAnalysis = Object.keys(loStats).map(loKey => {
        const stats = loStats[loKey];
        const accuracy = stats.total_attempts > 0 ?
            Math.round((stats.correct_attempts / stats.total_attempts) * 100) : 0;
        const avgTime = stats.total_attempts > 0 ?
            Math.round(stats.total_time / stats.total_attempts) : 0;

        return {
            lo_id: stats.lo_id,
            lo_name: stats.lo_name,
            description: stats.description,
            accuracy: accuracy,
            total_questions: stats.total_questions,
            total_attempts: stats.total_attempts,
            correct_attempts: stats.correct_attempts,
            average_time: avgTime,
            chapters: Array.from(stats.chapters),
            improvement_priority: accuracy < 50 ? 'high' : accuracy < 70 ? 'medium' : 'low'
        };
    });

    // Tính toán accuracy cho Chapters dựa trên LOs
    Object.keys(chapterStats).forEach(chapterId => {
        const chapterStat = chapterStats[chapterId];
        const chapterLOs = Array.from(chapterStat.los);

        let totalAccuracy = 0;
        let totalAttempts = 0;
        let correctAttempts = 0;
        let totalTime = 0;
        let validLOCount = 0;

        chapterLOs.forEach(loName => {
            const loStat = loStats[loName];
            if (loStat && loStat.total_attempts > 0) {
                totalAttempts += loStat.total_attempts;
                correctAttempts += loStat.correct_attempts;
                totalTime += loStat.total_time;
                validLOCount++;
            }
        });

        chapterStat.total_attempts = totalAttempts;
        chapterStat.correct_attempts = correctAttempts;
        chapterStat.total_time = totalTime;
        chapterStat.accuracy = totalAttempts > 0 ?
            Math.round((correctAttempts / totalAttempts) * 100) : 0;
        chapterStat.average_time = totalAttempts > 0 ?
            Math.round(totalTime / totalAttempts) : 0;
        chapterStat.los = chapterLOs;
        chapterStat.improvement_priority = chapterStat.accuracy < 50 ? 'high' :
            chapterStat.accuracy < 70 ? 'medium' : 'low';
    });

    // Chuyển đổi chapterStats thành array và sắp xếp
    const chapterAnalysis = Object.values(chapterStats)
        .filter(chapter => chapter.total_attempts > 0)
        .sort((a, b) => a.accuracy - b.accuracy);

    // Sắp xếp LO analysis theo accuracy
    loAnalysis.sort((a, b) => a.accuracy - b.accuracy);

    return {
        lo_analysis: loAnalysis,
        chapter_analysis: chapterAnalysis,
        weakest_los: loAnalysis.filter(lo => lo.improvement_priority !== 'low').slice(0, 5),
        chapters_need_improvement: chapterAnalysis.filter(ch => ch.improvement_priority !== 'low').slice(0, 5),
        summary: {
            total_los: loAnalysis.length,
            total_chapters: chapterAnalysis.length,
            los_need_improvement: loAnalysis.filter(lo => lo.improvement_priority !== 'low').length,
            chapters_need_improvement: chapterAnalysis.filter(ch => ch.improvement_priority !== 'low').length
        }
    };
}

// Hàm phân tích cải thiện cho toàn bộ course
async function analyzeCourseImprovement(courseId, userId = null) {
    // TODO: Implement full course improvement analysis
    // For now, return similar structure to quiz improvement
    
    const course = await Course.findByPk(courseId, {
        include: [{
            model: Subject,
            as: 'Subjects',
            include: [{
                model: Quiz,
                as: 'Quizzes',
                include: [{
                    model: Question,
                    as: 'Questions',
                    through: { attributes: [] },
                    attributes: ['question_id', 'question_text', 'level_id', 'lo_id'],
                    include: [
                        { model: Level, as: 'Level', attributes: ['level_id', 'name'] },
                        {
                            model: LO,
                            as: 'LO',
                            attributes: ['lo_id', 'name', 'description']
                        }
                    ]
                }]
            }]
        }]
    });

    if (!course) {
        throw new Error('Course không tồn tại');
    }

    // Tạm thời trả về structure cơ bản
    return {
        course_info: {
            course_id: courseId,
            course_name: course.name,
            total_subjects: course.Subjects?.length || 0
        },
        message: 'Course improvement analysis - coming soon',
        analysis_scope: userId ? 'individual' : 'all_participants'
    };
}

// Export function để sử dụng trong adaptive quiz service
exports.analyzeCourseImprovement = analyzeCourseImprovement;

/**
 * API: Lấy phân tích chi tiết kết quả quiz cho người học
 * Trả lời câu hỏi: "Tôi đã làm được những gì, điểm mạnh điểm yếu ra sao, và tôi cần học gì để cải thiện điểm yếu"
 */
exports.getDetailedQuizAnalysisForStudent = async (req, res) => {
    try {
        const { quiz_id, user_id } = req.params;

        // Kiểm tra quyền truy cập - chỉ cho phép học sinh xem kết quả của chính mình
        if (req.user.role === 'student' && req.user.user_id !== parseInt(user_id)) {
            return res.status(403).json({
                message: 'Bạn chỉ có thể xem kết quả của chính mình'
            });
        }

        // 1. Lấy thông tin quiz và câu hỏi
        const quiz = await Quiz.findByPk(quiz_id, {
            include: [
                {
                    model: Question,
                    as: 'Questions',
                    through: { attributes: [] },
                    include: [
                        {
                            model: Level,
                            as: 'Level',
                            attributes: ['level_id', 'name']
                        },
                        {
                            model: LO,
                            as: 'LO',
                            attributes: ['lo_id', 'name', 'description']
                        }
                    ]
                },
                {
                    model: Course,
                    as: 'Course',
                    attributes: ['course_id', 'name', 'subject_id'],
                    include: [{
                        model: Subject,
                        as: 'Subject',
                        attributes: ['subject_id', 'name', 'description']
                    }]
                }
            ]
        });

        if (!quiz) {
            return res.status(404).json({ message: 'Quiz không tồn tại' });
        }

        // 2. Lấy kết quả quiz của người dùng
        const quizResult = await QuizResult.findOne({
            where: { quiz_id, user_id },
            include: [
                {
                    model: User,
                    as: 'Student',
                    attributes: ['user_id', 'name', 'email']
                }
            ]
        });

        if (!quizResult) {
            return res.status(404).json({ message: 'Không tìm thấy kết quả quiz của người dùng này' });
        }

        // 3. Lấy lịch sử trả lời câu hỏi chi tiết
        console.log(`Debug: Looking for UserQuestionHistory with quiz_id=${quiz_id}, user_id=${user_id}`);
        
        const questionHistory = await UserQuestionHistory.findAll({
            where: { quiz_id, user_id },
            include: [
                {
                    model: Question,
                    as: 'Question',
                    include: [
                        {
                            model: Level,
                            as: 'Level',
                            attributes: ['level_id', 'name']
                        },
                        {
                            model: LO,
                            as: 'LO',
                            attributes: ['lo_id', 'name', 'description']
                        }
                    ]
                }
            ],
            order: [['attempt_date', 'ASC']]
        });

        console.log(`Debug: Found ${questionHistory.length} question history records`);
        
        // If no data found, try alternative approaches for migration compatibility
        if (questionHistory.length === 0) {
            console.log('Debug: No UserQuestionHistory found, trying migration compatibility queries...');
            
            // Try to find any UserQuestionHistory for this user to check data exists
            const anyUserHistory = await UserQuestionHistory.findAll({
                where: { user_id },
                limit: 5,
                attributes: ['history_id', 'quiz_id', 'user_id', 'question_id', 'is_correct']
            });
            console.log(`Debug: User has ${anyUserHistory.length} total history records`);
            if (anyUserHistory.length > 0) {
                console.log('Debug: Sample quiz_ids for this user:', anyUserHistory.map(h => h.quiz_id));
            }
            
            // Check if quiz exists in our current quiz table
            const quizExists = await Quiz.findByPk(quiz_id, { attributes: ['quiz_id', 'name'] });
            console.log(`Debug: Quiz ${quiz_id} exists:`, !!quizExists);
            
            // Migration compatibility: Try to find history by quiz name pattern or other identifiers
            if (quizExists && anyUserHistory.length > 0) {
                console.log('Debug: Data exists but quiz_id mismatch likely due to migration');
                console.log('Debug: This quiz may need manual quiz_id mapping or data migration');
            }
        }

        // 4. Tính phần trăm phân bổ câu hỏi theo chương
        const questionDistribution = await calculateChapterQuestionDistribution(quiz.Questions);

        // 5. Phân tích điểm mạnh/yếu theo chương (chính) và LO (phụ)
        const chapterAnalysis = await analyzeChapterStrengthsWeaknesses(questionHistory, 40);
        const loAnalysis = analyzeLOStrengthsWeaknesses(questionHistory, 40);

        // 6. Phân tích điểm mạnh/yếu theo độ khó
        const difficultyAnalysis = analyzeDifficultyStrengthsWeaknesses(questionHistory, 40);

        // 7. Tạo gợi ý cải thiện học tập dựa trên chương
        const improvementSuggestions = await generateChapterBasedImprovementSuggestions(
            chapterAnalysis.weaknesses,
            difficultyAnalysis.weaknesses,
            chapterAnalysis // Truyền thêm chapterAnalysis để xử lý trường hợp không có weaknesses
        );

        // 8. Phân tích LO theo % hoàn thành (tính năng mới)
        const loCompletionAnalysis = await analyzeLOCompletionPercentage(
            questionHistory,
            quiz.Course.Subject.subject_id,  // Fixed: Use Course.Subject path
            60 // threshold 60%
        );

        // 9. Tạo gợi ý học tập cá nhân hóa dựa trên % hoàn thành LO
        const personalizedRecommendations = createPersonalizedStudyPlan(loCompletionAnalysis);

        // 10. Tính toán thống kê tổng quan
        const totalQuestions = questionHistory.length;
        const correctAnswers = questionHistory.filter(h => h.is_correct).length;
        const overallAccuracy = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;
        const totalTimeSpent = questionHistory.reduce((sum, h) => sum + (h.time_spent || 0), 0);
        const averageTimePerQuestion = totalQuestions > 0 ? totalTimeSpent / totalQuestions : 0;

        // 11. Tạo phản hồi chi tiết
        const response = {
            quiz_info: {
                quiz_id: quiz.quiz_id,
                quiz_name: quiz.name,
                course_id: quiz.Course.course_id,
                course_name: quiz.Course.name,
                subject: quiz.Course.Subject,  // Fixed: Use Course.Subject path
                total_questions: quiz.Questions.length,
                completion_date: quizResult.update_time
            },
            student_info: {
                user_id: quizResult.Student.user_id,
                name: quizResult.Student.name,
                email: quizResult.Student.email
            },
            overall_performance: {
                final_score: quizResult.score,
                total_questions_answered: totalQuestions,
                correct_answers: correctAnswers,
                accuracy_percentage: Math.round(overallAccuracy * 100) / 100,
                total_time_spent_seconds: totalTimeSpent,
                average_time_per_question_seconds: Math.round(averageTimePerQuestion),
                performance_level: overallAccuracy >= 80 ? 'excellent' :
                    overallAccuracy >= 60 ? 'good' :
                        overallAccuracy >= 40 ? 'average' : 'needs_improvement'
            },
            question_distribution: questionDistribution,
            chapter_analysis: {
                ...chapterAnalysis,
                // Thêm thông báo khi không có weaknesses
                weaknesses_message: chapterAnalysis.weaknesses.length === 0 ?
                    'Chúc mừng! Bạn không có chương nào yếu (dưới 40%). Hãy tiếp tục duy trì kết quả tốt này!' :
                    null,
                summary: {
                    total_chapters_covered: chapterAnalysis.overall_stats.total_chapters_tested,
                    strong_chapters_count: chapterAnalysis.overall_stats.strong_chapters,
                    weak_chapters_count: chapterAnalysis.overall_stats.weak_chapters,
                    neutral_chapters_count: chapterAnalysis.overall_stats.neutral_chapters,
                    chapters_needing_attention: chapterAnalysis.weaknesses.length > 0 ?
                        chapterAnalysis.weaknesses.map(w => ({
                            chapter_id: w.chapter_id,
                            chapter_name: w.chapter_name,
                            accuracy: w.accuracy_percentage,
                            gap_to_target: Math.max(0, 70 - w.accuracy_percentage),
                            related_los: w.related_los,
                            status: 'needs_improvement',
                            sections: w.sections ? w.sections.map(s => ({
                                section_id: s.section_id,
                                title: s.title,
                                content_type: 'text',
                                has_content: !!s.content,
                                order: s.order
                            })) : []
                        })) :
                        // Nếu không có weaknesses, hiển thị thông báo và các chương để nâng cao
                        [{
                            chapter_id: null,
                            chapter_name: 'Thông báo',
                            accuracy: 100,
                            gap_to_target: 0,
                            related_los: [],
                            status: 'no_weak_chapters',
                            message: 'Chúc mừng! Bạn đã đạt kết quả tốt ở tất cả các chương (>40%). Hãy tiếp tục duy trì và nâng cao kiến thức.',
                            sections: [],
                            enhancement_suggestions: chapterAnalysis.strengths.length > 0 ?
                                chapterAnalysis.strengths.slice(0, 3).map(s => ({
                                    chapter_id: s.chapter_id,
                                    chapter_name: s.chapter_name,
                                    accuracy: s.accuracy_percentage,
                                    suggestion: 'Chương để nâng cao kiến thức chuyên sâu'
                                })) : []
                        }],
                    all_chapters_details: [
                        ...chapterAnalysis.strengths.map(s => ({
                            chapter_id: s.chapter_id,
                            chapter_name: s.chapter_name,
                            accuracy: s.accuracy_percentage,
                            performance_level: s.performance_level,
                            status: 'strong',
                            related_los: s.related_los,
                            sections_count: s.sections?.length || 0
                        })),
                        ...chapterAnalysis.neutral.map(n => ({
                            chapter_id: n.chapter_id,
                            chapter_name: n.chapter_name,
                            accuracy: n.accuracy_percentage,
                            performance_level: n.performance_level,
                            status: 'neutral',
                            related_los: n.related_los,
                            sections_count: n.sections?.length || 0
                        })),
                        ...chapterAnalysis.weaknesses.map(w => ({
                            chapter_id: w.chapter_id,
                            chapter_name: w.chapter_name,
                            accuracy: w.accuracy_percentage,
                            performance_level: w.performance_level,
                            status: 'weak',
                            related_los: w.related_los,
                            sections_count: w.sections?.length || 0
                        }))
                    ]
                }
            },
            learning_outcome_analysis: {
                ...loAnalysis,
                summary: {
                    total_los_covered: loAnalysis.overall_stats.total_los_tested,
                    strong_areas_count: loAnalysis.overall_stats.strong_los,
                    weak_areas_count: loAnalysis.overall_stats.weak_los,
                    areas_needing_attention: loAnalysis.weaknesses.map(w => ({
                        lo_name: w.lo_name,
                        accuracy: w.accuracy_percentage,
                        gap_to_target: Math.max(0, 70 - w.accuracy_percentage)
                    }))
                }
            },
            difficulty_analysis: {
                ...difficultyAnalysis,
                summary: {
                    total_levels_tested: difficultyAnalysis.overall_stats.total_levels_tested,
                    strong_levels_count: difficultyAnalysis.overall_stats.strong_levels,
                    weak_levels_count: difficultyAnalysis.overall_stats.weak_levels,
                    challenging_areas: difficultyAnalysis.weaknesses.length > 0 ?
                        difficultyAnalysis.weaknesses.map(w => ({
                            level_name: w.level_name,
                            accuracy: w.accuracy_percentage,
                            improvement_needed: Math.max(0, 70 - w.accuracy_percentage)
                        })) :
                        // Nếu không có weaknesses, hiển thị các level để nâng cao
                        difficultyAnalysis.strengths.slice(0, 2).map(s => ({
                            level_name: s.level_name,
                            accuracy: s.accuracy_percentage,
                            improvement_needed: 0,
                            note: 'Cấp độ để thử thách nâng cao'
                        }))
                }
            },
            improvement_suggestions: improvementSuggestions,
            lo_completion_analysis: {
                needs_improvement: (loCompletionAnalysis.needs_improvement || []).map(lo => ({
                    lo_id: lo.lo_id,
                    lo_name: lo.lo_name,
                    completion_percentage: lo.completion_percentage,
                    status: lo.status,
                    description: lo.lo_description || 'Không có mô tả',
                    related_chapters: (lo.related_chapters || []).map(ch => ({
                        chapter_id: ch.chapter_id,
                        chapter_name: ch.chapter_name,
                        chapter_description: ch.chapter_description,
                        sections: (ch.sections || []).map(section => ({
                            section_id: section.section_id,
                            title: section.title,
                            content: section.content
                        }))
                    })),
                    improvement_plan: lo.improvement_plan || {}
                })),
                ready_for_advancement: (loCompletionAnalysis.ready_for_advancement || []).map(lo => ({
                    lo_id: lo.lo_id,
                    lo_name: lo.lo_name,
                    completion_percentage: lo.completion_percentage,
                    status: lo.status,
                    next_level_suggestions: lo.next_level_suggestions || [],
                    alternative_paths: lo.alternative_paths || []
                })),
                summary: {
                    total_los_analyzed: (loCompletionAnalysis.needs_improvement || []).length +
                        (loCompletionAnalysis.ready_for_advancement || []).length,
                    los_needing_improvement: (loCompletionAnalysis.needs_improvement || []).length,
                    los_ready_for_advancement: (loCompletionAnalysis.ready_for_advancement || []).length,
                    completion_threshold: 60
                }
            },
            personalized_recommendations: personalizedRecommendations,
            learning_insights: {
                what_you_did_well: chapterAnalysis.strengths.length > 0 ?
                    `Bạn đã thể hiện tốt ở ${chapterAnalysis.strengths.length} chương: ${chapterAnalysis.strengths.map(s => s.chapter_name).join(', ')}` :
                    'Bạn cần cải thiện ở tất cả các chương được kiểm tra',
                areas_for_improvement: chapterAnalysis.weaknesses.length > 0 ?
                    `Bạn cần tập trung cải thiện ${chapterAnalysis.weaknesses.length} chương: ${chapterAnalysis.weaknesses.map(w => w.chapter_name).join(', ')}` :
                    'Bạn đã đạt kết quả tốt ở tất cả các chương',
                next_steps: chapterAnalysis.weaknesses.length > 0 ?
                    `Ưu tiên ôn tập: ${chapterAnalysis.weaknesses.slice(0, 2).map(w => w.chapter_name).join(', ')}` :
                    'Tiếp tục duy trì kết quả tốt và thử thách bản thân với các bài tập nâng cao',
                study_chapters: chapterAnalysis.weaknesses.length > 0 ?
                    chapterAnalysis.weaknesses.slice(0, 3).map(w => ({
                        chapter_name: w.chapter_name,
                        accuracy: w.accuracy_percentage,
                        sections_to_review: w.sections ? w.sections.map(s => s.title) : [],
                        related_concepts: w.related_los || []
                    })) :
                    // Nếu không có weaknesses, đề xuất các chương để nâng cao
                    chapterAnalysis.strengths.slice(0, 2).map(s => ({
                        chapter_name: s.chapter_name,
                        accuracy: s.accuracy_percentage,
                        sections_to_review: s.sections ? s.sections.map(sec => sec.title) : [],
                        related_concepts: s.related_los || [],
                        note: 'Chương để nâng cao kiến thức'
                    }))
            },
            generated_at: new Date()
        };

        res.status(200).json({
            success: true,
            data: response
        });

    } catch (error) {
        console.error('Error in getDetailedQuizAnalysisForStudent:', error);
        res.status(500).json({
            message: 'Lỗi server khi phân tích kết quả quiz',
            error: error.message
        });
    }
};

// =====================================================
// QUIZ LO ANALYSIS - PHÂN TÍCH KẾT QUẢ QUIZ THEO LO
// =====================================================

exports.getQuizLOAnalysis = async (req, res) => {
    try {
        const { quiz_id, user_id } = req.params;
        const { user } = req;

        // Kiểm tra quyền truy cập
        if (user.role === 'student' && user.user_id !== parseInt(user_id)) {
            return res.status(403).json({ message: 'Không có quyền xem kết quả của người khác' });
        }

        // 1. Lấy thông tin quiz
        const quiz = await Quiz.findByPk(quiz_id, {
            include: [
                {
                    model: Course,
                    as: 'Course',
                    attributes: ['course_id', 'name', 'subject_id'],
                    include: [{
                        model: Subject,
                        as: 'Subject',
                        attributes: ['subject_id', 'name', 'description']
                    }]
                }
            ]
        });

        if (!quiz) {
            return res.status(404).json({ message: 'Không tìm thấy quiz' });
        }

        // 2. Lấy kết quả quiz của người dùng
        const quizResult = await QuizResult.findOne({
            where: { quiz_id, user_id },
            include: [
                {
                    model: User,
                    as: 'Student',
                    attributes: ['user_id', 'name', 'email']
                }
            ]
        });

        if (!quizResult) {
            return res.status(404).json({ message: 'Không tìm thấy kết quả quiz của người dùng này' });
        }

        // 3. Lấy lịch sử trả lời câu hỏi chi tiết
        const questionHistory = await UserQuestionHistory.findAll({
            where: { quiz_id, user_id },
            include: [
                {
                    model: Question,
                    as: 'Question',
                    include: [
                        {
                            model: LO,
                            as: 'LO',
                            attributes: ['lo_id', 'name', 'description']
                        }
                    ]
                }
            ],
            order: [['attempt_date', 'ASC']]
        });

        // 4. Phân tích theo LO
        const loAnalysis = await analyzeQuizResultsByLO(questionHistory);

        // 5. Tạo gợi ý học tập
        const learningSuggestions = generateLOBasedLearningSuggestions(loAnalysis);

        const response = {
            success: true,
            data: {
                quiz_info: {
                    quiz_id: quiz.quiz_id,
                    quiz_name: quiz.name,
                    course_id: quiz.Course.course_id,
                    course_name: quiz.Course.name,
                    subject: quiz.Course.Subject,  // Fixed: Use Course.Subject path
                    total_questions: questionHistory.length,
                    completion_date: quizResult.completion_time
                },
                student_info: {
                    user_id: quizResult.Student.user_id,
                    name: quizResult.Student.name,
                    email: quizResult.Student.email
                },
                overall_performance: {
                    final_score: quizResult.score,
                    total_questions_answered: questionHistory.length,
                    correct_answers: questionHistory.filter(q => q.is_correct).length,
                    accuracy_percentage: (questionHistory.filter(q => q.is_correct).length / questionHistory.length) * 100,
                    performance_level: getPerformanceLevel(quizResult.score)
                },
                lo_analysis: loAnalysis,
                learning_suggestions: learningSuggestions,
                generated_at: new Date().toISOString()
            }
        };

        res.status(200).json(response);

    } catch (error) {
        console.error('Error in getQuizLOAnalysis:', error);
        res.status(500).json({
            message: 'Lỗi khi phân tích kết quả quiz theo LO',
            error: error.message
        });
    }
};

// =====================================================
// QUIZ LO ANALYSIS WITH CHAPTERS - PHÂN TÍCH CHI TIẾT VỚI CHƯƠNG
// =====================================================

exports.getQuizLOAnalysisWithChapters = async (req, res) => {
    try {
        const { quiz_id, user_id } = req.params;
        const { user } = req;

        // Kiểm tra quyền truy cập
        if (user.role === 'student' && user.user_id !== parseInt(user_id)) {
            return res.status(403).json({ message: 'Không có quyền xem kết quả của người khác' });
        }

        // 1. Lấy thông tin quiz
        const quiz = await Quiz.findByPk(quiz_id, {
            include: [
                {
                    model: Course,
                    as: 'Course',
                    attributes: ['course_id', 'name', 'subject_id'],
                    include: [
                        {
                            model: Subject,
                            as: 'Subject',
                            attributes: ['subject_id', 'name', 'description']
                        }
                    ]
                }
            ]
        });

        if (!quiz) {
            return res.status(404).json({ message: 'Không tìm thấy quiz' });
        }

        // 2. Lấy kết quả quiz của người dùng
        const quizResult = await QuizResult.findOne({
            where: { quiz_id, user_id },
            include: [
                {
                    model: User,
                    as: 'Student',
                    attributes: ['user_id', 'name', 'email']
                }
            ]
        });

        if (!quizResult) {
            return res.status(404).json({ message: 'Không tìm thấy kết quả quiz của người dùng này' });
        }

        // 3. Lấy lịch sử trả lời câu hỏi chi tiết
        const questionHistory = await UserQuestionHistory.findAll({
            where: { quiz_id, user_id },
            include: [
                {
                    model: Question,
                    as: 'Question',
                    include: [
                        {
                            model: LO,
                            as: 'LO',
                            attributes: ['lo_id', 'name', 'description']
                        }
                    ]
                }
            ],
            order: [['attempt_date', 'ASC']]
        });

        // 4. Phân tích theo LO với thông tin chương
        // Support both subject_id (existing) and course_id (migration path)
        let subjectForLO = quiz.Course && quiz.Course.Subject ? quiz.Course.Subject.subject_id : null;
        // If caller provided course_id (migration), resolve subject from Course
        const providedCourseId = req.query?.course_id || req.body?.course_id;
        if (providedCourseId) {
            const courseObj = await Course.findByPk(providedCourseId, { include: [{ model: Subject, as: 'Subject' }] });
            if (courseObj && courseObj.Subject) {
                subjectForLO = courseObj.Subject.subject_id;
            }
        }
        const loAnalysisWithChapters = await analyzeQuizResultsByLOWithChapters(questionHistory, subjectForLO);

        // 5. Tạo gợi ý học tập chi tiết
        const detailedLearningSuggestions = generateDetailedLOBasedLearningSuggestions(loAnalysisWithChapters);

        const response = {
            success: true,
            data: {
                quiz_info: {
                    quiz_id: quiz.quiz_id,
                    quiz_name: quiz.name,
                    course_id: quiz.Course.course_id,
                    course_name: quiz.Course.name,
                    subject: quiz.Course.Subject,  // Fixed: Use Course.Subject path
                    total_questions: questionHistory.length,
                    completion_date: quizResult.completion_time
                },
                student_info: {
                    user_id: quizResult.Student.user_id,
                    name: quizResult.Student.name,
                    email: quizResult.Student.email
                },
                overall_performance: {
                    final_score: quizResult.score,
                    total_questions_answered: questionHistory.length,
                    correct_answers: questionHistory.filter(q => q.is_correct).length,
                    accuracy_percentage: (questionHistory.filter(q => q.is_correct).length / questionHistory.length) * 100,
                    performance_level: getPerformanceLevel(quizResult.score)
                },
                lo_analysis_with_chapters: loAnalysisWithChapters,
                learning_suggestions: detailedLearningSuggestions,
                generated_at: new Date().toISOString()
            }
        };

        res.status(200).json(response);

    } catch (error) {
        console.error('Error in getQuizLOAnalysisWithChapters:', error);
        res.status(500).json({
            message: 'Lỗi khi phân tích kết quả quiz theo LO với chương',
            error: error.message
        });
    }
};

// =====================================================
// ADDITIONAL HELPER FUNCTIONS
// =====================================================

async function analyzeQuizResultsByLOWithChapters(questionHistory, subjectId) {
    const loResults = {};

    // Nhóm câu hỏi theo LO
    questionHistory.forEach(question => {
        const lo = question.Question.LO;
        if (!lo) return;

        if (!loResults[lo.lo_id]) {
            loResults[lo.lo_id] = {
                lo_id: lo.lo_id,
                lo_name: lo.name,
                lo_description: lo.description,
                total_questions: 0,
                correct_answers: 0,
                accuracy_percentage: 0,
                performance_level: '',
                mastery_status: '',
                needs_improvement: false,
                related_chapters: []
            };
        }

        loResults[lo.lo_id].total_questions++;
        if (question.is_correct) {
            loResults[lo.lo_id].correct_answers++;
        }
    });

    // Tính toán thống kê cho từng LO
    Object.values(loResults).forEach(lo => {
        lo.accuracy_percentage = (lo.correct_answers / lo.total_questions) * 100;
        lo.performance_level = getPerformanceLevel(lo.accuracy_percentage);
        lo.mastery_status = lo.accuracy_percentage >= 60 ? 'mastered' : 'needs_improvement';
        lo.needs_improvement = lo.accuracy_percentage < 60;
    });

    // Lấy thông tin chương liên quan cho từng LO
    // Note: this helper expects a subjectId. If subjectId is not provided
    // the related_chapters list will be left empty. Controller should resolve
    // subjectId from course_id when needed.
    for (const lo of Object.values(loResults)) {
        let relatedChapters = [];
        if (subjectId) {
            relatedChapters = await Chapter.findAll({
            include: [
                {
                    model: LO,
                    as: 'LOs',
                    where: { lo_id: lo.lo_id },
                    attributes: []
                },
                {
                    model: ChapterSection,
                    as: 'Sections',
                    attributes: ['section_id', 'title', 'content', 'order']
                }
            ],
            where: { subject_id: subjectId },
            attributes: ['chapter_id', 'name', 'description'],
            order: [['chapter_id', 'ASC'], [{ model: ChapterSection, as: 'Sections' }, 'order', 'ASC']]
        });
        } else {
            // no subjectId provided: relatedChapters remains empty
            console.warn('analyzeQuizResultsByLOWithChapters: no subjectId provided, skipping chapter lookup');
        }

        lo.related_chapters = relatedChapters.map(chapter => ({
            chapter_id: chapter.chapter_id,
            chapter_name: chapter.name,
            chapter_description: chapter.description,
            sections: chapter.Sections.map(section => ({
                section_id: section.section_id,
                section_title: section.title,
                content_summary: section.content ? section.content.substring(0, 200) + '...' : '',
                order: section.order
            }))
        }));
    }

    return {
        mastered_los: Object.values(loResults).filter(lo => lo.mastery_status === 'mastered'),
        needs_improvement_los: Object.values(loResults).filter(lo => lo.mastery_status === 'needs_improvement'),
        summary: {
            total_los_covered: Object.keys(loResults).length,
            mastered_count: Object.values(loResults).filter(lo => lo.mastery_status === 'mastered').length,
            needs_improvement_count: Object.values(loResults).filter(lo => lo.mastery_status === 'needs_improvement').length
        }
    };
}

function generateDetailedLOBasedLearningSuggestions(loAnalysis) {
    const suggestions = {
        focus_areas: [],
        study_recommendations: []
    };

    // Gợi ý cho LO cần cải thiện
    loAnalysis.needs_improvement_los.forEach(lo => {
        const focusArea = {
            lo_id: lo.lo_id,
            lo_name: lo.lo_name,
            current_accuracy: lo.accuracy_percentage,
            target_accuracy: 60,
            improvement_needed: 60 - lo.accuracy_percentage,
            priority_level: getPriorityLevel(lo.accuracy_percentage),
            study_focus: `Ôn lại và thực hành ${lo.lo_name}`,
            what_to_study: [
                `Lý thuyết cơ bản về ${lo.lo_name}`,
                `Các khái niệm quan trọng trong ${lo.lo_name}`,
                `Phương pháp áp dụng ${lo.lo_name}`
            ],
            related_chapters: lo.related_chapters.map(chapter => ({
                chapter_id: chapter.chapter_id,
                chapter_name: chapter.chapter_name,
                chapter_description: chapter.chapter_description,
                study_priority: 'high',
                sections_to_focus: chapter.sections.map(section => ({
                    section_id: section.section_id,
                    section_title: section.section_title,
                    content_summary: section.content_summary
                }))
            })),
            practice_exercises: [
                `Làm bài tập cơ bản về ${lo.lo_name}`,
                `Thực hành các ví dụ trong chương ${lo.lo_name}`,
                `Làm quiz thực hành về ${lo.lo_name}`,
                `Ôn lại các khái niệm cơ bản của ${lo.lo_name}`
            ]
        };

        suggestions.focus_areas.push(focusArea);
    });

    // Gợi ý cho LO đã thành thạo
    loAnalysis.mastered_los.forEach(lo => {
        const studyRecommendation = {
            lo_id: lo.lo_id,
            lo_name: lo.lo_name,
            current_accuracy: lo.accuracy_percentage,
            status: 'excellent_mastery',
            next_level_suggestion: `Có thể học nâng cao về ${lo.lo_name}`,
            what_to_learn_next: [
                `Chuyên sâu về ${lo.lo_name}`,
                `Ứng dụng thực tế của ${lo.lo_name}`,
                `Tích hợp ${lo.lo_name} với các LO khác`,
                `Các kỹ thuật nâng cao trong ${lo.lo_name}`
            ],
            related_chapters: lo.related_chapters.map(chapter => ({
                chapter_id: chapter.chapter_id,
                chapter_name: chapter.chapter_name,
                chapter_description: chapter.chapter_description,
                study_priority: 'review_and_advance',
                sections_to_review: chapter.sections.map(section => ({
                    section_id: section.section_id,
                    section_title: section.section_title,
                    content_summary: section.content_summary
                }))
            }))
        };

        suggestions.study_recommendations.push(studyRecommendation);
    });

    return suggestions;
}

function getPerformanceLevel(accuracy) {
    if (accuracy >= 80) return 'excellent';
    if (accuracy >= 60) return 'good';
    if (accuracy >= 40) return 'average';
    return 'needs_improvement';
}

function getPriorityLevel(accuracy) {
    if (accuracy < 30) return 'critical';
    if (accuracy < 45) return 'high';
    return 'medium';
}

// =====================================================
// QUIZ RESULT ENSURE USER QUESTION HISTORY COMPLETENESS
// =====================================================

exports.ensureUserQuestionHistoryCompleteness = async (req, res) => {
    try {
        const { user_id, quiz_id } = req.body;

        if (!user_id || !quiz_id) {
            return res.status(400).json({ message: 'Thiếu user_id hoặc quiz_id' });
        }

        await ensureUserQuestionHistoryCompleteness(user_id, quiz_id);

        res.json({ message: 'UserQuestionHistory completeness ensured' });
    } catch (error) {
        console.error('Error in ensureUserQuestionHistoryCompleteness API:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};