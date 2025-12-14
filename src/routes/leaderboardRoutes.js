const express = require('express');
const router = express.Router();
const LeaderboardController = require('../controllers/leaderboardController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// =====================================================
// PUBLIC LEADERBOARD ENDPOINTS
// =====================================================

/**
 * @route GET /api/leaderboard/global
 * @desc Get global leaderboard
 * @access Public
 * @param {string} criteria - Ranking criteria (TOTAL_XP, LEVEL, QUIZ_SCORE, etc.)
 * @param {number} limit - Number of entries to return (default: 50)
 * @param {number} offset - Offset for pagination (default: 0)
 */
router.get('/global', LeaderboardController.getGlobalLeaderboard);

/**
 * @route GET /api/leaderboard/tier
 * @desc Get tier-based leaderboard
 * @access Public
 * @param {string} tier - Tier filter (WOOD, BRONZE, SILVER, etc.)
 * @param {string} criteria - Ranking criteria (TOTAL_XP, LEVEL, QUIZ_SCORE, etc.)
 * @param {number} limit - Number of entries to return (default: 50)
 * @param {number} offset - Offset for pagination (default: 0)
 */
router.get('/tier', LeaderboardController.getTierBasedLeaderboard);

/**
 * @route GET /api/leaderboard/time
 * @desc Get time-based leaderboard (daily, weekly, monthly)
 * @access Public
 * @param {string} time_type - Time type (DAILY, WEEKLY, MONTHLY)
 * @param {string} criteria - Ranking criteria (default: QUIZ_SCORE)
 * @param {number} limit - Number of entries to return (default: 50)
 * @param {number} offset - Offset for pagination (default: 0)
 * @param {string} date - Specific date for the leaderboard (optional)
 */
router.get('/time', LeaderboardController.getTimeBasedLeaderboard);

/**
 * @route GET /api/leaderboard/top-performers
 * @desc Get top performers based on performance criteria
 * @access Public
 * @param {string} criteria - Performance criteria (accuracy_rate, average_score, etc.)
 * @param {string} time_period - Time period (DAILY, WEEKLY, MONTHLY, ALL_TIME)
 * @param {number} limit - Number of performers to return (default: 10)
 * @param {string} tier - Tier filter (optional)
 */
router.get('/top-performers', LeaderboardController.getTopPerformers);

/**
 * @route GET /api/leaderboard/top-movers
 * @desc Get users with biggest rank changes
 * @access Public
 * @param {string} leaderboard_type - Leaderboard type (GLOBAL, TIER_BASED, etc.)
 * @param {string} criteria - Ranking criteria (TOTAL_XP, LEVEL, etc.)
 * @param {string} direction - Movement direction (up, down)
 * @param {number} limit - Number of movers to return (default: 10)
 * @param {string} tier - Tier filter (optional)
 */
router.get('/top-movers', LeaderboardController.getTopMovers);

/**
 * @route GET /api/leaderboard/stats
 * @desc Get leaderboard statistics
 * @access Public
 * @param {string} leaderboard_type - Leaderboard type (GLOBAL, TIER_BASED, etc.)
 * @param {string} criteria - Ranking criteria (TOTAL_XP, LEVEL, etc.)
 * @param {string} tier - Tier filter (optional)
 */
router.get('/stats', LeaderboardController.getLeaderboardStats);

// =====================================================
// AUTHENTICATED USER ENDPOINTS
// =====================================================

/**
 * @route GET /api/leaderboard/my-rank
 * @desc Get current user's rank in specified leaderboard
 * @access Private
 * @param {string} leaderboard_type - Leaderboard type (default: GLOBAL)
 * @param {string} criteria - Ranking criteria (default: TOTAL_XP)
 * @param {string} tier - Tier filter (optional)
 */
router.get('/my-rank', authenticateToken, LeaderboardController.getUserRank);

/**
 * @route GET /api/leaderboard/my-rankings
 * @desc Get current user's rankings across all leaderboards
 * @access Private
 */
router.get('/my-rankings', authenticateToken, LeaderboardController.getUserRankings);

/**
 * @route GET /api/leaderboard/my-performance
 * @desc Get current user's performance statistics
 * @access Private
 * @param {string} time_period - Time period (DAILY, WEEKLY, MONTHLY, ALL_TIME)
 * @param {string} period_date - Specific period date (optional)
 */
router.get('/my-performance', authenticateToken, LeaderboardController.getUserPerformanceStats);

/**
 * @route GET /api/leaderboard/compare
 * @desc Compare current user's performance with another user
 * @access Private
 * @param {number} compare_user_id - ID of user to compare with
 * @param {string} time_period - Time period for comparison (default: ALL_TIME)
 */
router.get('/compare', authenticateToken, LeaderboardController.compareUsers);

// =====================================================
// ADMIN ENDPOINTS
// =====================================================

/**
 * @route POST /api/leaderboard/initialize-user
 * @desc Initialize leaderboard entries for a user
 * @access Admin
 * @body {number} user_id - User ID to initialize
 */
router.post('/initialize-user', 
    authenticateToken, 
    authorize(['admin']), 
    LeaderboardController.initializeUserLeaderboards
);

/**
 * @route POST /api/leaderboard/update-score
 * @desc Manually update user's score in leaderboard
 * @access Admin
 * @body {number} user_id - User ID
 * @body {string} criteria - Ranking criteria
 * @body {number} score - New score value
 * @body {string} leaderboard_type - Leaderboard type (default: GLOBAL)
 * @body {string} tier - Tier filter (optional)
 */
router.post('/update-score', 
    authenticateToken, 
    authorize(['admin']), 
    LeaderboardController.updateUserScore
);

// =====================================================
// ROUTE DOCUMENTATION
// =====================================================

/**
 * @route GET /api/leaderboard/info
 * @desc Get information about available leaderboard options
 * @access Public
 */
router.get('/info', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Leaderboard system information',
        data: {
            leaderboard_types: [
                {
                    type: 'GLOBAL',
                    description: 'Global leaderboard across all users',
                    endpoint: '/api/leaderboard/global'
                },
                {
                    type: 'TIER_BASED',
                    description: 'Leaderboard filtered by user tier',
                    endpoint: '/api/leaderboard/tier'
                },
                {
                    type: 'TIME_BASED',
                    description: 'Time-based leaderboards (daily, weekly, monthly)',
                    endpoint: '/api/leaderboard/time'
                }
            ],
            ranking_criteria: [
                {
                    criteria: 'TOTAL_XP',
                    description: 'Total experience points earned'
                },
                {
                    criteria: 'LEVEL',
                    description: 'Current user level'
                },
                {
                    criteria: 'QUIZ_SCORE',
                    description: 'Quiz performance score'
                },
                {
                    criteria: 'WIN_RATE',
                    description: 'Quiz win rate percentage'
                },
                {
                    criteria: 'STREAK',
                    description: 'Longest answer streak'
                },
                {
                    criteria: 'SOCIAL_SCORE',
                    description: 'Social interaction score'
                }
            ],
            tiers: [
                'WOOD', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 
                'ONYX', 'SAPPHIRE', 'RUBY', 'AMETHYST', 'MASTER'
            ],
            time_periods: [
                'DAILY', 'WEEKLY', 'MONTHLY', 'ALL_TIME'
            ],
            performance_criteria: [
                'accuracy_rate', 'average_score', 'highest_score', 'total_score_earned',
                'first_place_finishes', 'top_3_finishes', 'longest_streak', 'average_rank'
            ]
        }
    });
});

// =====================================================
// ERROR HANDLING MIDDLEWARE
// =====================================================

router.use((error, req, res, next) => {
    console.error('Leaderboard route error:', error);
    res.status(500).json({
        success: false,
        message: 'Internal server error in leaderboard system',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

module.exports = router;
