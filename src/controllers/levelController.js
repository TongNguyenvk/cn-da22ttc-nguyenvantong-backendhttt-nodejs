const { Level, Question, UserQuestionHistory, LO } = require('../models');
const { Op } = require('sequelize');

exports.getAllLevels = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const levels = await Level.findAndCountAll({
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [{ model: Question, attributes: ['question_id', 'question_text'] }],
        });

        res.status(200).json({
            success: true,
            data: {
                totalItems: levels.count,
                totalPages: Math.ceil(levels.count / limit),
                currentPage: parseInt(page),
                levels: levels.rows,
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách Level',
            error: error.message
        });
    }
};

exports.getLevelById = async (req, res) => {
    try {
        const level = await Level.findByPk(req.params.id, {
            include: [{ model: Question, attributes: ['question_id', 'question_text'] }],
        });

        if (!level) return res.status(404).json({ message: 'Level không tồn tại' });
        res.status(200).json(level);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi lấy thông tin Level', error: error.message });
    }
};

exports.createLevel = async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'Tên Level là bắt buộc' });
        }

        const newLevel = await Level.create({ name });
        res.status(201).json(newLevel);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi tạo Level', error: error.message });
    }
};

exports.updateLevel = async (req, res) => {
    try {
        const { name } = req.body;

        const level = await Level.findByPk(req.params.id);
        if (!level) return res.status(404).json({ message: 'Level không tồn tại' });

        await level.update({ name: name || level.name });
        res.status(200).json(level);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi cập nhật Level', error: error.message });
    }
};

exports.deleteLevel = async (req, res) => {
    const { sequelize } = require('../models');
    const transaction = await sequelize.transaction();
    
    try {
        const levelId = req.params.id;
        const level = await Level.findByPk(levelId);
        
        if (!level) {
            await transaction.rollback();
            return res.status(404).json({ 
                success: false,
                message: 'Level không tồn tại' 
            });
        }

        // Kiểm tra xem Level có đang được sử dụng trong Questions không
        const { Question } = require('../models');
        const questionsCount = await Question.count({
            where: { level_id: levelId },
            transaction
        });

        if (questionsCount > 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `Không thể xóa Level vì còn ${questionsCount} câu hỏi đang sử dụng level này. Vui lòng cập nhật level của các câu hỏi trước.`
            });
        }

        await level.destroy({ transaction });
        await transaction.commit();
        
        res.status(200).json({ 
            success: true,
            message: 'Xóa Level thành công' 
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error deleting level:', error);
        res.status(500).json({ 
            success: false,
            message: 'Lỗi khi xóa Level', 
            error: error.message 
        });
    }
};

// =====================================================
// ADMIN STATISTICS FUNCTIONS
// =====================================================

// Get level statistics
exports.getLevelStatistics = async (req, res) => {
    try {
        const { program_id } = req.query;

        // Get all levels with question counts
        const levels = await Level.findAll({
            include: [{
                model: Question,
                attributes: ['question_id'],
                required: false
            }],
            attributes: ['level_id', 'name']
        });

        // Calculate statistics for each level
        const levelStats = await Promise.all(levels.map(async (level) => {
            const questionCount = level.Questions.length;

            // Get performance data for this level
            const performanceData = await UserQuestionHistory.findAll({
                include: [{
                    model: Question,
                    as: 'Question',
                    where: { level_id: level.level_id },
                    attributes: ['question_id']
                }],
                attributes: ['is_correct', 'time_spent']
            });

            const totalAttempts = performanceData.length;
            const correctAttempts = performanceData.filter(h => h.is_correct).length;
            const accuracyRate = totalAttempts > 0 ? ((correctAttempts / totalAttempts) * 100).toFixed(2) : 0;

            const avgTime = totalAttempts > 0 ?
                performanceData.reduce((sum, h) => sum + (h.time_spent || 0), 0) / totalAttempts : 0;

            return {
                level_id: level.level_id,
                name: level.name,
                question_count: questionCount,
                total_attempts: totalAttempts,
                accuracy_rate: parseFloat(accuracyRate),
                average_time: Math.round(avgTime)
            };
        }));

        // Overall statistics
        const totalQuestions = levelStats.reduce((sum, stat) => sum + stat.question_count, 0);
        const totalAttempts = levelStats.reduce((sum, stat) => sum + stat.total_attempts, 0);
        const overallAccuracy = levelStats.length > 0 ?
            (levelStats.reduce((sum, stat) => sum + stat.accuracy_rate, 0) / levelStats.length).toFixed(2) : 0;

        res.json({
            success: true,
            data: {
                overview: {
                    total_levels: levels.length,
                    total_questions: totalQuestions,
                    total_attempts: totalAttempts,
                    overall_accuracy: parseFloat(overallAccuracy)
                },
                level_statistics: levelStats,
                generated_at: new Date()
            }
        });

    } catch (error) {
        console.error('Error getting level statistics:', error);
        res.status(500).json({ message: 'Error getting level statistics', error: error.message });
    }
};

// Get difficulty analysis
exports.getDifficultyAnalysis = async (req, res) => {
    try {
        const { program_id, time_period } = req.query;

        // Build date filter if provided
        let dateFilter = {};
        if (time_period && time_period.start_date && time_period.end_date) {
            dateFilter.attempt_date = {
                [Op.between]: [time_period.start_date, time_period.end_date]
            };
        }

        // Get performance data by difficulty level
        const difficultyAnalysis = await UserQuestionHistory.findAll({
            where: dateFilter,
            include: [{
                model: Question,
                as: 'Question',
                include: [{
                    model: Level,
                    as: 'Level',
                    attributes: ['level_id', 'name']
                }, {
                    model: LO,
                    as: 'LO',
                    attributes: ['lo_id', 'name']
                }],
                attributes: ['question_id', 'level_id', 'lo_id']
            }],
            attributes: ['is_correct', 'time_spent', 'user_id']
        });

        // Group by difficulty level
        const difficultyStats = {};

        difficultyAnalysis.forEach(history => {
            const level = history.Question?.Level;
            if (!level) return;

            const levelName = level.name.toLowerCase();
            if (!difficultyStats[levelName]) {
                difficultyStats[levelName] = {
                    level_name: level.name,
                    total_attempts: 0,
                    correct_attempts: 0,
                    unique_students: new Set(),
                    total_time: 0,
                    lo_breakdown: {}
                };
            }

            const stats = difficultyStats[levelName];
            stats.total_attempts++;
            stats.unique_students.add(history.user_id);

            if (history.is_correct) {
                stats.correct_attempts++;
            }

            if (history.time_spent) {
                stats.total_time += history.time_spent;
            }

            // Track LO performance within this difficulty level
            const lo = history.Question.LO;
            if (lo) {
                if (!stats.lo_breakdown[lo.lo_id]) {
                    stats.lo_breakdown[lo.lo_id] = {
                        lo_name: lo.name,
                        attempts: 0,
                        correct: 0
                    };
                }
                stats.lo_breakdown[lo.lo_id].attempts++;
                if (history.is_correct) {
                    stats.lo_breakdown[lo.lo_id].correct++;
                }
            }
        });

        // Calculate final metrics
        const results = Object.keys(difficultyStats).map(levelName => {
            const stats = difficultyStats[levelName];
            return {
                level_name: stats.level_name,
                performance_metrics: {
                    total_attempts: stats.total_attempts,
                    unique_students: stats.unique_students.size,
                    accuracy_rate: stats.total_attempts > 0 ?
                        ((stats.correct_attempts / stats.total_attempts) * 100).toFixed(2) : 0,
                    average_time: stats.total_attempts > 0 ?
                        Math.round(stats.total_time / stats.total_attempts) : 0
                },
                lo_breakdown: Object.values(stats.lo_breakdown).map(lo => ({
                    ...lo,
                    accuracy_rate: lo.attempts > 0 ? ((lo.correct / lo.attempts) * 100).toFixed(2) : 0
                }))
            };
        });

        // Sort by difficulty (assuming easy, medium, hard order)
        const difficultyOrder = ['easy', 'medium', 'hard'];
        results.sort((a, b) => {
            const aIndex = difficultyOrder.indexOf(a.level_name.toLowerCase());
            const bIndex = difficultyOrder.indexOf(b.level_name.toLowerCase());
            return aIndex - bIndex;
        });

        res.json({
            difficulty_analysis: results,
            summary: {
                total_levels_analyzed: results.length,
                easiest_level: results.length > 0 ?
                    results.reduce((max, level) =>
                        parseFloat(level.performance_metrics.accuracy_rate) > parseFloat(max.performance_metrics.accuracy_rate) ? level : max
                    ) : null,
                hardest_level: results.length > 0 ?
                    results.reduce((min, level) =>
                        parseFloat(level.performance_metrics.accuracy_rate) < parseFloat(min.performance_metrics.accuracy_rate) ? level : min
                    ) : null
            },
            generated_at: new Date()
        });

    } catch (error) {
        console.error('Error getting difficulty analysis:', error);
        res.status(500).json({ message: 'Error getting difficulty analysis', error: error.message });
    }
};