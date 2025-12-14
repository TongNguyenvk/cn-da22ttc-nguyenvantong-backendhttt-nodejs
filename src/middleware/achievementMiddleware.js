const AchievementService = require('../services/achievementService');

/**
 * Middleware để tự động track user actions và check achievements
 */
class AchievementMiddleware {
    
    /**
     * Track quiz completion
     */
    static trackQuizCompletion(req, res, next) {
        // Store original res.json
        const originalJson = res.json;
        
        res.json = function(data) {
            // Call original res.json first
            originalJson.call(this, data);
            
            // Track achievement if quiz completed successfully
            if (data.success && req.user && req.user.user_id) {
                const userId = req.user.user_id;
                const quizData = data.data || {};
                
                // Track quiz completion
                AchievementService.trackUserAction(userId, 'quiz_completed', {
                    quiz_id: quizData.quiz_id,
                    score: quizData.score || 0,
                    total_questions: quizData.total_questions || 0,
                    correct_answers: quizData.correct_answers || 0,
                    time_taken: quizData.time_taken || 0
                }).catch(error => {
                    console.error('Error tracking quiz completion:', error);
                });
            }
        };
        
        next();
    }
    
    /**
     * Track question answering
     */
    static trackQuestionAnswer(req, res, next) {
        // Store original res.json
        const originalJson = res.json;
        
        res.json = function(data) {
            // Call original res.json first
            originalJson.call(this, data);
            
            // Track achievement if question answered
            if (data.success && req.user && req.user.user_id) {
                const userId = req.user.user_id;
                const answerData = data.data || {};
                
                // Track question answer
                AchievementService.trackUserAction(userId, 'question_answered', {
                    question_id: answerData.question_id,
                    correct: answerData.is_correct || false,
                    response_time: answerData.response_time || 0,
                    points_earned: answerData.points_earned || 0
                }).catch(error => {
                    console.error('Error tracking question answer:', error);
                });
            }
        };
        
        next();
    }
    
    /**
     * Track streak achievements
     */
    static trackStreak(req, res, next) {
        // Store original res.json
        const originalJson = res.json;
        
        res.json = function(data) {
            // Call original res.json first
            originalJson.call(this, data);
            
            // Track streak if achieved
            if (data.success && req.user && req.user.user_id && data.streak_count) {
                const userId = req.user.user_id;
                
                // Track streak achievement
                AchievementService.trackUserAction(userId, 'streak_achieved', {
                    streak_count: data.streak_count,
                    streak_type: data.streak_type || 'answer'
                }).catch(error => {
                    console.error('Error tracking streak:', error);
                });
            }
        };
        
        next();
    }
    
    /**
     * Track daily login
     */
    static trackDailyLogin(req, res, next) {
        if (req.user && req.user.user_id) {
            const userId = req.user.user_id;
            
            // Track daily login (async, don't wait)
            AchievementService.trackUserAction(userId, 'daily_login', {
                login_time: new Date(),
                streak_days: 1 // This should be calculated based on last login
            }).catch(error => {
                console.error('Error tracking daily login:', error);
            });
        }
        
        next();
    }
    
    /**
     * Track subject progress
     */
    static trackSubjectProgress(req, res, next) {
        // Store original res.json
        const originalJson = res.json;
        
        res.json = function(data) {
            // Call original res.json first
            originalJson.call(this, data);
            
            // Track subject progress if points earned
            if (data.success && req.user && req.user.user_id && data.points_earned) {
                const userId = req.user.user_id;
                
                // Track subject progress
                AchievementService.trackUserAction(userId, 'subject_progress', {
                    subject: data.subject || req.body.subject,
                    points: data.points_earned,
                    quiz_id: data.quiz_id
                }).catch(error => {
                    console.error('Error tracking subject progress:', error);
                });
            }
        };
        
        next();
    }
    
    /**
     * Generic achievement tracker
     * Sử dụng khi muốn track custom actions
     */
    static trackCustomAction(actionType) {
        return (req, res, next) => {
            // Store original res.json
            const originalJson = res.json;
            
            res.json = function(data) {
                // Call original res.json first
                originalJson.call(this, data);
                
                // Track custom action
                if (data.success && req.user && req.user.user_id) {
                    const userId = req.user.user_id;
                    
                    AchievementService.trackUserAction(userId, actionType, {
                        ...req.body,
                        ...data.data,
                        timestamp: new Date()
                    }).catch(error => {
                        console.error(`Error tracking ${actionType}:`, error);
                    });
                }
            };
            
            next();
        };
    }
    
    /**
     * Middleware để check và notify về new achievements
     */
    static notifyNewAchievements(req, res, next) {
        // Store original res.json
        const originalJson = res.json;
        
        res.json = function(data) {
            // Add new_achievements field if available
            if (req.newAchievements && req.newAchievements.length > 0) {
                data.new_achievements = req.newAchievements;
                data.achievements_unlocked = req.newAchievements.length;
            }
            
            // Call original res.json
            originalJson.call(this, data);
        };
        
        next();
    }
    
    /**
     * Batch track multiple actions
     */
    static trackBatchActions(req, res, next) {
        if (req.user && req.user.user_id && req.body.actions && Array.isArray(req.body.actions)) {
            const userId = req.user.user_id;
            
            // Track all actions
            Promise.all(
                req.body.actions.map(action => 
                    AchievementService.trackUserAction(userId, action.type, action.data)
                )
            ).then(results => {
                // Collect all new achievements
                const allNewAchievements = results.reduce((acc, result) => {
                    if (result.new_badges) {
                        acc.push(...result.new_badges);
                    }
                    return acc;
                }, []);
                
                req.newAchievements = allNewAchievements;
                next();
            }).catch(error => {
                console.error('Error tracking batch actions:', error);
                next();
            });
        } else {
            next();
        }
    }
}

module.exports = AchievementMiddleware;
