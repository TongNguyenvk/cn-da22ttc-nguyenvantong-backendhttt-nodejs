const AssessmentService = require('./assessmentService');
const PracticeService = require('./practiceService');
const { Quiz } = require('../models');

/**
 * Quiz Mode Service - Orchestrator cho 2 mode quiz
 * Quyết định sử dụng AssessmentService hay PracticeService dựa trên quiz mode
 */
class QuizModeService {

    // =====================================================
    // MODE DETECTION
    // =====================================================

    /**
     * Kiểm tra quiz mode
     */
    static async getQuizMode(quizId) {
        try {
            const quiz = await Quiz.findByPk(quizId);
            if (!quiz) {
                throw new Error('Quiz not found');
            }
            return quiz.quiz_mode;
        } catch (error) {
            console.error('Error getting quiz mode:', error);
            return 'assessment'; // Default to assessment mode
        }
    }

    /**
     * Kiểm tra xem quiz có enable gamification không
     */
    static async isGamificationEnabled(quizId) {
        try {
            const quiz = await Quiz.findByPk(quizId);
            return quiz && quiz.gamification_enabled;
        } catch (error) {
            console.error('Error checking gamification enabled:', error);
            return false;
        }
    }

    // =====================================================
    // SCORING METHODS
    // =====================================================

    /**
     * Tính điểm dựa trên quiz mode
     */
    static async calculateScore(params) {
        const { quizId } = params;
        const quizMode = await this.getQuizMode(quizId);

        if (quizMode === 'assessment') {
            return await AssessmentService.calculateAssessmentScore(params);
        } else {
            return await PracticeService.calculatePracticeScore(params);
        }
    }

    /**
     * Lưu câu trả lời dựa trên quiz mode
     */
    static async saveAnswer(quizId, userId, questionId, answerId, isCorrect, responseTime) {
        const quizMode = await this.getQuizMode(quizId);

        if (quizMode === 'assessment') {
            return await AssessmentService.saveAssessmentAnswer(
                quizId, userId, questionId, answerId, isCorrect, responseTime
            );
        } else {
            return await PracticeService.savePracticeAnswer(
                quizId, userId, questionId, answerId, isCorrect, responseTime
            );
        }
    }

    // =====================================================
    // COMPLETION METHODS
    // =====================================================

    /**
     * Xử lý hoàn thành quiz dựa trên quiz mode
     */
    static async processQuizCompletion(userId, quizId, quizData) {
        const quizMode = await this.getQuizMode(quizId);

        if (quizMode === 'assessment') {
            return await AssessmentService.processAssessmentCompletion(userId, quizId, quizData);
        } else {
            return await PracticeService.processPracticeCompletion(userId, quizId, quizData);
        }
    }

    // =====================================================
    // LEADERBOARD METHODS
    // =====================================================

    /**
     * Lấy leaderboard dựa trên quiz mode
     */
    static async getLeaderboard(quizId) {
        const quizMode = await this.getQuizMode(quizId);

        if (quizMode === 'assessment') {
            return await AssessmentService.getAssessmentLeaderboard(quizId);
        } else {
            return await PracticeService.getPracticeLeaderboard(quizId);
        }
    }

    // =====================================================
    // GAMIFICATION METHODS
    // =====================================================

    /**
     * Xử lý skill effects (chỉ cho practice mode)
     */
    static async processSkillEffects(quizId, userId, questionId) {
        const quizMode = await this.getQuizMode(quizId);

        if (quizMode === 'practice') {
            return await PracticeService.processSkillEffects(quizId, userId, questionId);
        } else {
            return { success: false, message: 'Skill system not available in assessment mode' };
        }
    }

    /**
     * Lấy thông tin avatar (chỉ cho practice mode)
     */
    static async getAvatarInfo(userId, quizId) {
        const quizMode = await this.getQuizMode(quizId);

        if (quizMode === 'practice') {
            return await PracticeService.getPracticeAvatarInfo(userId);
        } else {
            return { success: false, message: 'Avatar system not available in assessment mode' };
        }
    }

    // =====================================================
    // QUIZ CREATION HELPERS
    // =====================================================

    /**
     * Tạo quiz với mode configuration
     */
    static async createQuizWithMode(quizData) {
        const { quiz_mode = 'assessment' } = quizData;

        // Set default flags based on mode
        const modeConfig = {
            quiz_mode: quiz_mode,
            gamification_enabled: quiz_mode === 'practice',
            avatar_system_enabled: quiz_mode === 'practice',
            level_progression_enabled: quiz_mode === 'practice',
            real_time_leaderboard_enabled: quiz_mode === 'practice'
        };

        return {
            ...quizData,
            ...modeConfig
        };
    }

    /**
     * Validate quiz mode configuration
     */
    static validateQuizModeConfig(quizData) {
        const { quiz_mode, gamification_enabled, avatar_system_enabled } = quizData;

        const errors = [];

        // Validate quiz_mode is required and valid
        if (!quiz_mode) {
            errors.push('Quiz mode is required');
        } else if (!['assessment', 'practice', 'code_practice'].includes(quiz_mode)) {
            errors.push('Quiz mode must be either "assessment", "practice" or "code_practice"');
        }

        if (quiz_mode === 'assessment') {
            // Assessment mode không được có gamification
            if (gamification_enabled === true) {
                errors.push('Assessment mode cannot have gamification enabled');
            }
            if (avatar_system_enabled === true) {
                errors.push('Assessment mode cannot have avatar system enabled');
            }
        }

        // Removed strict requirement for practice mode gamification
        // Practice mode can work with or without gamification

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    // =====================================================
    // UTILITY METHODS
    // =====================================================

    /**
     * Lấy thông tin mode của quiz
     */
    static async getQuizModeInfo(quizId) {
        try {
            const quiz = await Quiz.findByPk(quizId);
            if (!quiz) {
                return { success: false, message: 'Quiz not found' };
            }

            return {
                success: true,
                quiz_mode: quiz.quiz_mode,
                gamification_enabled: quiz.gamification_enabled,
                avatar_system_enabled: quiz.avatar_system_enabled,
                level_progression_enabled: quiz.level_progression_enabled,
                real_time_leaderboard_enabled: quiz.real_time_leaderboard_enabled
            };
        } catch (error) {
            console.error('Error getting quiz mode info:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Cập nhật quiz mode
     */
    static async updateQuizMode(quizId, modeConfig) {
        try {
            const quiz = await Quiz.findByPk(quizId);
            if (!quiz) {
                return { 
                    success: false, 
                    message: 'Quiz not found',
                    errors: ['Quiz not found'] 
                };
            }

            // Validate mode configuration
            const validation = this.validateQuizModeConfig(modeConfig);
            if (!validation.isValid) {
                return { 
                    success: false, 
                    message: 'Validation failed',
                    errors: validation.errors 
                };
            }

            // Update quiz with new mode configuration
            await quiz.update(modeConfig);

            // Invalidate quiz cache
            const { deleteCacheByPattern } = require('../redis/utils');
            try {
                await deleteCacheByPattern(`quiz:${quizId}:*`);
                await deleteCacheByPattern('quizzes:*');
                console.log(`✅ Cache invalidated for quiz ${quizId} after mode update`);
            } catch (cacheError) {
                console.error('❌ Cache invalidation error:', cacheError);
                // Don't fail the update if cache invalidation fails
            }

            return {
                success: true,
                message: 'Quiz mode updated successfully',
                quiz_mode: quiz.quiz_mode
            };
        } catch (error) {
            console.error('Error updating quiz mode:', error);
            return { 
                success: false, 
                message: 'Database error',
                errors: [error.message] 
            };
        }
    }
}

module.exports = QuizModeService; 