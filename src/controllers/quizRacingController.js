// backend/src/controllers/quizRacingController.js
// Real-time Quiz Racing Controller with WebSocket Events

const QuizRacingService = require('../services/quizRacingService');
const { Quiz, User, QuizQuestion, Question } = require('../models');
const { withAuth } = require('../middleware/socketAuthMiddleware');

class QuizRacingController {
    constructor(io) {
        this.io = io;
        this.quizRacingService = new QuizRacingService(io);
        this.setupSocketEvents();
    }

    // =====================================================
    // WEBSOCKET EVENT HANDLERS
    // =====================================================

    setupSocketEvents() {
        this.io.on('connection', (socket) => {
            console.log(`Quiz Racing client connected: ${socket.id} (User: ${socket.user?.name || 'Unknown'})`);

            // Join quiz racing room với authentication
            socket.on('join-quiz-racing', withAuth(async (socket, data) => {
                await this.handleJoinQuizRacing(socket, data);
            }, ['student', 'teacher', 'admin']));

            // Submit answer with racing mechanics
            socket.on('submit-racing-answer', withAuth(async (socket, data) => {
                await this.handleSubmitRacingAnswer(socket, data);
            }, ['student']));

            // Use skill during racing
            socket.on('use-skill', withAuth(async (socket, data) => {
                await this.handleUseSkill(socket, data);
            }, ['student']));

            // Skip question
            socket.on('skip-question', withAuth(async (socket, data) => {
                await this.handleSkipQuestion(socket, data);
            }, ['student']));

            // Get random skill when energy = 100%
            socket.on('get-random-skill', withAuth(async (socket, data) => {
                await this.handleGetRandomSkill(socket, data);
            }, ['student']));

            // Player ready for next round
            socket.on('player-ready', withAuth(async (socket, data) => {
                await this.handlePlayerReady(socket, data);
            }, ['student']));

            // Complete round with racing mechanics
            socket.on('complete-round', withAuth(async (socket, data) => {
                await this.handleCompleteRound(socket, data);
            }, ['student']));

            // Heartbeat for connection maintenance (không cần auth)
            socket.on('heartbeat', () => {
                socket.emit('heartbeat-ack', { 
                    timestamp: Date.now(),
                    user_id: socket.user?.user_id || null 
                });
            });

            // Handle disconnection
            socket.on('disconnect', (reason) => {
                console.log(`Quiz Racing client disconnected: ${socket.id} (${socket.user?.name || 'Unknown'}) - Reason: ${reason}`);
            });
        });
    }

    // =====================================================
    // EVENT HANDLER IMPLEMENTATIONS
    // =====================================================

    /**
     * Handle joining quiz racing session
     */
    async handleJoinQuizRacing(socket, data) {
        try {
            const { quiz_session_id, user_id, username } = data;

            // Validate required data
            if (!quiz_session_id || !user_id || !username) {
                socket.emit('error', { message: 'Missing required data for joining quiz racing' });
                return;
            }

            // Join socket room
            socket.join(`quiz:${quiz_session_id}`);
            socket.join(`quiz:${quiz_session_id}:${user_id}`);

            // Load user's skill loadout
            const loadout = await this.quizRacingService.loadParticipantSkills(quiz_session_id, user_id);

            // Get current session state
            const sessionData = await this.quizRacingService.getSessionData(quiz_session_id);

            // Send join confirmation
            socket.emit('quiz-racing-joined', {
                session_id: quiz_session_id,
                user_id: user_id,
                loadout: loadout,
                session_state: sessionData,
                timestamp: Date.now()
            });

            // Notify other participants
            socket.to(`quiz:${quiz_session_id}`).emit('participant-joined', {
                user_id: user_id,
                username: username,
                timestamp: Date.now()
            });

            console.log(`User ${user_id} joined quiz racing session ${quiz_session_id}`);
        } catch (error) {
            console.error('Error handling join quiz racing:', error);
            socket.emit('error', { message: 'Failed to join quiz racing session' });
        }
    }

    /**
     * Handle submitting answer with racing mechanics
     */
    async handleSubmitRacingAnswer(socket, data) {
        try {
            const { quiz_session_id, user_id, question_id, answer_id, response_time } = data;

            // Validate required data
            if (!quiz_session_id || !user_id || !question_id || !answer_id) {
                socket.emit('error', { message: 'Missing required data for answer submission' });
                return;
            }

            // Get question details for scoring
            const question = await Question.findByPk(question_id);
            if (!question) {
                socket.emit('error', { message: 'Question not found' });
                return;
            }

            // Check if answer is correct
            const isCorrect = answer_id === question.correct_answer;

            // Calculate dynamic scoring with racing mechanics
            const scoringResult = await this.calculateRacingScore(
                quiz_session_id,
                user_id,
                question,
                isCorrect,
                response_time
            );

            // Check for mini game trigger (4 correct answers)
            let miniGameTriggered = false;
            if (isCorrect) {
                const sessionData = await this.quizRacingService.getSessionData(quiz_session_id);
                const participant = sessionData?.participants?.find(p => p.user_id === user_id);

                if (participant) {
                    participant.correct_answers_count = (participant.correct_answers_count || 0) + 1;

                    // Trigger mini game every 4 correct answers
                    if (participant.correct_answers_count % 4 === 0) {
                        miniGameTriggered = true;

                        // Emit mini game trigger event
                        this.io.to(`quiz:${quiz_session_id}:${user_id}`).emit('mini-game-trigger', {
                            user_id: user_id,
                            correct_count: participant.correct_answers_count,
                            duration_seconds: 10,
                            timestamp: Date.now()
                        });
                    }
                }
            }

            // Update energy based on performance
            const energyResult = await this.quizRacingService.updatePlayerEnergy(
                quiz_session_id,
                user_id,
                isCorrect,
                scoringResult.has_speed_bonus,
                scoringResult.has_streak_bonus
            );

            // Update session data with new scores
            await this.updateSessionScores(quiz_session_id, user_id, scoringResult);

            // Send answer result to user
            socket.emit('racing-answer-result', {
                question_id: question_id,
                is_correct: isCorrect,
                points_earned: scoringResult.points_earned,
                total_score: scoringResult.total_score,
                current_streak: scoringResult.current_streak,
                energy_percent: energyResult.energy_percent,
                speed_bonus: scoringResult.speed_bonus,
                streak_bonus: scoringResult.streak_bonus,
                skill_available: energyResult.skill_available,
                mini_game_triggered: miniGameTriggered,
                timestamp: Date.now()
            });

            // Update leaderboard for all participants
            await this.broadcastLeaderboardUpdate(quiz_session_id);

            console.log(`User ${user_id} submitted racing answer for question ${question_id}`);
        } catch (error) {
            console.error('Error handling racing answer submission:', error);
            socket.emit('error', { message: 'Failed to submit racing answer' });
        }
    }

    /**
     * Handle mini game completion
     */
    async handleMiniGameComplete(socket, data) {
        try {
            const { quiz_session_id, user_id, eggs_collected } = data;

            // Validate required data
            if (!quiz_session_id || !user_id || !Array.isArray(eggs_collected)) {
                socket.emit('error', { message: 'Missing required data for mini game completion' });
                return;
            }

            // Store eggs for later opening (after quiz completion)
            const sessionData = await this.quizRacingService.getSessionData(quiz_session_id);
            const participant = sessionData?.participants?.find(p => p.user_id === user_id);

            if (participant) {
                if (!participant.collected_eggs) {
                    participant.collected_eggs = [];
                }
                participant.collected_eggs.push(...eggs_collected);

                // Update session data
                await this.quizRacingService.updateSessionData(quiz_session_id, sessionData);

                // Send confirmation to user
                socket.emit('mini-game-complete', {
                    user_id: user_id,
                    eggs_collected: eggs_collected.length,
                    total_eggs: participant.collected_eggs.length,
                    timestamp: Date.now()
                });

                console.log(`User ${user_id} completed mini game, collected ${eggs_collected.length} eggs`);
            }
        } catch (error) {
            console.error('Error handling mini game completion:', error);
            socket.emit('error', { message: 'Failed to complete mini game' });
        }
    }

    /**
     * Handle skill usage during racing
     */
    async handleUseSkill(socket, data) {
        try {
            const { quiz_session_id, user_id, skill_id, target_user_id } = data;

            // Validate required data
            if (!quiz_session_id || !user_id || !skill_id) {
                socket.emit('error', { message: 'Missing required data for skill usage' });
                return;
            }

            // Execute skill in racing context
            const result = await this.quizRacingService.executeSkillInRacing(
                quiz_session_id,
                user_id,
                skill_id,
                target_user_id
            );

            if (result.success) {
                // Update leaderboard after skill effects
                await this.broadcastLeaderboardUpdate(quiz_session_id);
                
                console.log(`User ${user_id} used skill ${skill_id} in quiz ${quiz_session_id}`);
            } else {
                socket.emit('skill-usage-failed', {
                    skill_id: skill_id,
                    error: result.error,
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            console.error('Error handling skill usage:', error);
            socket.emit('error', { message: 'Failed to use skill' });
        }
    }

    /**
     * Handle skip question
     */
    async handleSkipQuestion(socket, data) {
        try {
            const { quiz_session_id, user_id, question_id } = data;

            // Record skip (0 points, no energy gain)
            await this.updateSessionScores(quiz_session_id, user_id, {
                points_earned: 0,
                total_score: 0, // Keep current score
                current_streak: 0, // Reset streak
                has_speed_bonus: false,
                has_streak_bonus: false
            });

            // Send skip confirmation
            socket.emit('question-skipped', {
                question_id: question_id,
                points_earned: 0,
                timestamp: Date.now()
            });

            // Update leaderboard
            await this.broadcastLeaderboardUpdate(quiz_session_id);

            console.log(`User ${user_id} skipped question ${question_id}`);
        } catch (error) {
            console.error('Error handling skip question:', error);
            socket.emit('error', { message: 'Failed to skip question' });
        }
    }

    /**
     * Handle get random skill when energy = 100%
     */
    async handleGetRandomSkill(socket, data) {
        try {
            const { quiz_session_id, user_id } = data;

            const skill = await this.quizRacingService.selectRandomSkill(quiz_session_id, user_id);

            if (skill) {
                socket.emit('random-skill-selected', {
                    skill: skill,
                    timestamp: Date.now()
                });
            } else {
                socket.emit('no-skills-available', {
                    message: 'No skills available or all skills used',
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            console.error('Error getting random skill:', error);
            socket.emit('error', { message: 'Failed to get random skill' });
        }
    }

    /**
     * Handle player ready for next round
     */
    async handlePlayerReady(socket, data) {
        try {
            const { quiz_session_id, user_id } = data;

            // Mark player as ready
            socket.to(`quiz:${quiz_session_id}`).emit('player-ready', {
                user_id: user_id,
                timestamp: Date.now()
            });

            console.log(`User ${user_id} is ready for next round in quiz ${quiz_session_id}`);
        } catch (error) {
            console.error('Error handling player ready:', error);
            socket.emit('error', { message: 'Failed to mark player as ready' });
        }
    }

    /**
     * Handle quiz racing completion and instant egg opening
     */
    async handleQuizRacingComplete(req, res) {
        try {
            const { quiz_session_id } = req.params;
            const user_id = req.user.user_id;

            // Get session data
            const sessionData = await this.quizRacingService.getSessionData(quiz_session_id);
            if (!sessionData) {
                return res.status(404).json({
                    success: false,
                    message: 'Quiz session not found'
                });
            }

            const participant = sessionData.participants.find(p => p.user_id === user_id);
            if (!participant) {
                return res.status(404).json({
                    success: false,
                    message: 'Participant not found in session'
                });
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
            const finalRewards = await this.calculateFinalRewards(participant);

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
    }

    // =====================================================
    // HELPER METHODS
    // =====================================================

    /**
     * Calculate racing score with bonuses according to GAME_SYSTEM_SYNLEARNIA.md
     */
    async calculateRacingScore(quizSessionId, userId, question, isCorrect, responseTime) {
        if (!isCorrect) {
            return {
                points_earned: 0,
                total_score: 0,
                current_streak: 0,
                speed_bonus: 0,
                streak_bonus: 0,
                has_speed_bonus: false,
                has_streak_bonus: false,
                round: 1
            };
        }

        // Base points according to difficulty
        const basePoints = {
            'easy': 100,
            'medium': 150,
            'hard': 200
        };

        // Speed bonus thresholds (5 seconds = 5000ms)
        const speedBonusPoints = {
            'easy': 30,
            'medium': 40,
            'hard': 50
        };

        // Streak bonus points
        const streakBonusPoints = {
            4: 15,
            5: 25,
            6: 35,
            7: 50  // 7+ gets 50 points
        };

        const difficulty = question.difficulty || 'medium';
        let points = basePoints[difficulty] || 150;
        let speedBonus = 0;
        let streakBonus = 0;
        let hasSpeedBonus = false;
        let hasStreakBonus = false;

        // Calculate speed bonus (only in round 1, within 5 seconds)
        if (responseTime <= 5000) {
            speedBonus = speedBonusPoints[difficulty] || 40;
            hasSpeedBonus = true;
        }

        // Get current streak for user
        const sessionData = await this.quizRacingService.getSessionData(quizSessionId);
        const participant = sessionData?.participants?.find(p => p.user_id === userId);
        const currentStreak = participant?.current_streak || 0;

        // Calculate streak bonus (only for streak >= 4)
        if (currentStreak >= 4) {
            const streakLevel = Math.min(currentStreak, 7);
            streakBonus = streakBonusPoints[streakLevel] || 50;
            hasStreakBonus = true;
        }

        const totalPoints = points + speedBonus + streakBonus;

        return {
            points_earned: totalPoints,
            base_points: points,
            speed_bonus: speedBonus,
            streak_bonus: streakBonus,
            current_streak: currentStreak + 1,
            has_speed_bonus: hasSpeedBonus,
            has_streak_bonus: hasStreakBonus,
            difficulty: difficulty,
            response_time: responseTime,
            round: 1
        };
    }

    /**
     * Calculate final rewards from quiz performance
     */
    async calculateFinalRewards(participant) {
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

    /**
     * Update session scores
     */
    async updateSessionScores(quizSessionId, userId, scoringResult) {
        const sessionData = await this.quizRacingService.getSessionData(quizSessionId);
        if (!sessionData) return;

        const participant = sessionData.participants.find(p => p.user_id === userId);
        if (participant) {
            if (scoringResult.total_score > 0) {
                participant.current_score = scoringResult.total_score;
            }
            participant.current_streak = scoringResult.current_streak;
        }

        await this.quizRacingService.updateSessionData(quizSessionId, sessionData);
    }

    /**
     * Broadcast leaderboard update to all participants
     */
    async broadcastLeaderboardUpdate(quizSessionId) {
        const sessionData = await this.quizRacingService.getSessionData(quizSessionId);
        if (!sessionData) return;

        // Sort participants by score
        const leaderboard = sessionData.participants
            .sort((a, b) => b.current_score - a.current_score)
            .map((p, index) => ({
                position: index + 1,
                user_id: p.user_id,
                username: p.username,
                current_score: p.current_score,
                current_streak: p.current_streak,
                energy_percent: p.energy_percent
            }));

        // Broadcast to all participants
        this.io.to(`quiz:${quizSessionId}`).emit('leaderboard-update', {
            session_id: quizSessionId,
            leaderboard: leaderboard,
            timestamp: Date.now()
        });
    }

    /**
     * Handle round completion via Socket.io
     */
    async handleCompleteRound(socket, data) {
        try {
            const { quiz_id, round_number, round_score, skipped_round, user_id } = data;

            // Validate required data
            if (!quiz_id || round_number === undefined || round_score === undefined || !user_id) {
                socket.emit('error', { 
                    message: 'Missing required data for round completion',
                    required: ['quiz_id', 'round_number', 'round_score', 'user_id']
                });
                return;
            }

            console.log(`🎯 Processing round completion: User ${user_id}, Round ${round_number}, Score ${round_score}`);

            // Process round completion
            const result = await this.quizRacingService.completeRound({
                quiz_id,
                user_id,
                round_number,
                round_score,
                skipped_round: skipped_round || false
            });

            if (result.success) {
                // Send success response to the user
                socket.emit('round-completed', {
                    success: true,
                    message: 'Vòng đua hoàn thành thành công',
                    data: {
                        round_result: result.round_result
                    },
                    timestamp: Date.now()
                });

                console.log(`✅ Round ${round_number} completed successfully for user ${user_id}`);
            } else {
                socket.emit('error', {
                    message: result.message || 'Failed to complete round',
                    error: result.error
                });
                console.error(`❌ Failed to complete round ${round_number} for user ${user_id}:`, result.error);
            }
        } catch (error) {
            console.error('Error in handleCompleteRound:', error);
            socket.emit('error', {
                message: 'Internal server error during round completion',
                error: error.message
            });
        }
    }
}

module.exports = QuizRacingController;
