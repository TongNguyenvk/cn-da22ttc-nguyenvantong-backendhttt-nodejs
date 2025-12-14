const {
    LO,
    PO,
    PLO,
    Chapter,
    Subject,
    Question,
    UserQuestionHistory,
    ProgramOutcomeTracking,
    Program,
    Course,
    User,
    Level,
    sequelize
} = require('../models');
const { Op } = require('sequelize');

// Dashboard tổng quan cho admin
exports.getAdminDashboard = async (req, res) => {
    try {
        const { program_id, time_period } = req.query;

        // Build base filters
        let programFilter = {};
        if (program_id) {
            programFilter.program_id = program_id;
        }

        // Get basic counts
        const totalPrograms = await Program.count();
        const totalSubjects = await Subject.count();
        const totalChapters = await Chapter.count();
        const totalLOs = await LO.count();
        const totalPOs = await PO.count(program_id ? { where: programFilter } : {});
        const totalPLOs = await PLO.count(program_id ? { where: programFilter } : {});
        const totalQuestions = await Question.count();
        const totalUsers = await User.count();

        // Get recent activity
        const recentQuizActivity = await UserQuestionHistory.count({
            where: {
                attempt_date: {
                    [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
                }
            }
        });

        // Get performance overview
        const performanceOverview = await getPerformanceOverview(program_id);

        // Get top performing LOs
        const topLOs = await getTopPerformingLOs(program_id, 5);

        // Get areas needing attention
        const areasNeedingAttention = await getAreasNeedingAttention(program_id, 5);

        res.json({
            success: true,
            data: {
                overview: {
                    total_programs: totalPrograms,
                    total_subjects: totalSubjects,
                    total_chapters: totalChapters,
                    total_los: totalLOs,
                    total_pos: totalPOs,
                    total_plos: totalPLOs,
                    total_questions: totalQuestions,
                    total_users: totalUsers,
                    recent_quiz_activity: recentQuizActivity
                },
                performance_overview: performanceOverview,
                top_performing_los: topLOs,
                areas_needing_attention: areasNeedingAttention,
                generated_at: new Date()
            }
        });

    } catch (error) {
        console.error('Error getting admin dashboard:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting admin dashboard',
            error: error.message
        });
    }
};

// Thống kê so sánh giữa LO/PO/PLO
exports.getComparativeStatistics = async (req, res) => {
    try {
        const { program_id, comparison_type = 'all' } = req.query;

        let results = {};

        if (comparison_type === 'all' || comparison_type === 'lo') {
            results.lo_comparison = await getLOComparison(program_id);
        }

        if (comparison_type === 'all' || comparison_type === 'po') {
            results.po_comparison = await getPOComparison(program_id);
        }

        if (comparison_type === 'all' || comparison_type === 'plo') {
            results.plo_comparison = await getPLOComparison(program_id);
        }

        res.json({
            success: true,
            data: {
                program_id: program_id ? parseInt(program_id) : null,
                comparison_type,
                results,
                generated_at: new Date()
            }
        });

    } catch (error) {
        console.error('Error getting comparative statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting comparative statistics',
            error: error.message
        });
    }
};

// Báo cáo xu hướng theo thời gian
exports.getTrendAnalysis = async (req, res) => {
    try {
        const { program_id, period = 'monthly', start_date, end_date } = req.query;

        // Build date filter
        let dateFilter = {};
        if (start_date && end_date) {
            dateFilter.attempt_date = {
                [Op.between]: [start_date, end_date]
            };
        } else {
            // Default to last 6 months
            dateFilter.attempt_date = {
                [Op.gte]: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000)
            };
        }

        // Get trend data based on period
        const trendData = await getTrendData(program_id, period, dateFilter);

        res.json({
            program_id: program_id ? parseInt(program_id) : null,
            period,
            date_range: {
                start_date: start_date || new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000).toISOString(),
                end_date: end_date || new Date().toISOString()
            },
            trend_data: trendData,
            generated_at: new Date()
        });

    } catch (error) {
        console.error('Error getting trend analysis:', error);
        res.status(500).json({ message: 'Error getting trend analysis', error: error.message });
    }
};

// Báo cáo hiệu suất chi tiết
exports.getDetailedPerformanceReport = async (req, res) => {
    try {
        const { program_id, subject_id, include_students = false } = req.query;

        // Get detailed performance data
        const performanceData = await getDetailedPerformanceData(program_id, subject_id);

        // Include student details if requested
        let studentDetails = null;
        if (include_students === 'true') {
            studentDetails = await getStudentPerformanceDetails(program_id, subject_id);
        }

        res.json({
            success: true,
            data: {
                program_id: program_id ? parseInt(program_id) : null,
                subject_id: subject_id ? parseInt(subject_id) : null,
                performance_data: performanceData,
                student_details: studentDetails,
                generated_at: new Date()
            }
        });

    } catch (error) {
        console.error('Error getting detailed performance report:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting detailed performance report',
            error: error.message
        });
    }
};

// Helper functions
const getPerformanceOverview = async (program_id) => {
    try {
        // Get overall accuracy rate
        const questionHistory = await UserQuestionHistory.findAll({
            include: [{
                model: Question,
                as: 'Question',
                include: [{
                    model: LO,
                    as: 'LO'
                }]
            }],
            attributes: ['is_correct']
        });

        const totalAttempts = questionHistory.length;
        const correctAttempts = questionHistory.filter(h => h.is_correct).length;
        const overallAccuracy = totalAttempts > 0 ? ((correctAttempts / totalAttempts) * 100).toFixed(2) : 0;

        // Get PO/PLO achievement rates
        let poAchievementRate = 0;
        let ploAchievementRate = 0;

        if (program_id) {
            const poTracking = await ProgramOutcomeTracking.findAll({
                where: { program_id, outcome_type: 'PO', is_active: true }
            });
            const achievedPOs = poTracking.filter(t => t.achievement_status === 'achieved' || t.achievement_status === 'exceeded').length;
            poAchievementRate = poTracking.length > 0 ? ((achievedPOs / poTracking.length) * 100).toFixed(2) : 0;

            const ploTracking = await ProgramOutcomeTracking.findAll({
                where: { program_id, outcome_type: 'PLO', is_active: true }
            });
            const achievedPLOs = ploTracking.filter(t => t.achievement_status === 'achieved' || t.achievement_status === 'exceeded').length;
            ploAchievementRate = ploTracking.length > 0 ? ((achievedPLOs / ploTracking.length) * 100).toFixed(2) : 0;
        }

        return {
            overall_accuracy: parseFloat(overallAccuracy),
            po_achievement_rate: parseFloat(poAchievementRate),
            plo_achievement_rate: parseFloat(ploAchievementRate),
            total_attempts: totalAttempts
        };

    } catch (error) {
        console.error('Error getting performance overview:', error);
        return {
            overall_accuracy: 0,
            po_achievement_rate: 0,
            plo_achievement_rate: 0,
            total_attempts: 0
        };
    }
};

const getTopPerformingLOs = async (program_id, limit = 5) => {
    try {
        const loPerformance = await UserQuestionHistory.findAll({
            include: [{
                model: Question,
                as: 'Question',
                include: [{
                    model: LO,
                    as: 'LO',
                    attributes: ['lo_id', 'name']
                }]
            }],
            attributes: ['is_correct']
        });

        // Group by LO and calculate accuracy
        const loStats = {};
        loPerformance.forEach(history => {
            const lo = history.Question?.LO;
            if (!lo) return;

            if (!loStats[lo.lo_id]) {
                loStats[lo.lo_id] = {
                    lo_id: lo.lo_id,
                    name: lo.name,
                    total_attempts: 0,
                    correct_attempts: 0
                };
            }

            loStats[lo.lo_id].total_attempts++;
            if (history.is_correct) {
                loStats[lo.lo_id].correct_attempts++;
            }
        });

        // Calculate accuracy and sort
        const results = Object.values(loStats)
            .map(stat => ({
                ...stat,
                accuracy_rate: stat.total_attempts > 0 ?
                    ((stat.correct_attempts / stat.total_attempts) * 100).toFixed(2) : 0
            }))
            .sort((a, b) => parseFloat(b.accuracy_rate) - parseFloat(a.accuracy_rate))
            .slice(0, limit);

        return results;

    } catch (error) {
        console.error('Error getting top performing LOs:', error);
        return [];
    }
};

const getAreasNeedingAttention = async (program_id, limit = 5) => {
    try {
        const loPerformance = await UserQuestionHistory.findAll({
            include: [{
                model: Question,
                as: 'Question',
                include: [{
                    model: LO,
                    as: 'LO',
                    attributes: ['lo_id', 'name']
                }]
            }],
            attributes: ['is_correct']
        });

        // Group by LO and calculate accuracy
        const loStats = {};
        loPerformance.forEach(history => {
            const lo = history.Question?.LO;
            if (!lo) return;

            if (!loStats[lo.lo_id]) {
                loStats[lo.lo_id] = {
                    lo_id: lo.lo_id,
                    name: lo.name,
                    total_attempts: 0,
                    correct_attempts: 0
                };
            }

            loStats[lo.lo_id].total_attempts++;
            if (history.is_correct) {
                loStats[lo.lo_id].correct_attempts++;
            }
        });

        // Calculate accuracy and sort (lowest first)
        const results = Object.values(loStats)
            .filter(stat => stat.total_attempts >= 10) // Only include LOs with sufficient data
            .map(stat => ({
                ...stat,
                accuracy_rate: stat.total_attempts > 0 ?
                    ((stat.correct_attempts / stat.total_attempts) * 100).toFixed(2) : 0
            }))
            .sort((a, b) => parseFloat(a.accuracy_rate) - parseFloat(b.accuracy_rate))
            .slice(0, limit);

        return results;

    } catch (error) {
        console.error('Error getting areas needing attention:', error);
        return [];
    }
};

// Additional helper functions for comparative statistics
const getLOComparison = async (program_id) => {
    // Implementation for LO comparison
    return { message: 'LO comparison data' };
};

const getPOComparison = async (program_id) => {
    // Implementation for PO comparison
    return { message: 'PO comparison data' };
};

const getPLOComparison = async (program_id) => {
    // Implementation for PLO comparison
    return { message: 'PLO comparison data' };
};

const getTrendData = async (program_id, period, dateFilter) => {
    // Implementation for trend data
    return { message: 'Trend data' };
};

const getDetailedPerformanceData = async (program_id, subject_id) => {
    // Implementation for detailed performance data
    return { message: 'Detailed performance data' };
};

const getStudentPerformanceDetails = async (program_id, subject_id) => {
    // Implementation for student performance details
    return { message: 'Student performance details' };
};
