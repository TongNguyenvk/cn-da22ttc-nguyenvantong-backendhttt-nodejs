const {
    StudentProgramProgress,
    SubjectOutcomeAnalysis,
    ProgramOutcomeTracking,
    LearningAnalytics,
    Program,
    Subject,
    User,
    PO,
    PLO,
    Course,
    QuizResult,
    UserQuestionHistory,
    Question,
    LO,
    Level,
    Quiz,
    ChapterLO,
    Chapter,
    ChapterSection
} = require('../models');
const { Op } = require('sequelize');
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

// Báo cáo tổng quan chương trình
const getProgramOverviewReport = async (req, res) => {
    try {
        const { program_id } = req.params;
        const { semester, academic_year } = req.query;

        // Validate program
        const program = await Program.findByPk(program_id);
        if (!program) {
            return res.status(404).json({ error: 'Program not found' });
        }

        // Lấy thống kê tổng quan
        const totalStudents = await StudentProgramProgress.count({
            where: { program_id }
        });

        const activeStudents = await StudentProgramProgress.count({
            where: {
                program_id,
                student_status: 'active'
            }
        });

        const graduatedStudents = await StudentProgramProgress.count({
            where: {
                program_id,
                student_status: 'graduated'
            }
        });

        // Lấy điểm trung bình chương trình
        const studentProgresses = await StudentProgramProgress.findAll({
            where: { program_id },
            attributes: ['overall_progress']
        });

        const averageGPA = studentProgresses.length > 0
            ? studentProgresses.reduce((sum, progress) =>
                sum + (progress.overall_progress.gpa || 0), 0) / studentProgresses.length
            : 0;

        // Lấy phân tích PO/PLO
        const poAnalysis = await getPOAnalysisByProgram(program_id);
        const ploAnalysis = await getPLOAnalysisByProgram(program_id);

        // Lấy phân tích môn học
        const subjectAnalysis = await getSubjectAnalysisByProgram(program_id, semester, academic_year);

        res.json({
            success: true,
            data: {
                program: {
                    program_id: program.program_id,
                    name: program.name,
                    description: program.description
                },
                overview: {
                    total_students: totalStudents,
                    active_students: activeStudents,
                    graduated_students: graduatedStudents,
                    graduation_rate: totalStudents > 0 ? (graduatedStudents / totalStudents * 100) : 0,
                    average_gpa: Math.round(averageGPA * 100) / 100
                },
                po_analysis: poAnalysis,
                plo_analysis: ploAnalysis,
                subject_analysis: subjectAnalysis,
                generated_at: new Date()
            }
        });

    } catch (error) {
        console.error('Error generating program overview report:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Báo cáo chi tiết sinh viên
const getStudentDetailReport = async (req, res) => {
    try {
        const { user_id, program_id } = req.params;

        // Lấy thông tin sinh viên
        const student = await User.findByPk(user_id, {
            attributes: ['user_id', 'name', 'email']
        });

        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // Lấy tiến độ chương trình
        const progress = await StudentProgramProgress.findOne({
            where: { user_id, program_id },
            include: [{
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

        // Lấy lịch sử quiz
        const quizHistory = await getStudentQuizHistory(user_id, program_id);

        // Tính toán radar chart data
        const radarData = await calculateStudentRadarData(user_id, program_id);

        res.json({
            success: true,
            data: {
                student: student,
                program: progress.Program,
                progress: progress,
                outcome_tracking: outcomeTracking,
                quiz_history: quizHistory,
                radar_data: radarData,
                performance_summary: {
                    overall_gpa: progress.overall_progress.gpa,
                    completion_rate: progress.overall_progress.completion_percentage,
                    credits_earned: progress.overall_progress.credits_earned,
                    total_credits: progress.overall_progress.total_credits_required,
                    status: progress.student_status
                },
                generated_at: new Date()
            }
        });

    } catch (error) {
        console.error('Error generating student detail report:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Báo cáo so sánh môn học
const getSubjectComparisonReport = async (req, res) => {
    try {
        const { program_id } = req.params;
        const { semester, academic_year, subject_ids } = req.query;

        let whereClause = { program_id };
        if (semester) whereClause.analysis_semester = semester;
        if (academic_year) whereClause.academic_year = academic_year;
        if (subject_ids) {
            const subjectIdArray = subject_ids.split(',').map(id => parseInt(id));
            whereClause.subject_id = { [Op.in]: subjectIdArray };
        }

        const subjectAnalyses = await SubjectOutcomeAnalysis.findAll({
            where: whereClause,
            include: [{
                model: Subject,
                as: 'Subject',
                attributes: ['subject_id', 'name', 'description']
            }],
            order: [['analysis_date', 'DESC']]
        });

        const comparison = {
            subjects: [],
            comparative_metrics: {
                highest_average_score: 0,
                lowest_average_score: 100,
                highest_completion_rate: 0,
                lowest_completion_rate: 100,
                most_challenging_subject: null,
                easiest_subject: null
            }
        };

        subjectAnalyses.forEach(analysis => {
            const subjectData = {
                subject: analysis.Subject,
                statistics: analysis.subject_statistics,
                po_achievement: analysis.po_achievement,
                plo_achievement: analysis.plo_achievement,
                difficulty_analysis: analysis.difficulty_analysis,
                improvement_recommendations: analysis.improvement_recommendations
            };

            comparison.subjects.push(subjectData);

            // Update comparative metrics
            const avgScore = analysis.subject_statistics.average_score;
            const completionRate = analysis.subject_statistics.completion_rate;

            if (avgScore > comparison.comparative_metrics.highest_average_score) {
                comparison.comparative_metrics.highest_average_score = avgScore;
                comparison.comparative_metrics.easiest_subject = analysis.Subject.name;
            }

            if (avgScore < comparison.comparative_metrics.lowest_average_score) {
                comparison.comparative_metrics.lowest_average_score = avgScore;
                comparison.comparative_metrics.most_challenging_subject = analysis.Subject.name;
            }

            if (completionRate > comparison.comparative_metrics.highest_completion_rate) {
                comparison.comparative_metrics.highest_completion_rate = completionRate;
            }

            if (completionRate < comparison.comparative_metrics.lowest_completion_rate) {
                comparison.comparative_metrics.lowest_completion_rate = completionRate;
            }
        });

        res.json({
            success: true,
            data: {
                program_id,
                filter_criteria: { semester, academic_year, subject_ids },
                comparison,
                generated_at: new Date()
            }
        });

    } catch (error) {
        console.error('Error generating subject comparison report:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Helper functions
const getPOAnalysisByProgram = async (program_id) => {
    const poTracking = await ProgramOutcomeTracking.findAll({
        where: { program_id, outcome_type: 'PO', is_active: true },
        include: [{
            model: PO,
            as: 'PO',
            attributes: ['po_id', 'name', 'description']
        }]
    });

    const analysis = {};
    poTracking.forEach(tracking => {
        const po_id = tracking.po_id;
        if (!analysis[po_id]) {
            analysis[po_id] = {
                po: tracking.PO,
                students_count: 0,
                average_score: 0,
                achievement_rate: 0,
                scores: []
            };
        }
        analysis[po_id].students_count++;
        analysis[po_id].scores.push(tracking.current_score);
    });

    // Calculate averages
    Object.keys(analysis).forEach(po_id => {
        const data = analysis[po_id];
        data.average_score = data.scores.reduce((sum, score) => sum + score, 0) / data.scores.length;
        data.achievement_rate = (data.scores.filter(score => score >= 70).length / data.scores.length) * 100;
        delete data.scores;
    });

    return analysis;
};

const getPLOAnalysisByProgram = async (program_id) => {
    const ploTracking = await ProgramOutcomeTracking.findAll({
        where: { program_id, outcome_type: 'PLO', is_active: true },
        include: [{
            model: PLO,
            as: 'PLO',
            attributes: ['plo_id', 'description']
        }]
    });

    const analysis = {};
    ploTracking.forEach(tracking => {
        const plo_id = tracking.plo_id;
        if (!analysis[plo_id]) {
            analysis[plo_id] = {
                plo: tracking.PLO,
                students_count: 0,
                average_score: 0,
                achievement_rate: 0,
                scores: []
            };
        }
        analysis[plo_id].students_count++;
        analysis[plo_id].scores.push(tracking.current_score);
    });

    // Calculate averages
    Object.keys(analysis).forEach(plo_id => {
        const data = analysis[plo_id];
        data.average_score = data.scores.reduce((sum, score) => sum + score, 0) / data.scores.length;
        data.achievement_rate = (data.scores.filter(score => score >= 70).length / data.scores.length) * 100;
        delete data.scores;
    });

    return analysis;
};

const getSubjectAnalysisByProgram = async (program_id, semester, academic_year) => {
    let whereClause = { program_id };
    if (semester) whereClause.analysis_semester = semester;
    if (academic_year) whereClause.academic_year = academic_year;

    const analyses = await SubjectOutcomeAnalysis.findAll({
        where: whereClause,
        include: [{
            model: Subject,
            as: 'Subject',
            attributes: ['subject_id', 'name']
        }],
        limit: 10,
        order: [['analysis_date', 'DESC']]
    });

    return analyses.map(analysis => ({
        subject: analysis.Subject,
        average_score: analysis.subject_statistics.average_score,
        completion_rate: analysis.subject_statistics.completion_rate,
        pass_rate: analysis.subject_statistics.pass_rate
    }));
};

const getStudentQuizHistory = async (user_id, program_id) => {
    const quizResults = await QuizResult.findAll({
        where: { user_id },
        include: [{
            model: Quiz,
            as: 'Quiz',
            include: [{
                model: Course,
                as: 'Course',
                where: { program_id },
                include: [{
                    model: Subject,
                    as: 'Subject',
                    attributes: ['subject_id', 'name']
                }]
            }]
        }],
        order: [['update_time', 'DESC']],
        limit: 20
    });

    return quizResults.map(result => ({
        quiz_id: result.quiz_id,
        quiz_name: result.Quiz?.name,
        subject_name: result.Quiz?.Course?.Subject?.name,
        course_name: result.Quiz?.Course?.name,
        score: result.score,
        completed_at: result.update_time
    }));
};

const calculateStudentRadarData = async (user_id, program_id) => {
    // Simplified radar data calculation
    const outcomeTracking = await ProgramOutcomeTracking.findAll({
        where: { user_id, program_id, is_active: true }
    });

    const radarData = {
        po_scores: {},
        plo_scores: {}
    };

    outcomeTracking.forEach(tracking => {
        if (tracking.outcome_type === 'PO') {
            radarData.po_scores[tracking.po_id] = tracking.current_score;
        } else if (tracking.outcome_type === 'PLO') {
            radarData.plo_scores[tracking.plo_id] = tracking.current_score;
        }
    });

    return radarData;
};

/**
 * API: Báo cáo tổng thể theo môn học cho người học
 * Hiển thị từng môn học với biểu đồ LO đã đáp ứng, % đáp ứng, phân tích cần cải thiện gì
 */
const getSubjectComprehensiveAnalysisForStudent = async (req, res) => {
    try {
        const { subject_id, user_id } = req.params;

        // Kiểm tra quyền truy cập - chỉ cho phép học sinh xem báo cáo của chính mình
        if (req.user.role === 'student' && req.user.user_id !== parseInt(user_id)) {
            return res.status(403).json({
                message: 'Bạn chỉ có thể xem báo cáo của chính mình'
            });
        }

        // 1. Lấy thông tin môn học
        const subject = await Subject.findByPk(subject_id, {
            attributes: ['subject_id', 'name', 'description']
        });

        if (!subject) {
            return res.status(404).json({ message: 'Môn học không tồn tại' });
        }

        // 2. Lấy thông tin người dùng
        const user = await User.findByPk(user_id, {
            attributes: ['user_id', 'name', 'email']
        });

        if (!user) {
            return res.status(404).json({ message: 'Người dùng không tồn tại' });
        }

        // 3. Lấy tất cả quiz của môn học này thông qua Course
        const quizzes = await Quiz.findAll({
            include: [
                {
                    model: Course,
                    as: 'Course',
                    where: { subject_id },
                    attributes: ['course_id', 'name'],
                    include: [{
                        model: Subject,
                        as: 'Subject',
                        attributes: ['subject_id', 'name']
                    }]
                },
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
                }
            ]
        });

        if (quizzes.length === 0) {
            return res.status(404).json({ message: 'Không có quiz nào cho môn học này' });
        }

        // 4. Lấy tất cả kết quả quiz của người dùng trong môn học này
        const quizIds = quizzes.map(q => q.quiz_id);
        const quizResults = await QuizResult.findAll({
            where: {
                quiz_id: { [Op.in]: quizIds },
                user_id
            },
            include: [
                {
                    model: Quiz,
                    as: 'Quiz',
                    attributes: ['quiz_id', 'name']
                }
            ]
        });

        // 5. Lấy tất cả lịch sử trả lời câu hỏi trong môn học này
        const allQuestionHistory = await UserQuestionHistory.findAll({
            where: {
                quiz_id: { [Op.in]: quizIds },
                user_id
            },
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

        // Normalize to first attempts per question
        const firstAttempts = selectFirstAttempts(allQuestionHistory);

        if (firstAttempts.length === 0) {
            return res.status(404).json({ message: 'Không có dữ liệu trả lời câu hỏi cho môn học này' });
        }

        // 6. Tập hợp tất cả câu hỏi trong môn học
        const allQuestions = [];
        quizzes.forEach(quiz => {
            allQuestions.push(...quiz.Questions);
        });

        // 7. Phân tích điểm mạnh/yếu theo chương (chính) và LO (phụ)
    const chapterAnalysis = await analyzeChapterStrengthsWeaknesses(firstAttempts, 40);
    const loAnalysis = analyzeLOStrengthsWeaknesses(firstAttempts, 40);

        // 8. Phân tích điểm mạnh/yếu theo độ khó
    const difficultyAnalysis = analyzeDifficultyStrengthsWeaknesses(firstAttempts, 40);

        // 9. Tính phần trăm phân bổ câu hỏi tổng thể theo chương
        const questionDistribution = await calculateChapterQuestionDistribution(allQuestions);

        // 10. Tạo gợi ý cải thiện học tập dựa trên chương
        const improvementSuggestions = await generateChapterBasedImprovementSuggestions(
            chapterAnalysis.weaknesses,
            difficultyAnalysis.weaknesses,
            chapterAnalysis // Truyền thêm chapterAnalysis để xử lý trường hợp không có weaknesses
        );

        // 10.1. Phân tích LO theo % hoàn thành (tính năng mới)
        const loCompletionAnalysis = await analyzeLOCompletionPercentage(
            firstAttempts,
            subject_id,
            60 // threshold 60%
        );

        // 10.2. Tạo gợi ý học tập cá nhân hóa dựa trên % hoàn thành LO
        const personalizedRecommendations = createPersonalizedStudyPlan(loCompletionAnalysis);

        // 11. Tính toán thống kê tổng quan
        const totalQuestions = firstAttempts.length;
        const correctAnswers = firstAttempts.filter(h => h.is_correct).length;
        const overallAccuracy = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;
        const totalTimeSpent = firstAttempts.reduce((sum, h) => sum + (h.time_spent || 0), 0);
        const averageScore = quizResults.length > 0 ?
            quizResults.reduce((sum, r) => sum + r.score, 0) / quizResults.length : 0;

        // 12. Tạo biểu đồ chương đã đáp ứng
        const chapterCompletionChart = {
            labels: [],
            completion_percentages: [],
            target_line: 70, // Mục tiêu 70%
            chart_data: []
        };

        // Sử dụng dữ liệu từ chapterAnalysis
        const allChapters = [...chapterAnalysis.strengths, ...chapterAnalysis.neutral, ...chapterAnalysis.weaknesses];

        allChapters.forEach(chapter => {
            chapterCompletionChart.labels.push(chapter.chapter_name);
            chapterCompletionChart.completion_percentages.push(chapter.accuracy_percentage);
            chapterCompletionChart.chart_data.push({
                chapter_id: chapter.chapter_id,
                chapter_name: chapter.chapter_name,
                completion_percentage: chapter.accuracy_percentage,
                status: chapter.accuracy_percentage >= 70 ? 'achieved' :
                    chapter.accuracy_percentage >= 40 ? 'in_progress' : 'needs_attention',
                gap_to_target: Math.max(0, 70 - chapter.accuracy_percentage),
                related_los: chapter.related_los,
                sections: chapter.sections ? chapter.sections.map(s => ({
                    section_id: s.section_id,
                    title: s.title,
                    content_type: 'text', // Default since column doesn't exist
                    has_content: !!s.content,
                    order: s.order
                })) : []
            });
        });

        // 13. Tạo phản hồi chi tiết
        const response = {
            subject_info: {
                subject_id: subject.subject_id,
                subject_name: subject.name,
                description: subject.description,
                total_quizzes: quizzes.length,
                completed_quizzes: quizResults.length
            },
            student_info: {
                user_id: user.user_id,
                name: user.name,
                email: user.email
            },
            overall_performance: {
                total_questions_answered: totalQuestions,
                correct_answers: correctAnswers,
                overall_accuracy_percentage: Math.round(overallAccuracy * 100) / 100,
                average_quiz_score: Math.round(averageScore * 100) / 100,
                total_time_spent_seconds: totalTimeSpent,
                performance_level: overallAccuracy >= 80 ? 'excellent' :
                    overallAccuracy >= 60 ? 'good' :
                        overallAccuracy >= 40 ? 'average' : 'needs_improvement'
            },
            chapter_completion_chart: chapterCompletionChart,
            question_distribution: questionDistribution,
            chapter_analysis: {
                ...chapterAnalysis,
                achievement_summary: {
                    total_chapters: chapterCompletionChart.chart_data.length,
                    achieved_chapters: chapterCompletionChart.chart_data.filter(ch => ch.status === 'achieved').length,
                    in_progress_chapters: chapterCompletionChart.chart_data.filter(ch => ch.status === 'in_progress').length,
                    needs_attention_chapters: chapterCompletionChart.chart_data.filter(ch => ch.status === 'needs_attention').length
                }
            },
            learning_outcome_analysis: {
                ...loAnalysis,
                achievement_summary: {
                    total_los: loAnalysis.overall_stats.total_los_tested,
                    achieved_los: loAnalysis.strengths.length,
                    weak_los: loAnalysis.weaknesses.length,
                    neutral_los: loAnalysis.neutral?.length || 0
                }
            },
            difficulty_analysis: difficultyAnalysis,
            improvement_suggestions: improvementSuggestions,
            quiz_breakdown: quizResults.map(result => ({
                quiz_id: result.Quiz.quiz_id,
                quiz_name: result.Quiz.name,
                score: result.score,
                completion_date: result.update_time,
                status: result.status
            })),
            learning_insights: {
                subject_mastery_level: overallAccuracy >= 80 ? 'Thành thạo' :
                    overallAccuracy >= 60 ? 'Tốt' :
                        overallAccuracy >= 40 ? 'Trung bình' : 'Cần cải thiện',
                strongest_chapters: chapterAnalysis.strengths.length > 0 ?
                    chapterAnalysis.strengths.slice(0, 3).map(s => s.chapter_name) :
                    ['Chưa có dữ liệu đánh giá'],
                chapters_needing_improvement: chapterAnalysis.weaknesses.length > 0 ?
                    chapterAnalysis.weaknesses.slice(0, 3).map(w => w.chapter_name) :
                    // Nếu không có weaknesses, hiển thị các chương có thể nâng cao
                    chapterAnalysis.neutral.length > 0 ?
                        chapterAnalysis.neutral.slice(0, 2).map(n => `${n.chapter_name} (nâng cao)`) :
                        chapterAnalysis.strengths.length > 0 ?
                            chapterAnalysis.strengths.slice(0, 2).map(s => `${s.chapter_name} (nâng cao)`) :
                            ['Không có chương cần cải thiện'],
                recommended_focus: chapterAnalysis.weaknesses.length > 0 ?
                    `Tập trung ôn tập: ${chapterAnalysis.weaknesses.slice(0, 2).map(w => w.chapter_name).join(', ')}` :
                    'Tiếp tục duy trì kết quả tốt và nâng cao kiến thức',
                next_learning_phase: overallAccuracy < 40 ? 'Củng cố kiến thức cơ bản' :
                    overallAccuracy < 70 ? 'Thực hành và áp dụng' :
                        'Nâng cao và mở rộng kiến thức',
                study_recommendations: chapterAnalysis.weaknesses.length > 0 ?
                    chapterAnalysis.weaknesses.slice(0, 3).map(w => ({
                        chapter_name: w.chapter_name,
                        current_accuracy: w.accuracy_percentage,
                        sections_to_review: w.sections ? w.sections.map(s => s.title) : [],
                        related_concepts: w.related_los || [],
                        priority: w.accuracy_percentage < 20 ? 'critical' :
                            w.accuracy_percentage < 30 ? 'high' : 'medium'
                    })) :
                    // Nếu không có weaknesses, đề xuất nâng cao cho các chương mạnh
                    chapterAnalysis.strengths.length > 0 ?
                        chapterAnalysis.strengths.slice(0, 2).map(s => ({
                            chapter_name: s.chapter_name,
                            current_accuracy: s.accuracy_percentage,
                            sections_to_review: s.sections ? s.sections.map(sec => sec.title) : [],
                            related_concepts: s.related_los || [],
                            priority: 'enhancement',
                            note: 'Chương để nâng cao và mở rộng kiến thức'
                        })) :
                        [{
                            chapter_name: 'Chưa có dữ liệu',
                            current_accuracy: 0,
                            sections_to_review: [],
                            related_concepts: [],
                            priority: 'none',
                            note: 'Cần có thêm dữ liệu quiz để đưa ra gợi ý'
                        }]
            },
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
                    completion_threshold: 60,
                    subject_lo_mastery_rate: (loCompletionAnalysis.ready_for_advancement || []).length > 0 ?
                        Math.round(((loCompletionAnalysis.ready_for_advancement || []).length /
                        ((loCompletionAnalysis.needs_improvement || []).length +
                         (loCompletionAnalysis.ready_for_advancement || []).length)) * 100) : 0
                }
            },
            personalized_recommendations: personalizedRecommendations,
            generated_at: new Date()
        };

        res.status(200).json({
            success: true,
            data: response
        });

    } catch (error) {
        console.error('Error in getSubjectComprehensiveAnalysisForStudent:', error);
        res.status(500).json({
            message: 'Lỗi server khi tạo báo cáo tổng thể môn học',
            error: error.message
        });
    }
};

// Báo cáo tổng thể theo khóa học cho người học (mới thêm)
const getCourseComprehensiveAnalysisForStudent = async (req, res) => {
    try {
        console.log('🔍 getCourseComprehensiveAnalysisForStudent called:', { 
            course_id: req.params.course_id, 
            user_id: req.params.user_id,
            user: req.user ? { user_id: req.user.user_id, role: req.user.role } : 'undefined'
        });

        const { course_id, user_id } = req.params;

        // Kiểm tra authentication
        if (!req.user) {
            console.log('❌ No authenticated user found');
            return res.status(401).json({
                message: 'Không có quyền truy cập'
            });
        }

        // Kiểm tra quyền truy cập - chỉ cho phép học sinh xem báo cáo của chính mình
        if (req.user.role === 'student' && req.user.user_id !== parseInt(user_id)) {
            console.log('❌ Access denied: student trying to access other user data');
            return res.status(403).json({
                message: 'Bạn chỉ có thể xem báo cáo của chính mình'
            });
        }

        // 1. Lấy thông tin khóa học và môn học liên quan
        const course = await Course.findByPk(course_id, {
            include: [{
                model: Subject,
                as: 'Subject',
                attributes: ['subject_id', 'name', 'description']
            }],
            attributes: ['course_id', 'name', 'description', 'subject_id']
        });

        if (!course) {
            return res.status(404).json({ message: 'Khóa học không tồn tại' });
        }

        // 2. Lấy thông tin người dùng
        const user = await User.findByPk(user_id, {
            attributes: ['user_id', 'name', 'email']
        });

        if (!user) {
            return res.status(404).json({ message: 'Người dùng không tồn tại' });
        }

        // 3. Lấy tất cả quiz của khóa học này
        const quizzes = await Quiz.findAll({
            where: { course_id },
            include: [
                {
                    model: Course,
                    as: 'Course',
                    attributes: ['course_id', 'name'],
                    include: [{
                        model: Subject,
                        as: 'Subject',
                        attributes: ['subject_id', 'name']
                    }]
                },
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
                }
            ]
        });

        if (quizzes.length === 0) {
            return res.status(404).json({ message: 'Không có quiz nào cho khóa học này' });
        }

        // 4. Lấy tất cả kết quả quiz của người dùng trong khóa học này
        const quizIds = quizzes.map(q => q.quiz_id);
        const quizResults = await QuizResult.findAll({
            where: {
                quiz_id: { [Op.in]: quizIds },
                user_id
            },
            attributes: ['quiz_id', 'score', 'completion_time']
        });

        // 5. Lấy lịch sử trả lời câu hỏi chi tiết
        const questionHistory = await UserQuestionHistory.findAll({
            where: {
                quiz_id: { [Op.in]: quizIds },
                user_id
            },
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
            ]
        });

        // Normalize to first attempts per question
        const firstAttempts = selectFirstAttempts(questionHistory);

        // 6. Phân tích các thế mạnh và điểm yếu theo LO
        const loAnalysis = await analyzeLOStrengthsWeaknesses(firstAttempts);

        // 7. Phân tích theo độ khó
        const difficultyAnalysis = await analyzeDifficultyStrengthsWeaknesses(firstAttempts);

        // 8. Phân tích theo chương
        const chapterAnalysis = await analyzeChapterStrengthsWeaknesses(firstAttempts, course.Subject.subject_id);

        // 9. Phân bổ câu hỏi theo chương
        const questionDistribution = await calculateChapterQuestionDistribution(
            quizzes.flatMap(q => q.Questions || [])
        );

        // 10. Gợi ý cải thiện dựa trên chương
        const improvementSuggestions = await generateChapterBasedImprovementSuggestions(
            chapterAnalysis.weaknesses || [],
            difficultyAnalysis.weaknesses || [],
            chapterAnalysis
        );

        // 11. Phân tích LO completion percentage 
        const loCompletionAnalysis = await analyzeLOCompletionPercentage(
            firstAttempts,
            course.Subject.subject_id,
            60 // threshold 60%
        );

        // 12. Tạo kế hoạch học tập cá nhân hóa
        const personalizedRecommendations = createPersonalizedStudyPlan(loCompletionAnalysis);

        // 13. Chuẩn bị response với thông tin khóa học
        const response = {
            course_info: {
                course_id: course.course_id,
                course_name: course.name,
                course_description: course.description,
                subject: {
                    subject_id: course.Subject.subject_id,
                    subject_name: course.Subject.name,
                    subject_description: course.Subject.description
                }
            },
            student_info: {
                user_id: user.user_id,
                name: user.name,
                email: user.email
            },
            overall_performance: {
                total_quizzes_taken: quizResults.length,
                total_questions_answered: firstAttempts.length,
                correct_answers: firstAttempts.filter(q => q.is_correct).length,
                accuracy_percentage: firstAttempts.length > 0 ?
                    Math.round((firstAttempts.filter(q => q.is_correct).length / firstAttempts.length) * 100) : 0,
                average_score: quizResults.length > 0 ?
                    Math.round((quizResults.reduce((sum, r) => sum + r.score, 0) / quizResults.length) * 100) / 100 : 0,
                total_time_spent_seconds: firstAttempts.reduce((sum, q) => sum + (q.time_spent || 0), 0)
            },
            lo_analysis: {
                strengths: loAnalysis.strengths || [],
                weaknesses: loAnalysis.weaknesses || [],
                overall_stats: loAnalysis.overall_stats || {
                    total_los_tested: 0,
                    strong_los: 0,
                    weak_los: 0
                }
            },
            difficulty_analysis: {
                strengths: difficultyAnalysis.strengths || [],
                weaknesses: difficultyAnalysis.weaknesses || [],
                overall_stats: difficultyAnalysis.overall_stats || {
                    total_levels_tested: 0,
                    strong_levels: 0,
                    weak_levels: 0
                }
            },
            chapter_analysis: {
                strengths: chapterAnalysis.strengths || [],
                weaknesses: chapterAnalysis.weaknesses || [],
                overall_stats: chapterAnalysis.overall_stats || {
                    total_chapters_tested: 0,
                    strong_chapters: 0,
                    weak_chapters: 0
                }
            },
            question_distribution: questionDistribution,
            improvement_suggestions: {
                priority_areas: improvementSuggestions.priority_areas || [],
                study_plan: improvementSuggestions.study_plan || {},
                next_steps: improvementSuggestions.next_steps || []
            },
            personalized_recommendations: personalizedRecommendations,
            generated_at: new Date()
        };

        console.log('✅ About to send response for getCourseComprehensiveAnalysisForStudent');
        return res.status(200).json({
            success: true,
            data: response
        });

    } catch (error) {
        console.error('❌ Error in getCourseComprehensiveAnalysisForStudent:', error);
        return res.status(500).json({
            message: 'Lỗi server khi tạo báo cáo tổng thể khóa học',
            error: error.message
        });
    }
};

module.exports = {
    getProgramOverviewReport,
    getStudentDetailReport,
    getSubjectComparisonReport,
    getSubjectComprehensiveAnalysisForStudent,
    getCourseComprehensiveAnalysisForStudent
};
