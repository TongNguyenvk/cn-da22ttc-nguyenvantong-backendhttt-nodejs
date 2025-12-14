// backend/src/routes/skillRoutes.js
const express = require('express');
const router = express.Router();
const SkillController = require('../controllers/skillController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// =====================================================
// PUBLIC SKILL SHOP ROUTES
// =====================================================

/**
 * Get all available skills
 * GET /api/skills
 * Access: Public (for browsing skill shop)
 */
router.get('/', SkillController.getAllSkills);

/**
 * Get skills by category
 * GET /api/skills/category/:category
 * Access: Public
 */
router.get('/category/:category', SkillController.getSkillsByCategory);

// =====================================================
// AUTHENTICATED USER ROUTES
// =====================================================

/**
 * Get user's owned skills
 * GET /api/skills/my-skills
 * Access: Authenticated users
 */
router.get('/my-skills', authenticateToken, SkillController.getUserSkills);

/**
 * Get affordable skills for user
 * GET /api/skills/affordable
 * Access: Authenticated users
 */
router.get('/affordable', authenticateToken, SkillController.getAffordableSkills);

/**
 * Purchase a skill
 * POST /api/skills/purchase
 * Access: Authenticated users
 */
router.post('/purchase', authenticateToken, SkillController.purchaseSkill);

/**
 * Get user's skill statistics
 * GET /api/skills/stats/my-stats
 * Access: Authenticated users
 */
router.get('/stats/my-stats', authenticateToken, SkillController.getUserSkillStats);

// =====================================================
// QUIZ LOADOUT ROUTES
// =====================================================

/**
 * Create/Update quiz skill loadout
 * POST /api/skills/loadout
 * Access: Students (during quiz preparation)
 */
router.post('/loadout', authenticateToken, SkillController.createQuizLoadout);

/**
 * Get user's quiz loadout
 * GET /api/skills/loadout/:quiz_session_id
 * Access: Authenticated users
 */
router.get('/loadout/:quiz_session_id', authenticateToken, SkillController.getQuizLoadout);

/**
 * Get all loadouts for a quiz session
 * GET /api/skills/loadouts/:quiz_session_id
 * Access: Teachers and Admins only
 */
router.get('/loadouts/:quiz_session_id',
    authenticateToken,
    authorize(['teacher', 'admin']),
    SkillController.getAllQuizLoadouts
);

// =====================================================
// SKILL EXECUTION ROUTES (QUIZ RACING)
// =====================================================

/**
 * Execute a skill during quiz
 * POST /api/skills/execute
 * Access: Students (during quiz)
 */
router.post('/execute', authenticateToken, SkillController.executeSkill);

/**
 * Get random skill from user's loadout
 * GET /api/skills/random/:quiz_session_id
 * Access: Students (during quiz - when energy = 100%)
 */
router.get('/random/:quiz_session_id', authenticateToken, SkillController.getRandomSkill);

/**
 * Get active skill effects for quiz session
 * GET /api/skills/effects/:quiz_session_id
 * Access: Authenticated users (during quiz)
 */
router.get('/effects/:quiz_session_id', authenticateToken, SkillController.getActiveEffects);

// =====================================================
// STATISTICS & ANALYTICS ROUTES
// =====================================================

/**
 * Get skill usage statistics
 * GET /api/skills/stats/usage
 * Access: Teachers and Admins
 */
router.get('/stats/usage',
    authenticateToken,
    authorize(['teacher', 'admin']),
    SkillController.getSkillUsageStats
);

// =====================================================
// ROUTE DOCUMENTATION
// =====================================================

/**
 * SKILL SYSTEM API ENDPOINTS SUMMARY:
 * 
 * PUBLIC ROUTES:
 * - GET /api/skills - Get all skills (skill shop browsing)
 * - GET /api/skills/category/:category - Get skills by category
 * 
 * STUDENT ROUTES:
 * - GET /api/skills/my-skills - Get owned skills
 * - GET /api/skills/affordable - Get purchasable skills
 * - POST /api/skills/purchase - Purchase skill
 * - POST /api/skills/loadout - Create quiz loadout
 * - GET /api/skills/loadout/:quiz_session_id - Get quiz loadout
 * - POST /api/skills/execute - Execute skill during quiz
 * - GET /api/skills/random/:quiz_session_id - Get random skill (energy = 100%)
 * - GET /api/skills/effects/:quiz_session_id - Get active effects
 * - GET /api/skills/stats/my-stats - Get personal skill stats
 * 
 * TEACHER/ADMIN ROUTES:
 * - GET /api/skills/loadouts/:quiz_session_id - Get all quiz loadouts
 * - GET /api/skills/stats/usage - Get skill usage analytics
 * 
 * SKILL CATEGORIES:
 * - ATTACK: blackhole, steal, break, slow
 * - DEFENSE: shield, lock, cleanse
 * - BURST: double, lucky, triple, perfect, quintuple
 * - SPECIAL: swap, dice, energy
 * - ULTIMATE: king, phoenix
 * 
 * SKILL TIERS:
 * - S-Tier: Ultimate skills (150-200 Kristal)
 * - A-Tier: Premium burst skills (40-80 Kristal)
 * - B-Tier: Advanced strategy skills (160-200 SynCoin)
 * - C-Tier: Solid choice skills (110-160 SynCoin)
 * - D-Tier: Basic tool skills (100-120 SynCoin)
 * 
 * QUIZ RACING INTEGRATION:
 * 1. Students select 4 skills before joining quiz
 * 2. When energy = 100%, server randomly selects 1/4 skills
 * 3. Student can use skill immediately or save for later
 * 4. Skills have different target types and durations
 * 5. Effects are tracked and processed each question
 * 6. Real-time Socket.IO events for skill usage
 * 
 * CURRENCY SYSTEM:
 * - SynCoin: Primary currency for most skills
 * - Kristal: Premium currency for high-tier skills
 * - Earned through Quiz Racing performance
 * 
 * SOCKET.IO EVENTS:
 * - skill_purchased: When user buys a skill
 * - loadout_updated: When user updates quiz loadout
 * - skill_executed: When skill is used during quiz
 * - effects_processed: When skill effects are updated
 */

module.exports = router;
