// backend/src/services/obstacleRacingService.js
// Obstacle Course Racing Service - Game Integration with Quiz Racing

const QuizRacingService = require('./quizRacingService');
const { setCache, getCache } = require('../redis/utils');

class ObstacleRacingService extends QuizRacingService {
    constructor(io) {
        super(io);
        this.activeObstacleRaces = new Map(); // Map<sessionId, raceData>
    }

    /**
     * Initialize obstacle course racing session
     * @param {string} sessionId - Racing session ID  
     * @param {Array} participants - Array of participants
     * @param {number} totalQuestions - Total questions in quiz
     * @param {Object} obstacleConfig - Obstacle course configuration
     */
    async initializeObstacleRacing(sessionId, participants, totalQuestions, obstacleConfig = {}) {
        try {
            // Initialize base racing session
            const baseResult = await super.initializeQuizRacing(sessionId, participants, totalQuestions);
            
            if (!baseResult.success) {
                return baseResult;
            }

            // Default obstacle course configuration
            const defaultConfig = {
                total_obstacles: totalQuestions, // One obstacle per question
                obstacle_types: ['jump', 'slide', 'climb', 'dodge', 'sprint'],
                difficulty_progression: 'linear', // linear, exponential, random
                power_ups: true,
                time_pressure: true,
                visual_theme: 'forest', // forest, space, underwater, mountain
                background_music: true,
                sound_effects: true
            };

            const config = { ...defaultConfig, ...obstacleConfig };

            // Generate obstacle course layout
            const obstacleLayout = this.generateObstacleLayout(totalQuestions, config);

            // Initialize race data
            const raceData = {
                session_id: sessionId,
                participants: participants.map(p => ({
                    ...p,
                    position: { x: 0, y: 0 }, // Starting position
                    current_obstacle: 0,
                    obstacles_completed: 0,
                    power_ups_collected: [],
                    status: 'ready', // ready, racing, completed, failed
                    completion_time: null,
                    course_progress: 0 // 0-100%
                })),
                obstacle_layout: obstacleLayout,
                config: config,
                start_time: null,
                status: 'waiting', // waiting, active, completed
                leaderboard: [],
                events: [] // Track race events
            };

            // Store race data
            this.activeObstacleRaces.set(sessionId, raceData);
            await setCache(`obstacle_race:${sessionId}`, raceData, 3600);

            // Notify participants about obstacle course setup
            this.io.to(`quiz:${sessionId}`).emit('obstacle-course-initialized', {
                session_id: sessionId,
                obstacle_layout: obstacleLayout,
                config: config,
                participants: raceData.participants,
                timestamp: Date.now()
            });

            return {
                success: true,
                data: {
                    session_id: sessionId,
                    obstacle_layout: obstacleLayout,
                    config: config,
                    participants: raceData.participants
                }
            };

        } catch (error) {
            console.error('Error initializing obstacle racing:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Generate obstacle course layout based on questions
     */
    generateObstacleLayout(totalQuestions, config) {
        const layout = [];
        const obstacleTypes = config.obstacle_types;
        
        for (let i = 0; i < totalQuestions; i++) {
            // Determine difficulty based on progression
            let difficulty = 'easy';
            if (config.difficulty_progression === 'linear') {
                if (i < totalQuestions * 0.3) difficulty = 'easy';
                else if (i < totalQuestions * 0.7) difficulty = 'medium';
                else difficulty = 'hard';
            } else if (config.difficulty_progression === 'exponential') {
                const progress = i / totalQuestions;
                if (progress < 0.5) difficulty = 'easy';
                else if (progress < 0.8) difficulty = 'medium';
                else difficulty = 'hard';
            } else {
                difficulty = ['easy', 'medium', 'hard'][Math.floor(Math.random() * 3)];
            }

            // Select obstacle type
            const obstacleType = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];
            
            // Generate obstacle data
            const obstacle = {
                id: i + 1,
                question_id: null, // Will be set when questions are loaded
                type: obstacleType,
                difficulty: difficulty,
                position: {
                    x: (i + 1) * 100, // Spaced 100 units apart
                    y: Math.floor(Math.random() * 50) // Random height variation
                },
                // Obstacle-specific properties
                properties: this.generateObstacleProperties(obstacleType, difficulty),
                // Power-ups near this obstacle
                power_ups: config.power_ups ? this.generatePowerUps(i, difficulty) : [],
                // Visual elements
                visual: {
                    theme: config.visual_theme,
                    animations: this.getObstacleAnimations(obstacleType),
                    particles: difficulty === 'hard' // Hard obstacles have particle effects
                }
            };

            layout.push(obstacle);
        }

        // Add finish line
        layout.push({
            id: 'finish',
            type: 'finish_line',
            position: {
                x: (totalQuestions + 1) * 100,
                y: 0
            },
            visual: {
                theme: config.visual_theme,
                celebration: true
            }
        });

        return layout;
    }

    /**
     * Generate obstacle-specific properties
     */
    generateObstacleProperties(type, difficulty) {
        const baseProperties = {
            jump: {
                height: difficulty === 'easy' ? 30 : difficulty === 'medium' ? 50 : 70,
                width: difficulty === 'easy' ? 20 : difficulty === 'medium' ? 30 : 40,
                timing_window: difficulty === 'easy' ? 2000 : difficulty === 'medium' ? 1500 : 1000
            },
            slide: {
                length: difficulty === 'easy' ? 40 : difficulty === 'medium' ? 60 : 80,
                slide_duration: difficulty === 'easy' ? 1500 : difficulty === 'medium' ? 1200 : 1000
            },
            climb: {
                height: difficulty === 'easy' ? 50 : difficulty === 'medium' ? 75 : 100,
                grip_points: difficulty === 'easy' ? 5 : difficulty === 'medium' ? 7 : 10,
                climb_speed: difficulty === 'easy' ? 1.5 : difficulty === 'medium' ? 1.0 : 0.8
            },
            dodge: {
                projectile_speed: difficulty === 'easy' ? 1.0 : difficulty === 'medium' ? 1.5 : 2.0,
                projectile_count: difficulty === 'easy' ? 2 : difficulty === 'medium' ? 3 : 5,
                pattern: difficulty === 'easy' ? 'linear' : difficulty === 'medium' ? 'wave' : 'random'
            },
            sprint: {
                distance: difficulty === 'easy' ? 60 : difficulty === 'medium' ? 80 : 100,
                time_limit: difficulty === 'easy' ? 3000 : difficulty === 'medium' ? 2500 : 2000,
                stamina_drain: difficulty === 'easy' ? 10 : difficulty === 'medium' ? 15 : 25
            }
        };

        return baseProperties[type] || {};
    }

    /**
     * Generate power-ups for obstacle
     */
    generatePowerUps(obstacleIndex, difficulty) {
        const powerUps = [];
        const powerUpTypes = ['speed_boost', 'shield', 'double_points', 'time_freeze', 'skill_refresh'];
        
        // Higher chance of power-ups on harder obstacles
        const spawnChance = difficulty === 'easy' ? 0.2 : difficulty === 'medium' ? 0.4 : 0.6;
        
        if (Math.random() < spawnChance) {
            const type = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
            powerUps.push({
                id: `powerup_${obstacleIndex}_${type}`,
                type: type,
                position: {
                    x: (obstacleIndex + 1) * 100 + Math.random() * 40 - 20,
                    y: Math.random() * 30
                },
                duration: type === 'time_freeze' ? 5000 : 10000,
                effect_strength: difficulty === 'hard' ? 1.5 : 1.0
            });
        }

        return powerUps;
    }

    /**
     * Get obstacle animations based on type
     */
    getObstacleAnimations(type) {
        const animations = {
            jump: ['idle', 'warning', 'trigger'],
            slide: ['static', 'opening', 'closing'],
            climb: ['stable', 'swaying', 'crumbling'],
            dodge: ['charging', 'firing', 'reloading'],
            sprint: ['countdown', 'active', 'finish']
        };

        return animations[type] || ['idle'];
    }

    /**
     * Handle answer submission with obstacle course mechanics
     */
    async handleObstacleRacingAnswer(sessionId, userId, questionId, answerId, responseTime, isCorrect) {
        try {
            // Get race data
            const raceData = this.activeObstacleRaces.get(sessionId) || 
                             await getCache(`obstacle_race:${sessionId}`);
            
            if (!raceData) {
                throw new Error('Obstacle race session not found');
            }

            // Find participant
            const participant = raceData.participants.find(p => p.user_id === userId);
            if (!participant) {
                throw new Error('Participant not found in race');
            }

            // Process the quiz answer using parent class
            const baseResult = await super.handleSubmitRacingAnswer(sessionId, userId, questionId, answerId, responseTime);

            // Calculate obstacle course progression
            const obstacleResult = await this.processObstacleProgression(
                raceData, participant, questionId, isCorrect, responseTime
            );

            // Update participant's race state
            this.updateParticipantRaceState(raceData, userId, obstacleResult);

            // Check for race completion
            if (participant.obstacles_completed >= raceData.obstacle_layout.length - 1) {
                await this.handleRaceCompletion(sessionId, userId, raceData);
            }

            // Update race data
            this.activeObstacleRaces.set(sessionId, raceData);
            await setCache(`obstacle_race:${sessionId}`, raceData, 3600);

            // Emit obstacle racing specific events
            this.emitObstacleRacingEvents(sessionId, userId, obstacleResult, raceData);

            return {
                success: true,
                quiz_result: baseResult,
                obstacle_result: obstacleResult,
                race_state: {
                    current_obstacle: participant.current_obstacle,
                    obstacles_completed: participant.obstacles_completed,
                    course_progress: participant.course_progress,
                    position: participant.position
                }
            };

        } catch (error) {
            console.error('Error handling obstacle racing answer:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Process obstacle progression based on answer result
     */
    async processObstacleProgression(raceData, participant, questionId, isCorrect, responseTime) {
        const currentObstacle = raceData.obstacle_layout[participant.current_obstacle];
        
        if (!currentObstacle) {
            return { success: false, reason: 'No current obstacle' };
        }

        const result = {
            obstacle_id: currentObstacle.id,
            obstacle_type: currentObstacle.type,
            success: false,
            time_taken: responseTime,
            points_earned: 0,
            animation: 'fail',
            effects: []
        };

        if (isCorrect) {
            // Successful obstacle completion
            result.success = true;
            result.animation = 'success';
            result.points_earned = this.calculateObstaclePoints(currentObstacle, responseTime);
            
            // Determine completion quality based on response time
            const timeThreshold = currentObstacle.properties.timing_window || 3000;
            if (responseTime < timeThreshold * 0.5) {
                result.quality = 'perfect';
                result.effects.push('speed_boost');
                result.points_earned *= 1.5;
            } else if (responseTime < timeThreshold * 0.8) {
                result.quality = 'good';
                result.effects.push('confidence_boost');
                result.points_earned *= 1.2;
            } else {
                result.quality = 'ok';
            }

            // Move to next obstacle
            participant.current_obstacle++;
            participant.obstacles_completed++;
            
        } else {
            // Failed obstacle - retry mechanism
            result.animation = 'retry';
            result.effects.push('slow_down');
            
            // Small penalty but allow progression after brief delay
            setTimeout(() => {
                participant.current_obstacle++;
                this.emitObstacleRetry(raceData.session_id, participant.user_id);
            }, 2000);
        }

        // Update position and progress
        participant.position.x = Math.min(
            participant.current_obstacle * 100, 
            raceData.obstacle_layout.length * 100
        );
        participant.course_progress = Math.min(
            (participant.current_obstacle / raceData.obstacle_layout.length) * 100, 
            100
        );

        return result;
    }

    /**
     * Calculate points for obstacle completion
     */
    calculateObstaclePoints(obstacle, responseTime) {
        let basePoints = 100;
        
        // Difficulty multiplier
        if (obstacle.difficulty === 'medium') basePoints *= 1.5;
        else if (obstacle.difficulty === 'hard') basePoints *= 2.0;
        
        // Time bonus (faster = more points)
        const timeBonus = Math.max(0, (5000 - responseTime) / 100);
        
        return Math.floor(basePoints + timeBonus);
    }

    /**
     * Update participant's race state
     */
    updateParticipantRaceState(raceData, userId, obstacleResult) {
        const participant = raceData.participants.find(p => p.user_id === userId);
        if (!participant) return;

        // Add points
        participant.total_points = (participant.total_points || 0) + obstacleResult.points_earned;
        
        // Track completion time for final obstacle
        if (participant.current_obstacle >= raceData.obstacle_layout.length - 1) {
            participant.completion_time = Date.now() - raceData.start_time;
            participant.status = 'completed';
        }

        // Update leaderboard
        this.updateObstacleLeaderboard(raceData);
    }

    /**
     * Update obstacle racing leaderboard
     */
    updateObstacleLeaderboard(raceData) {
        raceData.leaderboard = raceData.participants
            .slice() // Create copy
            .sort((a, b) => {
                // First by completion status
                if (a.status === 'completed' && b.status !== 'completed') return -1;
                if (a.status !== 'completed' && b.status === 'completed') return 1;
                
                // Then by progress
                if (b.course_progress !== a.course_progress) {
                    return b.course_progress - a.course_progress;
                }
                
                // Then by points
                if (b.total_points !== a.total_points) {
                    return b.total_points - a.total_points;
                }
                
                // Finally by completion time (only for completed participants)
                if (a.status === 'completed' && b.status === 'completed') {
                    return a.completion_time - b.completion_time;
                }
                
                return 0;
            })
            .map((participant, index) => ({
                position: index + 1,
                user_id: participant.user_id,
                username: participant.username,
                course_progress: participant.course_progress,
                total_points: participant.total_points || 0,
                status: participant.status,
                completion_time: participant.completion_time
            }));
    }

    /**
     * Handle race completion
     */
    async handleRaceCompletion(sessionId, userId, raceData) {
        const participant = raceData.participants.find(p => p.user_id === userId);
        if (!participant) return;

        // Calculate final rewards
        const finalRewards = this.calculateFinalRewards(participant, raceData);
        
        // Emit completion event
        this.io.to(`quiz:${sessionId}`).emit('obstacle-race-completed', {
            session_id: sessionId,
            user_id: userId,
            completion_time: participant.completion_time,
            final_position: raceData.leaderboard.find(l => l.user_id === userId)?.position || 0,
            rewards: finalRewards,
            timestamp: Date.now()
        });

        // Check if all participants completed
        const allCompleted = raceData.participants.every(p => p.status === 'completed');
        if (allCompleted) {
            await this.handleFullRaceCompletion(sessionId, raceData);
        }
    }

    /**
     * Calculate final rewards for race completion
     */
    calculateFinalRewards(participant, raceData) {
        const position = raceData.leaderboard.find(l => l.user_id === participant.user_id)?.position || 0;
        
        let syncCoins = 0;
        let achievements = [];

        // Position-based rewards (SynCoin only - Kristal removed)
        if (position === 1) {
            syncCoins = 550; // Increased to compensate for no Kristal
            achievements.push('first_place_racer');
        } else if (position <= 3) {
            syncCoins = 330;
            achievements.push('podium_finisher');
        } else {
            syncCoins = 165;
            achievements.push('race_participant');
        }

        // Completion time bonus
        if (participant.completion_time < 120000) { // Under 2 minutes
            syncCoins += 100;
            achievements.push('speed_demon');
        }

        // Perfect run bonus (changed from Kristal to SynCoin)
        if (participant.obstacles_completed === raceData.obstacle_layout.length - 1) {
            syncCoins += 50;
            achievements.push('obstacle_master');
        }

        return {
            syncCoins,
            achievements,
            position
        };
    }

    /**
     * Emit obstacle racing specific events
     */
    emitObstacleRacingEvents(sessionId, userId, obstacleResult, raceData) {
        // Individual obstacle result
        this.io.to(`quiz:${sessionId}:${userId}`).emit('obstacle-result', {
            user_id: userId,
            obstacle_result: obstacleResult,
            timestamp: Date.now()
        });

        // Race state update for all participants
        this.io.to(`quiz:${sessionId}`).emit('obstacle-race-update', {
            session_id: sessionId,
            leaderboard: raceData.leaderboard,
            participants: raceData.participants.map(p => ({
                user_id: p.user_id,
                username: p.username,
                position: p.position,
                course_progress: p.course_progress,
                current_obstacle: p.current_obstacle,
                status: p.status
            })),
            timestamp: Date.now()
        });
    }

    /**
     * Emit retry event for failed obstacle
     */
    emitObstacleRetry(sessionId, userId) {
        this.io.to(`quiz:${sessionId}:${userId}`).emit('obstacle-retry', {
            user_id: userId,
            message: 'Thử lại chướng ngại vật!',
            retry_delay: 2000,
            timestamp: Date.now()
        });
    }

    /**
     * Handle full race completion (all participants finished)
     */
    async handleFullRaceCompletion(sessionId, raceData) {
        // Mark race as completed
        raceData.status = 'completed';
        raceData.end_time = Date.now();

        // Save final results
        await setCache(`obstacle_race:${sessionId}:final`, raceData, 86400); // 24 hours

        // Emit final race results
        this.io.to(`quiz:${sessionId}`).emit('obstacle-race-final-results', {
            session_id: sessionId,
            final_leaderboard: raceData.leaderboard,
            race_duration: raceData.end_time - raceData.start_time,
            statistics: this.calculateRaceStatistics(raceData),
            timestamp: Date.now()
        });

        // Clean up active race
        this.activeObstacleRaces.delete(sessionId);
    }

    /**
     * Calculate race statistics
     */
    calculateRaceStatistics(raceData) {
        const participants = raceData.participants;
        const completionTimes = participants
            .filter(p => p.completion_time)
            .map(p => p.completion_time);

        return {
            total_participants: participants.length,
            completed_participants: participants.filter(p => p.status === 'completed').length,
            average_completion_time: completionTimes.length > 0 
                ? completionTimes.reduce((sum, time) => sum + time, 0) / completionTimes.length 
                : 0,
            fastest_time: completionTimes.length > 0 ? Math.min(...completionTimes) : 0,
            total_obstacles: raceData.obstacle_layout.length - 1, // Exclude finish line
            most_difficult_obstacle: this.findMostDifficultObstacle(raceData)
        };
    }

    /**
     * Find the most difficult obstacle based on failure rates
     */
    findMostDifficultObstacle(raceData) {
        // This would require tracking obstacle completion rates
        // For now, return hard difficulty obstacles
        const hardObstacles = raceData.obstacle_layout.filter(o => o.difficulty === 'hard');
        return hardObstacles[0] || raceData.obstacle_layout[0];
    }

    /**
     * Start obstacle race countdown
     */
    async startObstacleRace(sessionId) {
        const raceData = this.activeObstacleRaces.get(sessionId);
        if (!raceData) {
            throw new Error('Race session not found');
        }

        raceData.status = 'active';
        raceData.start_time = Date.now();

        // Update cache
        await setCache(`obstacle_race:${sessionId}`, raceData, 3600);

        // Emit race start
        this.io.to(`quiz:${sessionId}`).emit('obstacle-race-started', {
            session_id: sessionId,
            start_time: raceData.start_time,
            message: 'Cuộc đua vượt chướng ngại vật bắt đầu!',
            timestamp: Date.now()
        });

        return { success: true, start_time: raceData.start_time };
    }
}

module.exports = ObstacleRacingService;
