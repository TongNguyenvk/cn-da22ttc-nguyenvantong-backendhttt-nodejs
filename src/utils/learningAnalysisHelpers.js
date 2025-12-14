/**
 * LEARNING ANALYSIS HELPERS
 * Các hàm hỗ trợ phân tích học tập chi tiết cho người học
 */

const { ChapterLO, Chapter, ChapterSection, LO, Subject } = require('../models');

/**
 * Phân tích điểm mạnh và điểm yếu theo Learning Outcomes
 * @param {Array} questionHistory - Lịch sử trả lời câu hỏi
 * @param {number} weakThreshold - Ngưỡng yếu (mặc định 40%)
 * @returns {Object} Phân tích điểm mạnh/yếu theo LO
 */
const analyzeLOStrengthsWeaknesses = (questionHistory, weakThreshold = 40) => {
    const loStats = {};

    // Tính toán thống kê cho từng LO
    questionHistory.forEach(history => {
        const lo = history.Question?.LO;
        if (!lo) return;

        const loId = lo.lo_id;
        if (!loStats[loId]) {
            loStats[loId] = {
                lo_id: loId,
                lo_name: lo.name,
                lo_description: lo.description || '',
                total_questions: 0,
                correct_answers: 0,
                total_time_spent: 0,
                questions: []
            };
        }

        loStats[loId].total_questions++;
        if (history.is_correct) {
            loStats[loId].correct_answers++;
        }
        if (history.time_spent) {
            loStats[loId].total_time_spent += history.time_spent;
        }

        loStats[loId].questions.push({
            question_id: history.question_id,
            is_correct: history.is_correct,
            time_spent: history.time_spent
        });
    });

    // Phân loại điểm mạnh/yếu
    const strengths = [];
    const weaknesses = [];
    const neutral = [];

    Object.values(loStats).forEach(stat => {
        const accuracy = stat.total_questions > 0 ?
            (stat.correct_answers / stat.total_questions) * 100 : 0;
        const avgTimePerQuestion = stat.total_questions > 0 ?
            stat.total_time_spent / stat.total_questions : 0;

        const analysis = {
            ...stat,
            accuracy_percentage: Math.round(accuracy * 100) / 100,
            average_time_per_question: Math.round(avgTimePerQuestion),
            performance_level: accuracy >= 80 ? 'excellent' :
                accuracy >= 60 ? 'good' :
                    accuracy >= weakThreshold ? 'average' : 'weak'
        };

        if (accuracy < weakThreshold) {
            weaknesses.push(analysis);
        } else if (accuracy >= 80) {
            strengths.push(analysis);
        } else {
            neutral.push(analysis);
        }
    });

    return {
        strengths: strengths.sort((a, b) => b.accuracy_percentage - a.accuracy_percentage),
        weaknesses: weaknesses.sort((a, b) => a.accuracy_percentage - b.accuracy_percentage),
        neutral: neutral.sort((a, b) => b.accuracy_percentage - a.accuracy_percentage),
        overall_stats: {
            total_los_tested: Object.keys(loStats).length,
            strong_los: strengths.length,
            weak_los: weaknesses.length,
            neutral_los: neutral.length
        }
    };
};

/**
 * Phân tích điểm mạnh và điểm yếu theo độ khó
 * @param {Array} questionHistory - Lịch sử trả lời câu hỏi
 * @param {number} weakThreshold - Ngưỡng yếu (mặc định 40%)
 * @returns {Object} Phân tích điểm mạnh/yếu theo độ khó
 */
const analyzeDifficultyStrengthsWeaknesses = (questionHistory, weakThreshold = 40) => {
    const difficultyStats = {};

    // Tính toán thống kê cho từng độ khó
    questionHistory.forEach(history => {
        const level = history.Question?.Level;
        if (!level) return;

        const levelId = level.level_id;
        if (!difficultyStats[levelId]) {
            difficultyStats[levelId] = {
                level_id: levelId,
                level_name: level.name,
                total_questions: 0,
                correct_answers: 0,
                total_time_spent: 0,
                questions: []
            };
        }

        difficultyStats[levelId].total_questions++;
        if (history.is_correct) {
            difficultyStats[levelId].correct_answers++;
        }
        if (history.time_spent) {
            difficultyStats[levelId].total_time_spent += history.time_spent;
        }

        difficultyStats[levelId].questions.push({
            question_id: history.question_id,
            is_correct: history.is_correct,
            time_spent: history.time_spent
        });
    });

    // Phân loại điểm mạnh/yếu theo độ khó
    const strengths = [];
    const weaknesses = [];
    const neutral = [];

    Object.values(difficultyStats).forEach(stat => {
        const accuracy = stat.total_questions > 0 ?
            (stat.correct_answers / stat.total_questions) * 100 : 0;
        const avgTimePerQuestion = stat.total_questions > 0 ?
            stat.total_time_spent / stat.total_questions : 0;

        const analysis = {
            ...stat,
            accuracy_percentage: Math.round(accuracy * 100) / 100,
            average_time_per_question: Math.round(avgTimePerQuestion),
            performance_level: accuracy >= 80 ? 'excellent' :
                accuracy >= 60 ? 'good' :
                    accuracy >= weakThreshold ? 'average' : 'weak'
        };

        if (accuracy < weakThreshold) {
            weaknesses.push(analysis);
        } else if (accuracy >= 80) {
            strengths.push(analysis);
        } else {
            neutral.push(analysis);
        }
    });

    return {
        strengths: strengths.sort((a, b) => b.accuracy_percentage - a.accuracy_percentage),
        weaknesses: weaknesses.sort((a, b) => a.accuracy_percentage - b.accuracy_percentage),
        neutral: neutral.sort((a, b) => b.accuracy_percentage - a.accuracy_percentage),
        overall_stats: {
            total_levels_tested: Object.keys(difficultyStats).length,
            strong_levels: strengths.length,
            weak_levels: weaknesses.length,
            neutral_levels: neutral.length
        }
    };
};

/**
 * Tính phần trăm phân bổ câu hỏi theo LO và độ khó
 * @param {Array} questions - Danh sách câu hỏi trong quiz
 * @returns {Object} Phân bổ % câu hỏi
 */
const calculateQuestionDistribution = (questions) => {
    const loDistribution = {};
    const difficultyDistribution = {};
    const totalQuestions = questions.length;

    questions.forEach(question => {
        // Phân bổ theo LO
        const lo = question.LO;
        if (lo) {
            const loId = lo.lo_id;
            if (!loDistribution[loId]) {
                loDistribution[loId] = {
                    lo_id: loId,
                    lo_name: lo.name,
                    question_count: 0,
                    percentage: 0
                };
            }
            loDistribution[loId].question_count++;
        }

        // Phân bổ theo độ khó
        const level = question.Level;
        if (level) {
            const levelId = level.level_id;
            if (!difficultyDistribution[levelId]) {
                difficultyDistribution[levelId] = {
                    level_id: levelId,
                    level_name: level.name,
                    question_count: 0,
                    percentage: 0
                };
            }
            difficultyDistribution[levelId].question_count++;
        }
    });

    // Tính phần trăm
    Object.values(loDistribution).forEach(lo => {
        lo.percentage = Math.round((lo.question_count / totalQuestions) * 100 * 100) / 100;
    });

    Object.values(difficultyDistribution).forEach(level => {
        level.percentage = Math.round((level.question_count / totalQuestions) * 100 * 100) / 100;
    });

    return {
        by_learning_outcome: Object.values(loDistribution).sort((a, b) => b.percentage - a.percentage),
        by_difficulty: Object.values(difficultyDistribution).sort((a, b) => b.percentage - a.percentage),
        total_questions: totalQuestions
    };
};

/**
 * Tạo gợi ý cải thiện học tập dựa trên phân tích điểm yếu
 * @param {Object} loWeaknesses - Điểm yếu theo LO
 * @param {Object} difficultyWeaknesses - Điểm yếu theo độ khó
 * @returns {Object} Gợi ý cải thiện
 */
const generateLearningImprovementSuggestions = async (loWeaknesses, difficultyWeaknesses) => {
    const suggestions = {
        priority_areas: [],
        study_plan: [],
        recommended_chapters: [],
        learning_strategies: []
    };



    // Phân tích điểm yếu theo LO và tạo gợi ý
    for (const weakness of loWeaknesses || []) {
        const priority = {
            type: 'learning_outcome',
            lo_id: weakness.lo_id,
            lo_name: weakness.lo_name,
            current_accuracy: weakness.accuracy_percentage,
            target_accuracy: 70, // Mục tiêu cải thiện
            priority_level: weakness.accuracy_percentage < 20 ? 'critical' :
                weakness.accuracy_percentage < 30 ? 'high' : 'medium',
            improvement_needed: Math.round((70 - weakness.accuracy_percentage) * 100) / 100
        };

        suggestions.priority_areas.push(priority);

        // Tìm chương liên quan đến LO yếu
        try {
            const relatedChapters = await ChapterLO.findAll({
                where: { lo_id: weakness.lo_id },
                include: [
                    {
                        model: Chapter,
                        as: 'Chapter',
                        include: [
                            {
                                model: ChapterSection,
                                as: 'Sections',
                                attributes: ['section_id', 'title', 'content_type']
                            }
                        ]
                    }
                ]
            });

            relatedChapters.forEach(chapterLO => {
                if (chapterLO.Chapter) {
                    suggestions.recommended_chapters.push({
                        chapter_id: chapterLO.Chapter.chapter_id,
                        chapter_name: chapterLO.Chapter.name,
                        lo_name: weakness.lo_name,
                        sections: chapterLO.Chapter.Sections || [],
                        study_priority: priority.priority_level
                    });
                }
            });
        } catch (error) {
            console.error('Error finding related chapters:', error);
        }
    }

    // Phân tích điểm yếu theo độ khó và tạo chiến lược học tập
    (difficultyWeaknesses || []).forEach(weakness => {
        let strategy = '';
        switch (weakness.level_name.toLowerCase()) {
            case 'easy':
            case 'dễ':
                strategy = 'Tập trung ôn lại kiến thức cơ bản, đọc lại giáo trình và ghi chú. Làm nhiều bài tập cơ bản để củng cố nền tảng.';
                break;
            case 'medium':
            case 'trung bình':
                strategy = 'Thực hành nhiều bài tập ở mức độ trung bình, kết hợp lý thuyết với thực hành. Tham gia thảo luận nhóm để hiểu sâu hơn.';
                break;
            case 'hard':
            case 'khó':
                strategy = 'Phân tích kỹ các bài tập khó, tìm hiểu phương pháp giải quyết vấn đề. Tham khảo tài liệu nâng cao và nhờ hỗ trợ từ giảng viên.';
                break;
            default:
                strategy = 'Ôn tập có hệ thống và thực hành đều đặn để cải thiện kết quả.';
        }

        suggestions.learning_strategies.push({
            difficulty_level: weakness.level_name,
            current_accuracy: weakness.accuracy_percentage,
            strategy: strategy,
            recommended_practice_time: weakness.accuracy_percentage < 30 ? '2-3 giờ/tuần' : '1-2 giờ/tuần'
        });
    });

    // Tạo kế hoạch học tập tổng thể
    const totalWeakAreas = (loWeaknesses || []).length;
    if (totalWeakAreas > 0) {
        suggestions.study_plan = [
            {
                phase: 'Giai đoạn 1 (Tuần 1-2)',
                focus: 'Củng cố kiến thức cơ bản',
                activities: [
                    'Ôn lại lý thuyết các LO yếu nhất',
                    'Làm bài tập cơ bản để xây dựng nền tảng',
                    'Ghi chú và tóm tắt kiến thức quan trọng'
                ]
            },
            {
                phase: 'Giai đoạn 2 (Tuần 3-4)',
                focus: 'Thực hành và áp dụng',
                activities: [
                    'Thực hành bài tập ở nhiều mức độ khác nhau',
                    'Tham gia thảo luận và hỏi đáp',
                    'Tự kiểm tra tiến độ bằng quiz thử'
                ]
            },
            {
                phase: 'Giai đoạn 3 (Tuần 5+)',
                focus: 'Nâng cao và hoàn thiện',
                activities: [
                    'Giải quyết các bài tập nâng cao',
                    'Tổng hợp và liên kết kiến thức',
                    'Chuẩn bị cho đánh giá chính thức'
                ]
            }
        ];
    }

    return suggestions;
};

/**
 * Tạo gợi ý cải thiện học tập dựa trên phân tích chương
 * @param {Object} chapterWeaknesses - Điểm yếu theo chương
 * @param {Object} difficultyWeaknesses - Điểm yếu theo độ khó
 * @param {Object} chapterAnalysis - Kết quả phân tích chương (strengths, weaknesses, neutral)
 * @returns {Object} Gợi ý cải thiện theo chương
 */
const generateChapterBasedImprovementSuggestions = async (chapterWeaknesses, difficultyWeaknesses, chapterAnalysis = null) => {
    const suggestions = {
        priority_areas: [],
        study_plan: [],
        recommended_chapters: [],
        learning_strategies: []
    };





    // Nếu không có điểm yếu, tạo gợi ý chung cho việc duy trì và nâng cao
    if (!chapterWeaknesses || chapterWeaknesses.length === 0) {
        console.log('No chapter weaknesses found, generating general improvement suggestions');

        suggestions.priority_areas = [
            'Duy trì kết quả tốt hiện tại',
            'Nâng cao kiến thức chuyên sâu',
            'Thử thách bản thân với bài tập khó hơn'
        ];

        suggestions.study_plan = [
            {
                phase: 'Giai đoạn 1 (Tuần 1-2)',
                focus: 'Củng cố và mở rộng kiến thức',
                activities: [
                    'Ôn tập lại các chương đã học để củng cố',
                    'Tìm hiểu thêm các khía cạnh nâng cao',
                    'Thực hành với các bài tập phức tạp hơn'
                ]
            },
            {
                phase: 'Giai đoạn 2 (Tuần 3-4)',
                focus: 'Thực hành nâng cao',
                activities: [
                    'Giải quyết các bài tập tổng hợp',
                    'Tham gia thảo luận chuyên sâu',
                    'Chia sẻ kiến thức với bạn học'
                ]
            }
        ];

        suggestions.learning_strategies = [
            'Áp dụng kiến thức vào các tình huống thực tế',
            'Tìm hiểu các ứng dụng nâng cao của chủ đề',
            'Thử thách bản thân với các dự án cá nhân',
            'Hướng dẫn và giúp đỡ các bạn khác'
        ];

        // Thêm recommended_chapters cho trường hợp không có weaknesses
        if (chapterAnalysis && chapterAnalysis.strengths && chapterAnalysis.strengths.length > 0) {
            suggestions.recommended_chapters = chapterAnalysis.strengths.slice(0, 3).map(strength => ({
                chapter_id: strength.chapter_id,
                chapter_name: strength.chapter_name,
                chapter_description: strength.chapter_description || '',
                sections: strength.sections || [],
                related_los: strength.related_los || [],
                study_priority: 'enhancement',
                current_accuracy: strength.accuracy_percentage,
                target_accuracy: 90,
                note: 'Chương để nâng cao và mở rộng kiến thức'
            }));
        } else if (chapterAnalysis && chapterAnalysis.neutral && chapterAnalysis.neutral.length > 0) {
            suggestions.recommended_chapters = chapterAnalysis.neutral.slice(0, 2).map(neutral => ({
                chapter_id: neutral.chapter_id,
                chapter_name: neutral.chapter_name,
                chapter_description: neutral.chapter_description || '',
                sections: neutral.sections || [],
                related_los: neutral.related_los || [],
                study_priority: 'improvement',
                current_accuracy: neutral.accuracy_percentage,
                target_accuracy: 80,
                note: 'Chương có thể cải thiện thêm'
            }));
        } else {
            suggestions.recommended_chapters = [{
                chapter_id: null,
                chapter_name: 'Chưa có dữ liệu chương cụ thể',
                chapter_description: 'Cần có thêm dữ liệu để đưa ra gợi ý chương cụ thể',
                sections: [],
                related_los: [],
                study_priority: 'general',
                current_accuracy: 0,
                target_accuracy: 70,
                note: 'Tiếp tục làm quiz để nhận được gợi ý cụ thể hơn'
            }];
        }

        return suggestions;
    }

    // Phân tích điểm yếu theo chương và tạo gợi ý
    for (const weakness of chapterWeaknesses || []) {
        const priority = {
            type: 'chapter',
            chapter_id: weakness.chapter_id,
            chapter_name: weakness.chapter_name,
            current_accuracy: weakness.accuracy_percentage,
            target_accuracy: 70, // Mục tiêu cải thiện
            priority_level: weakness.accuracy_percentage < 20 ? 'critical' :
                weakness.accuracy_percentage < 30 ? 'high' : 'medium',
            improvement_needed: Math.round((70 - weakness.accuracy_percentage) * 100) / 100
        };

        suggestions.priority_areas.push(priority);

        // Thêm chương vào recommended_chapters
        suggestions.recommended_chapters.push({
            chapter_id: weakness.chapter_id,
            chapter_name: weakness.chapter_name,
            chapter_description: weakness.chapter_description || '',
            sections: weakness.sections || [],
            related_los: weakness.related_los || [],
            study_priority: priority.priority_level,
            current_accuracy: weakness.accuracy_percentage,
            target_accuracy: 70
        });
    }

    // Phân tích điểm yếu theo độ khó và tạo chiến lược học tập
    (difficultyWeaknesses || []).forEach(weakness => {
        let strategy = '';
        switch (weakness.level_name.toLowerCase()) {
            case 'easy':
            case 'dễ':
                strategy = 'Tập trung ôn lại kiến thức cơ bản, đọc lại giáo trình và ghi chú. Làm nhiều bài tập cơ bản để củng cố nền tảng.';
                break;
            case 'medium':
            case 'trung bình':
                strategy = 'Thực hành nhiều bài tập ở mức độ trung bình, kết hợp lý thuyết với thực hành. Tham gia thảo luận nhóm để hiểu sâu hơn.';
                break;
            case 'hard':
            case 'khó':
                strategy = 'Phân tích kỹ các bài tập khó, tìm hiểu phương pháp giải quyết vấn đề. Tham khảo tài liệu nâng cao và nhờ hỗ trợ từ giảng viên.';
                break;
            default:
                strategy = 'Ôn tập có hệ thống và thực hành đều đặn để cải thiện kết quả.';
        }

        suggestions.learning_strategies.push({
            difficulty_level: weakness.level_name,
            current_accuracy: weakness.accuracy_percentage,
            strategy: strategy,
            recommended_practice_time: weakness.accuracy_percentage < 30 ? '2-3 giờ/tuần' : '1-2 giờ/tuần'
        });
    });

    // Tạo kế hoạch học tập tổng thể dựa trên chương
    const totalWeakChapters = (chapterWeaknesses || []).length;
    if (totalWeakChapters > 0) {
        suggestions.study_plan = [
            {
                phase: 'Giai đoạn 1 (Tuần 1-2)',
                focus: 'Củng cố kiến thức cơ bản theo chương',
                activities: [
                    `Ôn lại lý thuyết ${totalWeakChapters} chương yếu nhất`,
                    'Đọc kỹ nội dung các sections trong chương',
                    'Ghi chú và tóm tắt kiến thức quan trọng từng chương'
                ]
            },
            {
                phase: 'Giai đoạn 2 (Tuần 3-4)',
                focus: 'Thực hành và áp dụng theo chương',
                activities: [
                    'Làm bài tập theo từng chương đã ôn',
                    'Tham gia thảo luận về nội dung chương',
                    'Tự kiểm tra tiến độ bằng quiz theo chương'
                ]
            },
            {
                phase: 'Giai đoạn 3 (Tuần 5+)',
                focus: 'Nâng cao và tổng hợp kiến thức',
                activities: [
                    'Liên kết kiến thức giữa các chương',
                    'Giải quyết các bài tập tổng hợp',
                    'Chuẩn bị cho đánh giá chính thức'
                ]
            }
        ];
    }



    return suggestions;
};

/**
 * Phân tích điểm mạnh và điểm yếu theo Chương (Chapter-based analysis)
 * @param {Array} questionHistory - Lịch sử trả lời câu hỏi
 * @param {number} weakThreshold - Ngưỡng yếu (mặc định 40%)
 * @returns {Object} Phân tích điểm mạnh/yếu theo chương
 */
const analyzeChapterStrengthsWeaknesses = async (questionHistory, weakThreshold = 40) => {
    const chapterStats = {};



    // Tính toán thống kê cho từng chương thông qua LO
    for (const history of questionHistory) {
        const lo = history.Question?.LO;
        if (!lo) continue;

        try {
            // Tìm các chương liên quan đến LO này
            const chapterLOs = await ChapterLO.findAll({
                where: { lo_id: lo.lo_id },
                include: [
                    {
                        model: Chapter,
                        as: 'Chapter',
                        include: [
                            {
                                model: ChapterSection,
                                as: 'Sections',
                                attributes: ['section_id', 'title', 'content', 'order']
                            }
                        ]
                    }
                ]
            });

            for (const chapterLO of chapterLOs) {
                if (!chapterLO.Chapter) continue;

                const chapter = chapterLO.Chapter;
                const chapterId = chapter.chapter_id;

                if (!chapterStats[chapterId]) {
                    chapterStats[chapterId] = {
                        chapter_id: chapterId,
                        chapter_name: chapter.name,
                        chapter_description: chapter.description || '',
                        sections: chapter.Sections || [],
                        total_questions: 0,
                        correct_answers: 0,
                        total_time_spent: 0,
                        related_los: new Set(),
                        questions: []
                    };
                }

                chapterStats[chapterId].total_questions++;
                if (history.is_correct) {
                    chapterStats[chapterId].correct_answers++;
                }
                if (history.time_spent) {
                    chapterStats[chapterId].total_time_spent += history.time_spent;
                }

                chapterStats[chapterId].related_los.add(lo.name);
                chapterStats[chapterId].questions.push({
                    question_id: history.question_id,
                    is_correct: history.is_correct,
                    time_spent: history.time_spent,
                    lo_name: lo.name
                });
            }
        } catch (error) {
            console.error('Error finding chapters for LO:', lo.lo_id, error);
        }
    }

    // Chuyển Set thành Array và phân loại điểm mạnh/yếu
    const strengths = [];
    const weaknesses = [];
    const neutral = [];

    Object.values(chapterStats).forEach(stat => {
        stat.related_los = Array.from(stat.related_los);

        const accuracy = stat.total_questions > 0 ?
            (stat.correct_answers / stat.total_questions) * 100 : 0;
        const avgTimePerQuestion = stat.total_questions > 0 ?
            stat.total_time_spent / stat.total_questions : 0;

        const analysis = {
            ...stat,
            accuracy_percentage: Math.round(accuracy * 100) / 100,
            average_time_per_question: Math.round(avgTimePerQuestion),
            performance_level: accuracy >= 80 ? 'excellent' :
                accuracy >= 60 ? 'good' :
                    accuracy >= weakThreshold ? 'average' : 'weak',
            los_covered: stat.related_los.length
        };

        if (accuracy < weakThreshold) {
            weaknesses.push(analysis);
        } else if (accuracy >= 80) {
            strengths.push(analysis);
        } else {
            neutral.push(analysis);
        }
    });



    return {
        strengths: strengths.sort((a, b) => b.accuracy_percentage - a.accuracy_percentage),
        weaknesses: weaknesses.sort((a, b) => a.accuracy_percentage - b.accuracy_percentage),
        neutral: neutral.sort((a, b) => b.accuracy_percentage - a.accuracy_percentage),
        overall_stats: {
            total_chapters_tested: Object.keys(chapterStats).length,
            strong_chapters: strengths.length,
            weak_chapters: weaknesses.length,
            neutral_chapters: neutral.length
        }
    };
};

/**
 * Tính phần trăm phân bổ câu hỏi theo chương và độ khó
 * @param {Array} questions - Danh sách câu hỏi trong quiz
 * @returns {Object} Phân bổ % câu hỏi theo chương
 */
const calculateChapterQuestionDistribution = async (questions) => {
    const chapterDistribution = {};
    const difficultyDistribution = {};
    const totalQuestions = questions.length;

    for (const question of questions) {
        // Phân bổ theo độ khó (giữ nguyên)
        const level = question.Level;
        if (level) {
            const levelId = level.level_id;
            if (!difficultyDistribution[levelId]) {
                difficultyDistribution[levelId] = {
                    level_id: levelId,
                    level_name: level.name,
                    question_count: 0,
                    percentage: 0
                };
            }
            difficultyDistribution[levelId].question_count++;
        }

        // Phân bổ theo chương thông qua LO
        const lo = question.LO;
        if (lo) {
            try {
                const chapterLOs = await ChapterLO.findAll({
                    where: { lo_id: lo.lo_id },
                    include: [
                        {
                            model: Chapter,
                            as: 'Chapter',
                            attributes: ['chapter_id', 'name']
                        }
                    ]
                });

                for (const chapterLO of chapterLOs) {
                    if (!chapterLO.Chapter) continue;

                    const chapterId = chapterLO.Chapter.chapter_id;
                    if (!chapterDistribution[chapterId]) {
                        chapterDistribution[chapterId] = {
                            chapter_id: chapterId,
                            chapter_name: chapterLO.Chapter.name,
                            question_count: 0,
                            percentage: 0,
                            related_los: new Set()
                        };
                    }
                    chapterDistribution[chapterId].question_count++;
                    chapterDistribution[chapterId].related_los.add(lo.name);
                }
            } catch (error) {
                console.error('Error finding chapters for question LO:', lo.lo_id, error);
            }
        }
    }

    // Tính phần trăm và chuyển Set thành Array
    Object.values(chapterDistribution).forEach(chapter => {
        chapter.percentage = Math.round((chapter.question_count / totalQuestions) * 100 * 100) / 100;
        chapter.related_los = Array.from(chapter.related_los);
    });

    Object.values(difficultyDistribution).forEach(level => {
        level.percentage = Math.round((level.question_count / totalQuestions) * 100 * 100) / 100;
    });

    return {
        by_chapter: Object.values(chapterDistribution).sort((a, b) => b.percentage - a.percentage),
        by_difficulty: Object.values(difficultyDistribution).sort((a, b) => b.percentage - a.percentage),
        total_questions: totalQuestions
    };
};

/**
 * Phân tích % hoàn thành LO và đưa ra gợi ý học tập phù hợp
 * @param {Array} questionHistory - Lịch sử trả lời câu hỏi của user
 * @param {number} subjectId - ID của môn học
 * @param {number} completionThreshold - Ngưỡng hoàn thành (mặc định 60%)
 * @returns {Object} Phân tích chi tiết theo % hoàn thành LO
 */
const analyzeLOCompletionPercentage = async (questionHistory, subjectId, completionThreshold = 60) => {
    const loStats = {};

    // Tính toán thống kê cho từng LO
    questionHistory.forEach(history => {
        const lo = history.Question?.LO;
        if (!lo) return;

        const loId = lo.lo_id;
        if (!loStats[loId]) {
            loStats[loId] = {
                lo_id: loId,
                lo_name: lo.name,
                lo_description: lo.description || '',
                total_questions: 0,
                correct_answers: 0,
                total_time_spent: 0,
                questions: []
            };
        }

        loStats[loId].total_questions++;
        if (history.is_correct) {
            loStats[loId].correct_answers++;
        }
        if (history.time_spent) {
            loStats[loId].total_time_spent += history.time_spent;
        }

        loStats[loId].questions.push({
            question_id: history.question_id,
            is_correct: history.is_correct,
            time_spent: history.time_spent
        });
    });

    // Phân loại LO theo % hoàn thành
    const needsImprovement = [];
    const readyForAdvancement = [];

    for (const stat of Object.values(loStats)) {
        const completionPercentage = stat.total_questions > 0 ?
            (stat.correct_answers / stat.total_questions) * 100 : 0;

        const analysis = {
            ...stat,
            completion_percentage: Math.round(completionPercentage * 100) / 100,
            status: completionPercentage < completionThreshold ? 'cần_cải_thiện' : 'đã_thành_thạo'
        };

        if (completionPercentage < completionThreshold) {
            // Lấy chi tiết chương liên quan cho LO yếu
            const chapterDetails = await generateChapterContentDetails(stat.lo_id);
            analysis.related_chapters = chapterDetails;
            analysis.improvement_plan = await createImprovementPlan(stat, completionThreshold);
            analysis.status = 'cần_cải_thiện';
            needsImprovement.push(analysis);
        } else {
            // Gợi ý LO cấp độ cao hơn cho LO đã thành thạo
            const nextLevelSuggestions = await suggestNextLevelLearning(stat.lo_id, subjectId);
            analysis.next_level_suggestions = nextLevelSuggestions.nextLOs;
            analysis.alternative_paths = nextLevelSuggestions.alternativePaths;
            analysis.status = 'đã_thành_thạo';
            readyForAdvancement.push(analysis);
        }
    }

    return {
        needs_improvement: needsImprovement.sort((a, b) => a.completion_percentage - b.completion_percentage),
        ready_for_advancement: readyForAdvancement.sort((a, b) => b.completion_percentage - a.completion_percentage)
    };
};

/**
 * Tạo chi tiết nội dung chương cho LO cần cải thiện
 * @param {number} loId - ID của Learning Outcome
 * @returns {Array} Danh sách chương với nội dung chi tiết
 */
const generateChapterContentDetails = async (loId) => {
    try {
        const relatedChapters = await ChapterLO.findAll({
            where: { lo_id: loId },
            include: [
                {
                    model: Chapter,
                    as: 'Chapter',
                    attributes: ['chapter_id', 'name', 'description'],
                    include: [
                        {
                            model: ChapterSection,
                            as: 'Sections',
                            attributes: ['section_id', 'title', 'content', 'order']
                        }
                    ]
                }
            ]
        });

        return relatedChapters.map(chapterLO => {
            if (!chapterLO.Chapter) return null;

            const chapter = chapterLO.Chapter;
            const sections = chapter.Sections || [];

            return {
                chapter_id: chapter.chapter_id,
                chapter_name: chapter.name,
                chapter_description: chapter.description || 'Không có mô tả',
                sections: sections.map(section => ({
                    section_id: section.section_id,
                    title: section.title,
                    content: section.content || 'Không có nội dung'
                })).sort((a, b) => a.section_id - b.section_id)
            };
        }).filter(chapter => chapter !== null);
    } catch (error) {
        console.error('Error generating chapter content details:', error);
        return [];
    }
};

/**
 * Gợi ý LO cấp độ cao hơn cho LO đã thành thạo
 * @param {number} currentLoId - ID của LO hiện tại
 * @param {number} subjectId - ID của môn học
 * @returns {Object} Gợi ý LO tiếp theo và lộ trình học tập
 */
const suggestNextLevelLearning = async (currentLoId, subjectId) => {
    try {
        const { LO, Subject } = require('../models');

        // Lấy thông tin LO hiện tại
        const currentLO = await LO.findByPk(currentLoId);
        if (!currentLO) {
            return { nextLOs: [], alternativePaths: [] };
        }

        // Tìm các LO khác trong cùng môn học
        const allLOsInSubject = await LO.findAll({
            include: [
                {
                    model: Chapter,
                    as: 'Chapters',
                    through: { model: ChapterLO },
                    include: [
                        {
                            model: Subject,
                            as: 'Subject',
                            where: { subject_id: subjectId }
                        }
                    ]
                }
            ]
        });

        // Lọc ra các LO có thể là cấp độ cao hơn
        const nextLevelLOs = allLOsInSubject
            .filter(lo => lo.lo_id !== currentLoId)
            .map(lo => ({
                lo_id: lo.lo_id,
                lo_name: lo.name,
                description: lo.description || '',
                prerequisite_met: true, // Giả định đã đáp ứng điều kiện
                difficulty_increase: determineRelativeDifficulty(currentLO.name, lo.name),
                estimated_study_time: estimateStudyTimeForLO(lo.name)
            }))
            .slice(0, 3); // Lấy tối đa 3 gợi ý

        // Tạo các lộ trình học tập thay thế
        const alternativePaths = generateAlternativePaths(currentLO.name, subjectId);

        return {
            nextLOs: nextLevelLOs,
            alternativePaths: alternativePaths
        };
    } catch (error) {
        console.error('Error suggesting next level learning:', error);
        return { nextLOs: [], alternativePaths: [] };
    }
};

/**
 * Tạo kế hoạch học tập cá nhân hóa
 * @param {Object} loAnalysis - Kết quả phân tích LO
 * @returns {Object} Kế hoạch học tập chi tiết
 */
const createPersonalizedStudyPlan = (loAnalysis) => {
    const needsImprovement = loAnalysis.needs_improvement || [];
    const readyForAdvancement = loAnalysis.ready_for_advancement || [];

    const studyPlan = {
        immediate_focus: [],
        next_phase: [],
        study_schedule: {}
    };

    // Xác định ưu tiên học tập ngay lập tức
    needsImprovement.forEach(lo => {
        studyPlan.immediate_focus.push({
            type: 'cải_thiện',
            lo_name: lo.lo_name,
            reason: `Tỷ lệ hoàn thành dưới ngưỡng 60% (${lo.completion_percentage}%)`,
            action: 'Học tập chuyên sâu các chương liên quan'
        });
    });

    // Xác định giai đoạn tiếp theo
    readyForAdvancement.forEach(lo => {
        if (lo.next_level_suggestions && lo.next_level_suggestions.length > 0) {
            studyPlan.next_phase.push({
                type: 'nâng_cao',
                lo_name: lo.next_level_suggestions[0].lo_name,
                reason: `${lo.lo_name} đã thành thạo (${lo.completion_percentage}%)`,
                action: 'Bắt đầu học cấp độ tiếp theo'
            });
        }
    });

    // Tạo lịch học tập theo tuần
    studyPlan.study_schedule = createWeeklySchedule(needsImprovement, readyForAdvancement);

    return studyPlan;
};

// Helper functions
const estimateStudyTime = (content) => {
    if (!content) return '1 giờ';
    const wordCount = content.split(' ').length;
    const hours = Math.ceil(wordCount / 300); // Giả định 300 từ/giờ
    return `${hours} giờ`;
};

const estimateTotalChapterTime = (sections) => {
    const totalHours = sections.length * 2; // Giả định 2 giờ/section
    return `${totalHours} giờ`;
};

const determineDifficultyLevel = (chapterName, sectionCount) => {
    if (sectionCount <= 3) return 'cơ_bản';
    if (sectionCount <= 6) return 'trung_bình';
    return 'nâng_cao';
};

const determineRelativeDifficulty = (currentLO, nextLO) => {
    // Logic đơn giản để xác định độ khó tương đối
    if (nextLO.toLowerCase().includes('advanced') || nextLO.toLowerCase().includes('nâng cao')) {
        return 'cao';
    }
    if (nextLO.toLowerCase().includes('basic') || nextLO.toLowerCase().includes('cơ bản')) {
        return 'thấp';
    }
    return 'trung_bình';
};

const estimateStudyTimeForLO = (loName) => {
    // Logic đơn giản để ước tính thời gian học
    if (loName.toLowerCase().includes('advanced') || loName.toLowerCase().includes('nâng cao')) {
        return '3-4 tuần';
    }
    if (loName.toLowerCase().includes('basic') || loName.toLowerCase().includes('cơ bản')) {
        return '1-2 tuần';
    }
    return '2-3 tuần';
};

const generateAlternativePaths = (currentLOName, subjectId) => {
    // Logic đơn giản để tạo lộ trình thay thế
    return [
        {
            path_name: 'Chuyên sâu Frontend',
            description: 'Chuyên sâu về giao diện người dùng',
            next_subjects: ['JavaScript Nâng cao', 'React.js', 'Thiết kế UI/UX']
        },
        {
            path_name: 'Phát triển Full-stack',
            description: 'Phát triển toàn diện cả frontend và backend',
            next_subjects: ['Phát triển Backend', 'Thiết kế Database', 'DevOps']
        }
    ];
};

const createImprovementPlan = async (loStat, targetPercentage) => {
    const improvementNeeded = targetPercentage - loStat.completion_percentage;

    return {
        priority: improvementNeeded > 40 ? 'cao' : improvementNeeded > 20 ? 'trung_bình' : 'thấp',
        recommended_study_order: [
            'Ôn lại kiến thức cơ bản',
            'Thực hành với bài tập đơn giản',
            'Làm bài tập nâng cao',
            'Tự kiểm tra với quiz'
        ],
        estimated_completion_time: Math.ceil(improvementNeeded / 10) + ' tuần',
        practice_exercises: [
            'Làm bài tập trắc nghiệm cơ bản',
            'Thực hành với ví dụ thực tế',
            'Tham gia thảo luận nhóm'
        ]
    };
};

const createWeeklySchedule = (needsImprovement, readyForAdvancement) => {
    const schedule = {};

    if (needsImprovement.length > 0) {
        schedule.week_1_2 = {
            focus: `${needsImprovement[0].lo_name} - Học tập chuyên sâu`,
            chapters: needsImprovement[0].related_chapters?.map(ch => ch.chapter_name) || [],
            target_completion: '60%'
        };

        if (needsImprovement.length > 1) {
            schedule.week_3_4 = {
                focus: `${needsImprovement[1].lo_name} - Cải thiện`,
                chapters: needsImprovement[1].related_chapters?.map(ch => ch.chapter_name) || [],
                target_completion: '70%'
            };
        }
    }

    if (readyForAdvancement.length > 0 && readyForAdvancement[0].next_level_suggestions?.length > 0) {
        schedule.week_5_6 = {
            focus: `${readyForAdvancement[0].next_level_suggestions[0].lo_name} (nếu đạt mục tiêu trước đó)`,
            chapters: ['Chủ đề nâng cao'],
            target_completion: 'Bắt đầu LO mới'
        };
    }

    return schedule;
};

module.exports = {
    analyzeLOStrengthsWeaknesses,
    analyzeDifficultyStrengthsWeaknesses,
    calculateQuestionDistribution,
    generateLearningImprovementSuggestions,
    analyzeChapterStrengthsWeaknesses,
    calculateChapterQuestionDistribution,
    generateChapterBasedImprovementSuggestions,
    analyzeLOCompletionPercentage,
    generateChapterContentDetails,
    suggestNextLevelLearning,
    createPersonalizedStudyPlan
};
