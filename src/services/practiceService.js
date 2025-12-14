const { User, Question, QuizResult, UserQuestionHistory, LevelRequirement } = require('../models');
const DynamicScoringService = require('./dynamicScoringService');
const GamificationService = require('./gamificationService');
const { Op } = require('sequelize');

/**
 * Practice Service - Xử lý logic cho Practice Mode
 * Có đầy đủ gamification và avatar system
 */
class PracticeService {

    // =====================================================
    // PRACTICE SCORING CONFIGURATION
    // =====================================================

    // Sử dụng DynamicScoringService cho practice mode
    // Bao gồm: speed bonus, streak bonus, difficulty multiplier, etc.

    // =====================================================
    // CORE PRACTICE METHODS
    // =====================================================

    /**
     * Tính điểm với gamification cho practice mode
     */
    static async calculatePracticeScore(params) {
        const {
            userId,
            questionId,
            quizId,
            isCorrect,
            responseTime,
            attemptNumber = 1,
            questionDifficulty = 'medium',
            totalQuizTime = null,
            timeRemaining = null
        } = params;

        // Sử dụng DynamicScoringService cho practice mode
        const dynamicScoreResult = await DynamicScoringService.calculateQuestionScore({
            userId,
            questionId,
            quizId,
            isCorrect,
            responseTime,
            attemptNumber,
            questionDifficulty,
            totalQuizTime,
            timeRemaining
        });

        // Thêm mode info
        dynamicScoreResult.mode = 'practice';

        return dynamicScoreResult;
    }

    /**
     * Xử lý hoàn thành quiz trong practice mode
     */
    static async processPracticeCompletion(userId, quizId, quizData) {
        try {
            const {
                totalQuestions,
                correctAnswers,
                totalTime,
                responseTimes,
                totalScore,
                bonuses
            } = quizData;

            // Sử dụng DynamicScoringService để tính perfect bonuses
            const perfectBonuses = await DynamicScoringService.calculatePerfectQuizBonuses(
                userId,
                quizId,
                quizData
            );

            // Xử lý gamification (tăng level, XP, rewards)
            const gamificationResult = await GamificationService.processQuizCompletion(
                userId,
                quizId,
                {
                    ...quizData,
                    perfect_bonuses: perfectBonuses
                }
            );

            // Lưu kết quả practice
            const practiceResult = {
                user_id: userId,
                quiz_id: quizId,
                total_score: totalScore + (perfectBonuses?.total_bonus || 0),
                correct_answers: correctAnswers,
                total_questions: totalQuestions,
                percentage: (correctAnswers / totalQuestions) * 100,
                total_time: totalTime,
                bonuses: bonuses,
                perfect_bonuses: perfectBonuses,
                gamification_result: gamificationResult,
                mode: 'practice',
                created_at: new Date()
            };

            return {
                success: true,
                practice_result: practiceResult,
                gamification_result: gamificationResult,
                mode: 'practice'
            };

        } catch (error) {
            console.error('Error processing practice completion:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Lấy leaderboard real-time cho practice mode
     */
    static async getPracticeLeaderboard(quizId) {
        try {
            // Sử dụng real-time leaderboard service
            const leaderboard = await GamificationService.getRealtimeLeaderboard(quizId);

            return leaderboard.map((entry, index) => ({
                position: index + 1,
                user_id: entry.user_id,
                username: entry.username,
                full_name: entry.full_name,
                score: entry.score,
                level: entry.level,
                avatar: entry.avatar,
                mode: 'practice'
            }));

        } catch (error) {
            console.error('Error getting practice leaderboard:', error);
            return [];
        }
    }

    /**
     * Lưu câu trả lời practice (có gamification)
     */
    static async savePracticeAnswer(quizId, userId, questionId, answerId, isCorrect, responseTime) {
        try {
            // Tính điểm với gamification
            const scoreResult = await this.calculatePracticeScore({
                userId,
                questionId,
                quizId,
                isCorrect,
                responseTime
            });

            // Lưu vào Redis với gamification data
            const answerData = {
                quiz_id: quizId,
                user_id: userId,
                question_id: questionId,
                answer_id: answerId,
                is_correct: isCorrect,
                score: scoreResult.total_points,
                response_time: responseTime,
                bonuses: scoreResult.bonuses,
                streak_info: scoreResult.streak_info,
                mode: 'practice',
                timestamp: new Date()
            };

            return {
                success: true,
                score: scoreResult.total_points,
                is_correct: isCorrect,
                bonuses: scoreResult.bonuses,
                streak_info: scoreResult.streak_info,
                mode: 'practice'
            };

        } catch (error) {
            console.error('Error saving practice answer:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Lấy thông tin avatar cho practice mode
     */
    static async getPracticeAvatarInfo(userId) {
        try {
            // Lấy thông tin avatar của user
            const avatarInfo = await GamificationService.getUserAvatarInfo(userId);

            return {
                success: true,
                avatar_info: avatarInfo,
                mode: 'practice'
            };

        } catch (error) {
            console.error('Error getting practice avatar info:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Kiểm tra xem quiz có phải practice mode không
     */
    static async isPracticeMode(quizId) {
        try {
            const quiz = await Quiz.findByPk(quizId);
            return quiz && quiz.quiz_mode === 'practice';
        } catch (error) {
            console.error('Error checking quiz mode:', error);
            return false;
        }
    }
}

module.exports = PracticeService; 