const { UserLearningPath, User, Subject, LO, ChapterLO, Chapter, QuizResult, UserQuestionHistory, Quiz, Question, sequelize } = require('../models');
const { Op } = require('sequelize');

class ProgressService {

    // Tính toán tiến độ học tập của user theo subject
    static async calculateSubjectProgress(userId, subjectId) {
        try {
            // Lấy tất cả LO của subject thông qua raw query đơn giản hơn
            const subjectLOs = await sequelize.query(`
                SELECT DISTINCT l.lo_id, l.name, l.description
                FROM "LOs" l
                INNER JOIN "chapter_lo" cl ON l.lo_id = cl.lo_id
                INNER JOIN "Chapters" c ON cl.chapter_id = c.chapter_id
                WHERE c.subject_id = :subjectId
            `, {
                replacements: { subjectId },
                type: sequelize.QueryTypes.SELECT
            });

            if (subjectLOs.length === 0) {
                return {
                    subject_id: subjectId,
                    total_los: 0,
                    completed_los: 0,
                    progress_percentage: 0,
                    mastery_levels: {}
                };
            }

            // Lấy lịch sử trả lời câu hỏi của user cho subject này
            const userHistory = await UserQuestionHistory.findAll({
                where: { user_id: userId },
                include: [{
                    model: Question,
                    as: 'Question',
                    include: [{
                        model: LO,
                        as: 'LO'
                    }]
                }]
            });

            // Tính mastery level cho từng LO
            const loMastery = {};
            const subjectLOIds = subjectLOs.map(lo => lo.lo_id);

            // Đếm số câu hỏi cho mỗi LO
            subjectLOs.forEach(lo => {
                loMastery[lo.lo_id] = {
                    total_questions: 0,
                    correct_answers: 0,
                    total_attempts: 0,
                    mastery_percentage: 0,
                    is_mastered: false
                };
            });

            // Tính toán từ lịch sử trả lời - chỉ lấy những câu hỏi thuộc subject này
            userHistory.forEach(history => {
                if (history.Question && history.Question.LO) {
                    const loId = history.Question.LO.lo_id;
                    // Chỉ tính những LO thuộc subject này
                    if (subjectLOIds.includes(loId) && loMastery[loId]) {
                        loMastery[loId].total_attempts++;
                        if (history.is_correct) {
                            loMastery[loId].correct_answers++;
                        }
                    }
                }
            });

            // Tính mastery percentage và xác định completed LOs
            let completedLOs = 0;
            Object.keys(loMastery).forEach(loId => {
                const mastery = loMastery[loId];
                if (mastery.total_attempts > 0) {
                    mastery.mastery_percentage = Math.round((mastery.correct_answers / mastery.total_attempts) * 100);
                    mastery.is_mastered = mastery.mastery_percentage >= 70; // 70% threshold
                    if (mastery.is_mastered) {
                        completedLOs++;
                    }
                }
            });

            const progressPercentage = subjectLOs.length > 0 ?
                Math.round((completedLOs / subjectLOs.length) * 100) : 0;

            return {
                subject_id: subjectId,
                total_los: subjectLOs.length,
                completed_los: completedLOs,
                progress_percentage: progressPercentage,
                mastery_levels: loMastery
            };

        } catch (error) {
            console.error('Error calculating subject progress:', error);
            throw error;
        }
    }

    // Cập nhật UserLearningPath với progress mới
    static async updateUserLearningPath(userId, subjectId, progressData) {
        try {
            let userPath = await UserLearningPath.findOne({
                where: { user_id: userId, subject_id: subjectId }
            });

            const newLearningProgress = {
                completed_quizzes: progressData.completed_quizzes || [],
                current_lo: progressData.current_lo || null,
                next_lo: progressData.next_lo || null,
                mastery_level: progressData.progress_percentage || 0,
                total_los: progressData.total_los || 0,
                completed_los: progressData.completed_los || 0,
                last_updated: new Date()
            };

            const newPerformanceHistory = {
                quiz_scores: progressData.quiz_scores || [],
                lo_mastery: progressData.mastery_levels || {},
                improvement_areas: progressData.improvement_areas || [],
                average_score: progressData.average_score || 0
            };

            if (userPath) {
                // Cập nhật existing path
                userPath.learning_progress = newLearningProgress;
                userPath.performance_history = newPerformanceHistory;
                await userPath.save();
            } else {
                // Tạo mới path
                userPath = await UserLearningPath.create({
                    user_id: userId,
                    subject_id: subjectId,
                    learning_progress: newLearningProgress,
                    performance_history: newPerformanceHistory,
                    recommended_actions: {
                        next_topics: [],
                        practice_areas: [],
                        difficulty_adjustment: 'maintain'
                    }
                });
            }

            return userPath;

        } catch (error) {
            console.error('Error updating user learning path:', error);
            throw error;
        }
    }

    // Lấy tổng quan tiến độ của user
    static async getUserProgressOverview(userId) {
        try {
            const user = await User.findByPk(userId, {
                attributes: ['user_id', 'name', 'total_points', 'current_level', 'experience_points']
            });

            if (!user) throw new Error('User not found');

            // Lấy tất cả learning paths của user
            const learningPaths = await UserLearningPath.findAll({
                where: { user_id: userId },
                include: [{
                    model: Subject,
                    as: 'Subject',
                    attributes: ['subject_id', 'name']
                }]
            });

            // Tính tổng tiến độ
            let totalProgress = 0;
            let totalSubjects = learningPaths.length;
            const subjectProgress = [];

            for (const path of learningPaths) {
                const progress = path.learning_progress.mastery_level || 0;
                totalProgress += progress;

                subjectProgress.push({
                    subject_id: path.subject_id,
                    subject_name: path.Subject ? path.Subject.name : 'Unknown',
                    progress_percentage: progress,
                    completed_los: path.learning_progress.completed_los || 0,
                    total_los: path.learning_progress.total_los || 0,
                    last_updated: path.learning_progress.last_updated
                });
            }

            const overallProgress = totalSubjects > 0 ? Math.round(totalProgress / totalSubjects) : 0;

            // Lấy thống kê quiz gần đây
            const recentQuizzes = await QuizResult.findAll({
                where: { user_id: userId },
                order: [['update_time', 'DESC']],
                limit: 5,
                attributes: ['quiz_id', 'score', 'update_time']
            });

            return {
                user_info: {
                    user_id: user.user_id,
                    name: user.name,
                    current_level: user.current_level,
                    total_points: user.total_points,
                    experience_points: user.experience_points,
                    experience_to_next_level: 100 - user.experience_points
                },
                progress_overview: {
                    overall_progress: overallProgress,
                    total_subjects: totalSubjects,
                    subjects_completed: subjectProgress.filter(s => s.progress_percentage >= 70).length,
                    subjects_in_progress: subjectProgress.filter(s => s.progress_percentage > 0 && s.progress_percentage < 70).length
                },
                subject_progress: subjectProgress,
                recent_activity: {
                    recent_quizzes: recentQuizzes,
                    last_activity: recentQuizzes.length > 0 ? recentQuizzes[0].update_time : null
                }
            };

        } catch (error) {
            console.error('Error getting user progress overview:', error);
            throw error;
        }
    }

    // Lấy next recommended LO cho user
    static async getNextRecommendedLO(userId, subjectId) {
        try {
            const progressData = await this.calculateSubjectProgress(userId, subjectId);

            // Tìm LO chưa mastered hoặc có mastery thấp nhất
            let nextLO = null;
            let lowestMastery = 100;

            Object.keys(progressData.mastery_levels).forEach(loId => {
                const mastery = progressData.mastery_levels[loId];
                if (!mastery.is_mastered && mastery.mastery_percentage < lowestMastery) {
                    lowestMastery = mastery.mastery_percentage;
                    nextLO = loId;
                }
            });

            if (nextLO) {
                const lo = await LO.findByPk(nextLO);
                return {
                    lo_id: nextLO,
                    lo_description: lo ? lo.description : 'Unknown LO',
                    current_mastery: lowestMastery,
                    recommended_action: lowestMastery === 0 ? 'start_learning' : 'continue_practice'
                };
            }

            return null;

        } catch (error) {
            console.error('Error getting next recommended LO:', error);
            throw error;
        }
    }

    // Cập nhật progress sau khi hoàn thành quiz
    static async updateProgressAfterQuizCompletion(userId, quizId, quizScore) {
        try {
            // Lấy thông tin quiz và subject
            const quiz = await Quiz.findByPk(quizId, {
                include: [{
                    model: Subject,
                    as: 'Subject',
                    attributes: ['subject_id', 'name']
                }]
            });

            if (!quiz || !quiz.Subject) {
                console.log('Quiz or Subject not found for progress update');
                return null;
            }

            const subjectId = quiz.Subject.subject_id;

            // Tính toán lại progress cho subject
            const progressData = await this.calculateSubjectProgress(userId, subjectId);

            // Lấy quiz results để cập nhật completed_quizzes
            const userQuizResults = await QuizResult.findAll({
                where: { user_id: userId },
                include: [{
                    model: Quiz,
                    as: 'Quiz',
                    include: [{
                        model: Subject,
                        as: 'Subject',
                        where: { subject_id: subjectId }
                    }]
                }],
                attributes: ['quiz_id', 'score', 'update_time']
            });

            const completedQuizzes = userQuizResults.map(result => ({
                quiz_id: result.quiz_id,
                score: result.score,
                completed_at: result.update_time
            }));

            const quizScores = userQuizResults.map(result => ({
                quiz_id: result.quiz_id,
                score: result.score,
                date: result.update_time
            }));

            // Cập nhật UserLearningPath
            const updatedPath = await this.updateUserLearningPath(userId, subjectId, {
                ...progressData,
                completed_quizzes: completedQuizzes,
                quiz_scores: quizScores,
                average_score: quizScores.length > 0 ?
                    Math.round(quizScores.reduce((sum, q) => sum + q.score, 0) / quizScores.length) : 0
            });

            // Lấy next recommended LO
            const nextLO = await this.getNextRecommendedLO(userId, subjectId);

            return {
                progress_data: progressData,
                updated_path: updatedPath,
                next_recommended_lo: nextLO,
                subject_info: {
                    subject_id: subjectId,
                    subject_name: quiz.Subject.name
                }
            };

        } catch (error) {
            console.error('Error updating progress after quiz completion:', error);
            throw error;
        }
    }
}

module.exports = ProgressService;
