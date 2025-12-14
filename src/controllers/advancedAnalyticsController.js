const {
    QuizResult,
    UserQuestionHistory,
    Question,
    Quiz,
    Subject,
    User,
    LO,
    Level,
    Chapter,
    ChapterLO,
    Answer,
    Course,
    Program,
    PO,
    PLO
} = require('../models');
const { Op, Sequelize } = require('sequelize');
const {
    calculateTrendAnalysis,
    createHistogram,
    calculateDescriptiveStatistics,
    getComparisonDateRange,
    calculateCorrelation,
    detectOutliers,
    calculateMovingAverage
} = require('../utils/analyticsHelpers');

/**
 * ADVANCED ANALYTICS CONTROLLER
 * Provides sophisticated data analysis endpoints for educational insights
 */

// ==================== HELPER FUNCTIONS ====================

/**
 * Get chapter information for a Learning Outcome through ChapterLO
 * @param {number} loId - Learning Outcome ID
 * @returns {Promise<Object>} Chapter information
 */
const getChapterForLO = async (loId) => {
    try {
        const chapterLOs = await ChapterLO.findAll({
            where: { lo_id: loId },
            include: [{
                model: Chapter,
                as: 'Chapter',
                required: true,
                attributes: ['chapter_id', 'name'],
                include: [{
                    model: Subject,
                    as: 'Subject',
                    required: true,
                    attributes: ['subject_id', 'name']
                }]
            }]
        });

        if (chapterLOs.length > 0) {
            const chapter = chapterLOs[0].Chapter;
            return {
                chapter_id: chapter.chapter_id,
                name: chapter.name,
                subject: chapter.Subject
            };
        }

        return {
            chapter_id: null,
            name: 'Unknown Chapter',
            subject: { subject_id: null, name: 'Unknown Subject' }
        };
    } catch (error) {
        console.error('Error getting chapter for LO:', error);
        return {
            chapter_id: null,
            name: 'Unknown Chapter',
            subject: { subject_id: null, name: 'Unknown Subject' }
        };
    }
};

/**
 * Get chapters for multiple LOs efficiently
 * @param {Array} loIds - Array of LO IDs
 * @returns {Promise<Object>} Map of loId -> chapter info
 */
const getChaptersForLOs = async (loIds) => {
    try {
        const chapterLOs = await ChapterLO.findAll({
            where: { lo_id: { [Op.in]: loIds } },
            include: [{
                model: Chapter,
                as: 'Chapter',
                required: true,
                attributes: ['chapter_id', 'name'],
                include: [{
                    model: Subject,
                    as: 'Subject',
                    required: true,
                    attributes: ['subject_id', 'name']
                }]
            }]
        });

        const loChapterMap = {};
        chapterLOs.forEach(chapterLO => {
            const loId = chapterLO.lo_id;
            const chapter = chapterLO.Chapter;

            if (!loChapterMap[loId]) {
                loChapterMap[loId] = {
                    chapter_id: chapter.chapter_id,
                    name: chapter.name,
                    subject: chapter.Subject
                };
            }
        });

        return loChapterMap;
    } catch (error) {
        console.error('Error getting chapters for LOs:', error);
        return {};
    }
};

// ==================== PERFORMANCE ANALYTICS ====================

/**
 * Get time series performance data
 * Shows score trends over time with various aggregation options
 */
const getPerformanceTimeSeries = async (req, res) => {
    try {
        const {
            program_id,
            course_id,
            quiz_id,
            user_id,
            time_period = '7d', // 7d, 30d, 3m, 6m, 1y
            aggregation = 'daily' // daily, weekly, monthly
        } = req.query;

        // Build where conditions
        const whereConditions = {};
        const includeConditions = [];

        if (user_id) whereConditions.user_id = user_id;
        if (quiz_id) whereConditions.quiz_id = quiz_id;

        // Include Quiz model when we need to filter by course/program
        if (course_id || program_id) {
            includeConditions.push({
                model: Quiz,
                as: 'Quiz',
                required: true,
                attributes: [], // Don't select Quiz columns to avoid GROUP BY issues
                where: course_id ? { course_id } : {},
                include: program_id ? [{
                    model: Course,
                    as: 'Course',
                    required: true,
                    attributes: [], // Don't select Course columns
                    where: { program_id },
                    include: [{
                        model: Subject,
                        as: 'Subject',
                        required: true,
                        attributes: [] // Don't select Subject columns
                    }]
                }] : [{
                    model: Course,
                    as: 'Course',
                    required: true,
                    attributes: [],
                    include: [{
                        model: Subject,
                        as: 'Subject',
                        required: true,
                        attributes: []
                    }]
                }]
            });
        }
        // When only quiz_id is specified, we don't need include since we're filtering by quiz_id in where clause

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();

        switch (time_period) {
            case '7d': startDate.setDate(endDate.getDate() - 7); break;
            case '30d': startDate.setDate(endDate.getDate() - 30); break;
            case '3m': startDate.setMonth(endDate.getMonth() - 3); break;
            case '6m': startDate.setMonth(endDate.getMonth() - 6); break;
            case '1y': startDate.setFullYear(endDate.getFullYear() - 1); break;
        }

        whereConditions.update_time = {
            [Op.between]: [startDate, endDate]
        };

        // Determine date truncation for aggregation
        let dateTrunc;
        switch (aggregation) {
            case 'daily': dateTrunc = 'day'; break;
            case 'weekly': dateTrunc = 'week'; break;
            case 'monthly': dateTrunc = 'month'; break;
            default: dateTrunc = 'day';
        }

        const results = await QuizResult.findAll({
            attributes: [
                [Sequelize.fn('DATE_TRUNC', dateTrunc, Sequelize.col('update_time')), 'period'],
                [Sequelize.fn('AVG', Sequelize.col('score')), 'avg_score'],
                [Sequelize.fn('COUNT', Sequelize.col('result_id')), 'total_attempts'],
                [Sequelize.fn('COUNT', Sequelize.literal('CASE WHEN score >= 8 THEN 1 END')), 'high_scores'],
                [Sequelize.fn('MIN', Sequelize.col('score')), 'min_score'],
                [Sequelize.fn('MAX', Sequelize.col('score')), 'max_score'],
                [Sequelize.fn('STDDEV', Sequelize.col('score')), 'score_stddev']
            ],
            where: whereConditions,
            include: includeConditions,
            group: [Sequelize.fn('DATE_TRUNC', dateTrunc, Sequelize.col('update_time'))],
            order: [[Sequelize.fn('DATE_TRUNC', dateTrunc, Sequelize.col('update_time')), 'ASC']],
            raw: true
        });

        // Calculate additional metrics
        const processedResults = results.map(result => ({
            period: result.period,
            avg_score: parseFloat(result.avg_score || 0).toFixed(2),
            total_attempts: parseInt(result.total_attempts || 0),
            high_score_rate: result.total_attempts > 0 ?
                ((result.high_scores / result.total_attempts) * 100).toFixed(2) : 0,
            min_score: parseFloat(result.min_score || 0),
            max_score: parseFloat(result.max_score || 0),
            score_range: parseFloat(result.max_score || 0) - parseFloat(result.min_score || 0),
            score_stddev: parseFloat(result.score_stddev || 0).toFixed(2)
        }));

        // Calculate trend indicators
        const trendAnalysis = calculateTrendAnalysis(processedResults);

        res.json({
            success: true,
            data: {
                time_series: processedResults,
                trend_analysis: trendAnalysis,
                metadata: {
                    time_period,
                    aggregation,
                    total_data_points: processedResults.length,
                    date_range: { start: startDate, end: endDate }
                }
            }
        });

    } catch (error) {
        console.error('Error in getPerformanceTimeSeries:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy dữ liệu time series',
            error: error.message
        });
    }
};

/**
 * Get score distribution analysis
 * Provides histogram data and statistical analysis of score distributions
 */
const getScoreDistribution = async (req, res) => {
    try {
        const {
            program_id,
            course_id,
            quiz_id,
            bins = 10,
            comparison_period = null // 'previous_month', 'previous_quarter', etc.
        } = req.query;

        // Build base query conditions
        const whereConditions = {};
        const includeConditions = [];

        if (quiz_id) whereConditions.quiz_id = quiz_id;

        // Include Quiz model when we need to filter by course/program
        if (course_id || program_id) {
            includeConditions.push({
                model: Quiz,
                as: 'Quiz',
                required: true,
                attributes: [], // Don't select Quiz columns to avoid GROUP BY issues
                where: course_id ? { course_id } : {},
                include: program_id ? [{
                    model: Course,
                    as: 'Course',
                    required: true,
                    attributes: [], // Don't select Course columns
                    where: { program_id },
                    include: [{
                        model: Subject,
                        as: 'Subject',
                        required: true,
                        attributes: []
                    }]
                }] : [{
                    model: Course,
                    as: 'Course',
                    required: true,
                    attributes: [],
                    include: [{
                        model: Subject,
                        as: 'Subject',
                        required: true,
                        attributes: []
                    }]
                }]
            });
        }
        // When only quiz_id is specified, we don't need include since we're filtering by quiz_id in where clause

        // Get current period data
        const currentResults = await QuizResult.findAll({
            attributes: ['score'],
            where: whereConditions,
            include: includeConditions,
            raw: true
        });

        // Create histogram bins
        const histogram = createHistogram(currentResults.map(r => r.score), parseInt(bins));

        // Calculate statistical measures
        const statistics = calculateDescriptiveStatistics(currentResults.map(r => r.score));

        // Get comparison data if requested
        let comparisonData = null;
        if (comparison_period) {
            const comparisonWhere = { ...whereConditions };
            const comparisonDateRange = getComparisonDateRange(comparison_period);

            if (comparisonDateRange) {
                comparisonWhere.update_time = {
                    [Op.between]: [comparisonDateRange.start, comparisonDateRange.end]
                };
            }

            const comparisonResults = await QuizResult.findAll({
                attributes: ['score'],
                where: comparisonWhere,
                include: includeConditions,
                raw: true
            });

            if (comparisonResults.length > 0) {
                comparisonData = {
                    histogram: createHistogram(comparisonResults.map(r => r.score), parseInt(bins)),
                    statistics: calculateDescriptiveStatistics(comparisonResults.map(r => r.score))
                };
            }
        }

        res.json({
            success: true,
            data: {
                current_period: {
                    histogram,
                    statistics,
                    total_samples: currentResults.length
                },
                comparison_period: comparisonData,
                metadata: {
                    bins: parseInt(bins),
                    comparison_period
                }
            }
        });

    } catch (error) {
        console.error('Error in getScoreDistribution:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi phân tích phân bố điểm số',
            error: error.message
        });
    }
};

/**
 * Get Learning Outcomes comparison analysis
 * Provides radar chart data for LO performance comparison
 */
const getLearningOutcomesComparison = async (req, res) => {
    try {
        const {
            program_id,
            course_id,
            user_id,
            comparison_type = 'average' // 'average', 'top_performer', 'user_vs_average'
        } = req.query;

        // Build base conditions
        const whereConditions = {};
        const includeConditions = [];

        if (user_id && comparison_type !== 'average') {
            whereConditions.user_id = user_id;
        }

        // Add filtering through joins
        includeConditions.push({
            model: Quiz,
            as: 'Quiz',
            required: true,
            where: course_id ? { course_id } : {},
            include: [{
                model: Course,
                as: 'Course',
                required: true,
                where: program_id ? { program_id } : {},
                include: [{
                    model: Subject,
                    as: 'Subject',
                    required: true
                }]
            }]
        });

        // Get question-level data with LO information
        const questionResults = await UserQuestionHistory.findAll({
            attributes: [
                'question_id',
                'is_correct',
                'attempt_date'
            ],
            where: whereConditions,
            include: [
                {
                    model: Question,
                    as: 'Question',
                    required: true,
                    attributes: ['question_id', 'lo_id'],
                    include: [{
                        model: LO,
                        as: 'LO',
                        required: true,
                        attributes: ['lo_id', 'name', 'description']
                    }]
                },
                ...includeConditions
            ],
            raw: true
        });

        // Group by LO and calculate performance
        const loPerformance = {};
        questionResults.forEach(result => {
            const loId = result['Question.lo_id'];
            const loName = result['Question.LO.name'];

            if (!loPerformance[loId]) {
                loPerformance[loId] = {
                    lo_id: loId,
                    lo_name: loName,
                    total_attempts: 0,
                    correct_attempts: 0,
                    accuracy_rate: 0
                };
            }

            loPerformance[loId].total_attempts++;
            if (result.is_correct) {
                loPerformance[loId].correct_attempts++;
            }
        });

        // Calculate accuracy rates
        Object.values(loPerformance).forEach(lo => {
            lo.accuracy_rate = lo.total_attempts > 0 ?
                (lo.correct_attempts / lo.total_attempts * 100).toFixed(2) : 0;
        });

        // Get comparison data if needed
        let comparisonData = null;
        if (comparison_type === 'user_vs_average' && user_id) {
            // Get average performance for comparison
            const avgResults = await UserQuestionHistory.findAll({
                attributes: [
                    'question_id',
                    'is_correct'
                ],
                include: [
                    {
                        model: Question,
                        as: 'Question',
                        required: true,
                        attributes: ['question_id', 'lo_id'],
                        include: [{
                            model: LO,
                            as: 'LO',
                            required: true,
                            attributes: ['lo_id', 'name']
                        }]
                    }
                ],
                raw: true
            });

            const avgLoPerformance = {};
            avgResults.forEach(result => {
                const loId = result['Question.lo_id'];
                const loName = result['Question.LO.name'];

                if (!avgLoPerformance[loId]) {
                    avgLoPerformance[loId] = {
                        lo_id: loId,
                        lo_name: loName,
                        total_attempts: 0,
                        correct_attempts: 0,
                        accuracy_rate: 0
                    };
                }

                avgLoPerformance[loId].total_attempts++;
                if (result.is_correct) {
                    avgLoPerformance[loId].correct_attempts++;
                }
            });

            Object.values(avgLoPerformance).forEach(lo => {
                lo.accuracy_rate = lo.total_attempts > 0 ?
                    (lo.correct_attempts / lo.total_attempts * 100).toFixed(2) : 0;
            });

            comparisonData = Object.values(avgLoPerformance);
        }

        res.json({
            success: true,
            data: {
                learning_outcomes: Object.values(loPerformance),
                comparison_data: comparisonData,
                metadata: {
                    comparison_type,
                    total_los: Object.keys(loPerformance).length,
                    user_id: user_id || null
                }
            }
        });

    } catch (error) {
        console.error('Error in getLearningOutcomesComparison:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi phân tích Learning Outcomes',
            error: error.message
        });
    }
};

/**
 * Get completion funnel analysis
 * Shows the conversion rates through different stages of quiz completion
 */
const getCompletionFunnel = async (req, res) => {
    try {
        const {
            program_id,
            subject_id,
            quiz_id,
            time_period = '30d'
        } = req.query;

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();

        switch (time_period) {
            case '7d': startDate.setDate(endDate.getDate() - 7); break;
            case '30d': startDate.setDate(endDate.getDate() - 30); break;
            case '3m': startDate.setMonth(endDate.getMonth() - 3); break;
            case '6m': startDate.setMonth(endDate.getMonth() - 6); break;
            case '1y': startDate.setFullYear(endDate.getFullYear() - 1); break;
        }

        // Build filtering conditions
        const whereConditions = {
            update_time: {
                [Op.between]: [startDate, endDate]
            }
        };

        if (quiz_id) whereConditions.quiz_id = quiz_id;

        const includeConditions = [];

        // Only include Quiz model when we need to filter by subject/program
        if (subject_id || program_id) {
            includeConditions.push({
                model: Quiz,
                as: 'Quiz',
                required: true,
                attributes: [], // Don't select Quiz columns to avoid GROUP BY issues
                include: [{
                    model: Subject,
                    as: 'Subject',
                    required: true,
                    attributes: [], // Don't select Subject columns
                    where: subject_id ? { subject_id } : {},
                    include: program_id ? [{
                        model: Course,
                        as: 'Courses',
                        required: true,
                        attributes: [], // Don't select Course columns
                        where: { program_id }
                    }] : []
                }]
            });
        }
        // When only quiz_id is specified, we don't need include since we're filtering by quiz_id in where clause

        // Get funnel data
        const funnelData = await QuizResult.findAll({
            attributes: [
                [Sequelize.fn('COUNT', Sequelize.literal('DISTINCT user_id')), 'total_users'],
                [Sequelize.fn('COUNT', Sequelize.col('result_id')), 'total_attempts'],
                [Sequelize.fn('COUNT', Sequelize.literal('CASE WHEN status = \'completed\' THEN 1 END')), 'completed_attempts'],
                [Sequelize.fn('COUNT', Sequelize.literal('CASE WHEN score >= 5 THEN 1 END')), 'passing_attempts'],
                [Sequelize.fn('COUNT', Sequelize.literal('CASE WHEN score >= 8 THEN 1 END')), 'high_score_attempts'],
                [Sequelize.fn('AVG', Sequelize.col('completion_time')), 'avg_completion_time']
            ],
            where: whereConditions,
            include: includeConditions,
            raw: true
        });

        const data = funnelData[0] || {};

        // Calculate conversion rates
        const totalUsers = parseInt(data.total_users || 0);
        const totalAttempts = parseInt(data.total_attempts || 0);
        const completedAttempts = parseInt(data.completed_attempts || 0);
        const passingAttempts = parseInt(data.passing_attempts || 0);
        const highScoreAttempts = parseInt(data.high_score_attempts || 0);

        const funnelStages = [
            {
                stage: 'Registered Users',
                count: totalUsers,
                percentage: 100,
                conversion_rate: 100
            },
            {
                stage: 'Started Quiz',
                count: totalAttempts,
                percentage: totalUsers > 0 ? (totalAttempts / totalUsers * 100).toFixed(2) : 0,
                conversion_rate: totalUsers > 0 ? (totalAttempts / totalUsers * 100).toFixed(2) : 0
            },
            {
                stage: 'Completed Quiz',
                count: completedAttempts,
                percentage: totalAttempts > 0 ? (completedAttempts / totalAttempts * 100).toFixed(2) : 0,
                conversion_rate: totalUsers > 0 ? (completedAttempts / totalUsers * 100).toFixed(2) : 0
            },
            {
                stage: 'Passed (≥5 points)',
                count: passingAttempts,
                percentage: completedAttempts > 0 ? (passingAttempts / completedAttempts * 100).toFixed(2) : 0,
                conversion_rate: totalUsers > 0 ? (passingAttempts / totalUsers * 100).toFixed(2) : 0
            },
            {
                stage: 'High Score (≥8 points)',
                count: highScoreAttempts,
                percentage: passingAttempts > 0 ? (highScoreAttempts / passingAttempts * 100).toFixed(2) : 0,
                conversion_rate: totalUsers > 0 ? (highScoreAttempts / totalUsers * 100).toFixed(2) : 0
            }
        ];

        res.json({
            success: true,
            data: {
                funnel_stages: funnelStages,
                summary: {
                    total_users: totalUsers,
                    completion_rate: totalUsers > 0 ? (completedAttempts / totalUsers * 100).toFixed(2) : 0,
                    pass_rate: completedAttempts > 0 ? (passingAttempts / completedAttempts * 100).toFixed(2) : 0,
                    excellence_rate: passingAttempts > 0 ? (highScoreAttempts / passingAttempts * 100).toFixed(2) : 0,
                    avg_completion_time: parseFloat(data.avg_completion_time || 0).toFixed(2)
                },
                metadata: {
                    time_period,
                    date_range: { start: startDate, end: endDate }
                }
            }
        });

    } catch (error) {
        console.error('Error in getCompletionFunnel:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi phân tích completion funnel',
            error: error.message
        });
    }
};

// ==================== LEARNING DIFFICULTY ANALYSIS ====================

/**
 * Get difficulty heatmap analysis
 * Shows question difficulty across chapters and levels
 */
const getDifficultyHeatmap = async (req, res) => {
    try {
        const {
            program_id,
            subject_id,
            time_period = '30d'
        } = req.query;

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();

        switch (time_period) {
            case '7d': startDate.setDate(endDate.getDate() - 7); break;
            case '30d': startDate.setDate(endDate.getDate() - 30); break;
            case '3m': startDate.setMonth(endDate.getMonth() - 3); break;
            case '6m': startDate.setMonth(endDate.getMonth() - 6); break;
            case '1y': startDate.setFullYear(endDate.getFullYear() - 1); break;
        }

        // Build query conditions
        const whereConditions = {
            attempt_date: {
                [Op.between]: [startDate, endDate]
            }
        };

        const includeConditions = [
            {
                model: Question,
                as: 'Question',
                required: true,
                attributes: ['question_id', 'question_text', 'level_id', 'lo_id'],
                include: [
                    {
                        model: Level,
                        as: 'Level',
                        required: true,
                        attributes: ['level_id', 'name']
                    },
                    {
                        model: LO,
                        as: 'LO',
                        required: true,
                        attributes: ['lo_id', 'name']
                    }
                ]
            }
        ];

        // Get question attempt data
        const questionAttempts = await UserQuestionHistory.findAll({
            attributes: [
                'question_id',
                'is_correct',
                'time_spent'
            ],
            where: whereConditions,
            include: includeConditions,
            raw: true
        });

        // Get unique LO IDs and their chapter information
        const loIds = [...new Set(questionAttempts.map(attempt => attempt['Question.LO.lo_id']))];
        const loChapterMap = await getChaptersForLOs(loIds);

        // Filter by subject/program if specified
        let filteredAttempts = questionAttempts;
        if (subject_id || program_id) {
            filteredAttempts = questionAttempts.filter(attempt => {
                const loId = attempt['Question.LO.lo_id'];
                const chapterInfo = loChapterMap[loId];

                if (!chapterInfo) return false;

                if (subject_id && chapterInfo.subject.subject_id !== parseInt(subject_id)) {
                    return false;
                }

                // For program filtering, we'd need to check if subject belongs to program
                // This would require additional query, skipping for now

                return true;
            });
        }

        // Process data for heatmap
        const heatmapData = {};

        filteredAttempts.forEach(attempt => {
            const loId = attempt['Question.LO.lo_id'];
            const chapterInfo = loChapterMap[loId];
            const chapterName = chapterInfo ? chapterInfo.name : 'Unknown Chapter';
            const levelName = attempt['Question.Level.name'];
            const key = `${chapterName}|${levelName}`;

            if (!heatmapData[key]) {
                heatmapData[key] = {
                    chapter: chapterName,
                    level: levelName,
                    total_attempts: 0,
                    correct_attempts: 0,
                    total_response_time: 0,
                    difficulty_score: 0,
                    avg_response_time: 0
                };
            }

            heatmapData[key].total_attempts++;
            if (attempt.is_correct) {
                heatmapData[key].correct_attempts++;
            }
            heatmapData[key].total_response_time += attempt.time_spent || 0;
        });

        // Calculate difficulty metrics
        Object.values(heatmapData).forEach(cell => {
            const accuracy = cell.total_attempts > 0 ?
                (cell.correct_attempts / cell.total_attempts) : 0;

            cell.avg_response_time = cell.total_attempts > 0 ?
                (cell.total_response_time / cell.total_attempts).toFixed(2) : 0;

            // Difficulty score: combination of low accuracy and high response time
            // Scale: 0 (easy) to 100 (very difficult)
            const accuracyScore = (1 - accuracy) * 50; // 0-50 based on accuracy
            const timeScore = Math.min(cell.avg_response_time / 60, 1) * 50; // 0-50 based on time (normalized to 1 minute)

            cell.difficulty_score = (accuracyScore + timeScore).toFixed(2);
            cell.accuracy_rate = (accuracy * 100).toFixed(2);
        });

        // Convert to array format for frontend
        const heatmapArray = Object.values(heatmapData);

        // Get unique chapters and levels for axis labels
        const chapters = [...new Set(heatmapArray.map(item => item.chapter))];
        const levels = [...new Set(heatmapArray.map(item => item.level))];

        res.json({
            success: true,
            data: {
                heatmap_data: heatmapArray,
                axis_labels: {
                    chapters,
                    levels
                },
                summary: {
                    total_questions: questionAttempts.length,
                    avg_difficulty: heatmapArray.length > 0 ?
                        (heatmapArray.reduce((sum, item) => sum + parseFloat(item.difficulty_score), 0) / heatmapArray.length).toFixed(2) : 0,
                    most_difficult: heatmapArray.length > 0 ?
                        heatmapArray.reduce((max, item) => parseFloat(item.difficulty_score) > parseFloat(max.difficulty_score) ? item : max) : null,
                    easiest: heatmapArray.length > 0 ?
                        heatmapArray.reduce((min, item) => parseFloat(item.difficulty_score) < parseFloat(min.difficulty_score) ? item : min) : null
                },
                metadata: {
                    time_period,
                    date_range: { start: startDate, end: endDate }
                }
            }
        });

    } catch (error) {
        console.error('Error in getDifficultyHeatmap:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo difficulty heatmap',
            error: error.message
        });
    }
};

/**
 * Get time vs score correlation analysis
 * Analyzes relationship between response time and accuracy
 */
const getTimeScoreCorrelation = async (req, res) => {
    try {
        const {
            program_id,
            subject_id,
            quiz_id,
            user_id,
            time_period = '30d'
        } = req.query;

        // Build query conditions
        const whereConditions = {};
        const includeConditions = [];

        if (user_id) whereConditions.user_id = user_id;

        // Add date filtering
        const endDate = new Date();
        const startDate = new Date();

        switch (time_period) {
            case '7d': startDate.setDate(endDate.getDate() - 7); break;
            case '30d': startDate.setDate(endDate.getDate() - 30); break;
            case '3m': startDate.setMonth(endDate.getMonth() - 3); break;
            case '6m': startDate.setMonth(endDate.getMonth() - 6); break;
            case '1y': startDate.setFullYear(endDate.getFullYear() - 1); break;
        }

        whereConditions.update_time = {
            [Op.between]: [startDate, endDate]
        };

        if (quiz_id) whereConditions.quiz_id = quiz_id;

        // Add subject/program filtering
        // Only include Quiz model when we need to filter by subject/program
        if (subject_id || program_id) {
            includeConditions.push({
                model: Quiz,
                as: 'Quiz',
                required: true,
                attributes: [], // Don't select Quiz columns to avoid GROUP BY issues
                include: [{
                    model: Subject,
                    as: 'Subject',
                    required: true,
                    attributes: [], // Don't select Subject columns
                    where: subject_id ? { subject_id } : {},
                    include: program_id ? [{
                        model: Course,
                        as: 'Courses',
                        required: true,
                        attributes: [], // Don't select Course columns
                        where: { program_id }
                    }] : []
                }]
            });
        }
        // When only quiz_id is specified, we don't need include since we're filtering by quiz_id in where clause

        // Get quiz results with completion time
        const results = await QuizResult.findAll({
            attributes: ['score', 'completion_time', 'user_id', 'quiz_id'],
            where: whereConditions,
            include: includeConditions,
            raw: true
        });

        if (results.length === 0) {
            return res.json({
                success: true,
                data: {
                    correlation_analysis: {
                        correlation_coefficient: 0,
                        sample_size: 0,
                        significance: 'insufficient_data'
                    },
                    scatter_plot_data: [],
                    outliers: [],
                    summary: {
                        avg_score: 0,
                        avg_time: 0,
                        time_efficiency_score: 0
                    }
                }
            });
        }

        // Extract data for analysis
        const scores = results.map(r => parseFloat(r.score));
        const times = results.map(r => parseFloat(r.completion_time || 0));

        // Calculate correlation
        const correlation = calculateCorrelation(times, scores);

        // Detect outliers in both dimensions
        const scoreOutliers = detectOutliers(scores);
        const timeOutliers = detectOutliers(times);

        // Create scatter plot data
        const scatterData = results.map((result, index) => ({
            x: times[index],
            y: scores[index],
            user_id: result.user_id,
            quiz_id: result.quiz_id,
            is_outlier: scoreOutliers.outliers.includes(scores[index]) ||
                timeOutliers.outliers.includes(times[index])
        }));

        // Calculate summary statistics
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

        // Time efficiency score: high score with low time is better
        const timeEfficiencyScore = avgTime > 0 ? (avgScore / (avgTime / 60)).toFixed(2) : 0;

        // Determine correlation significance
        let significance = 'low';
        const absCorr = Math.abs(correlation);
        if (absCorr > 0.7) significance = 'high';
        else if (absCorr > 0.4) significance = 'medium';

        res.json({
            success: true,
            data: {
                correlation_analysis: {
                    correlation_coefficient: correlation.toFixed(4),
                    sample_size: results.length,
                    significance,
                    interpretation: getCorrelationInterpretation(correlation)
                },
                scatter_plot_data: scatterData,
                outliers: {
                    score_outliers: scoreOutliers,
                    time_outliers: timeOutliers
                },
                summary: {
                    avg_score: avgScore.toFixed(2),
                    avg_time: avgTime.toFixed(2),
                    time_efficiency_score: timeEfficiencyScore
                },
                metadata: {
                    time_period,
                    date_range: { start: startDate, end: endDate }
                }
            }
        });

    } catch (error) {
        console.error('Error in getTimeScoreCorrelation:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi phân tích correlation',
            error: error.message
        });
    }
};

// Helper function for correlation interpretation
const getCorrelationInterpretation = (correlation) => {
    const absCorr = Math.abs(correlation);

    if (absCorr < 0.1) return 'Không có mối quan hệ';
    if (absCorr < 0.3) return 'Mối quan hệ yếu';
    if (absCorr < 0.5) return 'Mối quan hệ trung bình';
    if (absCorr < 0.7) return 'Mối quan hệ mạnh';
    return 'Mối quan hệ rất mạnh';
};

// ==================== STUDENT BEHAVIOR ANALYTICS ====================

/**
 * Get student activity timeline analysis
 * Shows learning activity patterns over time
 */
const getActivityTimeline = async (req, res) => {
    try {
        const {
            program_id,
            subject_id,
            user_id,
            time_period = '30d',
            granularity = 'daily' // daily, weekly, hourly
        } = req.query;

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();

        switch (time_period) {
            case '7d': startDate.setDate(endDate.getDate() - 7); break;
            case '30d': startDate.setDate(endDate.getDate() - 30); break;
            case '3m': startDate.setMonth(endDate.getMonth() - 3); break;
            case '6m': startDate.setMonth(endDate.getMonth() - 6); break;
            case '1y': startDate.setFullYear(endDate.getFullYear() - 1); break;
        }

        // Build query conditions
        const whereConditions = {
            attempt_date: {
                [Op.between]: [startDate, endDate]
            }
        };

        if (user_id) whereConditions.user_id = user_id;

        const includeConditions = [];
        if (subject_id || program_id) {
            includeConditions.push({
                model: Question,
                as: 'Question',
                required: true,
                include: [{
                    model: LO,
                    as: 'LO',
                    required: true,
                    include: [{
                        model: Chapter,
                        as: 'Chapters',
                        required: true,
                        include: [{
                            model: Subject,
                            as: 'Subject',
                            required: true,
                            where: subject_id ? { subject_id } : {},
                            include: program_id ? [{
                                model: Course,
                                as: 'Courses',
                                required: true,
                                where: { program_id }
                            }] : []
                        }]
                    }]
                }]
            });
        }

        // Determine date truncation
        let dateTrunc;
        switch (granularity) {
            case 'hourly': dateTrunc = 'hour'; break;
            case 'daily': dateTrunc = 'day'; break;
            case 'weekly': dateTrunc = 'week'; break;
            default: dateTrunc = 'day';
        }

        // Get activity data
        const activityData = await UserQuestionHistory.findAll({
            attributes: [
                [Sequelize.fn('DATE_TRUNC', dateTrunc, Sequelize.col('attempt_date')), 'time_period'],
                [Sequelize.fn('COUNT', Sequelize.col('history_id')), 'total_attempts'],
                [Sequelize.fn('COUNT', Sequelize.literal('CASE WHEN is_correct = true THEN 1 END')), 'correct_attempts'],
                [Sequelize.fn('AVG', Sequelize.col('time_spent')), 'avg_response_time'],
                [Sequelize.fn('COUNT', Sequelize.literal('DISTINCT user_id')), 'active_users']
            ],
            where: whereConditions,
            include: includeConditions,
            group: [Sequelize.fn('DATE_TRUNC', dateTrunc, Sequelize.col('attempt_date'))],
            order: [[Sequelize.fn('DATE_TRUNC', dateTrunc, Sequelize.col('attempt_date')), 'ASC']],
            raw: true
        });

        // Process timeline data
        const timelineData = activityData.map(period => ({
            time_period: period.time_period,
            total_attempts: parseInt(period.total_attempts || 0),
            correct_attempts: parseInt(period.correct_attempts || 0),
            accuracy_rate: period.total_attempts > 0 ?
                ((period.correct_attempts / period.total_attempts) * 100).toFixed(2) : 0,
            avg_response_time: parseFloat(period.avg_response_time || 0).toFixed(2),
            active_users: parseInt(period.active_users || 0),
            activity_intensity: calculateActivityIntensity(period.total_attempts, period.active_users)
        }));

        // Calculate activity patterns
        const activityPatterns = analyzeActivityPatterns(timelineData, granularity);

        res.json({
            success: true,
            data: {
                timeline: timelineData,
                patterns: activityPatterns,
                summary: {
                    total_periods: timelineData.length,
                    peak_activity: timelineData.length > 0 ?
                        timelineData.reduce((max, period) =>
                            period.total_attempts > max.total_attempts ? period : max
                        ) : null,
                    avg_daily_attempts: timelineData.length > 0 ?
                        (timelineData.reduce((sum, period) => sum + period.total_attempts, 0) / timelineData.length).toFixed(2) : 0
                },
                metadata: {
                    time_period,
                    granularity,
                    date_range: { start: startDate, end: endDate }
                }
            }
        });

    } catch (error) {
        console.error('Error in getActivityTimeline:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi phân tích activity timeline',
            error: error.message
        });
    }
};

/**
 * Get learning flow analysis
 * Analyzes the sequence and flow of learning activities
 */
const getLearningFlow = async (req, res) => {
    try {
        const {
            program_id,
            subject_id,
            user_id,
            time_period = '30d'
        } = req.query;

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();

        switch (time_period) {
            case '7d': startDate.setDate(endDate.getDate() - 7); break;
            case '30d': startDate.setDate(endDate.getDate() - 30); break;
            case '3m': startDate.setMonth(endDate.getMonth() - 3); break;
            case '6m': startDate.setMonth(endDate.getMonth() - 6); break;
            case '1y': startDate.setFullYear(endDate.getFullYear() - 1); break;
        }

        // Build query conditions
        const whereConditions = {
            attempt_date: {
                [Op.between]: [startDate, endDate]
            }
        };

        if (user_id) whereConditions.user_id = user_id;

        // Get learning sequence data
        const learningSequence = await UserQuestionHistory.findAll({
            attributes: [
                'user_id',
                'question_id',
                'attempt_date',
                'is_correct',
                'time_spent'
            ],
            where: whereConditions,
            include: [{
                model: Question,
                as: 'Question',
                required: true,
                attributes: ['question_id', 'lo_id', 'level_id'],
                include: [
                    {
                        model: LO,
                        as: 'LO',
                        required: true,
                        attributes: ['lo_id', 'name'],
                        include: [{
                            model: Chapter,
                            as: 'Chapters',
                            required: true,
                            attributes: ['chapter_id', 'name', 'order_index'],
                            include: [{
                                model: Subject,
                                as: 'Subject',
                                required: true,
                                where: subject_id ? { subject_id } : {},
                                include: program_id ? [{
                                    model: Course,
                                    as: 'Courses',
                                    required: true,
                                    where: { program_id }
                                }] : []
                            }]
                        }]
                    },
                    {
                        model: Level,
                        as: 'Level',
                        required: true,
                        attributes: ['level_id', 'name']
                    }
                ]
            }],
            order: [['user_id', 'ASC'], ['attempt_date', 'ASC']],
            raw: true
        });

        // Analyze learning flow patterns
        const flowAnalysis = analyzeLearningFlow(learningSequence);

        res.json({
            success: true,
            data: {
                flow_patterns: flowAnalysis.patterns,
                transition_matrix: flowAnalysis.transitions,
                learning_paths: flowAnalysis.paths,
                summary: {
                    total_users: flowAnalysis.totalUsers,
                    avg_path_length: flowAnalysis.avgPathLength,
                    most_common_path: flowAnalysis.mostCommonPath,
                    completion_rate: flowAnalysis.completionRate
                },
                metadata: {
                    time_period,
                    date_range: { start: startDate, end: endDate }
                }
            }
        });

    } catch (error) {
        console.error('Error in getLearningFlow:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi phân tích learning flow',
            error: error.message
        });
    }
};

// Helper functions for student behavior analysis
const calculateActivityIntensity = (totalAttempts, activeUsers) => {
    if (activeUsers === 0) return 0;
    const attemptsPerUser = totalAttempts / activeUsers;

    // Classify intensity based on attempts per user
    if (attemptsPerUser < 5) return 'low';
    if (attemptsPerUser < 15) return 'medium';
    if (attemptsPerUser < 30) return 'high';
    return 'very_high';
};

const analyzeActivityPatterns = (timelineData, granularity) => {
    if (!timelineData || timelineData.length === 0) {
        return {
            peak_hours: [],
            peak_days: [],
            activity_trend: 'insufficient_data',
            consistency_score: 0
        };
    }

    // Extract activity values
    const activities = timelineData.map(d => d.total_attempts);

    // Calculate moving average for trend analysis
    const movingAvg = calculateMovingAverage(activities, Math.min(7, activities.length));

    // Determine trend
    let activityTrend = 'stable';
    if (movingAvg.length > 1) {
        const firstHalf = movingAvg.slice(0, Math.floor(movingAvg.length / 2));
        const secondHalf = movingAvg.slice(Math.floor(movingAvg.length / 2));

        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

        if (secondAvg > firstAvg * 1.1) activityTrend = 'increasing';
        else if (secondAvg < firstAvg * 0.9) activityTrend = 'decreasing';
    }

    // Calculate consistency score (lower standard deviation = higher consistency)
    const mean = activities.reduce((a, b) => a + b, 0) / activities.length;
    const variance = activities.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / activities.length;
    const stdDev = Math.sqrt(variance);
    const consistencyScore = mean > 0 ? Math.max(0, 100 - (stdDev / mean * 100)) : 0;

    return {
        activity_trend: activityTrend,
        consistency_score: consistencyScore.toFixed(2),
        peak_periods: timelineData
            .sort((a, b) => b.total_attempts - a.total_attempts)
            .slice(0, 5)
            .map(p => ({
                period: p.time_period,
                attempts: p.total_attempts
            }))
    };
};

const analyzeLearningFlow = (learningSequence) => {
    if (!learningSequence || learningSequence.length === 0) {
        return {
            patterns: [],
            transitions: {},
            paths: [],
            totalUsers: 0,
            avgPathLength: 0,
            mostCommonPath: null,
            completionRate: 0
        };
    }

    // Group by user
    const userPaths = {};
    learningSequence.forEach(record => {
        const userId = record.user_id;
        const chapters = record['Question.LO.Chapters'] || [];
        const chapterName = chapters.length > 0 ? chapters[0].name : 'Unknown Chapter';
        const levelName = record['Question.Level.name'];

        if (!userPaths[userId]) {
            userPaths[userId] = [];
        }

        userPaths[userId].push({
            chapter: chapterName,
            level: levelName,
            timestamp: record.attempt_date,
            isCorrect: record.is_correct
        });
    });

    // Analyze transitions between chapters
    const transitions = {};
    const pathPatterns = {};

    Object.values(userPaths).forEach(path => {
        // Sort by timestamp
        path.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Track transitions
        for (let i = 0; i < path.length - 1; i++) {
            const from = path[i].chapter;
            const to = path[i + 1].chapter;
            const transitionKey = `${from} -> ${to}`;

            transitions[transitionKey] = (transitions[transitionKey] || 0) + 1;
        }

        // Track path patterns (simplified to first 5 chapters)
        const pathKey = path.slice(0, 5).map(p => p.chapter).join(' -> ');
        pathPatterns[pathKey] = (pathPatterns[pathKey] || 0) + 1;
    });

    // Find most common path
    const mostCommonPath = Object.keys(pathPatterns).reduce((a, b) =>
        pathPatterns[a] > pathPatterns[b] ? a : b, null);

    // Calculate average path length
    const pathLengths = Object.values(userPaths).map(path => path.length);
    const avgPathLength = pathLengths.length > 0 ?
        pathLengths.reduce((a, b) => a + b, 0) / pathLengths.length : 0;

    // Calculate completion rate (users who completed at least 80% of chapters)
    const allChapterNames = learningSequence.map(r => {
        const chapters = r['Question.LO.Chapters'] || [];
        return chapters.length > 0 ? chapters[0].name : 'Unknown Chapter';
    });
    const totalChapters = [...new Set(allChapterNames)].length;
    const completedUsers = Object.values(userPaths).filter(path => {
        const uniqueChapters = [...new Set(path.map(p => p.chapter))];
        return uniqueChapters.length >= totalChapters * 0.8;
    }).length;

    const completionRate = Object.keys(userPaths).length > 0 ?
        (completedUsers / Object.keys(userPaths).length * 100).toFixed(2) : 0;

    return {
        patterns: Object.entries(pathPatterns)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([path, count]) => ({ path, count })),
        transitions: Object.entries(transitions)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 20)
            .map(([transition, count]) => ({ transition, count })),
        paths: Object.entries(userPaths).map(([userId, path]) => ({
            user_id: userId,
            path_length: path.length,
            unique_chapters: [...new Set(path.map(p => p.chapter))].length,
            accuracy_rate: path.length > 0 ?
                (path.filter(p => p.isCorrect).length / path.length * 100).toFixed(2) : 0
        })),
        totalUsers: Object.keys(userPaths).length,
        avgPathLength: avgPathLength.toFixed(2),
        mostCommonPath,
        completionRate: parseFloat(completionRate)
    };
};

// ==================== PREDICTIVE ANALYTICS ====================

/**
 * Get completion probability prediction
 * Predicts likelihood of student completing program/subject successfully
 */
const getCompletionProbability = async (req, res) => {
    try {
        const {
            program_id,
            subject_id,
            user_id,
            prediction_horizon = '3m' // 1m, 3m, 6m, 1y
        } = req.query;

        if (!user_id) {
            return res.status(400).json({
                success: false,
                message: 'user_id is required for completion probability prediction'
            });
        }

        // Get user's historical performance
        const whereConditions = { user_id };
        const includeConditions = [];

        if (subject_id || program_id) {
            includeConditions.push({
                model: Quiz,
                as: 'Quiz',
                required: true,
                include: [{
                    model: Subject,
                    as: 'Subject',
                    required: true,
                    where: subject_id ? { subject_id } : {},
                    include: program_id ? [{
                        model: Course,
                        as: 'Courses',
                        required: true,
                        where: { program_id }
                    }] : []
                }]
            });
        }

        // Get recent performance data (last 30 days)
        const recentDate = new Date();
        recentDate.setDate(recentDate.getDate() - 30);

        const recentResults = await QuizResult.findAll({
            attributes: ['score', 'completion_time', 'status', 'update_time'],
            where: {
                ...whereConditions,
                update_time: {
                    [Op.gte]: recentDate
                }
            },
            include: includeConditions,
            order: [['update_time', 'DESC']],
            raw: true
        });

        // Get all-time performance for comparison
        const allTimeResults = await QuizResult.findAll({
            attributes: ['score', 'completion_time', 'status'],
            where: whereConditions,
            include: includeConditions,
            raw: true
        });

        // Calculate prediction factors
        const predictionFactors = calculatePredictionFactors(recentResults, allTimeResults);

        // Simple prediction model based on multiple factors
        const completionProbability = calculateCompletionProbability(predictionFactors);

        // Generate recommendations
        const recommendations = generateRecommendations(predictionFactors, completionProbability);

        res.json({
            success: true,
            data: {
                user_id: parseInt(user_id),
                completion_probability: completionProbability,
                prediction_factors: predictionFactors,
                recommendations,
                confidence_level: predictionFactors.sample_size >= 10 ? 'high' :
                    predictionFactors.sample_size >= 5 ? 'medium' : 'low',
                prediction_horizon,
                generated_at: new Date()
            }
        });

    } catch (error) {
        console.error('Error in getCompletionProbability:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi dự đoán completion probability',
            error: error.message
        });
    }
};

/**
 * Get risk assessment for students
 * Identifies students at risk of not completing successfully
 */
const getRiskAssessment = async (req, res) => {
    try {
        const {
            program_id,
            subject_id,
            risk_threshold = 0.3 // Students with completion probability < threshold are at risk
        } = req.query;

        // Get all students' recent performance
        const whereConditions = {};
        const includeConditions = [
            {
                model: User,
                as: 'Student',
                required: true,
                attributes: ['user_id', 'name', 'email']
            }
        ];

        if (subject_id || program_id) {
            includeConditions.push({
                model: Quiz,
                as: 'Quiz',
                required: true,
                include: [{
                    model: Subject,
                    as: 'Subject',
                    required: true,
                    where: subject_id ? { subject_id } : {},
                    include: program_id ? [{
                        model: Course,
                        as: 'Courses',
                        required: true,
                        where: { program_id }
                    }] : []
                }]
            });
        }

        // Get recent results (last 30 days)
        const recentDate = new Date();
        recentDate.setDate(recentDate.getDate() - 30);

        whereConditions.update_time = {
            [Op.gte]: recentDate
        };

        const studentResults = await QuizResult.findAll({
            attributes: [
                'user_id',
                [Sequelize.fn('AVG', Sequelize.col('score')), 'avg_score'],
                [Sequelize.fn('COUNT', Sequelize.col('result_id')), 'total_attempts'],
                [Sequelize.fn('COUNT', Sequelize.literal('CASE WHEN score >= 5 THEN 1 END')), 'passing_attempts'],
                [Sequelize.fn('AVG', Sequelize.col('completion_time')), 'avg_completion_time']
            ],
            where: whereConditions,
            include: includeConditions,
            group: ['user_id', 'Student.user_id', 'Student.name', 'Student.email'],
            having: Sequelize.literal('COUNT(result_id) >= 3'), // At least 3 attempts for meaningful analysis
            raw: true
        });

        // Calculate risk scores for each student
        const riskAssessments = studentResults.map(student => {
            const avgScore = parseFloat(student.avg_score || 0);
            const totalAttempts = parseInt(student.total_attempts || 0);
            const passingAttempts = parseInt(student.passing_attempts || 0);
            const avgTime = parseFloat(student.avg_completion_time || 0);

            // Simple risk calculation based on multiple factors
            const passRate = totalAttempts > 0 ? passingAttempts / totalAttempts : 0;
            const scoreRisk = avgScore < 5 ? 0.4 : avgScore < 7 ? 0.2 : 0;
            const passRateRisk = passRate < 0.5 ? 0.3 : passRate < 0.7 ? 0.15 : 0;
            const timeRisk = avgTime > 300 ? 0.2 : avgTime > 180 ? 0.1 : 0; // 5 minutes = high risk
            const attemptRisk = totalAttempts < 5 ? 0.1 : 0; // Low engagement risk

            const totalRisk = Math.min(1, scoreRisk + passRateRisk + timeRisk + attemptRisk);
            const completionProbability = Math.max(0, 1 - totalRisk);

            return {
                user_id: student.user_id,
                user_name: student['Student.name'],
                user_email: student['Student.email'],
                risk_score: totalRisk.toFixed(3),
                completion_probability: completionProbability.toFixed(3),
                risk_level: totalRisk > 0.7 ? 'high' : totalRisk > 0.4 ? 'medium' : 'low',
                performance_metrics: {
                    avg_score: avgScore.toFixed(2),
                    pass_rate: (passRate * 100).toFixed(2),
                    total_attempts: totalAttempts,
                    avg_completion_time: avgTime.toFixed(2)
                },
                risk_factors: {
                    low_scores: scoreRisk > 0,
                    low_pass_rate: passRateRisk > 0,
                    slow_completion: timeRisk > 0,
                    low_engagement: attemptRisk > 0
                }
            };
        });

        // Filter students at risk
        const studentsAtRisk = riskAssessments.filter(student =>
            parseFloat(student.completion_probability) < parseFloat(risk_threshold)
        );

        // Sort by risk level (highest risk first)
        studentsAtRisk.sort((a, b) => parseFloat(b.risk_score) - parseFloat(a.risk_score));

        res.json({
            success: true,
            data: {
                students_at_risk: studentsAtRisk,
                summary: {
                    total_students_analyzed: riskAssessments.length,
                    students_at_risk_count: studentsAtRisk.length,
                    risk_percentage: riskAssessments.length > 0 ?
                        (studentsAtRisk.length / riskAssessments.length * 100).toFixed(2) : 0,
                    high_risk_count: studentsAtRisk.filter(s => s.risk_level === 'high').length,
                    medium_risk_count: studentsAtRisk.filter(s => s.risk_level === 'medium').length
                },
                risk_threshold: parseFloat(risk_threshold),
                generated_at: new Date()
            }
        });

    } catch (error) {
        console.error('Error in getRiskAssessment:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi đánh giá risk assessment',
            error: error.message
        });
    }
};

// Helper functions for predictive analytics
const calculatePredictionFactors = (recentResults, allTimeResults) => {
    const factors = {
        recent_avg_score: 0,
        all_time_avg_score: 0,
        score_trend: 'stable',
        completion_rate: 0,
        consistency_score: 0,
        engagement_level: 'low',
        sample_size: recentResults.length
    };

    if (recentResults.length === 0) return factors;

    // Calculate averages
    const recentScores = recentResults.map(r => parseFloat(r.score));
    const allTimeScores = allTimeResults.map(r => parseFloat(r.score));

    factors.recent_avg_score = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    factors.all_time_avg_score = allTimeScores.reduce((a, b) => a + b, 0) / allTimeScores.length;

    // Determine score trend
    if (factors.recent_avg_score > factors.all_time_avg_score * 1.1) {
        factors.score_trend = 'improving';
    } else if (factors.recent_avg_score < factors.all_time_avg_score * 0.9) {
        factors.score_trend = 'declining';
    }

    // Calculate completion rate
    const completedQuizzes = recentResults.filter(r => r.status === 'completed').length;
    factors.completion_rate = recentResults.length > 0 ? completedQuizzes / recentResults.length : 0;

    // Calculate consistency (lower std dev = higher consistency)
    const variance = recentScores.reduce((sum, score) =>
        sum + Math.pow(score - factors.recent_avg_score, 2), 0) / recentScores.length;
    const stdDev = Math.sqrt(variance);
    factors.consistency_score = factors.recent_avg_score > 0 ?
        Math.max(0, 100 - (stdDev / factors.recent_avg_score * 100)) : 0;

    // Determine engagement level
    if (recentResults.length >= 15) factors.engagement_level = 'high';
    else if (recentResults.length >= 8) factors.engagement_level = 'medium';

    return factors;
};

const calculateCompletionProbability = (factors) => {
    let probability = 0.5; // Base probability

    // Score factor (40% weight)
    if (factors.recent_avg_score >= 8) probability += 0.3;
    else if (factors.recent_avg_score >= 6) probability += 0.1;
    else if (factors.recent_avg_score < 4) probability -= 0.2;

    // Trend factor (20% weight)
    if (factors.score_trend === 'improving') probability += 0.15;
    else if (factors.score_trend === 'declining') probability -= 0.15;

    // Completion rate factor (20% weight)
    probability += (factors.completion_rate - 0.5) * 0.4;

    // Consistency factor (10% weight)
    probability += (factors.consistency_score / 100 - 0.5) * 0.2;

    // Engagement factor (10% weight)
    if (factors.engagement_level === 'high') probability += 0.1;
    else if (factors.engagement_level === 'low') probability -= 0.1;

    return Math.max(0, Math.min(1, probability)).toFixed(3);
};

const generateRecommendations = (factors, probability) => {
    const recommendations = [];

    if (parseFloat(probability) < 0.4) {
        recommendations.push({
            priority: 'high',
            category: 'intervention',
            message: 'Cần can thiệp ngay lập tức - học viên có nguy cơ cao không hoàn thành',
            action: 'Liên hệ trực tiếp với học viên và cung cấp hỗ trợ cá nhân'
        });
    }

    if (factors.recent_avg_score < 5) {
        recommendations.push({
            priority: 'high',
            category: 'academic',
            message: 'Điểm số thấp - cần cải thiện hiểu biết cơ bản',
            action: 'Cung cấp tài liệu ôn tập và bài tập bổ sung'
        });
    }

    if (factors.score_trend === 'declining') {
        recommendations.push({
            priority: 'medium',
            category: 'monitoring',
            message: 'Xu hướng điểm số giảm - cần theo dõi chặt chẽ',
            action: 'Tăng cường feedback và hướng dẫn'
        });
    }

    if (factors.engagement_level === 'low') {
        recommendations.push({
            priority: 'medium',
            category: 'engagement',
            message: 'Mức độ tham gia thấp - cần tăng động lực học tập',
            action: 'Áp dụng gamification và tương tác nhiều hơn'
        });
    }

    if (factors.consistency_score < 50) {
        recommendations.push({
            priority: 'low',
            category: 'consistency',
            message: 'Kết quả không ổn định - cần cải thiện phương pháp học',
            action: 'Hướng dẫn kỹ thuật học tập hiệu quả'
        });
    }

    return recommendations;
};

// ==================== QUIZ-SPECIFIC ANALYTICS ====================

/**
 * Get comprehensive analytics for a specific quiz
 * Analyzes performance of all users who took this quiz
 */
const getQuizAnalytics = async (req, res) => {
    try {
        const {
            quiz_id,
            include_individual_performance = true,
            include_question_breakdown = true,
            include_lo_analysis = true
        } = req.query;

        if (!quiz_id) {
            return res.status(400).json({
                success: false,
                message: 'quiz_id is required for quiz analytics'
            });
        }

        // Get quiz information
        const quiz = await Quiz.findByPk(quiz_id, {
            include: [
                {
                    model: Subject,
                    as: 'Subject',
                    attributes: ['subject_id', 'name']
                }
            ]
        });

        if (!quiz) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found'
            });
        }

        // Get all attempts for this quiz
        const quizAttempts = await UserQuestionHistory.findAll({
            where: { quiz_id: parseInt(quiz_id) },
            include: [
                {
                    model: User,
                    as: 'User',
                    attributes: ['user_id', 'name']
                },
                {
                    model: Question,
                    as: 'Question',
                    attributes: ['question_id', 'question_text', 'lo_id', 'level_id'],
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
            ],
            order: [['attempt_date', 'DESC']]
        });

        if (quizAttempts.length === 0) {
            return res.json({
                success: true,
                data: {
                    message: 'Chưa có ai làm quiz này',
                    quiz_id: parseInt(quiz_id),
                    quiz_name: quiz.name
                }
            });
        }

        // Get LO-Chapter mapping for questions in this quiz
        const loIds = [...new Set(quizAttempts.map(attempt => attempt.Question?.LO?.lo_id).filter(Boolean))];
        const loChapterMap = await getChaptersForLOs(loIds);

        // Analyze quiz performance
        const analysis = await analyzeQuizPerformance(quizAttempts, loChapterMap, {
            include_individual_performance,
            include_question_breakdown,
            include_lo_analysis
        });

        res.json({
            success: true,
            data: {
                quiz_info: {
                    quiz_id: parseInt(quiz_id),
                    quiz_name: quiz.name,
                    subject: quiz.Subject?.name || 'Unknown Subject',
                    total_participants: analysis.total_participants,
                    total_attempts: quizAttempts.length
                },
                overall_statistics: analysis.overall_statistics,
                question_analysis: include_question_breakdown ? analysis.question_analysis : null,
                lo_performance: include_lo_analysis ? analysis.lo_performance : null,
                individual_performance: include_individual_performance ? analysis.individual_performance : null,
                difficulty_distribution: analysis.difficulty_distribution,
                time_analysis: analysis.time_analysis,
                generated_at: new Date()
            }
        });

    } catch (error) {
        console.error('Error in getQuizAnalytics:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi phân tích quiz',
            error: error.message
        });
    }
};

/**
 * Get student's performance on a specific quiz
 * Detailed analysis of how a specific student performed on a quiz
 */
const getStudentQuizPerformance = async (req, res) => {
    try {
        const { user_id, quiz_id } = req.query;

        if (!user_id || !quiz_id) {
            return res.status(400).json({
                success: false,
                message: 'Both user_id and quiz_id are required'
            });
        }

        // Get student's attempts for this specific quiz
        const studentAttempts = await UserQuestionHistory.findAll({
            where: {
                user_id: parseInt(user_id),
                quiz_id: parseInt(quiz_id)
            },
            include: [
                {
                    model: Question,
                    as: 'Question',
                    attributes: ['question_id', 'question_text', 'lo_id', 'level_id'],
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
            ],
            order: [['attempt_date', 'ASC']]
        });

        if (studentAttempts.length === 0) {
            return res.json({
                success: true,
                data: {
                    message: 'Sinh viên chưa làm quiz này',
                    user_id: parseInt(user_id),
                    quiz_id: parseInt(quiz_id)
                }
            });
        }

        // Get LO-Chapter mapping
        const loIds = [...new Set(studentAttempts.map(attempt => attempt.Question?.LO?.lo_id).filter(Boolean))];
        const loChapterMap = await getChaptersForLOs(loIds);

        // Analyze student's quiz performance
        const analysis = await analyzeStudentQuizPerformance(studentAttempts, loChapterMap);

        res.json({
            success: true,
            data: {
                user_id: parseInt(user_id),
                quiz_id: parseInt(quiz_id),
                performance_summary: analysis.summary,
                question_by_question: analysis.question_breakdown,
                lo_performance: analysis.lo_performance,
                strengths_weaknesses: analysis.strengths_weaknesses,
                recommendations: analysis.recommendations,
                generated_at: new Date()
            }
        });

    } catch (error) {
        console.error('Error in getStudentQuizPerformance:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi phân tích kết quả quiz của sinh viên',
            error: error.message
        });
    }
};

// ==================== TESTING FUNCTIONS ====================

/**
 * Test function to verify LO-Chapter relationship works correctly
 */
const testLOChapterRelationship = async (req, res) => {
    try {
        console.log('Testing LO-Chapter relationship...');

        // Test 1: Get some LOs
        const los = await LO.findAll({
            limit: 5,
            attributes: ['lo_id', 'name']
        });

        console.log('Found LOs:', los.map(lo => ({ id: lo.lo_id, name: lo.name })));

        if (los.length === 0) {
            return res.json({
                success: true,
                message: 'No LOs found in database',
                data: { los: [], chapters: [] }
            });
        }

        // Test 2: Get chapters for these LOs
        const loIds = los.map(lo => lo.lo_id);
        const loChapterMap = await getChaptersForLOs(loIds);

        console.log('LO-Chapter mapping:', loChapterMap);

        // Test 3: Get some UserQuestionHistory with simplified query
        const questionHistory = await UserQuestionHistory.findAll({
            limit: 10,
            attributes: ['question_id', 'is_correct', 'time_spent'],
            include: [{
                model: Question,
                as: 'Question',
                required: true,
                attributes: ['question_id', 'lo_id'],
                include: [{
                    model: LO,
                    as: 'LO',
                    required: true,
                    attributes: ['lo_id', 'name']
                }]
            }]
        });

        console.log('Question history count:', questionHistory.length);

        // Process the data to show chapter information
        const processedData = questionHistory.map(record => {
            const loId = record.Question?.LO?.lo_id;
            const chapterInfo = loChapterMap[loId];

            return {
                question_id: record.question_id,
                is_correct: record.is_correct,
                lo_id: loId,
                lo_name: record.Question?.LO?.name,
                chapter_name: chapterInfo ? chapterInfo.name : 'Unknown Chapter',
                subject_name: chapterInfo ? chapterInfo.subject.name : 'Unknown Subject'
            };
        });

        res.json({
            success: true,
            message: 'LO-Chapter relationship test completed',
            data: {
                total_los: los.length,
                total_chapters_mapped: Object.keys(loChapterMap).length,
                total_question_history: questionHistory.length,
                lo_chapter_mapping: loChapterMap,
                sample_processed_data: processedData.slice(0, 5)
            }
        });

    } catch (error) {
        console.error('Error in testLOChapterRelationship:', error);
        res.status(500).json({
            success: false,
            message: 'Error testing LO-Chapter relationship',
            error: error.message,
            stack: error.stack
        });
    }
};

// ==================== STUDENT SCORE ANALYSIS ====================

/**
 * Get comprehensive student score analysis
 * Analyzes strengths, weaknesses, and provides specific recommendations
 */
const getStudentScoreAnalysis = async (req, res) => {
    try {
        const {
            user_id,
            program_id,
            course_id,
            time_period = '3m',
            include_comparison = true
        } = req.query;

        if (!user_id) {
            return res.status(400).json({
                success: false,
                message: 'user_id is required for student score analysis'
            });
        }

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();

        switch (time_period) {
            case '1m': startDate.setMonth(endDate.getMonth() - 1); break;
            case '3m': startDate.setMonth(endDate.getMonth() - 3); break;
            case '6m': startDate.setMonth(endDate.getMonth() - 6); break;
            case '1y': startDate.setFullYear(endDate.getFullYear() - 1); break;
            default: startDate.setMonth(endDate.getMonth() - 3);
        }

        // Get detailed question-level performance
        const whereConditions = {
            user_id: parseInt(user_id),
            attempt_date: {
                [Op.between]: [startDate, endDate]
            }
        };

        const includeConditions = [
            {
                model: Question,
                as: 'Question',
                required: true,
                attributes: ['question_id', 'question_text', 'lo_id', 'level_id'],
                include: [
                    {
                        model: LO,
                        as: 'LO',
                        required: true,
                        attributes: ['lo_id', 'name', 'description']
                    },
                    {
                        model: Level,
                        as: 'Level',
                        required: true,
                        attributes: ['level_id', 'name']
                    }
                ]
            }
        ];

        // Get student's detailed performance data
        const studentPerformance = await UserQuestionHistory.findAll({
            attributes: [
                'question_id',
                'is_correct',
                'time_spent',
                'attempt_date',
                'selected_answer'
            ],
            where: whereConditions,
            include: includeConditions,
            order: [['attempt_date', 'DESC']],
            raw: true
        });

        if (studentPerformance.length === 0) {
            return res.json({
                success: true,
                data: {
                    message: 'Không có dữ liệu trong khoảng thời gian được chọn',
                    user_id: parseInt(user_id),
                    time_period
                }
            });
        }

        // Analyze performance by different dimensions
        const analysis = await analyzeStudentPerformance(studentPerformance, user_id, include_comparison);

        res.json({
            success: true,
            data: {
                user_id: parseInt(user_id),
                analysis_period: { start: startDate, end: endDate },
                overall_performance: analysis.overall,
                strengths_weaknesses: analysis.strengthsWeaknesses,
                learning_outcomes_analysis: analysis.loAnalysis,
                chapter_performance: analysis.chapterAnalysis,
                difficulty_level_analysis: analysis.difficultyAnalysis,
                improvement_trends: analysis.trends,
                personalized_recommendations: analysis.recommendations,
                comparison_with_peers: include_comparison ? analysis.peerComparison : null,
                generated_at: new Date()
            }
        });

    } catch (error) {
        console.error('Error in getStudentScoreAnalysis:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi phân tích điểm số sinh viên',
            error: error.message
        });
    }
};

/**
 * Get learning outcome mastery analysis for a student
 * Detailed analysis of mastery level for each Learning Outcome
 */
const getLearningOutcomeMastery = async (req, res) => {
    try {
        const {
            user_id,
            course_id,
            program_id,
            mastery_threshold = 0.7 // 70% accuracy = mastery
        } = req.query;

        if (!user_id) {
            return res.status(400).json({
                success: false,
                message: 'user_id is required for LO mastery analysis'
            });
        }

        // Get all LO performance for the student, optionally filtered by course/program
        const whereConditions = { user_id: parseInt(user_id) };
        const includeConditions = [
            {
                model: Question,
                as: 'Question',
                required: true,
                include: [
                    {
                        model: LO,
                        as: 'LO',
                        required: true,
                        attributes: ['lo_id', 'name', 'description'],
                    },
                    {
                        model: Level,
                        as: 'Level',
                        required: true,
                        attributes: ['level_id', 'name']
                    }
                ]
            }
        ];

        // Add filtering through Quiz → Course if course_id or program_id specified
        if (course_id || program_id) {
            includeConditions.push({
                model: Quiz,
                as: 'Quiz',
                required: true,
                where: course_id ? { course_id } : {},
                include: program_id ? [{
                    model: Course,
                    as: 'Course',
                    required: true,
                    where: { program_id },
                    include: [{
                        model: Subject,
                        as: 'Subject',
                        required: true
                    }]
                }] : [{
                    model: Course,
                    as: 'Course',
                    required: true,
                    include: [{
                        model: Subject,
                        as: 'Subject',
                        required: true
                    }]
                }]
            });
        }

        const loPerformance = await UserQuestionHistory.findAll({
            attributes: [
                'question_id',
                'is_correct',
                'time_spent',
                'attempt_date'
            ],
            where: whereConditions,
            include: includeConditions,
            raw: true
        });

        // Get unique LO IDs and their chapter information
        const loIds = [...new Set(loPerformance.map(record => record['Question.LO.lo_id']))];
        const loChapterMap = await getChaptersForLOs(loIds);

        // Group by Learning Outcome
        const loMastery = {};
        loPerformance.forEach(record => {
            const loId = record['Question.LO.lo_id'];
            const loName = record['Question.LO.name'];
            const chapterInfo = loChapterMap[loId];
            const chapterName = chapterInfo ? chapterInfo.name : 'Unknown Chapter';
            const levelName = record['Question.Level.name'];

            if (!loMastery[loId]) {
                loMastery[loId] = {
                    lo_id: loId,
                    lo_name: loName,
                    chapter: chapterName,
                    attempts: [],
                    total_attempts: 0,
                    correct_attempts: 0,
                    accuracy_rate: 0,
                    avg_response_time: 0,
                    mastery_level: 'not_started',
                    difficulty_distribution: {},
                    recent_performance: [],
                    improvement_trend: 'stable'
                };
            }

            loMastery[loId].attempts.push({
                is_correct: record.is_correct,
                time_spent: record.time_spent,
                attempt_date: record.attempt_date,
                level: levelName
            });

            loMastery[loId].total_attempts++;
            if (record.is_correct) {
                loMastery[loId].correct_attempts++;
            }

            // Track difficulty distribution
            if (!loMastery[loId].difficulty_distribution[levelName]) {
                loMastery[loId].difficulty_distribution[levelName] = {
                    total: 0,
                    correct: 0,
                    accuracy: 0
                };
            }
            loMastery[loId].difficulty_distribution[levelName].total++;
            if (record.is_correct) {
                loMastery[loId].difficulty_distribution[levelName].correct++;
            }
        });

        // Calculate mastery metrics for each LO
        Object.values(loMastery).forEach(lo => {
            // Basic metrics
            lo.accuracy_rate = lo.total_attempts > 0 ?
                (lo.correct_attempts / lo.total_attempts) : 0;

            lo.avg_response_time = lo.attempts.length > 0 ?
                lo.attempts.reduce((sum, a) => sum + (a.time_spent || 0), 0) / lo.attempts.length : 0;

            // Determine mastery level
            if (lo.total_attempts === 0) {
                lo.mastery_level = 'not_started';
            } else if (lo.accuracy_rate >= mastery_threshold) {
                lo.mastery_level = 'mastered';
            } else if (lo.accuracy_rate >= mastery_threshold * 0.7) {
                lo.mastery_level = 'developing';
            } else {
                lo.mastery_level = 'needs_improvement';
            }

            // Calculate difficulty distribution percentages
            Object.keys(lo.difficulty_distribution).forEach(level => {
                const dist = lo.difficulty_distribution[level];
                dist.accuracy = dist.total > 0 ? (dist.correct / dist.total) : 0;
            });

            // Analyze recent performance trend (last 10 attempts)
            const recentAttempts = lo.attempts
                .sort((a, b) => new Date(b.attempt_date) - new Date(a.attempt_date))
                .slice(0, 10);

            if (recentAttempts.length >= 5) {
                const firstHalf = recentAttempts.slice(Math.floor(recentAttempts.length / 2));
                const secondHalf = recentAttempts.slice(0, Math.floor(recentAttempts.length / 2));

                const firstAccuracy = firstHalf.filter(a => a.is_correct).length / firstHalf.length;
                const secondAccuracy = secondHalf.filter(a => a.is_correct).length / secondHalf.length;

                if (secondAccuracy > firstAccuracy * 1.2) {
                    lo.improvement_trend = 'improving';
                } else if (secondAccuracy < firstAccuracy * 0.8) {
                    lo.improvement_trend = 'declining';
                }
            }

            lo.recent_performance = recentAttempts.slice(0, 5).map(a => ({
                is_correct: a.is_correct,
                time_spent: a.time_spent,
                level: a.level
            }));
        });

        // Generate LO-specific recommendations
        const loRecommendations = generateLORecommendations(Object.values(loMastery), mastery_threshold);

        // Calculate overall mastery summary
        const masteryLevels = Object.values(loMastery);
        const summary = {
            total_los: masteryLevels.length,
            mastered_count: masteryLevels.filter(lo => lo.mastery_level === 'mastered').length,
            developing_count: masteryLevels.filter(lo => lo.mastery_level === 'developing').length,
            needs_improvement_count: masteryLevels.filter(lo => lo.mastery_level === 'needs_improvement').length,
            not_started_count: masteryLevels.filter(lo => lo.mastery_level === 'not_started').length,
            overall_mastery_rate: masteryLevels.length > 0 ?
                (masteryLevels.filter(lo => lo.mastery_level === 'mastered').length / masteryLevels.length * 100).toFixed(2) : 0
        };

        res.json({
            success: true,
            data: {
                user_id: parseInt(user_id),
                mastery_threshold: parseFloat(mastery_threshold),
                summary,
                learning_outcomes: Object.values(loMastery),
                recommendations: loRecommendations,
                generated_at: new Date()
            }
        });

    } catch (error) {
        console.error('Error in getLearningOutcomeMastery:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi phân tích mastery Learning Outcomes',
            error: error.message
        });
    }
};

/**
 * Get detailed improvement suggestions for specific Learning Outcomes
 * Provides actionable recommendations based on student's performance patterns
 */
const getImprovementSuggestions = async (req, res) => {
    try {
        const {
            user_id,
            lo_id, // Specific LO to analyze, if not provided, analyze all weak LOs
            subject_id,
            program_id,
            suggestion_depth = 'detailed' // 'basic', 'detailed', 'comprehensive'
        } = req.query;

        if (!user_id) {
            return res.status(400).json({
                success: false,
                message: 'user_id is required for improvement suggestions'
            });
        }

        // Build query conditions
        const whereConditions = { user_id: parseInt(user_id) };
        const includeConditions = [
            {
                model: Question,
                as: 'Question',
                required: true,
                where: lo_id ? { lo_id: parseInt(lo_id) } : {},
                include: [
                    {
                        model: LO,
                        as: 'LO',
                        required: true,
                        attributes: ['lo_id', 'name', 'description']
                    },
                    {
                        model: Level,
                        as: 'Level',
                        required: true,
                        attributes: ['level_id', 'name']
                    }
                ]
            }
        ];

        // Get student's performance data
        const performanceData = await UserQuestionHistory.findAll({
            attributes: [
                'question_id',
                'is_correct',
                'time_spent',
                'attempt_date',
                'selected_answer'
            ],
            where: whereConditions,
            include: includeConditions,
            order: [['attempt_date', 'DESC']],
            raw: true
        });

        if (performanceData.length === 0) {
            return res.json({
                success: true,
                data: {
                    message: 'Không có dữ liệu performance để phân tích',
                    user_id: parseInt(user_id)
                }
            });
        }

        // Get unique LO IDs and their chapter information
        const loIds = [...new Set(performanceData.map(record => record['Question.LO.lo_id']))];
        const loChapterMap = await getChaptersForLOs(loIds);

        // Analyze performance patterns for each LO
        const loPerformanceMap = {};
        performanceData.forEach(record => {
            const loId = record['Question.LO.lo_id'];
            const loName = record['Question.LO.name'];
            const levelName = record['Question.Level.name'];

            if (!loPerformanceMap[loId]) {
                const chapterInfo = loChapterMap[loId];
                const chapterName = chapterInfo ? chapterInfo.name : 'Unknown Chapter';

                loPerformanceMap[loId] = {
                    lo_id: loId,
                    lo_name: loName,
                    chapter: chapterName,
                    attempts: [],
                    error_patterns: {},
                    difficulty_struggles: {},
                    time_patterns: []
                };
            }

            loPerformanceMap[loId].attempts.push({
                is_correct: record.is_correct,
                time_spent: record.time_spent,
                level: levelName,
                date: record.attempt_date,
                question_id: record.question_id
            });

            // Track error patterns by difficulty level
            if (!record.is_correct) {
                if (!loPerformanceMap[loId].difficulty_struggles[levelName]) {
                    loPerformanceMap[loId].difficulty_struggles[levelName] = 0;
                }
                loPerformanceMap[loId].difficulty_struggles[levelName]++;
            }

            // Track time patterns
            loPerformanceMap[loId].time_patterns.push({
                time: record.time_spent,
                correct: record.is_correct,
                level: levelName
            });
        });

        // Generate detailed suggestions for each LO
        const suggestions = [];

        for (const [loId, loData] of Object.entries(loPerformanceMap)) {
            const totalAttempts = loData.attempts.length;
            const correctAttempts = loData.attempts.filter(a => a.is_correct).length;
            const accuracy = correctAttempts / totalAttempts;

            // Only provide suggestions for LOs with accuracy < 80%
            if (accuracy < 0.8 && totalAttempts >= 3) {
                const suggestion = await generateDetailedLOSuggestions(loData, accuracy, suggestion_depth);
                suggestions.push(suggestion);
            }
        }

        // Sort suggestions by priority (lowest accuracy first)
        suggestions.sort((a, b) => parseFloat(a.current_accuracy) - parseFloat(b.current_accuracy));

        // Generate overall study plan
        const studyPlan = generateStudyPlan(suggestions);

        res.json({
            success: true,
            data: {
                user_id: parseInt(user_id),
                total_los_analyzed: Object.keys(loPerformanceMap).length,
                suggestions_count: suggestions.length,
                improvement_suggestions: suggestions,
                study_plan: studyPlan,
                suggestion_depth,
                generated_at: new Date()
            }
        });

    } catch (error) {
        console.error('Error in getImprovementSuggestions:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo gợi ý cải thiện',
            error: error.message
        });
    }
};

// Helper function to generate detailed LO suggestions
const generateDetailedLOSuggestions = async (loData, accuracy, depth) => {
    const suggestion = {
        lo_id: loData.lo_id,
        lo_name: loData.lo_name,
        chapter: loData.chapter,
        current_accuracy: (accuracy * 100).toFixed(2),
        total_attempts: loData.attempts.length,
        priority: accuracy < 0.3 ? 'critical' : accuracy < 0.5 ? 'high' : accuracy < 0.7 ? 'medium' : 'low',
        main_issues: [],
        specific_recommendations: [],
        study_resources: [],
        practice_plan: {},
        estimated_improvement_time: ''
    };

    // Analyze main issues
    const avgResponseTime = loData.time_patterns.reduce((sum, t) => sum + (t.time || 0), 0) / loData.time_patterns.length;

    if (accuracy < 0.5) {
        suggestion.main_issues.push({
            issue: 'Hiểu biết cơ bản chưa vững',
            severity: 'high',
            description: `Độ chính xác chỉ ${(accuracy * 100).toFixed(1)}% cho thấy cần ôn tập lại kiến thức nền tảng`
        });
    }

    if (avgResponseTime > 180) { // > 3 minutes
        suggestion.main_issues.push({
            issue: 'Thời gian làm bài chậm',
            severity: 'medium',
            description: `Thời gian trung bình ${(avgResponseTime / 60).toFixed(1)} phút/câu cần được cải thiện`
        });
    }

    // Analyze difficulty level struggles
    const difficultyIssues = Object.entries(loData.difficulty_struggles);
    if (difficultyIssues.length > 0) {
        const mostProblematicLevel = difficultyIssues.reduce((max, current) =>
            current[1] > max[1] ? current : max
        );

        suggestion.main_issues.push({
            issue: `Khó khăn với câu hỏi mức độ ${mostProblematicLevel[0]}`,
            severity: 'medium',
            description: `${mostProblematicLevel[1]} lỗi trong ${loData.attempts.length} lần thử với mức độ ${mostProblematicLevel[0]}`
        });
    }

    // Generate specific recommendations based on depth
    if (depth === 'basic') {
        suggestion.specific_recommendations = [
            'Ôn tập lý thuyết cơ bản',
            'Làm thêm bài tập thực hành',
            'Tham khảo tài liệu bổ sung'
        ];
    } else if (depth === 'detailed') {
        suggestion.specific_recommendations = [
            {
                action: 'Ôn tập lý thuyết',
                details: `Đọc lại phần ${loData.lo_name} trong giáo trình`,
                time_needed: '2-3 giờ',
                priority: 1
            },
            {
                action: 'Thực hành có hướng dẫn',
                details: 'Làm bài tập từ dễ đến khó với giải thích chi tiết',
                time_needed: '3-4 giờ',
                priority: 2
            },
            {
                action: 'Tự kiểm tra',
                details: 'Làm quiz tự đánh giá sau mỗi phiên học',
                time_needed: '30 phút/ngày',
                priority: 3
            }
        ];
    } else { // comprehensive
        suggestion.specific_recommendations = [
            {
                action: 'Phân tích lỗi chi tiết',
                details: 'Xem lại từng câu trả lời sai để hiểu nguyên nhân',
                time_needed: '1 giờ',
                priority: 1,
                tools: ['Bảng phân tích lỗi', 'Ghi chú cá nhân']
            },
            {
                action: 'Học theo phương pháp Feynman',
                details: 'Giải thích khái niệm bằng ngôn ngữ đơn giản',
                time_needed: '2 giờ',
                priority: 2,
                tools: ['Ghi âm giải thích', 'Vẽ sơ đồ tư duy']
            },
            {
                action: 'Thực hành có khoảng cách',
                details: 'Lặp lại kiến thức theo chu kỳ tăng dần',
                time_needed: '15 phút/ngày trong 2 tuần',
                priority: 3,
                tools: ['Flashcards', 'Lịch ôn tập']
            },
            {
                action: 'Áp dụng thực tế',
                details: 'Tìm ví dụ thực tế liên quan đến kiến thức',
                time_needed: '1-2 giờ',
                priority: 4,
                tools: ['Case study', 'Dự án mini']
            }
        ];
    }

    // Study resources
    suggestion.study_resources = [
        {
            type: 'textbook',
            title: `Chương ${loData.chapter}`,
            description: 'Giáo trình chính của môn học'
        },
        {
            type: 'practice',
            title: 'Bài tập thực hành',
            description: `Tập trung vào ${loData.lo_name}`
        },
        {
            type: 'video',
            title: 'Video giảng dạy',
            description: 'Tìm video YouTube hoặc Khan Academy'
        }
    ];

    // Practice plan
    suggestion.practice_plan = {
        week_1: {
            focus: 'Nền tảng lý thuyết',
            daily_time: '30-45 phút',
            activities: ['Đọc giáo trình', 'Ghi chú khái niệm chính', 'Làm bài tập cơ bản']
        },
        week_2: {
            focus: 'Thực hành và ứng dụng',
            daily_time: '45-60 phút',
            activities: ['Làm bài tập nâng cao', 'Thảo luận nhóm', 'Tự kiểm tra']
        },
        week_3: {
            focus: 'Củng cố và đánh giá',
            daily_time: '30 phút',
            activities: ['Ôn tập tổng hợp', 'Làm quiz thử', 'Phân tích kết quả']
        }
    };

    // Estimated improvement time
    if (accuracy < 0.3) {
        suggestion.estimated_improvement_time = '4-6 tuần với 1-2 giờ/ngày';
    } else if (accuracy < 0.5) {
        suggestion.estimated_improvement_time = '3-4 tuần với 45-60 phút/ngày';
    } else {
        suggestion.estimated_improvement_time = '2-3 tuần với 30-45 phút/ngày';
    }

    return suggestion;
};

// Helper function to generate overall study plan
const generateStudyPlan = (suggestions) => {
    if (suggestions.length === 0) {
        return {
            message: 'Không cần kế hoạch cải thiện - hiệu suất tốt!',
            total_time_needed: '0 giờ'
        };
    }

    const criticalLOs = suggestions.filter(s => s.priority === 'critical');
    const highPriorityLOs = suggestions.filter(s => s.priority === 'high');
    const mediumPriorityLOs = suggestions.filter(s => s.priority === 'medium');

    const plan = {
        phase_1: {
            title: 'Khắc phục khẩn cấp (Tuần 1-2)',
            focus: criticalLOs.length > 0 ? criticalLOs.map(lo => lo.lo_name) : ['Không có LO cần khắc phục khẩn cấp'],
            daily_time: criticalLOs.length > 0 ? '1-2 giờ' : '0 giờ',
            priority: 'critical'
        },
        phase_2: {
            title: 'Cải thiện chính (Tuần 3-5)',
            focus: highPriorityLOs.length > 0 ? highPriorityLOs.map(lo => lo.lo_name) : ['Không có LO ưu tiên cao'],
            daily_time: highPriorityLOs.length > 0 ? '45-60 phút' : '0 giờ',
            priority: 'high'
        },
        phase_3: {
            title: 'Hoàn thiện (Tuần 6-8)',
            focus: mediumPriorityLOs.length > 0 ? mediumPriorityLOs.map(lo => lo.lo_name) : ['Không có LO ưu tiên trung bình'],
            daily_time: mediumPriorityLOs.length > 0 ? '30-45 phút' : '0 giờ',
            priority: 'medium'
        },
        total_duration: '6-8 tuần',
        success_metrics: [
            'Độ chính xác tăng lên trên 70% cho tất cả LO',
            'Thời gian làm bài giảm xuống dưới 2 phút/câu',
            'Tự tin hơn khi làm bài kiểm tra'
        ]
    };

    return plan;
};

// ==================== QUIZ ANALYSIS HELPER FUNCTIONS ====================

/**
 * Analyze overall quiz performance across all participants
 */
const analyzeQuizPerformance = async (quizAttempts, loChapterMap, options = {}) => {
    const userPerformance = {};
    const questionStats = {};
    const loStats = {};

    // Group attempts by user and question
    quizAttempts.forEach(attempt => {
        const userId = attempt.User?.user_id;
        const questionId = attempt.Question?.question_id;
        const loId = attempt.Question?.LO?.lo_id;

        // User performance
        if (!userPerformance[userId]) {
            userPerformance[userId] = {
                user_id: userId,
                user_name: attempt.User?.name || 'Unknown User',
                total_questions: 0,
                correct_answers: 0,
                total_time: 0,
                attempts: []
            };
        }

        userPerformance[userId].total_questions++;
        if (attempt.is_correct) userPerformance[userId].correct_answers++;
        userPerformance[userId].total_time += attempt.time_spent || 0;
        userPerformance[userId].attempts.push(attempt);

        // Question statistics
        if (!questionStats[questionId]) {
            questionStats[questionId] = {
                question_id: questionId,
                question_text: attempt.Question?.question_text,
                lo_name: attempt.Question?.LO?.name,
                level_name: attempt.Question?.Level?.name,
                chapter_name: loChapterMap[loId]?.name || 'Unknown Chapter',
                total_attempts: 0,
                correct_attempts: 0,
                avg_time: 0,
                total_time: 0
            };
        }

        questionStats[questionId].total_attempts++;
        if (attempt.is_correct) questionStats[questionId].correct_attempts++;
        questionStats[questionId].total_time += attempt.time_spent || 0;

        // LO statistics
        if (loId && !loStats[loId]) {
            loStats[loId] = {
                lo_id: loId,
                lo_name: attempt.Question?.LO?.name,
                chapter_name: loChapterMap[loId]?.name || 'Unknown Chapter',
                total_attempts: 0,
                correct_attempts: 0,
                total_time: 0,
                questions: new Set()
            };
        }

        if (loId) {
            loStats[loId].total_attempts++;
            if (attempt.is_correct) loStats[loId].correct_attempts++;
            loStats[loId].total_time += attempt.time_spent || 0;
            loStats[loId].questions.add(questionId);
        }
    });

    // Calculate averages and percentages
    Object.values(questionStats).forEach(stat => {
        stat.accuracy_rate = stat.total_attempts > 0 ?
            ((stat.correct_attempts / stat.total_attempts) * 100).toFixed(2) : 0;
        stat.avg_time = stat.total_attempts > 0 ?
            (stat.total_time / stat.total_attempts).toFixed(2) : 0;
    });

    Object.values(loStats).forEach(stat => {
        stat.accuracy_rate = stat.total_attempts > 0 ?
            ((stat.correct_attempts / stat.total_attempts) * 100).toFixed(2) : 0;
        stat.avg_time = stat.total_attempts > 0 ?
            (stat.total_time / stat.total_attempts).toFixed(2) : 0;
        stat.question_count = stat.questions.size;
        delete stat.questions; // Remove Set object for JSON serialization
    });

    Object.values(userPerformance).forEach(user => {
        user.accuracy_rate = user.total_questions > 0 ?
            ((user.correct_answers / user.total_questions) * 100).toFixed(2) : 0;
        user.avg_time_per_question = user.total_questions > 0 ?
            (user.total_time / user.total_questions).toFixed(2) : 0;
    });

    // Overall statistics
    const totalParticipants = Object.keys(userPerformance).length;
    const totalAttempts = quizAttempts.length;
    const totalCorrect = quizAttempts.filter(a => a.is_correct).length;
    const overallAccuracy = totalAttempts > 0 ? ((totalCorrect / totalAttempts) * 100).toFixed(2) : 0;
    const avgTimePerQuestion = totalAttempts > 0 ?
        (quizAttempts.reduce((sum, a) => sum + (a.time_spent || 0), 0) / totalAttempts).toFixed(2) : 0;

    return {
        total_participants: totalParticipants,
        overall_statistics: {
            total_attempts: totalAttempts,
            total_correct: totalCorrect,
            overall_accuracy: overallAccuracy,
            avg_time_per_question: avgTimePerQuestion
        },
        question_analysis: options.include_question_breakdown ? Object.values(questionStats) : null,
        lo_performance: options.include_lo_analysis ? Object.values(loStats) : null,
        individual_performance: options.include_individual_performance ? Object.values(userPerformance) : null,
        difficulty_distribution: calculateDifficultyDistribution(questionStats),
        time_analysis: calculateTimeAnalysis(quizAttempts)
    };
};

/**
 * Analyze individual student's performance on a specific quiz
 */
const analyzeStudentQuizPerformance = async (studentAttempts, loChapterMap) => {
    const questionBreakdown = [];
    const loPerformance = {};
    const strengths = [];
    const weaknesses = [];

    let totalCorrect = 0;
    let totalTime = 0;

    studentAttempts.forEach(attempt => {
        const loId = attempt.Question?.LO?.lo_id;
        const chapterInfo = loChapterMap[loId];

        // Question-by-question breakdown
        questionBreakdown.push({
            question_id: attempt.Question?.question_id,
            question_text: attempt.Question?.question_text,
            lo_name: attempt.Question?.LO?.name,
            level_name: attempt.Question?.Level?.name,
            chapter_name: chapterInfo?.name || 'Unknown Chapter',
            is_correct: attempt.is_correct,
            time_spent: attempt.time_spent,
            attempt_date: attempt.attempt_date
        });

        if (attempt.is_correct) totalCorrect++;
        totalTime += attempt.time_spent || 0;

        // LO performance tracking
        if (loId) {
            if (!loPerformance[loId]) {
                loPerformance[loId] = {
                    lo_id: loId,
                    lo_name: attempt.Question?.LO?.name,
                    chapter_name: chapterInfo?.name || 'Unknown Chapter',
                    total_questions: 0,
                    correct_answers: 0,
                    total_time: 0
                };
            }

            loPerformance[loId].total_questions++;
            if (attempt.is_correct) loPerformance[loId].correct_answers++;
            loPerformance[loId].total_time += attempt.time_spent || 0;
        }
    });

    // Calculate LO accuracy rates and identify strengths/weaknesses
    Object.values(loPerformance).forEach(lo => {
        lo.accuracy_rate = lo.total_questions > 0 ?
            ((lo.correct_answers / lo.total_questions) * 100).toFixed(2) : 0;
        lo.avg_time = lo.total_questions > 0 ?
            (lo.total_time / lo.total_questions).toFixed(2) : 0;

        if (parseFloat(lo.accuracy_rate) >= 80) {
            strengths.push({
                lo_name: lo.lo_name,
                chapter_name: lo.chapter_name,
                accuracy_rate: lo.accuracy_rate,
                performance_level: 'Excellent'
            });
        } else if (parseFloat(lo.accuracy_rate) < 60) {
            weaknesses.push({
                lo_name: lo.lo_name,
                chapter_name: lo.chapter_name,
                accuracy_rate: lo.accuracy_rate,
                performance_level: 'Needs Improvement'
            });
        }
    });

    const totalQuestions = studentAttempts.length;
    const overallAccuracy = totalQuestions > 0 ? ((totalCorrect / totalQuestions) * 100).toFixed(2) : 0;
    const avgTimePerQuestion = totalQuestions > 0 ? (totalTime / totalQuestions).toFixed(2) : 0;

    return {
        summary: {
            total_questions: totalQuestions,
            correct_answers: totalCorrect,
            accuracy_rate: overallAccuracy,
            total_time: totalTime,
            avg_time_per_question: avgTimePerQuestion,
            performance_grade: getPerformanceGrade(parseFloat(overallAccuracy))
        },
        question_breakdown: questionBreakdown,
        lo_performance: Object.values(loPerformance),
        strengths_weaknesses: {
            strengths: strengths.slice(0, 5),
            weaknesses: weaknesses.slice(0, 5)
        },
        recommendations: generateQuizRecommendations(weaknesses, overallAccuracy)
    };
};

const calculateDifficultyDistribution = (questionStats) => {
    const distribution = { easy: 0, medium: 0, hard: 0 };

    Object.values(questionStats).forEach(stat => {
        const accuracy = parseFloat(stat.accuracy_rate);
        if (accuracy >= 80) distribution.easy++;
        else if (accuracy >= 60) distribution.medium++;
        else distribution.hard++;
    });

    return distribution;
};

const calculateTimeAnalysis = (attempts) => {
    const times = attempts.map(a => a.time_spent || 0).filter(t => t > 0);
    if (times.length === 0) return { min: 0, max: 0, avg: 0, median: 0 };

    times.sort((a, b) => a - b);
    const min = times[0];
    const max = times[times.length - 1];
    const avg = times.reduce((sum, t) => sum + t, 0) / times.length;
    const median = times.length % 2 === 0 ?
        (times[times.length / 2 - 1] + times[times.length / 2]) / 2 :
        times[Math.floor(times.length / 2)];

    return {
        min: min.toFixed(2),
        max: max.toFixed(2),
        avg: avg.toFixed(2),
        median: median.toFixed(2)
    };
};

const generateQuizRecommendations = (weaknesses, overallAccuracy) => {
    const recommendations = [];

    if (parseFloat(overallAccuracy) < 60) {
        recommendations.push({
            priority: 'high',
            category: 'overall_performance',
            title: 'Cần cải thiện hiểu biết tổng thể',
            description: `Điểm số ${overallAccuracy}% cho thấy cần ôn tập lại kiến thức cơ bản`,
            actions: [
                'Ôn lại lý thuyết từ đầu',
                'Làm thêm bài tập cơ bản',
                'Tham khảo tài liệu học tập bổ sung'
            ]
        });
    }

    weaknesses.forEach(weakness => {
        recommendations.push({
            priority: 'medium',
            category: 'learning_outcome',
            title: `Cải thiện ${weakness.lo_name}`,
            description: `Chỉ đạt ${weakness.accuracy_rate}% ở chương ${weakness.chapter_name}`,
            actions: [
                `Ôn tập lại nội dung ${weakness.chapter_name}`,
                'Làm thêm bài tập về LO này',
                'Tìm hiểu thêm ví dụ thực tế'
            ]
        });
    });

    return recommendations;
};

// Helper functions for student score analysis
const analyzeStudentPerformance = async (performanceData, userId, includeComparison = true) => {
    // Get unique LO IDs and their chapter information
    const loIds = [...new Set(performanceData.map(record => record['Question.LO.lo_id']))];
    const loChapterMap = await getChaptersForLOs(loIds);

    // Group data by different dimensions
    const byLO = {};
    const byChapter = {};
    const byLevel = {};
    const chronological = [];

    performanceData.forEach(record => {
        const loId = record['Question.LO.lo_id'];
        const loName = record['Question.LO.name'];
        const chapterInfo = loChapterMap[loId];
        const chapterId = chapterInfo ? chapterInfo.chapter_id : null;
        const chapterName = chapterInfo ? chapterInfo.name : 'Unknown Chapter';
        const levelId = record['Question.Level.level_id'];
        const levelName = record['Question.Level.name'];

        // Group by Learning Outcome
        if (!byLO[loId]) {
            byLO[loId] = {
                lo_id: loId,
                lo_name: loName,
                chapter: chapterName,
                attempts: [],
                correct: 0,
                total: 0,
                avg_time: 0
            };
        }
        byLO[loId].attempts.push(record);
        byLO[loId].total++;
        if (record.is_correct) byLO[loId].correct++;

        // Group by Chapter
        if (!byChapter[chapterId]) {
            byChapter[chapterId] = {
                chapter_id: chapterId,
                chapter_name: chapterName,
                attempts: [],
                correct: 0,
                total: 0
            };
        }
        byChapter[chapterId].attempts.push(record);
        byChapter[chapterId].total++;
        if (record.is_correct) byChapter[chapterId].correct++;

        // Group by Difficulty Level
        if (!byLevel[levelId]) {
            byLevel[levelId] = {
                level_id: levelId,
                level_name: levelName,
                attempts: [],
                correct: 0,
                total: 0
            };
        }
        byLevel[levelId].attempts.push(record);
        byLevel[levelId].total++;
        if (record.is_correct) byLevel[levelId].correct++;

        // Chronological data
        chronological.push({
            date: record.attempt_date,
            is_correct: record.is_correct,
            time_spent: record.time_spent,
            lo_name: loName,
            chapter_name: chapterName,
            level_name: levelName
        });
    });

    // Calculate metrics for each dimension
    const loAnalysis = Object.values(byLO).map(lo => {
        lo.accuracy_rate = (lo.correct / lo.total * 100).toFixed(2);
        lo.avg_time = lo.attempts.reduce((sum, a) => sum + (a.time_spent || 0), 0) / lo.attempts.length;
        return lo;
    }).sort((a, b) => parseFloat(b.accuracy_rate) - parseFloat(a.accuracy_rate));

    const chapterAnalysis = Object.values(byChapter).map(chapter => {
        chapter.accuracy_rate = (chapter.correct / chapter.total * 100).toFixed(2);
        return chapter;
    }).sort((a, b) => parseFloat(b.accuracy_rate) - parseFloat(a.accuracy_rate));

    const difficultyAnalysis = Object.values(byLevel).map(level => {
        level.accuracy_rate = (level.correct / level.total * 100).toFixed(2);
        return level;
    }).sort((a, b) => parseFloat(b.accuracy_rate) - parseFloat(a.accuracy_rate));

    // Overall performance metrics
    const totalAttempts = performanceData.length;
    const correctAttempts = performanceData.filter(p => p.is_correct).length;
    const overallAccuracy = (correctAttempts / totalAttempts * 100).toFixed(2);
    const avgResponseTime = performanceData.reduce((sum, p) => sum + (p.time_spent || 0), 0) / totalAttempts;

    // Identify strengths and weaknesses
    const strengths = [];
    const weaknesses = [];

    // LO-based strengths/weaknesses
    loAnalysis.forEach(lo => {
        if (parseFloat(lo.accuracy_rate) >= 80 && lo.total >= 3) {
            strengths.push({
                type: 'learning_outcome',
                name: lo.lo_name,
                accuracy: lo.accuracy_rate,
                reason: `Thành thạo ${lo.lo_name} với độ chính xác ${lo.accuracy_rate}%`
            });
        } else if (parseFloat(lo.accuracy_rate) < 50 && lo.total >= 3) {
            weaknesses.push({
                type: 'learning_outcome',
                name: lo.lo_name,
                accuracy: lo.accuracy_rate,
                reason: `Cần cải thiện ${lo.lo_name} - chỉ đạt ${lo.accuracy_rate}% độ chính xác`,
                priority: parseFloat(lo.accuracy_rate) < 30 ? 'high' : 'medium'
            });
        }
    });

    // Chapter-based analysis
    chapterAnalysis.forEach(chapter => {
        if (parseFloat(chapter.accuracy_rate) >= 85 && chapter.total >= 5) {
            strengths.push({
                type: 'chapter',
                name: chapter.chapter_name,
                accuracy: chapter.accuracy_rate,
                reason: `Nắm vững kiến thức chương ${chapter.chapter_name}`
            });
        } else if (parseFloat(chapter.accuracy_rate) < 60 && chapter.total >= 5) {
            weaknesses.push({
                type: 'chapter',
                name: chapter.chapter_name,
                accuracy: chapter.accuracy_rate,
                reason: `Chương ${chapter.chapter_name} cần ôn tập thêm`,
                priority: parseFloat(chapter.accuracy_rate) < 40 ? 'high' : 'medium'
            });
        }
    });

    // Difficulty level analysis
    difficultyAnalysis.forEach(level => {
        if (parseFloat(level.accuracy_rate) >= 75 && level.total >= 3) {
            strengths.push({
                type: 'difficulty_level',
                name: level.level_name,
                accuracy: level.accuracy_rate,
                reason: `Xử lý tốt câu hỏi mức độ ${level.level_name}`
            });
        } else if (parseFloat(level.accuracy_rate) < 50 && level.total >= 3) {
            weaknesses.push({
                type: 'difficulty_level',
                name: level.level_name,
                accuracy: level.accuracy_rate,
                reason: `Gặp khó khăn với câu hỏi mức độ ${level.level_name}`,
                priority: level.level_name.toLowerCase().includes('advanced') ? 'medium' : 'high'
            });
        }
    });

    // Analyze improvement trends
    const trends = analyzeImprovementTrends(chronological);

    // Generate personalized recommendations
    const recommendations = generatePersonalizedRecommendations(strengths, weaknesses, trends, {
        overall_accuracy: parseFloat(overallAccuracy),
        avg_response_time: avgResponseTime,
        total_attempts: totalAttempts
    });

    // Peer comparison (if requested)
    let peerComparison = null;
    if (includeComparison) {
        peerComparison = await calculatePeerComparison(userId, overallAccuracy, loAnalysis);
    }

    return {
        overall: {
            total_attempts: totalAttempts,
            correct_attempts: correctAttempts,
            accuracy_rate: overallAccuracy,
            avg_response_time: avgResponseTime.toFixed(2),
            performance_grade: getPerformanceGrade(parseFloat(overallAccuracy))
        },
        strengthsWeaknesses: {
            strengths: strengths.slice(0, 5), // Top 5 strengths
            weaknesses: weaknesses.sort((a, b) => {
                const priorityOrder = { high: 3, medium: 2, low: 1 };
                return (priorityOrder[b.priority] || 1) - (priorityOrder[a.priority] || 1);
            }).slice(0, 5) // Top 5 weaknesses by priority
        },
        loAnalysis,
        chapterAnalysis,
        difficultyAnalysis,
        trends,
        recommendations,
        peerComparison
    };
};

const analyzeImprovementTrends = (chronologicalData) => {
    if (chronologicalData.length < 10) {
        return {
            trend: 'insufficient_data',
            message: 'Cần thêm dữ liệu để phân tích xu hướng'
        };
    }

    // Sort by date
    const sortedData = chronologicalData.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Split into time periods
    const midPoint = Math.floor(sortedData.length / 2);
    const earlierPeriod = sortedData.slice(0, midPoint);
    const laterPeriod = sortedData.slice(midPoint);

    const earlierAccuracy = earlierPeriod.filter(d => d.is_correct).length / earlierPeriod.length;
    const laterAccuracy = laterPeriod.filter(d => d.is_correct).length / laterPeriod.length;

    const earlierAvgTime = earlierPeriod.reduce((sum, d) => sum + (d.time_spent || 0), 0) / earlierPeriod.length;
    const laterAvgTime = laterPeriod.reduce((sum, d) => sum + (d.time_spent || 0), 0) / laterPeriod.length;

    let trend = 'stable';
    let message = 'Hiệu suất ổn định';

    if (laterAccuracy > earlierAccuracy * 1.1) {
        trend = 'improving';
        message = `Có tiến bộ rõ rệt - độ chính xác tăng từ ${(earlierAccuracy * 100).toFixed(1)}% lên ${(laterAccuracy * 100).toFixed(1)}%`;
    } else if (laterAccuracy < earlierAccuracy * 0.9) {
        trend = 'declining';
        message = `Cần chú ý - độ chính xác giảm từ ${(earlierAccuracy * 100).toFixed(1)}% xuống ${(laterAccuracy * 100).toFixed(1)}%`;
    }

    return {
        trend,
        message,
        accuracy_change: ((laterAccuracy - earlierAccuracy) * 100).toFixed(2),
        time_change: (laterAvgTime - earlierAvgTime).toFixed(2),
        earlier_period: {
            accuracy: (earlierAccuracy * 100).toFixed(2),
            avg_time: earlierAvgTime.toFixed(2)
        },
        later_period: {
            accuracy: (laterAccuracy * 100).toFixed(2),
            avg_time: laterAvgTime.toFixed(2)
        }
    };
};

const generatePersonalizedRecommendations = (strengths, weaknesses, trends, overallMetrics) => {
    const recommendations = [];

    // High priority recommendations based on weaknesses
    weaknesses.filter(w => w.priority === 'high').forEach(weakness => {
        if (weakness.type === 'learning_outcome') {
            recommendations.push({
                priority: 'high',
                category: 'learning_outcome',
                title: `Cải thiện ${weakness.name}`,
                description: `Tập trung ôn tập ${weakness.name} với độ chính xác hiện tại chỉ ${weakness.accuracy}%`,
                actions: [
                    'Xem lại lý thuyết cơ bản',
                    'Làm thêm bài tập thực hành',
                    'Tham khảo tài liệu bổ sung',
                    'Thảo luận với giảng viên'
                ],
                estimated_time: '2-3 tuần'
            });
        } else if (weakness.type === 'chapter') {
            recommendations.push({
                priority: 'high',
                category: 'chapter',
                title: `Ôn tập chương ${weakness.name}`,
                description: `Chương ${weakness.name} cần được ôn tập kỹ lưỡng`,
                actions: [
                    'Đọc lại giáo trình chương này',
                    'Làm bài tập cuối chương',
                    'Tìm hiểu các ví dụ thực tế',
                    'Tạo mind map cho chương'
                ],
                estimated_time: '1-2 tuần'
            });
        }
    });

    // Recommendations based on difficulty levels
    const difficultyWeaknesses = weaknesses.filter(w => w.type === 'difficulty_level');
    if (difficultyWeaknesses.length > 0) {
        recommendations.push({
            priority: 'medium',
            category: 'difficulty_progression',
            title: 'Cải thiện khả năng xử lý câu hỏi khó',
            description: 'Tăng cường luyện tập với các mức độ khó khác nhau',
            actions: [
                'Bắt đầu với câu hỏi dễ để xây dựng tự tin',
                'Dần dần tăng độ khó',
                'Phân tích kỹ các câu trả lời sai',
                'Học cách quản lý thời gian làm bài'
            ],
            estimated_time: '3-4 tuần'
        });
    }

    // Time-based recommendations
    if (overallMetrics.avg_response_time > 180) { // > 3 minutes average
        recommendations.push({
            priority: 'medium',
            category: 'time_management',
            title: 'Cải thiện tốc độ làm bài',
            description: `Thời gian trung bình ${overallMetrics.avg_response_time.toFixed(0)} giây/câu cần được cải thiện`,
            actions: [
                'Luyện tập làm bài trong thời gian giới hạn',
                'Học cách nhận diện nhanh dạng câu hỏi',
                'Tránh suy nghĩ quá lâu cho một câu',
                'Ôn tập để tăng độ tự tin'
            ],
            estimated_time: '2-3 tuần'
        });
    }

    // Trend-based recommendations
    if (trends.trend === 'declining') {
        recommendations.push({
            priority: 'high',
            category: 'performance_recovery',
            title: 'Khôi phục hiệu suất học tập',
            description: 'Hiệu suất đang có xu hướng giảm, cần can thiệp kịp thời',
            actions: [
                'Đánh giá lại phương pháp học tập',
                'Tăng thời gian ôn tập',
                'Tìm kiếm sự hỗ trợ từ giảng viên',
                'Kiểm tra và điều chỉnh lịch học'
            ],
            estimated_time: '1-2 tuần'
        });
    }

    // Positive reinforcement based on strengths
    if (strengths.length > 0) {
        const topStrength = strengths[0];
        recommendations.push({
            priority: 'low',
            category: 'strength_building',
            title: `Phát huy điểm mạnh: ${topStrength.name}`,
            description: `Tiếp tục duy trì và phát triển thế mạnh trong ${topStrength.name}`,
            actions: [
                'Chia sẻ kiến thức với bạn học',
                'Tham gia các dự án nâng cao',
                'Tìm hiểu sâu hơn về lĩnh vực này',
                'Làm mentor cho các bạn khác'
            ],
            estimated_time: 'Liên tục'
        });
    }

    return recommendations.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return (priorityOrder[b.priority] || 1) - (priorityOrder[a.priority] || 1);
    });
};

const calculatePeerComparison = async (userId, userAccuracy, userLOAnalysis) => {
    try {
        // Get average performance of all users (simplified)
        const peerData = await QuizResult.findAll({
            attributes: [
                [Sequelize.fn('AVG', Sequelize.col('score')), 'avg_score'],
                [Sequelize.fn('COUNT', Sequelize.col('result_id')), 'total_attempts']
            ],
            where: {
                user_id: { [Op.ne]: userId } // Exclude current user
            },
            raw: true
        });

        const peerAvgScore = parseFloat(peerData[0]?.avg_score || 0) * 10; // Convert to percentage
        const peerTotalAttempts = parseInt(peerData[0]?.total_attempts || 0);

        let comparison = 'average';
        let percentile = 50;

        if (parseFloat(userAccuracy) > peerAvgScore * 1.2) {
            comparison = 'above_average';
            percentile = 75;
        } else if (parseFloat(userAccuracy) > peerAvgScore * 1.1) {
            comparison = 'slightly_above_average';
            percentile = 65;
        } else if (parseFloat(userAccuracy) < peerAvgScore * 0.8) {
            comparison = 'below_average';
            percentile = 25;
        } else if (parseFloat(userAccuracy) < peerAvgScore * 0.9) {
            comparison = 'slightly_below_average';
            percentile = 35;
        }

        return {
            user_accuracy: userAccuracy,
            peer_average: peerAvgScore.toFixed(2),
            comparison,
            estimated_percentile: percentile,
            message: getComparisonMessage(comparison, userAccuracy, peerAvgScore.toFixed(2))
        };

    } catch (error) {
        console.error('Error calculating peer comparison:', error);
        return null;
    }
};

const getPerformanceGrade = (accuracy) => {
    if (accuracy >= 90) return 'A+';
    if (accuracy >= 85) return 'A';
    if (accuracy >= 80) return 'B+';
    if (accuracy >= 75) return 'B';
    if (accuracy >= 70) return 'C+';
    if (accuracy >= 65) return 'C';
    if (accuracy >= 60) return 'D+';
    if (accuracy >= 55) return 'D';
    return 'F';
};

const getComparisonMessage = (comparison, userAccuracy, peerAverage) => {
    switch (comparison) {
        case 'above_average':
            return `Xuất sắc! Bạn đang có kết quả tốt hơn đáng kể so với trung bình lớp (${userAccuracy}% vs ${peerAverage}%)`;
        case 'slightly_above_average':
            return `Tốt! Bạn đang có kết quả cao hơn trung bình lớp (${userAccuracy}% vs ${peerAverage}%)`;
        case 'average':
            return `Bạn đang có kết quả tương đương với trung bình lớp (${userAccuracy}% vs ${peerAverage}%)`;
        case 'slightly_below_average':
            return `Bạn đang có kết quả thấp hơn một chút so với trung bình lớp (${userAccuracy}% vs ${peerAverage}%)`;
        case 'below_average':
            return `Cần cải thiện! Bạn đang có kết quả thấp hơn trung bình lớp (${userAccuracy}% vs ${peerAverage}%)`;
        default:
            return `Kết quả của bạn: ${userAccuracy}%, trung bình lớp: ${peerAverage}%`;
    }
};

const generateLORecommendations = (loMasteryData, masteryThreshold) => {
    const recommendations = [];

    // Group by mastery level
    const needsImprovement = loMasteryData.filter(lo => lo.mastery_level === 'needs_improvement');
    const developing = loMasteryData.filter(lo => lo.mastery_level === 'developing');
    const notStarted = loMasteryData.filter(lo => lo.mastery_level === 'not_started');

    // High priority: LOs that need improvement
    needsImprovement.forEach(lo => {
        recommendations.push({
            priority: 'high',
            lo_id: lo.lo_id,
            lo_name: lo.lo_name,
            current_accuracy: (lo.accuracy_rate * 100).toFixed(2),
            target_accuracy: (masteryThreshold * 100).toFixed(0),
            recommendation: `Cần tập trung cải thiện ${lo.lo_name}`,
            specific_actions: [
                'Ôn tập lý thuyết cơ bản',
                'Làm thêm bài tập thực hành',
                'Tìm hiểu các ví dụ minh họa',
                'Thảo luận với giảng viên về những điểm chưa hiểu'
            ],
            difficulty_focus: Object.keys(lo.difficulty_distribution)
                .filter(level => lo.difficulty_distribution[level].accuracy < 0.5)
                .join(', ') || 'Tất cả các mức độ'
        });
    });

    // Medium priority: Developing LOs
    developing.forEach(lo => {
        recommendations.push({
            priority: 'medium',
            lo_id: lo.lo_id,
            lo_name: lo.lo_name,
            current_accuracy: (lo.accuracy_rate * 100).toFixed(2),
            target_accuracy: (masteryThreshold * 100).toFixed(0),
            recommendation: `Tiếp tục phát triển ${lo.lo_name} để đạt mức thành thạo`,
            specific_actions: [
                'Luyện tập thêm với các bài tập nâng cao',
                'Áp dụng kiến thức vào các tình huống thực tế',
                'Tự kiểm tra định kỳ',
                'Tham gia thảo luận nhóm'
            ]
        });
    });

    // Low priority: Not started LOs
    if (notStarted.length > 0) {
        recommendations.push({
            priority: 'low',
            recommendation: `Bắt đầu học ${notStarted.length} Learning Outcome(s) chưa được thực hành`,
            los_to_start: notStarted.map(lo => lo.lo_name).join(', '),
            specific_actions: [
                'Lập kế hoạch học tập cho các LO chưa bắt đầu',
                'Ưu tiên các LO cơ bản trước',
                'Tìm hiểu mối liên hệ giữa các LO',
                'Đặt mục tiêu cụ thể cho từng LO'
            ]
        });
    }

    return recommendations;
};

// Export functions
module.exports = {
    getPerformanceTimeSeries,
    getScoreDistribution,
    getLearningOutcomesComparison,
    getCompletionFunnel,
    getDifficultyHeatmap,
    getTimeScoreCorrelation,
    getActivityTimeline,
    getLearningFlow,
    getCompletionProbability,
    getRiskAssessment,
    getStudentScoreAnalysis,
    getLearningOutcomeMastery,
    getImprovementSuggestions,
    getQuizAnalytics,
    getStudentQuizPerformance,
    testLOChapterRelationship
};