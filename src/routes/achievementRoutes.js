const express = require('express');
const router = express.Router();
const AchievementController = require('../controllers/achievementController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// =====================================================
// ACHIEVEMENT PROGRESS ROUTES
// =====================================================

/**
 * @route GET /api/achievements/progress
 * @desc Lấy tiến độ achievements của user hiện tại
 * @access Private
 */
router.get('/progress', 
    authenticateToken, 
    AchievementController.getUserAchievementProgress
);

/**
 * @route GET /api/achievements/badges
 * @desc Lấy tất cả achievement badges (public)
 * @access Public
 * @query rarity - Filter by rarity (common, rare, epic, legendary)
 * @query badge_type - Filter by badge type (achievement, level, event, etc.)
 */
router.get('/badges', 
    AchievementController.getAllAchievementBadges
);

/**
 * @route POST /api/achievements/track
 * @desc Track user action để check achievements
 * @access Private
 * @body action_type - Loại action (quiz_completed, question_answered, etc.)
 * @body action_data - Data của action
 */
router.post('/track', 
    authenticateToken, 
    AchievementController.trackUserAction
);

// =====================================================
// EVENT BADGE ROUTES
// =====================================================

/**
 * @route GET /api/achievements/events
 * @desc Lấy event badges đang active
 * @access Public
 */
router.get('/events', 
    AchievementController.getActiveEventBadges
);

/**
 * @route POST /api/achievements/events/participate
 * @desc Participate in event và check event badges
 * @access Private
 * @body event_type - Loại event (tet_2025, valentine_2025, etc.)
 * @body event_data - Data của event participation
 */
router.post('/events/participate', 
    authenticateToken, 
    AchievementController.participateInEvent
);

// =====================================================
// BADGE STATISTICS ROUTES
// =====================================================

/**
 * @route GET /api/achievements/stats
 * @desc Lấy thống kê badges của user hiện tại
 * @access Private
 */
router.get('/stats', 
    authenticateToken, 
    AchievementController.getUserBadgeStats
);

/**
 * @route GET /api/achievements/leaderboard
 * @desc Lấy leaderboard theo badges
 * @access Public
 * @query limit - Số lượng users trong leaderboard (default: 10)
 * @query badge_type - Filter by badge type (default: all)
 */
router.get('/leaderboard', 
    AchievementController.getBadgeLeaderboard
);

// =====================================================
// ADMIN ROUTES (Optional - for future use)
// =====================================================

/**
 * @route POST /api/achievements/admin/create-badge
 * @desc Tạo badge mới (Admin only)
 * @access Admin
 */
router.post('/admin/create-badge', 
    authenticateToken, 
    authorize(['admin']), 
    async (req, res) => {
        try {
            const { Badge } = require('../models');
            const badgeData = req.body;
            
            const newBadge = await Badge.create(badgeData);
            
            return res.status(201).json({
                success: true,
                message: 'Tạo badge thành công',
                data: newBadge
            });
            
        } catch (error) {
            console.error('Error creating badge:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi tạo badge',
                error: error.message
            });
        }
    }
);

/**
 * @route PUT /api/achievements/admin/update-badge/:badgeId
 * @desc Cập nhật badge (Admin only)
 * @access Admin
 */
router.put('/admin/update-badge/:badgeId', 
    authenticateToken, 
    authorize(['admin']), 
    async (req, res) => {
        try {
            const { Badge } = require('../models');
            const { badgeId } = req.params;
            const updateData = req.body;
            
            const badge = await Badge.findByPk(badgeId);
            if (!badge) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy badge'
                });
            }
            
            await badge.update(updateData);
            
            return res.status(200).json({
                success: true,
                message: 'Cập nhật badge thành công',
                data: badge
            });
            
        } catch (error) {
            console.error('Error updating badge:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi cập nhật badge',
                error: error.message
            });
        }
    }
);

/**
 * @route DELETE /api/achievements/admin/delete-badge/:badgeId
 * @desc Xóa badge (Admin only)
 * @access Admin
 */
router.delete('/admin/delete-badge/:badgeId', 
    authenticateToken, 
    authorize(['admin']), 
    async (req, res) => {
        try {
            const { Badge } = require('../models');
            const { badgeId } = req.params;
            
            const badge = await Badge.findByPk(badgeId);
            if (!badge) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy badge'
                });
            }
            
            // Soft delete - set is_active to false
            await badge.update({ is_active: false });
            
            return res.status(200).json({
                success: true,
                message: 'Xóa badge thành công'
            });
            
        } catch (error) {
            console.error('Error deleting badge:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi xóa badge',
                error: error.message
            });
        }
    }
);

/**
 * @route POST /api/achievements/admin/grant-badge
 * @desc Grant badge cho user (Admin only)
 * @access Admin
 * @body user_id - ID của user
 * @body badge_id - ID của badge
 */
router.post('/admin/grant-badge', 
    authenticateToken, 
    authorize(['admin']), 
    async (req, res) => {
        try {
            const { UserBadge, User, Badge } = require('../models');
            const { user_id, badge_id } = req.body;
            
            if (!user_id || !badge_id) {
                return res.status(400).json({
                    success: false,
                    message: 'user_id và badge_id là bắt buộc'
                });
            }
            
            // Check if user exists
            const user = await User.findByPk(user_id);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy user'
                });
            }
            
            // Check if badge exists
            const badge = await Badge.findByPk(badge_id);
            if (!badge) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy badge'
                });
            }
            
            // Check if user already has this badge
            const existingUserBadge = await UserBadge.findOne({
                where: { user_id, badge_id }
            });
            
            if (existingUserBadge) {
                return res.status(400).json({
                    success: false,
                    message: 'User đã có badge này rồi'
                });
            }
            
            // Grant badge
            const userBadge = await UserBadge.create({
                user_id,
                badge_id,
                unlocked_at: new Date()
            });
            
            return res.status(201).json({
                success: true,
                message: 'Grant badge thành công',
                data: {
                    user_badge_id: userBadge.user_badge_id,
                    user_name: user.name,
                    badge_name: badge.badge_name
                }
            });
            
        } catch (error) {
            console.error('Error granting badge:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi grant badge',
                error: error.message
            });
        }
    }
);

module.exports = router;
