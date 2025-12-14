// backend/src/routes/quizRacingRoutes.js
// Routes for Quiz Racing System

const express = require('express');
const router = express.Router();
const { authenticateToken, authorize } = require('../middleware/authMiddleware');
const QuizRacingService = require('../services/quizRacingService');
const { Quiz, User, QuizSkillLoadout, Skill, UserSkill } = require('../models');

// Helper function to calculate final rewards
async function calculateFinalRewards(participant) {
    const baseXP = 10; // Participation XP
    const correctAnswerXP = 5; // XP per correct answer
    const scoreXP = Math.floor((participant.current_score || 0) / 50); // XP from score

    // Ranking XP bonus
    const rankingXPBonus = {
        1: 100, // 1st place
        2: 75,  // 2nd place
        3: 50,  // 3rd place
        4: 25,  // 4th-6th place
        5: 25,
        6: 25,
        7: 10,  // 7th-8th place
        8: 10
    };

    const rankBonus = rankingXPBonus[participant.current_rank] || 0;
    const totalXP = baseXP + (participant.correct_answers_count * correctAnswerXP) + scoreXP + rankBonus;

    // SynCoin calculation
    const baseSynCoin = Math.floor((participant.current_score || 0) / 100);
    const correctAnswerSynCoin = participant.correct_answers_count || 0;
    const rankingSynCoinBonus = {
        1: 6, 2: 4, 3: 2, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1
    };
    const rankSynCoinBonus = rankingSynCoinBonus[participant.current_rank] || 0;

    // Clamp SynCoin between 5-30 to prevent inflation
    const totalSynCoin = Math.max(5, Math.min(30, baseSynCoin + correctAnswerSynCoin + rankSynCoinBonus));

    return {
        xp_earned: totalXP,
        syncoin_earned: totalSynCoin,
        breakdown: {
            base_xp: baseXP,
            correct_answer_xp: participant.correct_answers_count * correctAnswerXP,
            score_xp: scoreXP,
            ranking_xp_bonus: rankBonus,
            base_syncoin: baseSynCoin,
            correct_answer_syncoin: correctAnswerSynCoin,
            ranking_syncoin_bonus: rankSynCoinBonus
        }
    };
}

// =====================================================
// QUIZ RACING SESSION MANAGEMENT
// =====================================================

/**
 * @route POST /api/quiz-racing/initialize
 * @desc Initialize a new quiz racing session
 * @access Private (Student+)
 */
router.post('/initialize', authenticateToken, authorize(['student', 'teacher', 'admin']), async (req, res) => {
    try {
        const { quiz_id, participants } = req.body;

        // Validate input
        if (!quiz_id || !participants || !Array.isArray(participants)) {
            return res.status(400).json({
                success: false,
                message: 'Quiz ID and participants array are required'
            });
        }

        // Get quiz details
        const quiz = await Quiz.findByPk(quiz_id);
        if (!quiz) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found'
            });
        }

        // Validate participants
        const validParticipants = [];
        for (const participant of participants) {
            const user = await User.findByPk(participant.user_id);
            if (user) {
                validParticipants.push({
                    user_id: user.user_id,
                    username: user.username
                });
            }
        }

        if (validParticipants.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'At least 2 valid participants required for racing'
            });
        }

        // Generate session ID
        const quizSessionId = `racing_${quiz_id}_${Date.now()}`;

        // Initialize racing session
        const quizRacingService = new QuizRacingService(req.app.get('io'));
        const result = await quizRacingService.initializeQuizRacing(
            quizSessionId,
            validParticipants,
            quiz.total_questions || 10
        );

        if (result.success) {
            res.status(201).json({
                success: true,
                message: 'Quiz racing session initialized successfully',
                data: {
                    session_id: quizSessionId,
                    quiz_id: quiz_id,
                    participants: validParticipants,
                    total_questions: quiz.total_questions || 10
                }
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to initialize quiz racing session',
                error: result.error
            });
        }
    } catch (error) {
        console.error('Error initializing quiz racing:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

/**
 * @route POST /api/quiz-racing/complete/:quiz_session_id
 * @desc Complete quiz racing and open eggs instantly
 * @access Private
 */
router.post('/complete/:quiz_session_id', authenticateToken, async (req, res) => {
    try {
        const { quiz_session_id } = req.params;
        const user_id = req.user.user_id;

        // Get session data
        const quizRacingService = new QuizRacingService(null); // io not needed for this operation
        const sessionData = await quizRacingService.getSessionData(quiz_session_id);

        if (!sessionData) {
            return res.status(404).json({
                success: false,
                message: 'Quiz session not found'
            });
        }

        let participant = sessionData.participants.find(p => p.user_id === user_id);

        // If participant not found, create a mock participant for testing
        if (!participant) {
            participant = {
                user_id: user_id,
                username: `user_${user_id}`,
                current_score: Math.floor(Math.random() * 1000) + 500, // Random score 500-1500
                current_rank: Math.floor(Math.random() * 8) + 1, // Random rank 1-8
                correct_answers_count: Math.floor(Math.random() * 10) + 5, // Random 5-15 correct answers
                collected_eggs: [
                    'basic-egg',
                    'royal-egg'
                ] // Mock collected eggs
            };
        }

        // Open all collected eggs instantly
        const eggResults = [];
        const EggRewardService = require('../services/eggRewardService');

        if (participant.collected_eggs && participant.collected_eggs.length > 0) {
            for (const eggType of participant.collected_eggs) {
                try {
                    const result = await EggRewardService.openEggInstantly(user_id, eggType);
                    if (result.success) {
                        eggResults.push(result.data);
                    }
                } catch (error) {
                    console.error('Error opening egg:', error);
                }
            }
        }

        // Calculate final rewards (XP, SynCoin from quiz performance)
        const finalRewards = await calculateFinalRewards(participant);

        res.status(200).json({
            success: true,
            message: 'Quiz racing completed successfully',
            data: {
                final_score: participant.current_score || 0,
                final_rank: participant.current_rank || 0,
                eggs_opened: eggResults,
                quiz_rewards: finalRewards,
                total_eggs_collected: participant.collected_eggs?.length || 0
            }
        });

    } catch (error) {
        console.error('Error handling quiz racing completion:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to complete quiz racing',
            error: error.message
        });
    }
});

/**
 * @route GET /api/quiz-racing/session/:sessionId
 * @desc Get quiz racing session data
 * @access Private (Student+)
 */
router.get('/session/:sessionId', authenticateToken, authorize(['student', 'teacher', 'admin']), async (req, res) => {
    try {
        const { sessionId } = req.params;

        const quizRacingService = new QuizRacingService(req.app.get('io'));
        const sessionData = await quizRacingService.getSessionData(sessionId);

        if (!sessionData) {
            return res.status(404).json({
                success: false,
                message: 'Quiz racing session not found'
            });
        }

        res.json({
            success: true,
            message: 'Session data retrieved successfully',
            data: sessionData
        });
    } catch (error) {
        console.error('Error getting session data:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// =====================================================
// SKILL LOADOUT MANAGEMENT FOR RACING
// =====================================================

/**
 * @route POST /api/quiz-racing/loadout
 * @desc Set skill loadout for quiz racing session
 * @access Private (Student+)
 */
router.post('/loadout', authenticateToken, authorize(['student', 'teacher', 'admin']), async (req, res) => {
    try {
        const { quiz_session_id, skill_ids } = req.body;
        const userId = req.user.user_id;

        // Validate input
        if (!quiz_session_id || !skill_ids || !Array.isArray(skill_ids) || skill_ids.length !== 4) {
            return res.status(400).json({
                success: false,
                message: 'Quiz session ID and exactly 4 skill IDs are required'
            });
        }

        // Check for duplicates
        const uniqueSkills = [...new Set(skill_ids)];
        if (uniqueSkills.length !== 4) {
            return res.status(400).json({
                success: false,
                message: 'All 4 skills must be different'
            });
        }

        // Validate skill ownership
        const ownedSkills = await UserSkill.findAll({
            where: {
                user_id: userId,
                skill_id: skill_ids
            },
            include: [{ model: Skill, as: 'Skill' }]
        });

        if (ownedSkills.length !== 4) {
            return res.status(400).json({
                success: false,
                message: 'You do not own all selected skills'
            });
        }

        // Create or update loadout
        const [loadout, created] = await QuizSkillLoadout.findOrCreate({
            where: {
                user_id: userId,
                quiz_session_id: quiz_session_id
            },
            defaults: {
                skill_1_id: skill_ids[0],
                skill_2_id: skill_ids[1],
                skill_3_id: skill_ids[2],
                skill_4_id: skill_ids[3]
            }
        });

        if (!created) {
            // Update existing loadout
            await loadout.update({
                skill_1_id: skill_ids[0],
                skill_2_id: skill_ids[1],
                skill_3_id: skill_ids[2],
                skill_4_id: skill_ids[3]
            });
        }

        // Get full loadout with skill details
        const fullLoadout = await QuizSkillLoadout.findByPk(loadout.loadout_id, {
            include: [
                { model: Skill, as: 'Skill1' },
                { model: Skill, as: 'Skill2' },
                { model: Skill, as: 'Skill3' },
                { model: Skill, as: 'Skill4' }
            ]
        });

        res.status(created ? 201 : 200).json({
            success: true,
            message: created ? 'Loadout created successfully' : 'Loadout updated successfully',
            data: {
                loadout_id: fullLoadout.loadout_id,
                skills: [
                    fullLoadout.Skill1,
                    fullLoadout.Skill2,
                    fullLoadout.Skill3,
                    fullLoadout.Skill4
                ]
            }
        });
    } catch (error) {
        console.error('Error setting quiz racing loadout:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

/**
 * @route GET /api/quiz-racing/loadout/:sessionId
 * @desc Get user's loadout for specific racing session
 * @access Private (Student+)
 */
router.get('/loadout/:sessionId', authenticateToken, authorize(['student', 'teacher', 'admin']), async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user.user_id;

        const loadout = await QuizSkillLoadout.findOne({
            where: {
                user_id: userId,
                quiz_session_id: sessionId
            },
            include: [
                { model: Skill, as: 'Skill1' },
                { model: Skill, as: 'Skill2' },
                { model: Skill, as: 'Skill3' },
                { model: Skill, as: 'Skill4' }
            ]
        });

        if (!loadout) {
            return res.status(404).json({
                success: false,
                message: 'No loadout found for this session'
            });
        }

        res.json({
            success: true,
            message: 'Loadout retrieved successfully',
            data: {
                loadout_id: loadout.loadout_id,
                skills: [
                    loadout.Skill1,
                    loadout.Skill2,
                    loadout.Skill3,
                    loadout.Skill4
                ].filter(skill => skill !== null)
            }
        });
    } catch (error) {
        console.error('Error getting quiz racing loadout:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// =====================================================
// RACING STATISTICS
// =====================================================

/**
 * @route GET /api/quiz-racing/stats/:sessionId
 * @desc Get racing session statistics
 * @access Private (Student+)
 */
router.get('/stats/:sessionId', authenticateToken, authorize(['student', 'teacher', 'admin']), async (req, res) => {
    try {
        const { sessionId } = req.params;

        const quizRacingService = new QuizRacingService(req.app.get('io'));
        const sessionData = await quizRacingService.getSessionData(sessionId);

        if (!sessionData) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        // Calculate statistics
        const stats = {
            session_id: sessionId,
            total_participants: sessionData.participants.length,
            current_round: sessionData.round_number,
            total_questions: sessionData.total_questions,
            session_duration: Date.now() - sessionData.session_start_time,
            leaderboard: sessionData.participants
                .sort((a, b) => b.current_score - a.current_score)
                .map((p, index) => ({
                    position: index + 1,
                    user_id: p.user_id,
                    username: p.username,
                    score: p.current_score,
                    streak: p.current_streak,
                    energy: p.energy_percent,
                    skills_used: p.skills_used.length
                }))
        };

        res.json({
            success: true,
            message: 'Session statistics retrieved successfully',
            data: stats
        });
    } catch (error) {
        console.error('Error getting racing statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

/**
 * @route POST /api/racing/complete-round
 * @desc Complete a round and emit top finisher events
 * @access Private
 */
router.post('/complete-round', authenticateToken, authorize(['student', 'teacher', 'admin']), async (req, res) => {
    try {
        const { quiz_id, round_number, round_score, skipped_round } = req.body;
        const user_id = req.user.user_id;

        // Validate input
        if (!quiz_id || round_number === undefined || round_score === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Quiz ID, round number, and round score are required'
            });
        }

        // Get quiz racing service
        const quizRacingService = new QuizRacingService(req.app.get('io'));
        
        // Process round completion
        const result = await quizRacingService.completeRound({
            quiz_id,
            user_id,
            round_number,
            round_score,
            skipped_round: skipped_round || false
        });

        if (result.success) {
            res.status(200).json({
                success: true,
                message: 'Vòng đua hoàn thành thành công',
                data: {
                    round_result: result.round_result
                },
                note: "Round score được cộng vào tổng điểm của realtime leaderboard. Bảng xếp hạng sẽ được cập nhật tự động qua Socket.io. Nếu `skipped_round: true` thì player bị loại khỏi top ranking tất cả các vòng sau."
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.message || 'Failed to complete round',
                error: result.error
            });
        }
    } catch (error) {
        console.error('Error completing round:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

/**
 * @route POST /api/racing/complete-round/test
 * @desc Test complete round without authentication (for testing only)
 * @access Public (for testing)
 */
router.post('/complete-round/test', async (req, res) => {
    try {
        const { quiz_id, round_number, round_score, skipped_round, user_id } = req.body;

        // Validate input
        if (!quiz_id || round_number === undefined || round_score === undefined || !user_id) {
            return res.status(400).json({
                success: false,
                message: 'Quiz ID, round number, round score, and user ID are required for testing'
            });
        }

        // Get quiz racing service
        const quizRacingService = new QuizRacingService(req.app.get('io'));
        
        // Process round completion
        const result = await quizRacingService.completeRound({
            quiz_id,
            user_id,
            round_number,
            round_score,
            skipped_round: skipped_round || false
        });

        if (result.success) {
            res.status(200).json({
                success: true,
                message: 'Vòng đua hoàn thành thành công (TEST MODE)',
                data: {
                    round_result: result.round_result
                },
                note: "TEST MODE: Round score được cộng vào tổng điểm của realtime leaderboard. Bảng xếp hạng sẽ được cập nhật tự động qua Socket.io. Nếu `skipped_round: true` thì player bị loại khỏi top ranking tất cả các vòng sau."
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.message || 'Failed to complete round',
                error: result.error
            });
        }
    } catch (error) {
        console.error('Error completing round (test):', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

module.exports = router;
