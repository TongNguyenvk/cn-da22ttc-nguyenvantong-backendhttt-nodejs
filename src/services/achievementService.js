const { Badge, UserBadge, User, sequelize } = require('../models');
const { Op } = require('sequelize');

class AchievementService {

    // =====================================================
    // ACHIEVEMENT TRACKING METHODS
    // =====================================================

    /**
     * Track user action và check achievements
     * @param {number} userId 
     * @param {string} actionType 
     * @param {object} actionData 
     */
    static async trackUserAction(userId, actionType, actionData = {}) {
        try {
            const user = await User.findByPk(userId);
            if (!user) return;

            // Update user stats based on action
            await this.updateUserStats(user, actionType, actionData);

            // Check for new achievements
            const newBadges = await this.checkAchievements(userId, actionType, actionData);

            return {
                action_tracked: true,
                new_badges: newBadges,
                badges_unlocked: newBadges.length
            };

        } catch (error) {
            console.error('Error tracking user action:', error);
            throw error;
        }
    }

    /**
     * Update user gamification stats
     * @param {object} user 
     * @param {string} actionType 
     * @param {object} actionData 
     */
    static async updateUserStats(user, actionType, actionData) {
        const currentStats = user.gamification_stats || {};

        switch (actionType) {
            case 'quiz_completed':
                currentStats.total_quizzes_completed = (currentStats.total_quizzes_completed || 0) + 1;
                if (actionData.score === 100) {
                    currentStats.perfect_scores = (currentStats.perfect_scores || 0) + 1;
                }
                break;

            case 'question_answered':
                currentStats.total_questions_answered = (currentStats.total_questions_answered || 0) + 1;
                if (actionData.correct) {
                    currentStats.total_correct_answers = (currentStats.total_correct_answers || 0) + 1;

                    // Track speed answers
                    if (actionData.response_time && actionData.response_time <= 5000) {
                        currentStats.speed_answers_5s = (currentStats.speed_answers_5s || 0) + 1;
                    }
                    if (actionData.response_time && actionData.response_time <= 3000) {
                        currentStats.speed_answers_3s = (currentStats.speed_answers_3s || 0) + 1;
                    }
                    if (actionData.response_time && actionData.response_time <= 2000) {
                        currentStats.speed_answers_2s = (currentStats.speed_answers_2s || 0) + 1;
                    }
                    if (actionData.response_time && actionData.response_time <= 1500) {
                        currentStats.speed_answers_1_5s = (currentStats.speed_answers_1_5s || 0) + 1;
                    }
                }
                break;

            case 'streak_achieved':
                const streakCount = actionData.streak_count || 0;
                currentStats.best_streak = Math.max(currentStats.best_streak || 0, streakCount);

                // Track different streak milestones
                if (streakCount >= 5) currentStats.streaks_5_plus = (currentStats.streaks_5_plus || 0) + 1;
                if (streakCount >= 10) currentStats.streaks_10_plus = (currentStats.streaks_10_plus || 0) + 1;
                if (streakCount >= 15) currentStats.streaks_15_plus = (currentStats.streaks_15_plus || 0) + 1;
                if (streakCount >= 20) currentStats.streaks_20_plus = (currentStats.streaks_20_plus || 0) + 1;
                if (streakCount >= 30) currentStats.streaks_30_plus = (currentStats.streaks_30_plus || 0) + 1;
                break;

            case 'daily_login':
                currentStats.login_streak = actionData.streak_days || 1;
                currentStats.total_login_days = (currentStats.total_login_days || 0) + 1;
                break;

            case 'subject_progress':
                if (!currentStats.subject_points) currentStats.subject_points = {};
                const subject = actionData.subject;
                currentStats.subject_points[subject] = (currentStats.subject_points[subject] || 0) + (actionData.points || 0);
                break;
        }

        // Update user stats
        await user.update({ gamification_stats: currentStats });
    }

    /**
     * Check achievements based on user action
     * @param {number} userId 
     * @param {string} actionType 
     * @param {object} actionData 
     */
    static async checkAchievements(userId, actionType, actionData) {
        try {
            const user = await User.findByPk(userId);
            const userStats = user.gamification_stats || {};
            const newBadges = [];

            // Get all achievement badges that user doesn't have yet
            const availableBadges = await Badge.findAll({
                where: {
                    badge_type: 'achievement',
                    is_active: true,
                    badge_id: {
                        [Op.notIn]: sequelize.literal(`(
                            SELECT badge_id FROM "UserBadges" 
                            WHERE user_id = ${userId}
                        )`)
                    }
                }
            });

            for (const badge of availableBadges) {
                const criteria = badge.unlock_criteria;
                let achieved = false;

                switch (criteria.type) {
                    case 'speed_answers':
                        const speedKey = `speed_answers_${criteria.max_time / 1000}s`;
                        achieved = (userStats[speedKey] || 0) >= criteria.count;
                        break;

                    case 'streak':
                        achieved = (userStats.best_streak || 0) >= criteria.count;
                        break;

                    case 'perfect_quiz':
                        achieved = (userStats.perfect_scores || 0) >= criteria.count;
                        break;

                    case 'quiz_completed':
                        achieved = (userStats.total_quizzes_completed || 0) >= criteria.count;
                        break;

                    case 'subject_mastery':
                        const subjectPoints = userStats.subject_points?.[criteria.subject] || 0;
                        achieved = subjectPoints >= criteria.points;
                        break;

                    case 'multi_subject':
                        const subjectPoints2 = userStats.subject_points || {};
                        const qualifiedSubjects = Object.values(subjectPoints2)
                            .filter(points => points >= criteria.min_points).length;
                        achieved = qualifiedSubjects >= criteria.subjects;
                        break;

                    case 'daily_streak':
                        achieved = (userStats.login_streak || 0) >= criteria.days;
                        break;

                    case 'total_points':
                        achieved = user.total_points >= criteria.points;
                        break;

                    case 'first_correct_answer':
                        achieved = (userStats.total_correct_answers || 0) >= 1;
                        break;
                }

                // Check level requirement
                if (achieved && user.current_level >= badge.unlock_level) {
                    const userBadge = await UserBadge.create({
                        user_id: userId,
                        badge_id: badge.badge_id,
                        unlocked_at: new Date()
                    });

                    newBadges.push({
                        user_badge_id: userBadge.user_badge_id,
                        badge_id: badge.badge_id,
                        Badge: badge
                    });
                }
            }

            return newBadges;

        } catch (error) {
            console.error('Error checking achievements:', error);
            return [];
        }
    }

    /**
     * Get user's achievement progress
     * @param {number} userId 
     */
    static async getUserAchievementProgress(userId) {
        try {
            const user = await User.findByPk(userId);
            const userStats = user.gamification_stats || {};

            // Get all achievement badges
            const achievementBadges = await Badge.findAll({
                where: {
                    badge_type: 'achievement',
                    is_active: true
                },
                order: [['unlock_level', 'ASC'], ['rarity', 'ASC']]
            });

            // Get user's unlocked badges
            const unlockedBadges = await UserBadge.findAll({
                where: { user_id: userId },
                include: [{
                    model: Badge,
                    as: 'Badge',
                    where: { badge_type: 'achievement' }
                }]
            });

            const unlockedBadgeIds = unlockedBadges.map(ub => ub.badge_id);

            const progress = achievementBadges.map(badge => {
                const criteria = badge.unlock_criteria;
                const isUnlocked = unlockedBadgeIds.includes(badge.badge_id);
                let currentProgress = 0;
                let maxProgress = 1;
                let progressText = '';

                if (!isUnlocked) {
                    switch (criteria.type) {
                        case 'speed_answers':
                            const speedKey = `speed_answers_${criteria.max_time / 1000}s`;
                            currentProgress = userStats[speedKey] || 0;
                            maxProgress = criteria.count;
                            progressText = `${currentProgress}/${maxProgress} câu nhanh`;
                            break;

                        case 'streak':
                            currentProgress = Math.min(userStats.best_streak || 0, criteria.count);
                            maxProgress = criteria.count;
                            progressText = `${currentProgress}/${maxProgress} chuỗi thắng`;
                            break;

                        case 'perfect_quiz':
                            currentProgress = userStats.perfect_scores || 0;
                            maxProgress = criteria.count;
                            progressText = `${currentProgress}/${maxProgress} quiz hoàn hảo`;
                            break;

                        case 'quiz_completed':
                            currentProgress = userStats.total_quizzes_completed || 0;
                            maxProgress = criteria.count;
                            progressText = `${currentProgress}/${maxProgress} quiz hoàn thành`;
                            break;
                    }
                }

                return {
                    badge_id: badge.badge_id,
                    badge_name: badge.badge_name,
                    badge_description: badge.badge_description,
                    rarity: badge.rarity,
                    unlock_level: badge.unlock_level,
                    is_unlocked: isUnlocked,
                    can_unlock: user.current_level >= badge.unlock_level,
                    current_progress: currentProgress,
                    max_progress: maxProgress,
                    progress_percentage: maxProgress > 0 ? (currentProgress / maxProgress * 100) : 0,
                    progress_text: progressText,
                    unlocked_at: isUnlocked ? unlockedBadges.find(ub => ub.badge_id === badge.badge_id)?.unlocked_at : null
                };
            });

            return {
                total_achievements: achievementBadges.length,
                unlocked_count: unlockedBadges.length,
                completion_rate: ((unlockedBadges.length / achievementBadges.length) * 100).toFixed(2),
                achievements: progress
            };

        } catch (error) {
            console.error('Error getting achievement progress:', error);
            throw error;
        }
    }

    /**
     * Get available event badges
     */
    static async getActiveEventBadges() {
        const now = new Date();

        return await Badge.findAll({
            where: {
                badge_type: 'event',
                is_active: true,
                [Op.or]: [
                    { valid_from: null },
                    { valid_from: { [Op.lte]: now } }
                ],
                [Op.or]: [
                    { valid_until: null },
                    { valid_until: { [Op.gte]: now } }
                ]
            },
            order: [['valid_until', 'ASC']]
        });
    }

    /**
     * Check event badge eligibility
     * @param {number} userId 
     * @param {string} eventType 
     * @param {object} eventData 
     */
    static async checkEventBadges(userId, eventType, eventData) {
        try {
            const eventBadges = await Badge.findAll({
                where: {
                    badge_type: 'event',
                    event_type: eventType,
                    is_active: true,
                    badge_id: {
                        [Op.notIn]: sequelize.literal(`(
                            SELECT badge_id FROM "UserBadges" 
                            WHERE user_id = ${userId}
                        )`)
                    }
                }
            });

            const newBadges = [];

            for (const badge of eventBadges) {
                const criteria = badge.unlock_criteria;
                let achieved = false;

                switch (criteria.type) {
                    case 'event_participation':
                        achieved = eventData.total_score >= criteria.min_score;
                        break;

                    case 'event_boss':
                        achieved = eventData.boss_defeated === criteria.boss;
                        break;
                }

                if (achieved) {
                    const userBadge = await UserBadge.create({
                        user_id: userId,
                        badge_id: badge.badge_id,
                        unlocked_at: new Date()
                    });

                    newBadges.push({
                        user_badge_id: userBadge.user_badge_id,
                        badge_id: badge.badge_id,
                        Badge: badge
                    });
                }
            }

            return newBadges;

        } catch (error) {
            console.error('Error checking event badges:', error);
            return [];
        }
    }
}

module.exports = AchievementService;
