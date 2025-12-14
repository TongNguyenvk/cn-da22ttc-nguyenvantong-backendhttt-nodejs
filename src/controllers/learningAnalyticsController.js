const {
    LearningAnalytics,
    StudentProgramProgress,
    SubjectOutcomeAnalysis,
    ProgramOutcomeTracking,
    Program,
    Subject,
    User,
    PO,
    PLO,
    QuizResult,
    UserQuestionHistory,
    Question,
    LO,
    Level,
    Quiz,
    Course,
    Chapter,
    ChapterLO
} = require('../models');
const { Op, sequelize } = require('sequelize');

// Helper: select first attempt per user per question
const selectFirstAttempts = (histories) => {
    if (!Array.isArray(histories) || histories.length === 0) return [];
    const sorted = histories.slice().sort((a, b) => {
        const da = new Date(a.attempt_date || a.createdAt || 0).getTime();
        const db = new Date(b.attempt_date || b.createdAt || 0).getTime();
        return da - db;
    });
    const seen = new Set();
    const result = [];
    for (const h of sorted) {
        const key = `${h.user_id}:${h.question_id}`;
        if (!seen.has(key)) {
            seen.add(key);
            result.push(h);
        }
    }
    return result;
};

// Tạo phân tích tổng quan chương trình
const createProgramAnalysis = async (req, res) => {
    try {
        const { program_id, time_period, analysis_config } = req.body;
        const user_id = req.user.user_id;

        // Validate program exists
        const program = await Program.findByPk(program_id);
        if (!program) {
            return res.status(404).json({ error: 'Program not found' });
        }

        // Tạo phân tích mới
        const analytics = await LearningAnalytics.create({
            program_id,
            analysis_type: 'program_overview',
            time_period: time_period || {},
            analysis_config: analysis_config || {},
            created_by: user_id,
            analysis_status: 'processing'
        });

        // Bắt đầu xử lý phân tích (async)
        processProgramAnalysis(analytics.analytics_id);

        res.status(201).json({
            message: 'Program analysis started',
            analytics_id: analytics.analytics_id,
            status: 'processing'
        });

    } catch (error) {
        console.error('Error creating program analysis:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Xử lý phân tích chương trình (background process)
const processProgramAnalysis = async (analytics_id) => {
    try {
        const startTime = Date.now();
        const analytics = await LearningAnalytics.findByPk(analytics_id);

        if (!analytics) return;

        const program_id = analytics.program_id;

        // 1. Lấy dữ liệu tổng quan
        const overviewMetrics = await calculateOverviewMetrics(program_id, analytics.time_period);

        // 2. Phân tích PO/PLO
        const outcomeAnalysis = await calculateOutcomeAnalysis(program_id, analytics.time_period);

        // 3. Phân tích LO performance
        const loPerformance = await calculateLOPerformance(program_id, analytics.time_period);

        // 4. Phân tích độ khó
        const difficultyDistribution = await calculateDifficultyDistribution(program_id, analytics.time_period);

        // 5. Phân tích xu hướng thời gian
        const temporalTrends = await calculateTemporalTrends(program_id, analytics.time_period);

        // 6. Phân nhóm sinh viên
        const studentSegmentation = await calculateStudentSegmentation(program_id, analytics.time_period);

        // Cập nhật kết quả
        await analytics.update({
            overview_metrics: overviewMetrics,
            outcome_analysis: outcomeAnalysis,
            lo_performance: loPerformance,
            difficulty_distribution: difficultyDistribution,
            temporal_trends: temporalTrends,
            student_segmentation: studentSegmentation,
            analysis_status: 'completed',
            processing_time: Date.now() - startTime
        });

    } catch (error) {
        console.error('Error processing program analysis:', error);
        await LearningAnalytics.update(
            { analysis_status: 'error' },
            { where: { analytics_id } }
        );
    }
};

// Tính toán metrics tổng quan
const calculateOverviewMetrics = async (program_id, time_period) => {
    // Lấy tất cả sinh viên trong chương trình
    const students = await User.findAll({
        include: [{
            model: StudentProgramProgress,
            as: 'StudentProgramProgress',
            where: { program_id }
        }]
    });

    // Lấy tất cả kết quả quiz trong khoảng thời gian
    const whereClause = {};
    if (time_period.start_date && time_period.end_date) {
        whereClause.createdAt = {
            [Op.between]: [time_period.start_date, time_period.end_date]
        };
    }

    const quizResults = await QuizResult.findAll({
        include: [{
            model: Quiz,
            include: [{
                model: Subject,
                include: [{
                    model: Course,
                    where: { program_id }
                }]
            }]
        }],
        where: whereClause
    });

    const totalAssessments = quizResults.length;
    const averagePerformance = totalAssessments > 0
        ? quizResults.reduce((sum, result) => sum + result.score, 0) / totalAssessments
        : 0;

    return {
        total_students: students.length,
        total_assessments: totalAssessments,
        average_performance: Math.round(averagePerformance * 100) / 100,
        completion_rate: calculateCompletionRate(students),
        engagement_score: calculateEngagementScore(students, quizResults)
    };
};

// Tính toán phân tích outcome
const calculateOutcomeAnalysis = async (program_id, time_period) => {
    const outcomeTracking = await ProgramOutcomeTracking.findAll({
        where: { program_id, is_active: true },
        include: [{
            model: PO,
            as: 'PO'
        }, {
            model: PLO,
            as: 'PLO'
        }]
    });

    const analysis = {};

    // Group by outcome type
    const poTracking = outcomeTracking.filter(t => t.outcome_type === 'PO');
    const ploTracking = outcomeTracking.filter(t => t.outcome_type === 'PLO');

    // Analyze PO achievement
    analysis.po_analysis = {};
    poTracking.forEach(tracking => {
        const po_id = tracking.po_id;
        if (!analysis.po_analysis[po_id]) {
            analysis.po_analysis[po_id] = {
                name: tracking.PO?.name || '',
                students_count: 0,
                average_score: 0,
                achievement_rate: 0,
                scores: []
            };
        }
        analysis.po_analysis[po_id].students_count++;
        analysis.po_analysis[po_id].scores.push(tracking.current_score);
    });

    // Calculate averages for PO
    Object.keys(analysis.po_analysis).forEach(po_id => {
        const data = analysis.po_analysis[po_id];
        data.average_score = data.scores.reduce((sum, score) => sum + score, 0) / data.scores.length;
        data.achievement_rate = (data.scores.filter(score => score >= 70).length / data.scores.length) * 100;
        delete data.scores; // Remove raw scores from response
    });

    return analysis;
};

// Tính toán LO performance
const calculateLOPerformance = async (program_id, time_period) => {
    const whereClause = {};
    if (time_period.start_date && time_period.end_date) {
        whereClause.attempt_date = {
            [Op.between]: [time_period.start_date, time_period.end_date]
        };
    }

    const questionHistory = await UserQuestionHistory.findAll({
        where: whereClause,
        include: [{
            model: Question,
            as: 'Question',
            include: [{
                model: LO,
                as: 'LO'
            }, {
                model: Level,
                as: 'Level'
            }]
        }, {
            model: Quiz,
            as: 'Quiz',
            include: [{
                model: Subject,
                include: [{
                    model: Course,
                    where: { program_id }
                }]
            }]
        }]
    });

    // Normalize to first attempt per user per question
    const firstAttempts = selectFirstAttempts(questionHistory);

    const loPerformance = {};

    firstAttempts.forEach(history => {
        const lo_id = history.Question?.lo_id;
        if (!lo_id) return;

        if (!loPerformance[lo_id]) {
            loPerformance[lo_id] = {
                name: history.Question.LO?.name || '',
                total_attempts: 0,
                correct_attempts: 0,
                accuracy_rate: 0,
                average_time: 0,
                difficulty_distribution: { easy: 0, medium: 0, hard: 0 }
            };
        }

        loPerformance[lo_id].total_attempts++;
        if (history.is_correct) {
            loPerformance[lo_id].correct_attempts++;
        }

        // Add time if available
        if (history.time_spent) {
            loPerformance[lo_id].average_time += history.time_spent;
        }

        // Track difficulty
        const difficulty = history.Question.Level?.name?.toLowerCase() || 'medium';
        if (loPerformance[lo_id].difficulty_distribution[difficulty] !== undefined) {
            loPerformance[lo_id].difficulty_distribution[difficulty]++;
        }
    });

    // Calculate final metrics
    Object.keys(loPerformance).forEach(lo_id => {
        const data = loPerformance[lo_id];
        data.accuracy_rate = data.total_attempts > 0 ? (data.correct_attempts / data.total_attempts) * 100 : 0;
        data.average_time = data.total_attempts > 0 ? data.average_time / data.total_attempts : 0;
    });

    return loPerformance;
};

// Lấy danh sách sinh viên theo tiến độ
const getStudentsByProgress = async (req, res) => {
    try {
        const { program_id } = req.params;
        const { status, page = 1, limit = 20 } = req.query;

        const whereClause = { program_id };
        if (status) {
            whereClause.student_status = status;
        }

        const offset = (page - 1) * limit;

        const result = await StudentProgramProgress.findAndCountAll({
            where: whereClause,
            include: [{
                model: User,
                as: 'Student',
                attributes: ['user_id', 'name', 'email']
            }, {
                model: Program,
                as: 'Program',
                attributes: ['program_id', 'name']
            }],
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['last_updated', 'DESC']]
        });

        res.json({
            success: true,
            data: {
                students: result.rows,
                pagination: {
                    total: result.count,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total_pages: Math.ceil(result.count / limit)
                }
            }
        });

    } catch (error) {
        console.error('Error getting students by progress:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

// Lấy phân tích chi tiết một sinh viên
const getStudentDetailedAnalysis = async (req, res) => {
    try {
        const { user_id, program_id } = req.params;

        // Lấy tiến độ tổng thể
        const progress = await StudentProgramProgress.findOne({
            where: { user_id, program_id },
            include: [{
                model: User,
                as: 'Student',
                attributes: ['user_id', 'name', 'email']
            }, {
                model: Program,
                as: 'Program',
                attributes: ['program_id', 'name']
            }]
        });

        if (!progress) {
            return res.status(404).json({ error: 'Student progress not found' });
        }

        // Lấy tracking PO/PLO
        const outcomeTracking = await ProgramOutcomeTracking.findAll({
            where: { user_id, program_id, is_active: true },
            include: [{
                model: PO,
                as: 'PO',
                attributes: ['po_id', 'name', 'description']
            }, {
                model: PLO,
                as: 'PLO',
                attributes: ['plo_id', 'description']
            }]
        });

        res.json({
            success: true,
            data: {
                student_progress: progress,
                outcome_tracking: outcomeTracking,
                analysis_summary: {
                    overall_performance: calculateOverallPerformance(progress),
                    strengths: progress.strengths_weaknesses.strong_areas,
                    areas_for_improvement: progress.strengths_weaknesses.weak_areas,
                    recommendations: progress.predictions.recommended_actions
                }
            }
        });

    } catch (error) {
        console.error('Error getting student detailed analysis:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Tính toán phân phối độ khó
const calculateDifficultyDistribution = async (program_id, time_period) => {
    const whereClause = {};
    if (time_period.start_date && time_period.end_date) {
        whereClause.attempt_date = {
            [Op.between]: [time_period.start_date, time_period.end_date]
        };
    }

    const questionHistory = await UserQuestionHistory.findAll({
        where: whereClause,
        include: [{
            model: Question,
            as: 'Question',
            include: [{
                model: Level,
                as: 'Level'
            }]
        }, {
            model: Quiz,
            as: 'Quiz',
            include: [{
                model: Subject,
                include: [{
                    model: Course,
                    where: { program_id }
                }]
            }]
        }]
    });

    // Normalize to first attempt per user per question
    const firstAttempts = selectFirstAttempts(questionHistory);

    const distribution = {
        easy: { count: 0, avg_score: 0, pass_rate: 0, total_score: 0, correct_count: 0 },
        medium: { count: 0, avg_score: 0, pass_rate: 0, total_score: 0, correct_count: 0 },
        hard: { count: 0, avg_score: 0, pass_rate: 0, total_score: 0, correct_count: 0 }
    };

    firstAttempts.forEach(history => {
        const difficulty = history.Question?.Level?.name?.toLowerCase() || 'medium';
        if (distribution[difficulty]) {
            distribution[difficulty].count++;
            if (history.is_correct) {
                distribution[difficulty].correct_count++;
                distribution[difficulty].total_score += 100; // Assuming 100 for correct answer
            }
        }
    });

    // Calculate final metrics
    Object.keys(distribution).forEach(level => {
        const data = distribution[level];
        if (data.count > 0) {
            data.avg_score = data.total_score / data.count;
            data.pass_rate = (data.correct_count / data.count) * 100;
        }
        delete data.total_score;
        delete data.correct_count;
    });

    return distribution;
};

// Tính toán xu hướng thời gian
const calculateTemporalTrends = async (program_id, time_period) => {
    // Simplified temporal analysis - can be expanded
    const trends = {
        weekly: {},
        monthly: {},
        semester: {}
    };

    // This would require more complex date grouping queries
    // For now, return empty structure
    return trends;
};

// Phân nhóm sinh viên
const calculateStudentSegmentation = async (program_id, time_period) => {
    const students = await StudentProgramProgress.findAll({
        where: { program_id },
        include: [{
            model: User,
            as: 'Student'
        }]
    });

    const segmentation = {
        high_performers: { count: 0, characteristics: [] },
        average_performers: { count: 0, characteristics: [] },
        at_risk_students: { count: 0, characteristics: [] },
        improvement_needed: { count: 0, characteristics: [] }
    };

    students.forEach(progress => {
        const gpa = progress.overall_progress.gpa || 0;
        const completionRate = progress.overall_progress.completion_percentage || 0;

        if (gpa >= 3.5 && completionRate >= 80) {
            segmentation.high_performers.count++;
        } else if (gpa >= 2.5 && completionRate >= 60) {
            segmentation.average_performers.count++;
        } else if (gpa < 2.0 || completionRate < 40) {
            segmentation.at_risk_students.count++;
        } else {
            segmentation.improvement_needed.count++;
        }
    });

    return segmentation;
};

// Helper functions
const getCourseIdsByProgram = async (program_id) => {
    const courses = await Course.findAll({
        where: { program_id },
        attributes: ['course_id']
    });
    return courses.map(course => course.course_id);
};

const calculateCompletionRate = (students) => {
    if (students.length === 0) return 0;
    const completedStudents = students.filter(student =>
        student.StudentProgramProgress &&
        student.StudentProgramProgress.student_status === 'graduated'
    ).length;
    return Math.round((completedStudents / students.length) * 100);
};

const calculateEngagementScore = (students, quizResults) => {
    // Simplified engagement calculation
    if (students.length === 0) return 0;
    const avgQuizzesPerStudent = quizResults.length / students.length;
    return Math.min(Math.round(avgQuizzesPerStudent * 10), 100);
};

const calculateOverallPerformance = (progress) => {
    return {
        gpa: progress.overall_progress.gpa,
        completion_percentage: progress.overall_progress.completion_percentage,
        credits_ratio: progress.overall_progress.credits_earned / progress.overall_progress.total_credits_required
    };
};

module.exports = {
    createProgramAnalysis,
    getStudentsByProgress,
    getStudentDetailedAnalysis,
    
    // NEW METHODS for missing endpoints
    async getOutcomesProgress(req, res) {
        try {
            const { course_id, program_id } = req.query;
            
            let whereClause = {};
            if (course_id) {
                whereClause.course_id = course_id;
            }
            
            // Get Learning Outcomes progress
            const progress = await LO.findAll({
                include: [
                    {
                        model: ChapterLO,
                        as: 'ChapterLOs',
                        include: [
                            {
                                model: Chapter,
                                as: 'Chapter',
                                where: whereClause,
                                include: [
                                    {
                                        model: Course,
                                        as: 'Course',
                                        attributes: ['course_id', 'name']
                                    }
                                ]
                            }
                        ]
                    }
                ],
                attributes: ['lo_id', 'name', 'description']
            });

            const progressData = progress.map(lo => ({
                lo_id: lo.lo_id,
                lo_name: lo.name,
                description: lo.description,
                completion_rate: Math.random() * 100, // Mock data
                mastery_level: ['Beginner', 'Intermediate', 'Advanced'][Math.floor(Math.random() * 3)],
                students_completed: Math.floor(Math.random() * 50),
                avg_performance: (Math.random() * 40 + 60).toFixed(2) // 60-100 range
            }));

            res.json({
                success: true,
                data: {
                    outcomes_progress: progressData,
                    summary: {
                        total_outcomes: progressData.length,
                        avg_completion_rate: (progressData.reduce((sum, lo) => sum + lo.completion_rate, 0) / progressData.length).toFixed(2),
                        course_id: course_id || 'all'
                    }
                }
            });
        } catch (error) {
            console.error('Outcomes progress error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    },

    async getOutcomesEffectiveness(req, res) {
        try {
            const { course_id } = req.query;
            
            // Mock effectiveness data
            const effectiveness = [
                {
                    lo_id: 1,
                    lo_name: 'Problem Solving',
                    effectiveness_score: 85.5,
                    improvement_rate: 12.3,
                    teaching_methods: ['Hands-on exercises', 'Case studies'],
                    student_feedback: 4.2,
                    assessment_accuracy: 88.7
                },
                {
                    lo_id: 2,
                    lo_name: 'Critical Thinking',
                    effectiveness_score: 78.9,
                    improvement_rate: 8.7,
                    teaching_methods: ['Group discussions', 'Analysis tasks'],
                    student_feedback: 3.9,
                    assessment_accuracy: 82.1
                }
            ];

            res.json({
                success: true,
                data: {
                    effectiveness_analysis: effectiveness,
                    recommendations: [
                        'Increase hands-on exercises for better engagement',
                        'Implement peer review sessions',
                        'Add more real-world case studies'
                    ],
                    course_id: course_id || 'all'
                }
            });
        } catch (error) {
            console.error('Outcomes effectiveness error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    },

    async getQuizPerformanceTrend(req, res) {
        try {
            const { course_id, time_period = '30d' } = req.query;
            
            const days = parseInt(time_period.replace('d', '')) || 30;
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - days);

            let whereClause = {
                update_time: {
                    [Op.between]: [startDate, endDate]
                }
            };

            if (course_id) {
                whereClause['$Quiz.course_id$'] = course_id;
            }

            const trendData = await QuizResult.findAll({
                attributes: [
                    [sequelize.fn('DATE', sequelize.col('QuizResult.update_time')), 'date'],
                    [sequelize.fn('AVG', sequelize.col('QuizResult.score')), 'avg_score'],
                    [sequelize.fn('COUNT', sequelize.col('QuizResult.quiz_result_id')), 'quiz_count']
                ],
                where: whereClause,
                include: [
                    {
                        model: Quiz,
                        as: 'Quiz',
                        attributes: []
                    }
                ],
                group: [sequelize.fn('DATE', sequelize.col('QuizResult.update_time'))],
                order: [[sequelize.fn('DATE', sequelize.col('QuizResult.update_time')), 'ASC']],
                raw: true
            });

            const formattedTrend = trendData.map(item => ({
                date: item.date,
                avg_score: parseFloat(item.avg_score).toFixed(2),
                quiz_count: parseInt(item.quiz_count),
                performance_trend: parseFloat(item.avg_score) > 75 ? 'High' : parseFloat(item.avg_score) > 60 ? 'Medium' : 'Low'
            }));

            res.json({
                success: true,
                data: {
                    trend_data: formattedTrend,
                    analysis: {
                        time_period: `${days} days`,
                        total_data_points: formattedTrend.length,
                        avg_performance: (formattedTrend.reduce((sum, day) => sum + parseFloat(day.avg_score), 0) / formattedTrend.length).toFixed(2),
                        trend_direction: formattedTrend.length > 1 ? 
                            (parseFloat(formattedTrend[formattedTrend.length - 1].avg_score) > parseFloat(formattedTrend[0].avg_score) ? 'Improving' : 'Declining') 
                            : 'Stable'
                    }
                }
            });
        } catch (error) {
            console.error('Quiz performance trend error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    },

    async getQuizPerformanceComparison(req, res) {
        try {
            const { course_id, quiz_ids, comparison_type = 'difficulty' } = req.query;
            
            let whereClause = {};
            if (course_id) {
                whereClause.course_id = course_id;
            }
            if (quiz_ids) {
                whereClause.quiz_id = { [Op.in]: quiz_ids.split(',').map(id => parseInt(id)) };
            }

            const quizzes = await Quiz.findAll({
                where: whereClause,
                include: [
                    {
                        model: QuizResult,
                        as: 'QuizResults',
                        attributes: ['score', 'completion_time', 'status']
                    }
                ]
            });

            const comparison = quizzes.map(quiz => {
                const results = quiz.QuizResults;
                const validResults = results.filter(r => r.score !== null);
                
                return {
                    quiz_id: quiz.quiz_id,
                    quiz_name: quiz.name,
                    avg_score: validResults.length > 0 ? 
                        (validResults.reduce((sum, r) => sum + r.score, 0) / validResults.length).toFixed(2) : 0,
                    completion_rate: results.length > 0 ? 
                        ((results.filter(r => r.status === 'completed').length / results.length) * 100).toFixed(2) : 0,
                    avg_completion_time: validResults.length > 0 ?
                        (validResults.reduce((sum, r) => sum + (r.completion_time || 0), 0) / validResults.length).toFixed(2) : 0,
                    total_attempts: results.length,
                    difficulty_rating: quiz.avg_score > 80 ? 'Easy' : quiz.avg_score > 60 ? 'Medium' : 'Hard'
                };
            });

            res.json({
                success: true,
                data: {
                    quiz_comparison: comparison,
                    comparison_type: comparison_type,
                    insights: {
                        easiest_quiz: comparison.reduce((max, quiz) => 
                            parseFloat(quiz.avg_score) > parseFloat(max.avg_score) ? quiz : max, comparison[0] || {}),
                        hardest_quiz: comparison.reduce((min, quiz) => 
                            parseFloat(quiz.avg_score) < parseFloat(min.avg_score) ? quiz : min, comparison[0] || {}),
                        avg_course_performance: comparison.length > 0 ?
                            (comparison.reduce((sum, quiz) => sum + parseFloat(quiz.avg_score), 0) / comparison.length).toFixed(2) : 0
                    }
                }
            });
        } catch (error) {
            console.error('Quiz performance comparison error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }
};
