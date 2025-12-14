const { Quiz, Question, Level, LO, QuizQuestion, Subject, UserQuestionHistory, User } = require('../models');
const { Op } = require('sequelize');

class AdaptiveQuizService {
    
    /**
     * Phân tích điểm yếu của học sinh
     * @param {number} userId - ID của học sinh
     * @param {number} subjectId - ID của môn học
     * @returns {Object} Dữ liệu phân tích điểm yếu
     */
    async analyzeUserWeakness(userId, subjectId) {
        try {
            // Gọi improvement analysis API logic (tái sử dụng code đã có)
            const { analyzeSubjectImprovement } = require('../controllers/quizResultController');
            
            const improvementData = await analyzeSubjectImprovement(subjectId, userId);
            
            return {
                weak_levels: improvementData.weak_levels,
                weak_chapters: improvementData.chapters_need_improvement,
                overall_performance: this.calculateOverallPerformance(improvementData)
            };
        } catch (error) {
            console.error('Error analyzing user weakness:', error);
            throw error;
        }
    }

    /**
     * Tính toán performance tổng thể
     */
    calculateOverallPerformance(improvementData) {
        const levels = improvementData.weak_levels.levels_analysis;
        const totalAccuracy = levels.reduce((sum, level) => sum + level.accuracy, 0);
        const avgAccuracy = levels.length > 0 ? totalAccuracy / levels.length : 0;
        
        return {
            average_accuracy: Math.round(avgAccuracy),
            performance_level: avgAccuracy >= 80 ? 'excellent' : 
                             avgAccuracy >= 70 ? 'good' : 
                             avgAccuracy >= 50 ? 'average' : 'needs_improvement'
        };
    }

    /**
     * Tính toán priority scores cho các LO
     * @param {Object} improvementData - Dữ liệu improvement analysis
     * @returns {Array} Danh sách LO với priority scores
     */
    calculateLOPriorities(improvementData) {
        const loPriorities = [];
        
        // Xử lý LO analysis
        if (improvementData.weak_chapters && improvementData.weak_chapters.lo_analysis) {
            improvementData.weak_chapters.lo_analysis.forEach(lo => {
                const priorityScore = this.calculatePriorityScore(lo.accuracy, lo.improvement_priority);
                
                loPriorities.push({
                    lo_id: lo.lo_id,
                    lo_name: lo.lo_name,
                    accuracy: lo.accuracy,
                    priority: lo.improvement_priority,
                    priority_score: priorityScore,
                    total_questions: lo.total_questions || 0,
                    chapters: lo.chapters || []
                });
            });
        }

        // Sắp xếp theo priority score giảm dần
        return loPriorities.sort((a, b) => b.priority_score - a.priority_score);
    }

    /**
     * Tính toán priority score
     */
    calculatePriorityScore(accuracy, priority) {
        const baseScore = 100 - accuracy;
        const weightFactor = {
            'high': 3.0,
            'medium': 2.0,
            'low': 1.0
        }[priority] || 1.5;
        
        return Math.round(baseScore * weightFactor);
    }

    /**
     * Tạo phân phối câu hỏi thích ứng
     * @param {Array} loPriorities - Danh sách LO với priority
     * @param {Object} levelWeakness - Điểm yếu theo level
     * @param {number} totalQuestions - Tổng số câu hỏi
     * @param {string} focusMode - Chế độ focus
     * @returns {Object} Phân phối câu hỏi
     */
    generateQuestionDistribution(loPriorities, levelWeakness, totalQuestions, focusMode = 'weak_areas') {
        const distribution = {
            by_priority: {},
            by_difficulty: {},
            by_lo: {},
            total_questions: totalQuestions
        };

        // Phân phối theo priority (weak/medium/strong areas)
        const priorityDistribution = this.calculatePriorityDistribution(totalQuestions, focusMode);
        distribution.by_priority = priorityDistribution;

        // Phân phối theo difficulty dựa trên level weakness
        const difficultyDistribution = this.calculateDifficultyDistribution(
            totalQuestions, 
            levelWeakness,
            focusMode
        );
        distribution.by_difficulty = difficultyDistribution;

        // Phân phối theo LO
        const loDistribution = this.calculateLODistribution(
            loPriorities, 
            totalQuestions,
            priorityDistribution
        );
        distribution.by_lo = loDistribution;

        return distribution;
    }

    /**
     * Tính phân phối theo priority
     */
    calculatePriorityDistribution(totalQuestions, focusMode) {
        const distributions = {
            'weak_areas': { weak: 0.6, medium: 0.25, strong: 0.15 },
            'balanced': { weak: 0.4, medium: 0.4, strong: 0.2 },
            'challenge': { weak: 0.3, medium: 0.3, strong: 0.4 }
        };

        const ratios = distributions[focusMode] || distributions['weak_areas'];
        
        return {
            weak_areas: Math.round(totalQuestions * ratios.weak),
            medium_areas: Math.round(totalQuestions * ratios.medium),
            strong_areas: Math.round(totalQuestions * ratios.strong)
        };
    }

    /**
     * Tính phân phối theo difficulty
     */
    calculateDifficultyDistribution(totalQuestions, levelWeakness, focusMode) {
        // Tìm level yếu nhất
        const weakestLevel = levelWeakness.weakest_level;
        let ratios = { easy: 0.3, medium: 0.4, hard: 0.3 }; // default

        if (weakestLevel) {
            const levelName = weakestLevel.level.toLowerCase();
            
            if (levelName === 'hard') {
                ratios = { easy: 0.2, medium: 0.5, hard: 0.3 };
            } else if (levelName === 'medium') {
                ratios = { easy: 0.3, medium: 0.5, hard: 0.2 };
            } else if (levelName === 'easy') {
                ratios = { easy: 0.5, medium: 0.4, hard: 0.1 };
            }
        }

        // Điều chỉnh theo focus mode
        if (focusMode === 'challenge') {
            ratios.hard += 0.1;
            ratios.easy -= 0.1;
        }

        return {
            easy: Math.round(totalQuestions * ratios.easy),
            medium: Math.round(totalQuestions * ratios.medium),
            hard: Math.round(totalQuestions * ratios.hard)
        };
    }

    /**
     * Tính phân phối theo LO
     */
    calculateLODistribution(loPriorities, totalQuestions, priorityDistribution) {
        const loDistribution = {};
        
        // Chia câu hỏi cho weak areas trước
        const weakLOs = loPriorities.filter(lo => lo.priority === 'high').slice(0, 3);
        const mediumLOs = loPriorities.filter(lo => lo.priority === 'medium').slice(0, 2);
        const strongLOs = loPriorities.filter(lo => lo.priority === 'low').slice(0, 2);

        // Phân phối cho weak LOs
        if (weakLOs.length > 0) {
            const questionsPerWeakLO = Math.floor(priorityDistribution.weak_areas / weakLOs.length);
            weakLOs.forEach(lo => {
                loDistribution[lo.lo_name] = questionsPerWeakLO;
            });
        }

        // Phân phối cho medium LOs
        if (mediumLOs.length > 0) {
            const questionsPerMediumLO = Math.floor(priorityDistribution.medium_areas / mediumLOs.length);
            mediumLOs.forEach(lo => {
                loDistribution[lo.lo_name] = (loDistribution[lo.lo_name] || 0) + questionsPerMediumLO;
            });
        }

        // Phân phối cho strong LOs
        if (strongLOs.length > 0) {
            const questionsPerStrongLO = Math.floor(priorityDistribution.strong_areas / strongLOs.length);
            strongLOs.forEach(lo => {
                loDistribution[lo.lo_name] = (loDistribution[lo.lo_name] || 0) + questionsPerStrongLO;
            });
        }

        return loDistribution;
    }

    /**
     * Chọn câu hỏi thích ứng dựa trên phân phối
     * @param {Object} distribution - Phân phối câu hỏi
     * @param {number} subjectId - ID môn học
     * @param {Array} loPriorities - Danh sách LO priorities
     * @returns {Array} Danh sách câu hỏi được chọn
     */
    async selectAdaptiveQuestions(distribution, subjectId, loPriorities) {
        try {
            const selectedQuestions = [];
            const usedQuestionIds = new Set();

            // Lấy tất cả LO IDs từ priorities
            const loIds = loPriorities.map(lo => lo.lo_id);

            // Chọn câu hỏi theo từng LO và difficulty
            for (const [loName, questionCount] of Object.entries(distribution.by_lo)) {
                if (questionCount <= 0) continue;

                const lo = loPriorities.find(l => l.lo_name === loName);
                if (!lo) continue;

                // Tính phân phối difficulty cho LO này
                const difficultyForLO = this.calculateDifficultyForLO(
                    questionCount, 
                    distribution.by_difficulty,
                    distribution.total_questions
                );

                // Chọn câu hỏi cho từng difficulty level
                for (const [difficulty, count] of Object.entries(difficultyForLO)) {
                    if (count <= 0) continue;

                    const questions = await this.getQuestionsByLOAndDifficulty(
                        lo.lo_id, 
                        difficulty, 
                        count,
                        usedQuestionIds
                    );

                    selectedQuestions.push(...questions);
                    questions.forEach(q => usedQuestionIds.add(q.question_id));
                }
            }

            // Nếu chưa đủ câu hỏi, bổ sung từ các LO khác
            if (selectedQuestions.length < distribution.total_questions) {
                const remainingCount = distribution.total_questions - selectedQuestions.length;
                const additionalQuestions = await this.getAdditionalQuestions(
                    loIds,
                    remainingCount,
                    usedQuestionIds
                );
                selectedQuestions.push(...additionalQuestions);
            }

            return selectedQuestions.slice(0, distribution.total_questions);

        } catch (error) {
            console.error('Error selecting adaptive questions:', error);
            throw error;
        }
    }

    /**
     * Tính phân phối difficulty cho một LO cụ thể
     */
    calculateDifficultyForLO(questionCount, totalDifficultyDistribution, totalQuestions) {
        const ratio = questionCount / totalQuestions;
        
        return {
            easy: Math.round(totalDifficultyDistribution.easy * ratio),
            medium: Math.round(totalDifficultyDistribution.medium * ratio),
            hard: Math.round(totalDifficultyDistribution.hard * ratio)
        };
    }

    /**
     * Lấy câu hỏi theo LO và difficulty
     */
    async getQuestionsByLOAndDifficulty(loId, difficulty, count, usedQuestionIds) {
        const difficultyMap = {
            'easy': 1,
            'medium': 2, 
            'hard': 3
        };

        const questions = await Question.findAll({
            where: {
                lo_id: loId,
                level_id: difficultyMap[difficulty],
                question_id: {
                    [Op.notIn]: Array.from(usedQuestionIds)
                }
            },
            include: [
                { model: Level, as: 'Level' },
                { model: LO, as: 'LO' }
            ],
            order: [['question_id', 'ASC']], // Có thể randomize sau
            limit: count
        });

        return questions;
    }

    /**
     * Lấy câu hỏi bổ sung nếu chưa đủ
     */
    async getAdditionalQuestions(loIds, count, usedQuestionIds) {
        const questions = await Question.findAll({
            where: {
                lo_id: {
                    [Op.in]: loIds
                },
                question_id: {
                    [Op.notIn]: Array.from(usedQuestionIds)
                }
            },
            include: [
                { model: Level, as: 'Level' },
                { model: LO, as: 'LO' }
            ],
            order: [['question_id', 'ASC']],
            limit: count
        });

        return questions;
    }

    /**
     * Tạo phân phối manual dựa trên config của giáo viên
     */
    generateManualDistribution(loPriorities, totalQuestions, manualConfig) {
        const distribution = {
            by_priority: {},
            by_difficulty: {},
            by_lo: {},
            total_questions: totalQuestions
        };

        // Sử dụng difficulty ratio từ manual config
        if (manualConfig.difficulty_ratio) {
            const ratios = manualConfig.difficulty_ratio;
            distribution.by_difficulty = {
                easy: Math.round(totalQuestions * ratios.easy / 100),
                medium: Math.round(totalQuestions * ratios.medium / 100),
                hard: Math.round(totalQuestions * ratios.hard / 100)
            };
        }

        // Sử dụng LO weights từ manual config
        if (manualConfig.lo_weights) {
            const totalWeight = Object.values(manualConfig.lo_weights).reduce((sum, weight) => sum + weight, 0);

            Object.entries(manualConfig.lo_weights).forEach(([loName, weight]) => {
                distribution.by_lo[loName] = Math.round(totalQuestions * weight / totalWeight);
            });
        } else {
            // Fallback to automatic LO distribution
            const loDistribution = this.calculateLODistribution(
                loPriorities,
                totalQuestions,
                { weak_areas: totalQuestions * 0.6, medium_areas: totalQuestions * 0.25, strong_areas: totalQuestions * 0.15 }
            );
            distribution.by_lo = loDistribution;
        }

        // Set priority distribution based on LO distribution
        distribution.by_priority = {
            weak_areas: Math.round(totalQuestions * 0.6),
            medium_areas: Math.round(totalQuestions * 0.25),
            strong_areas: Math.round(totalQuestions * 0.15)
        };

        return distribution;
    }

    /**
     * Tạo recommendations cho quiz thích ứng
     */
    generateRecommendations(loPriorities, levelWeakness, distribution) {
        const recommendations = {
            study_focus: [],
            expected_improvement: '',
            next_steps: []
        };

        // Study focus dựa trên weak areas
        const topWeakLOs = loPriorities.filter(lo => lo.priority === 'high').slice(0, 3);
        topWeakLOs.forEach(lo => {
            recommendations.study_focus.push(`Tập trung vào ${lo.lo_name} (accuracy: ${lo.accuracy}%)`);
        });

        if (levelWeakness.weakest_level) {
            recommendations.study_focus.push(
                `Cải thiện câu hỏi mức độ ${levelWeakness.weakest_level.level}`
            );
        }

        // Expected improvement
        const avgWeakAccuracy = topWeakLOs.length > 0 ? 
            topWeakLOs.reduce((sum, lo) => sum + lo.accuracy, 0) / topWeakLOs.length : 50;
        
        const expectedImprovement = Math.min(25, Math.max(10, Math.round((70 - avgWeakAccuracy) * 0.3)));
        recommendations.expected_improvement = `+${expectedImprovement}% accuracy sau quiz này`;

        // Next steps
        recommendations.next_steps = [
            'Ôn tập các chương liên quan đến LO yếu',
            'Làm thêm bài tập ở mức độ khó phù hợp',
            'Tham gia quiz thích ứng tiếp theo sau 3-5 ngày'
        ];

        return recommendations;
    }
}

module.exports = AdaptiveQuizService;
