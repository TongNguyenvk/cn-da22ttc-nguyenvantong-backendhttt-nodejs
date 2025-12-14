const express = require('express');
const router = express.Router();
const QuizModeService = require('../services/quizModeService');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// =====================================================
// QUIZ MODE MANAGEMENT ROUTES
// =====================================================

/**
 * GET /api/quiz-modes/:quizId/info
 * Lấy thông tin mode của quiz
 */
router.get('/:quizId/info', authenticateToken, authorize(['teacher', 'admin', 'student']), async (req, res) => {
    try {
        const { quizId } = req.params;

        const modeInfo = await QuizModeService.getQuizModeInfo(quizId);

        if (!modeInfo.success) {
            return res.status(404).json({
                success: false,
                message: modeInfo.message
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Lấy thông tin quiz mode thành công',
            data: modeInfo
        });
    } catch (error) {
        console.error('Error getting quiz mode info:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin quiz mode',
            error: error.message
        });
    }
});

/**
 * PUT /api/quiz-modes/:quizId/update
 * Cập nhật mode của quiz
 */
router.put('/:quizId/update', authenticateToken, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const { quizId } = req.params;
        const modeConfig = req.body;

        console.log(`[QUIZ-MODE-UPDATE] QuizId: ${quizId}, User: ${req.user?.user_id}, Role: ${req.user?.role}`);
        console.log(`[QUIZ-MODE-UPDATE] Config:`, modeConfig);

        const updateResult = await QuizModeService.updateQuizMode(quizId, modeConfig);

        console.log(`[QUIZ-MODE-UPDATE] Result:`, updateResult);

        if (!updateResult.success) {
            return res.status(400).json({
                success: false,
                message: updateResult.message,
                errors: updateResult.errors
            });
        }

        return res.status(200).json({
            success: true,
            message: updateResult.message,
            data: {
                quiz_id: quizId,
                quiz_mode: updateResult.quiz_mode
            }
        });
    } catch (error) {
        console.error('[QUIZ-MODE-UPDATE] Error updating quiz mode:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật quiz mode',
            error: error.message
        });
    }
});

/**
 * POST /api/quiz-modes/validate
 * Validate quiz mode configuration
 */
router.post('/validate', authenticateToken, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const quizData = req.body;

        const validation = QuizModeService.validateQuizModeConfig(quizData);

        return res.status(200).json({
            success: validation.isValid,
            message: validation.isValid ? 'Cấu hình hợp lệ' : 'Cấu hình không hợp lệ',
            data: {
                isValid: validation.isValid,
                errors: validation.errors
            }
        });
    } catch (error) {
        console.error('Error validating quiz mode config:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi khi validate cấu hình',
            error: error.message
        });
    }
});

/**
 * GET /api/quiz-modes/:quizId/leaderboard
 * Lấy leaderboard dựa trên quiz mode
 */
router.get('/:quizId/leaderboard', authenticateToken, authorize(['teacher', 'admin', 'student']), async (req, res) => {
    try {
        const { quizId } = req.params;

        const leaderboard = await QuizModeService.getLeaderboard(quizId);

        return res.status(200).json({
            success: true,
            message: 'Lấy leaderboard thành công',
            data: {
                quiz_id: quizId,
                leaderboard: leaderboard,
                total_participants: leaderboard.length
            }
        });
    } catch (error) {
        console.error('Error getting leaderboard:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy leaderboard',
            error: error.message
        });
    }
});

/**
 * POST /api/quiz-modes/:quizId/skill-effects
 * Xử lý skill effects (chỉ cho practice mode)
 */
router.post('/:quizId/skill-effects', authenticateToken, authorize(['student']), async (req, res) => {
    try {
        const { quizId } = req.params;
        const { userId, questionId } = req.body;

        const skillResult = await QuizModeService.processSkillEffects(quizId, userId, questionId);

        return res.status(200).json({
            success: skillResult.success,
            message: skillResult.message,
            data: skillResult
        });
    } catch (error) {
        console.error('Error processing skill effects:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi khi xử lý skill effects',
            error: error.message
        });
    }
});

/**
 * GET /api/quiz-modes/:quizId/avatar-info/:userId
 * Lấy thông tin avatar (chỉ cho practice mode)
 */
router.get('/:quizId/avatar-info/:userId', authenticateToken, authorize(['teacher', 'admin', 'student']), async (req, res) => {
    try {
        const { quizId, userId } = req.params;

        const avatarInfo = await QuizModeService.getAvatarInfo(userId, quizId);

        return res.status(200).json({
            success: avatarInfo.success,
            message: avatarInfo.message,
            data: avatarInfo
        });
    } catch (error) {
        console.error('Error getting avatar info:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin avatar',
            error: error.message
        });
    }
});

module.exports = router; 