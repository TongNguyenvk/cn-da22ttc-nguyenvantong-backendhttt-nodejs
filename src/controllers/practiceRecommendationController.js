const {
    UserQuestionHistory,
    QuizResult,
    Question,
    Quiz,
    Subject,
    User,
    LO,
    Level,
    Chapter,
    ChapterLO,
    Course,
    Answer,
    sequelize
} = require('../models');
const { Op } = require('sequelize');

/**
 * PRACTICE RECOMMENDATION CONTROLLER
 * Cung cấp đề xuất luyện tập và sinh câu hỏi luyện tập cho học sinh
 */

// ==================== HELPER FUNCTIONS ====================

/**
 * Xác định priority dựa trên accuracy và attempts
 */
function determinePriority(accuracy, attempts) {
    if (attempts === 0) return 'high'; // chưa làm bao giờ nhưng cần luyện
    if (accuracy < 40 && attempts >= 3) return 'urgent';
    if (accuracy < 60) return 'high';
    if (accuracy < 80) return 'medium';
    return 'low';
}

/**
 * Tạo improvement actions cho LO
 */
function generateImprovementActions(loData) {
    const actions = [];
    
    if (loData.accuracy < 0.4) {
        actions.push("Ôn lại kiến thức cơ bản và làm bài tập dễ");
        actions.push("Xem lại tài liệu học tập cho LO này");
        actions.push("Đặt lịch luyện tập trong 24h tới");
    } else if (loData.accuracy < 0.6) {
        actions.push("Luyện tập thêm với câu hỏi trung bình");
        actions.push("Tập trung vào các dạng bài thường sai");
        actions.push("Viết lại các điểm sai vào sổ tay học tập");
    } else if (loData.accuracy < 0.8) {
        actions.push("Thử thách bản thân với câu hỏi khó hơn");
        actions.push("Rút ngắn thời gian làm bài");
        actions.push("Ôn tập theo phương pháp spaced repetition");
    } else {
        actions.push("Duy trì phong độ với bài tập đa dạng");
        actions.push("Hỗ trợ bạn bè học tập");
        actions.push("Thử thách với câu hỏi ứng dụng cao");
    }

    if (loData.attempts < 3) {
        actions.push("Làm thêm bài tập để đánh giá chính xác năng lực");
    }

    return actions.slice(0, 4); // Giới hạn 4 actions
}

// ==================== MAIN API CONTROLLERS ====================

/**
 * Get practice recommendations cho user
 * Route: GET /api/practice/recommendations?courseId=xxx&userId=xxx
 */
const getPracticeRecommendations = async (req, res) => {
    try {
        const { courseId, userId } = req.query;

        if (!courseId || !userId) {
            return res.status(400).json({
                success: false,
                error: 'courseId và userId là bắt buộc'
            });
        }

        // 1. Lấy tất cả LOs của course này bằng Sequelize associations (tránh lỗi tên bảng)
        const course = await Course.findByPk(courseId, {
            include: [{
                model: Subject,
                as: 'Subject',
                include: [{
                    model: Chapter,
                    as: 'Chapters',
                    include: [{
                        model: LO,
                        as: 'LOs',
                        through: { attributes: [] }
                    }]
                }]
            }]
        });

        if (!course || !course.Subject) {
            return res.status(404).json({
                success: false,
                error: 'Không tìm thấy course hoặc subject liên quan'
            });
        }

        // Map LO -> một chapter đầu tiên để hiển thị
        const loMap = new Map();
        for (const ch of course.Subject.Chapters || []) {
            for (const lo of ch.LOs || []) {
                if (!loMap.has(lo.lo_id)) {
                    loMap.set(lo.lo_id, {
                        lo_id: lo.lo_id,
                        lo_name: lo.name,
                        description: lo.description,
                        subject_name: course.Subject.name,
                        chapter_name: ch.name,
                        level_name: 'Cơ bản'
                    });
                }
            }
        }

        // Sort theo subject -> chapter -> lo_name
        const courseLos = Array.from(loMap.values()).sort((a, b) => {
            if (a.subject_name !== b.subject_name) return a.subject_name.localeCompare(b.subject_name);
            if (a.chapter_name !== b.chapter_name) return a.chapter_name.localeCompare(b.chapter_name);
            return a.lo_name.localeCompare(b.lo_name);
        });

        const courseRecommendations = [];

        for (const lo of courseLos) {
            // 2. Lấy lịch sử làm bài cho LO này
            const historyQuery = await UserQuestionHistory.findAll({
                where: { user_id: userId },
                include: [{
                    model: Question,
                    as: 'Question',
                    where: { lo_id: lo.lo_id },
                    required: true
                }]
            });

            // 3. Tính toán thống kê
            const totalAttempts = historyQuery.length;
            const correctAttempts = historyQuery.filter(h => h.is_correct).length;
            const accuracy = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;
            const avgTimeSpent = totalAttempts > 0 
                ? Math.round(historyQuery.reduce((sum, h) => sum + (h.time_spent || 0), 0) / totalAttempts)
                : 0;

            // 4. Xác định priority và tạo recommendation
            const priority = determinePriority(accuracy, totalAttempts);
            const difficultyScore = totalAttempts === 0 ? 50 : 
                accuracy < 40 ? 20 : 
                accuracy < 60 ? 35 : 
                accuracy < 80 ? 50 : 70;

            const loRecommendation = {
                lo_id: lo.lo_id,
                lo_name: lo.lo_name,
                lo_description: lo.description,
                subject_name: lo.subject_name,
                chapter_name: lo.chapter_name,
                level_name: lo.level_name || 'Cơ bản',
                statistics: {
                    accuracy_percentage: accuracy,
                    total_attempts: totalAttempts,
                    correct_attempts: correctAttempts,
                    average_time_spent: avgTimeSpent,
                    difficulty_score: difficultyScore
                },
                priority,
                recommendation_type: totalAttempts === 0 ? 'new_topic' : 
                    accuracy < 40 ? 'need_review' :
                    accuracy < 60 ? 'practice_more' :
                    accuracy < 80 ? 'improve_speed' : 'maintain',
                improvement_actions: generateImprovementActions({
                    accuracy: accuracy / 100,
                    attempts: totalAttempts
                }),
                estimated_time_minutes: totalAttempts === 0 ? 15 : 
                    accuracy < 40 ? 25 :
                    accuracy < 60 ? 20 :
                    accuracy < 80 ? 15 : 10
            };

            courseRecommendations.push(loRecommendation);
        }

        // 5. Sắp xếp theo priority và accuracy
        const priorityOrder = { 'urgent': 0, 'high': 1, 'medium': 2, 'low': 3 };
        courseRecommendations.sort((a, b) => {
            if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
                return priorityOrder[a.priority] - priorityOrder[b.priority];
            }
            return a.statistics.accuracy_percentage - b.statistics.accuracy_percentage;
        });

    return res.json({
            success: true,
            data: {
                course_id: courseId,
                total_los: courseRecommendations.length,
                recommendations: courseRecommendations,
                summary: {
                    urgent_count: courseRecommendations.filter(r => r.priority === 'urgent').length,
                    high_priority_count: courseRecommendations.filter(r => r.priority === 'high').length,
                    avg_accuracy: Math.round(
                        courseRecommendations.reduce((sum, r) => sum + r.statistics.accuracy_percentage, 0) / 
                        Math.max(courseRecommendations.length, 1)
                    ),
                    total_estimated_time: courseRecommendations.reduce((sum, r) => sum + r.estimated_time_minutes, 0)
                }
            }
        });

    } catch (error) {
        console.error('Error in getPracticeRecommendations:', error);
        res.status(500).json({
            success: false,
            error: 'Lỗi server khi lấy đề xuất luyện tập',
            details: error.message
        });
    }
};

/**
 * Generate practice quiz questions
 * Route: POST /api/practice/generate
 */
const generatePracticeQuiz = async (req, res) => {
    try {
        const { 
            courseId, 
            userId, 
            loId, 
            difficulty = 'medium', 
            totalQuestions = 10,
            includeReview = true 
        } = req.body;

        if (!courseId || !userId) {
            return res.status(400).json({
                success: false,
                error: 'courseId và userId là bắt buộc'
            });
        }

        // 1. Nếu không chỉ định LO cụ thể, chọn LO có priority cao nhất
        let targetLoId = loId;
        if (!targetLoId) {
            const recommendations = await getPracticeRecommendationsInternal(courseId, userId);
            if (recommendations.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Không tìm thấy LO phù hợp để tạo bài luyện tập'
                });
            }
            targetLoId = recommendations[0].lo_id;
        }

        // 2. Xác định level_id từ difficulty
        const difficultyMap = { 'easy': 1, 'medium': 2, 'hard': 3 };
        const levelId = difficultyMap[difficulty];

        // 3. Lấy danh sách câu hỏi đã làm của user cho LO này
        const attemptedQuestions = await UserQuestionHistory.findAll({
            where: { user_id: userId },
            include: [{
                model: Question,
                as: 'Question',
                where: { lo_id: targetLoId },
                required: true
            }]
        });
        const attemptedQuestionIds = attemptedQuestions.map(h => h.question_id);

        // 4. Lấy câu hỏi mới (chưa làm) trước
        const newQuestions = await Question.findAll({
            where: {
                lo_id: targetLoId,
                level_id: levelId,
                question_id: { [Op.notIn]: attemptedQuestionIds }
            },
            include: [{
                model: Answer,
                attributes: ['answer_id', 'answer_text', 'iscorrect']
            }],
            limit: totalQuestions,
            order: sequelize.random()
        });

        let selectedQuestions = [...newQuestions];

        // 5. Nếu không đủ câu mới và cho phép review, thêm câu đã làm
        if (selectedQuestions.length < totalQuestions && includeReview) {
            const remainingCount = totalQuestions - selectedQuestions.length;
            const reviewQuestions = await Question.findAll({
                where: {
                    lo_id: targetLoId,
                    level_id: levelId,
                    question_id: { [Op.in]: attemptedQuestionIds }
                },
                include: [{
                    model: Answer,
                    attributes: ['answer_id', 'answer_text', 'iscorrect']
                }],
                limit: remainingCount,
                order: sequelize.random()
            });
            selectedQuestions = [...selectedQuestions, ...reviewQuestions];
        }

        // 6. Format response cho frontend
        const formattedQuestions = selectedQuestions.map((question, index) => {
            const isReview = attemptedQuestionIds.includes(question.question_id);
            return {
                question_id: question.question_id,
                question_text: question.question_text,
                question_number: index + 1,
                difficulty,
                is_review: isReview,
                answers: question.Answers.map(answer => ({
                    answer_id: answer.answer_id,
                    answer_text: answer.answer_text,
                    is_correct: answer.iscorrect
                }))
            };
        });

        // 7. Lấy thông tin LO để gửi kèm (không include Level vì không có association)
        const loInfo = await LO.findByPk(targetLoId, {
            attributes: ['lo_id', 'name', 'description']
        });

        // 8. Lấy level info riêng biệt
        const levelInfo = await Level.findByPk(levelId, {
            attributes: ['level_id', 'name']
        });

        res.status(201).json({
            success: true,
            data: {
                quiz_id: `practice_${Date.now()}_${userId}`, // Temporary quiz ID
                lo_id: targetLoId,
                lo_name: loInfo?.name || 'Unknown LO',
                difficulty,
                level_name: levelInfo?.name || difficulty,
                total_questions: formattedQuestions.length,
                new_questions_count: formattedQuestions.filter(q => !q.is_review).length,
                review_questions_count: formattedQuestions.filter(q => q.is_review).length,
                estimated_time_minutes: formattedQuestions.length * 2, // 2 phút/câu
                questions: formattedQuestions
            }
        });

    } catch (error) {
        console.error('Error in generatePracticeQuiz:', error);
        res.status(500).json({
            success: false,
            error: 'Lỗi server khi tạo bài luyện tập',
            details: error.message
        });
    }
};

/**
 * Generate adaptive practice quiz covering multiple weak LOs with proportional distribution
 * Route: POST /api/practice-recommendations/generate-adaptive
 * @body {
 *   assessment_quiz_id: number,
 *   total_questions: number (default 20),
 *   distribution_method: 'proportional' | 'equal' (default 'proportional'),
 *   difficulty: 'easy' | 'medium' | 'hard' | 'adaptive' (default 'adaptive')
 * }
 */
const generateAdaptivePracticeQuiz = async (req, res) => {
    try {
        const {
            assessment_quiz_id,
            total_questions = 20,
            distribution_method = 'proportional',
            difficulty = 'adaptive'
        } = req.body;
        const userId = req.user.user_id;

        if (!assessment_quiz_id) {
            return res.status(400).json({
                success: false,
                error: 'assessment_quiz_id is required'
            });
        }

        // 1. Get weak LOs from assessment quiz
        const quizResult = await QuizResult.findOne({
            where: {
                quiz_id: assessment_quiz_id,
                user_id: userId,
                status: { [Op.in]: ['completed', 'finished'] }
            },
            include: [{
                model: Quiz,
                as: 'Quiz',
                attributes: ['quiz_id', 'name', 'quiz_mode', 'course_id']
            }]
        });

        if (!quizResult) {
            return res.status(404).json({
                success: false,
                message: 'Quiz result not found or quiz not completed'
            });
        }

        // Get weak LOs from question history
        const questionHistory = await UserQuestionHistory.findAll({
            where: {
                user_id: userId,
                quiz_id: assessment_quiz_id
            },
            include: [{
                model: Question,
                as: 'Question',
                include: [{
                    model: LO,
                    as: 'LO',
                    attributes: ['lo_id', 'name']
                }]
            }]
        });

        // Analyze LO performance
        const loPerformance = {};
        questionHistory.forEach(history => {
            const loId = history.Question.LO.lo_id;
            if (!loPerformance[loId]) {
                loPerformance[loId] = {
                    lo_id: loId,
                    lo_name: history.Question.LO.name,
                    total: 0,
                    correct: 0,
                    accuracy: 0
                };
            }
            loPerformance[loId].total++;
            if (history.is_correct) {
                loPerformance[loId].correct++;
            }
        });

        // Calculate accuracy and find weak LOs (<70%)
        const weakLOs = [];
        Object.values(loPerformance).forEach(lo => {
            lo.accuracy = lo.total > 0 ? (lo.correct / lo.total) * 100 : 0;
            if (lo.accuracy < 70) {
                weakLOs.push(lo);
            }
        });

        if (weakLOs.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No weak areas found. Great job!',
                data: {
                    assessment_quiz: {
                        quiz_id: assessment_quiz_id,
                        name: quizResult.Quiz.name,
                        score: quizResult.score
                    },
                    weak_los: [],
                    practice_quiz: null
                }
            });
        }

        // Sort by accuracy (weakest first)
        weakLOs.sort((a, b) => a.accuracy - b.accuracy);

        // 2. Calculate question distribution
        let questionDistribution = [];
        
        if (distribution_method === 'proportional') {
            // Proportional: weaker LOs get more questions
            const totalInverseAccuracy = weakLOs.reduce((sum, lo) => sum + (100 - lo.accuracy), 0);
            
            questionDistribution = weakLOs.map(lo => {
                const weight = (100 - lo.accuracy) / totalInverseAccuracy;
                const questionCount = Math.max(1, Math.round(total_questions * weight));
                return {
                    ...lo,
                    question_count: questionCount,
                    weight: Math.round(weight * 100)
                };
            });
        } else {
            // Equal distribution
            const questionsPerLO = Math.floor(total_questions / weakLOs.length);
            questionDistribution = weakLOs.map(lo => ({
                ...lo,
                question_count: questionsPerLO,
                weight: Math.round((100 / weakLOs.length))
            }));
        }

        // Adjust to ensure total equals target
        const currentTotal = questionDistribution.reduce((sum, lo) => sum + lo.question_count, 0);
        if (currentTotal < total_questions) {
            // Add remaining questions to weakest LO
            questionDistribution[0].question_count += (total_questions - currentTotal);
        }

        // 3. Get attempted questions for each LO
        const attemptedQuestionsMap = {};
        for (const lo of weakLOs) {
            const attempted = await UserQuestionHistory.findAll({
                where: { user_id: userId },
                include: [{
                    model: Question,
                    as: 'Question',
                    where: { lo_id: lo.lo_id },
                    required: true
                }]
            });
            attemptedQuestionsMap[lo.lo_id] = attempted.map(h => h.question_id);
        }

        // 4. Select questions for each LO
        const allQuestions = [];
        const difficultyMap = { 'easy': 1, 'medium': 2, 'hard': 3 };
        
        for (const dist of questionDistribution) {
            // Determine level based on accuracy (adaptive)
            let levelId;
            if (difficulty === 'adaptive') {
                if (dist.accuracy < 40) levelId = 1; // easy
                else if (dist.accuracy < 60) levelId = 2; // medium
                else levelId = 3; // hard (challenge to improve)
            } else {
                levelId = difficultyMap[difficulty] || 2;
            }

            const attemptedIds = attemptedQuestionsMap[dist.lo_id] || [];

            // Get new questions first
            const newQuestions = await Question.findAll({
                where: {
                    lo_id: dist.lo_id,
                    level_id: levelId,
                    question_id: { [Op.notIn]: attemptedIds }
                },
                include: [{
                    model: Answer,
                    attributes: ['answer_id', 'answer_text', 'iscorrect']
                }],
                limit: dist.question_count,
                order: sequelize.random()
            });

            let selectedForLO = [...newQuestions];

            // If not enough, add review questions
            if (selectedForLO.length < dist.question_count) {
                const remaining = dist.question_count - selectedForLO.length;
                const reviewQuestions = await Question.findAll({
                    where: {
                        lo_id: dist.lo_id,
                        level_id: levelId,
                        question_id: { [Op.in]: attemptedIds }
                    },
                    include: [{
                        model: Answer,
                        attributes: ['answer_id', 'answer_text', 'iscorrect']
                    }],
                    limit: remaining,
                    order: sequelize.random()
                });
                selectedForLO = [...selectedForLO, ...reviewQuestions];
            }

            // Add to all questions with LO info
            selectedForLO.forEach(q => {
                allQuestions.push({
                    ...q.toJSON(),
                    lo_info: {
                        lo_id: dist.lo_id,
                        lo_name: dist.lo_name,
                        accuracy: dist.accuracy,
                        is_weak: true
                    },
                    is_review: attemptedIds.includes(q.question_id)
                });
            });
        }

        // 5. Shuffle questions to mix LOs
        const shuffled = allQuestions.sort(() => Math.random() - 0.5);

        // 6. Format response
        const formattedQuestions = shuffled.map((question, index) => ({
            question_id: question.question_id,
            question_text: question.question_text,
            question_number: index + 1,
            lo_id: question.lo_info.lo_id,
            lo_name: question.lo_info.lo_name,
            is_review: question.is_review,
            answers: question.Answers.map(answer => ({
                answer_id: answer.answer_id,
                answer_text: answer.answer_text,
                is_correct: answer.iscorrect
            }))
        }));

        return res.status(201).json({
            success: true,
            message: 'Adaptive practice quiz generated successfully',
            data: {
                quiz_id: `adaptive_practice_${Date.now()}_${userId}`,
                assessment_quiz: {
                    quiz_id: assessment_quiz_id,
                    name: quizResult.Quiz.name,
                    score: quizResult.score
                },
                metadata: {
                    total_questions: formattedQuestions.length,
                    distribution_method,
                    difficulty_mode: difficulty,
                    weak_los_count: weakLOs.length,
                    new_questions_count: formattedQuestions.filter(q => !q.is_review).length,
                    review_questions_count: formattedQuestions.filter(q => q.is_review).length,
                    estimated_time_minutes: formattedQuestions.length * 2
                },
                weak_los_distribution: questionDistribution.map(d => ({
                    lo_id: d.lo_id,
                    lo_name: d.lo_name,
                    accuracy: d.accuracy,
                    question_count: d.question_count,
                    weight_percentage: d.weight
                })),
                questions: formattedQuestions
            }
        });

    } catch (error) {
        console.error('Error in generateAdaptivePracticeQuiz:', error);
        return res.status(500).json({
            success: false,
            message: 'Error generating adaptive practice quiz',
            error: error.message
        });
    }
};

/**
 * Internal helper để tái sử dụng logic recommendations
 */
async function getPracticeRecommendationsInternal(courseId, userId) {
    // Lấy LOs qua associations để tránh lỗi tên bảng
    const course = await Course.findByPk(courseId, {
        include: [{
            model: Subject,
            as: 'Subject',
            include: [{
                model: Chapter,
                as: 'Chapters',
                include: [{
                    model: LO,
                    as: 'LOs',
                    through: { attributes: [] }
                }]
            }]
        }]
    });

    if (!course || !course.Subject) return [];

    const loMap = new Map();
    for (const ch of course.Subject.Chapters || []) {
        for (const lo of ch.LOs || []) {
            if (!loMap.has(lo.lo_id)) loMap.set(lo.lo_id, { lo_id: lo.lo_id, lo_name: lo.name });
        }
    }

    const courseLos = Array.from(loMap.values()).sort((a, b) => a.lo_name.localeCompare(b.lo_name));

    const recommendations = [];

    for (const lo of courseLos) {
        const historyQuery = await UserQuestionHistory.findAll({
            where: { user_id: userId },
            include: [{
                model: Question,
                as: 'Question',
                where: { lo_id: lo.lo_id },
                required: true
            }]
        });

        const totalAttempts = historyQuery.length;
        const correctAttempts = historyQuery.filter(h => h.is_correct).length;
        const accuracy = totalAttempts > 0 ? (correctAttempts / totalAttempts) * 100 : 0;
        const priority = determinePriority(accuracy, totalAttempts);

        recommendations.push({
            lo_id: lo.lo_id,
            lo_name: lo.lo_name,
            accuracy,
            priority,
            attempts: totalAttempts
        });
    }

    // Sắp xếp theo priority
    const priorityOrder = { 'urgent': 0, 'high': 1, 'medium': 2, 'low': 3 };
    recommendations.sort((a, b) => {
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return a.accuracy - b.accuracy;
    });

    return recommendations;
}

/**
 * Get practice quiz recommendations based on completed assessment quiz
 * Route: GET /api/practice-recommendations/:quiz_id
 */
const getRecommendations = async (req, res) => {
    try {
        const { quiz_id } = req.params;
        const userId = req.user.user_id;

        // Get quiz details and user's result
        const quizResult = await QuizResult.findOne({
            where: {
                quiz_id,
                user_id: userId,
                status: { [Op.in]: ['completed', 'finished'] }
            },
            include: [
                {
                    model: Quiz,
                    as: 'Quiz',
                    attributes: ['quiz_id', 'name', 'quiz_mode', 'course_id']
                }
            ]
        });

        if (!quizResult) {
            return res.status(404).json({
                success: false,
                message: 'Quiz result not found or quiz not completed'
            });
        }

        // Only recommend practice quizzes for assessment mode quizzes
        if (quizResult.Quiz.quiz_mode !== 'assessment') {
            return res.status(400).json({
                success: false,
                message: 'Practice recommendations are only available for assessment quizzes'
            });
        }

        // Get weak LOs from this quiz
        const questionHistory = await UserQuestionHistory.findAll({
            where: {
                user_id: userId,
                quiz_id
            },
            include: [
                {
                    model: Question,
                    as: 'Question',
                    include: [
                        {
                            model: LO,
                            as: 'LO',
                            attributes: ['lo_id', 'name', 'subject_id']
                        }
                    ]
                }
            ]
        });

        // Analyze performance by LO
        const loPerformance = {};
        questionHistory.forEach(history => {
            const loId = history.Question.LO.lo_id;
            if (!loPerformance[loId]) {
                loPerformance[loId] = {
                    lo_id: loId,
                    lo_name: history.Question.LO.name,
                    total: 0,
                    correct: 0,
                    accuracy: 0
                };
            }
            loPerformance[loId].total++;
            if (history.is_correct) {
                loPerformance[loId].correct++;
            }
        });

        // Calculate accuracy and find weak LOs (< 70%)
        const weakLOs = [];
        Object.values(loPerformance).forEach(lo => {
            lo.accuracy = lo.total > 0 ? (lo.correct / lo.total) * 100 : 0;
            if (lo.accuracy < 70) {
                weakLOs.push(lo);
            }
        });

        // Sort by accuracy (weakest first)
        weakLOs.sort((a, b) => a.accuracy - b.accuracy);

        // Find practice quizzes for weak LOs
        const weakLOIds = weakLOs.map(lo => lo.lo_id);
        
        if (weakLOIds.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'Great job! No weak areas found. You can practice any quiz to improve further.',
                data: {
                    assessment_quiz_id: quiz_id,
                    assessment_quiz_name: quizResult.Quiz.name,
                    weak_los: [],
                    recommended_quizzes: []
                }
            });
        }

        // Get subject_id from Course (since Quiz only has course_id)
        const Course = require('../models').Course;
        const course = await Course.findByPk(quizResult.Quiz.course_id, {
            attributes: ['subject_id']
        });

        if (!course || !course.subject_id) {
            return res.status(404).json({
                success: false,
                message: 'Subject not found for this quiz'
            });
        }

        // Find all courses with same subject
        const samSubjectCourses = await Course.findAll({
            where: { subject_id: course.subject_id },
            attributes: ['course_id']
        });

        const courseIds = samSubjectCourses.map(c => c.course_id);

        // Find practice quizzes that cover these LOs in same subject
        const practiceQuizzes = await Quiz.findAll({
            where: {
                quiz_mode: 'practice',
                course_id: { [Op.in]: courseIds },
                quiz_id: { [Op.ne]: quiz_id } // Exclude the current assessment quiz
            },
            include: [
                {
                    model: Question,
                    as: 'Questions', // IMPORTANT: Use the alias defined in quiz.js model
                    through: { attributes: [] },
                    attributes: ['question_id', 'question_text', 'lo_id'],
                    include: [
                        {
                            model: LO,
                            as: 'LO',
                            attributes: ['lo_id', 'name']
                        }
                    ]
                }
            ]
        });

        // Filter quizzes that have at least one question covering weak LOs
        const relevantQuizzes = practiceQuizzes
            .map(quiz => {
                // Filter questions that cover weak LOs
                const relevantQuestions = quiz.Questions.filter(q => 
                    q.LO && weakLOIds.includes(q.LO.lo_id)
                );
                
                if (relevantQuestions.length === 0) return null;

                const coveredLOs = [...new Set(relevantQuestions.map(q => q.LO.lo_id))];
                const coverage = (coveredLOs.length / weakLOIds.length) * 100;
                
                return {
                    quiz_id: quiz.quiz_id,
                    quiz_name: quiz.name,
                    covered_weak_los: coveredLOs.length,
                    total_weak_los: weakLOIds.length,
                    coverage_percentage: Math.round(coverage),
                    question_count: relevantQuestions.length
                };
            })
            .filter(q => q !== null);

        const recommendations = relevantQuizzes.slice(0, 5);

        // Sort by coverage (best coverage first)
        recommendations.sort((a, b) => b.coverage_percentage - a.coverage_percentage);

        return res.status(200).json({
            success: true,
            message: 'Practice recommendations retrieved successfully',
            data: {
                assessment_quiz_id: quiz_id,
                assessment_quiz_name: quizResult.Quiz.name,
                score: quizResult.score,
                weak_los: weakLOs,
                recommended_quizzes: recommendations
            }
        });

    } catch (error) {
        console.error('Error getting practice recommendations:', error);
        return res.status(500).json({
            success: false,
            message: 'Error getting practice recommendations',
            error: error.message
        });
    }
};

/**
 * Get AI analysis with radar chart data
 * Route: POST /api/practice-recommendations/ai-analysis
 */
const getAIAnalysis = async (req, res) => {
    try {
        const { quiz_ids, user_id } = req.body;

        if (!quiz_ids || !Array.isArray(quiz_ids) || quiz_ids.length === 0 || !user_id) {
            return res.status(400).json({
                success: false,
                message: 'quiz_ids (array) and user_id are required'
            });
        }

        // Get question history for these quizzes
        const questionHistory = await UserQuestionHistory.findAll({
            where: {
                user_id,
                quiz_id: { [Op.in]: quiz_ids }
            },
            include: [
                {
                    model: Question,
                    as: 'Question',
                    include: [
                        {
                            model: LO,
                            as: 'LO',
                            attributes: ['lo_id', 'name']
                        },
                        {
                            model: Level,
                            as: 'Level',
                            attributes: ['level_id', 'name']
                        }
                    ]
                }
            ]
        });

        if (questionHistory.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No question history found for this quiz'
            });
        }

        // Analyze by LO
        const loAnalysis = {};
        questionHistory.forEach(history => {
            const loId = history.Question.LO.lo_id;
            const loName = history.Question.LO.name;
            
            if (!loAnalysis[loId]) {
                loAnalysis[loId] = {
                    lo_id: loId,
                    lo_name: loName,
                    total: 0,
                    correct: 0,
                    accuracy: 0
                };
            }
            loAnalysis[loId].total++;
            if (history.is_correct) {
                loAnalysis[loId].correct++;
            }
        });

        // Calculate accuracy for radar chart
        const radarData = Object.values(loAnalysis).map(lo => {
            lo.accuracy = lo.total > 0 ? Math.round((lo.correct / lo.total) * 100) : 0;
            return {
                subject: lo.lo_name,
                score: lo.accuracy,
                fullMark: 100
            };
        });

        // Generate AI analysis text (simple template-based)
        const avgAccuracy = radarData.reduce((sum, item) => sum + item.score, 0) / radarData.length;
        const strongAreas = radarData.filter(item => item.score >= 80).map(item => item.subject);
        const weakAreas = radarData.filter(item => item.score < 60).map(item => item.subject);

        let analysisText = `**Phân tích kết quả học tập:**\n\n`;
        analysisText += `Độ chính xác trung bình: ${Math.round(avgAccuracy)}%\n\n`;

        if (strongAreas.length > 0) {
            analysisText += `**Điểm mạnh:** Bạn đã thể hiện tốt ở các lĩnh vực: ${strongAreas.join(', ')}.\n\n`;
        }

        if (weakAreas.length > 0) {
            analysisText += `**Cần cải thiện:** Hãy tập trung ôn luyện thêm ở: ${weakAreas.join(', ')}.\n\n`;
        }

        analysisText += `**Khuyến nghị:**\n`;
        if (avgAccuracy >= 80) {
            analysisText += `- Bạn đã làm rất tốt! Tiếp tục duy trì và thử thách bản thân với các bài khó hơn.\n`;
        } else if (avgAccuracy >= 60) {
            analysisText += `- Bạn đang trên đúng hướng. Hãy luyện tập thêm ở các điểm yếu để cải thiện.\n`;
        } else {
            analysisText += `- Cần ôn lại kiến thức cơ bản. Đừng lo lắng, hãy từng bước học lại và luyện tập nhiều hơn.\n`;
        }

        return res.status(200).json({
            success: true,
            message: 'AI analysis retrieved successfully',
            data: {
                radar_chart: radarData,
                analysis: analysisText,
                summary: {
                    total_questions: questionHistory.length,
                    correct_answers: questionHistory.filter(h => h.is_correct).length,
                    average_accuracy: Math.round(avgAccuracy),
                    strong_areas: strongAreas,
                    weak_areas: weakAreas
                }
            }
        });

    } catch (error) {
        console.error('Error getting AI analysis:', error);
        return res.status(500).json({
            success: false,
            message: 'Error getting AI analysis',
            error: error.message
        });
    }
};

module.exports = {
    getPracticeRecommendations,
    generatePracticeQuiz,
    generateAdaptivePracticeQuiz,
    getPracticeRecommendationsInternal,
    getRecommendations,
    getAIAnalysis
};
