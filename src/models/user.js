'use strict';
const { Model } = require('sequelize');
const bcrypt = require('bcrypt');

module.exports = (sequelize, DataTypes) => {
    class User extends Model {
        static associate(models) {
            User.belongsTo(models.Role, { foreignKey: 'role_id' });
            User.hasMany(models.Course, { foreignKey: 'user_id' });
            User.belongsToMany(models.Course, { through: models.StudentCourse, foreignKey: 'user_id' });
            User.hasMany(models.QuizResult, { foreignKey: 'user_id' });
            User.hasMany(models.CourseResult, { foreignKey: 'user_id' });

            // New associations for learning analytics
            User.hasMany(models.StudentProgramProgress, { foreignKey: 'user_id', as: 'StudentProgramProgress' });
            User.hasMany(models.ProgramOutcomeTracking, { foreignKey: 'user_id', as: 'ProgramOutcomeTracking' });
            User.hasMany(models.LearningAnalytics, { foreignKey: 'created_by', as: 'CreatedAnalytics' });

            // Gamification associations
            User.hasMany(models.UserTitle, { foreignKey: 'user_id', as: 'UserTitles' });
            User.hasMany(models.UserBadge, { foreignKey: 'user_id', as: 'UserBadges' });
            User.hasOne(models.UserCustomization, { foreignKey: 'user_id', as: 'UserCustomization' });

            // Skills system associations
            User.hasMany(models.UserSkill, { foreignKey: 'user_id', as: 'UserSkills' });
            User.hasMany(models.QuizSkillLoadout, { foreignKey: 'user_id', as: 'QuizSkillLoadouts' });
            User.hasMany(models.SkillUsageHistory, { foreignKey: 'user_id', as: 'SkillUsageHistory' });
            User.hasMany(models.SkillUsageHistory, { foreignKey: 'target_user_id', as: 'TargetedSkillUsage' });
            User.hasMany(models.ActiveSkillEffect, { foreignKey: 'affected_user_id', as: 'ActiveSkillEffects' });
            User.hasMany(models.ActiveSkillEffect, { foreignKey: 'caster_user_id', as: 'CastedSkillEffects' });
        }

        // Phương thức để so sánh mật khẩu
        async comparePassword(password) {
            return await bcrypt.compare(password, this.password);
        }

        // Gamification methods - Updated to use new level system
        async addPoints(points, reason = 'quiz_completion') {
            const { LevelRequirement, Title, Badge, UserTitle, UserBadge } = sequelize.models;
            const AvatarCustomizationService = require('../services/avatarCustomizationService');
            const oldTotalPoints = this.total_points;
            const newTotalPoints = oldTotalPoints + points;

            // Tính level mới dựa trên LevelRequirement
            const levelInfo = await LevelRequirement.calculateLevelFromXP(newTotalPoints);
            const oldLevel = this.current_level;
            const newLevel = levelInfo.current_level;

            // Cập nhật thông tin user
            this.total_points = newTotalPoints;
            this.current_level = newLevel;
            this.experience_points = levelInfo.current_xp_in_level;

            await this.save();

            // Kiểm tra level up và mở khóa danh hiệu/huy hiệu/avatar items mới
            let newTitles = [];
            let newBadges = [];
            let newAvatarItems = [];

            if (newLevel > oldLevel) {
                // Mở khóa danh hiệu mới
                const unlockedTitles = await Title.getNewUnlockedTitles(oldLevel, newLevel);
                for (const title of unlockedTitles) {
                    const newTitle = await UserTitle.unlockTitle(this.user_id, title.title_id, true); // Set as active
                    if (newTitle) newTitles.push(newTitle);
                }

                // Mở khóa huy hiệu mới
                const unlockedBadges = await Badge.getNewUnlockedBadges(oldLevel, newLevel);
                for (const badge of unlockedBadges) {
                    const newBadge = await UserBadge.unlockBadge(this.user_id, badge.badge_id);
                    if (newBadge) newBadges.push(newBadge);
                }

                // Mở khóa avatar items mới (avatars, frames, name effects, emojis)
                try {
                    const tierInfo = levelInfo.tier_info;
                    const avatarUnlockResult = await AvatarCustomizationService.unlockItemsByLevel(
                        this.user_id,
                        newLevel,
                        tierInfo ? tierInfo.tier_name : 'Wood'
                    );

                    if (avatarUnlockResult.success && avatarUnlockResult.data.unlocked_items) {
                        newAvatarItems = avatarUnlockResult.data.unlocked_items;
                    }
                } catch (avatarError) {
                    console.error('Error unlocking avatar items on level up:', avatarError);
                    // Don't fail the entire level up process if avatar unlock fails
                }
            }

            // Trả về thông tin chi tiết
            return {
                points_added: points,
                total_points: newTotalPoints,
                old_level: oldLevel,
                new_level: newLevel,
                level_up: newLevel > oldLevel,
                levels_gained: newLevel - oldLevel,
                experience_points: levelInfo.current_xp_in_level,
                xp_to_next_level: levelInfo.xp_to_next_level,
                tier_info: levelInfo.tier_info,
                next_level_info: levelInfo.next_level_info,
                new_titles: newTitles,
                new_badges: newBadges,
                new_avatar_items: newAvatarItems,
                reason
            };
        }

        // Lấy thông tin gamification đầy đủ của user
        async getGamificationInfo() {
            const { LevelRequirement, UserTitle, UserBadge } = sequelize.models;

            // Tính toán level info
            const levelInfo = await LevelRequirement.calculateLevelFromXP(this.total_points);

            // Lấy danh hiệu active
            const activeTitle = await UserTitle.getActiveTitle(this.user_id);

            // Lấy thống kê danh hiệu và huy hiệu
            const titleStats = await UserTitle.getUserTitleStats(this.user_id);
            const badgeStats = await UserBadge.getUserBadgeStats(this.user_id);

            return {
                user_id: this.user_id,
                name: this.name,
                total_points: this.total_points,
                current_level: levelInfo.current_level,
                experience_points: levelInfo.current_xp_in_level,
                experience_to_next_level: levelInfo.xp_to_next_level,
                tier_info: levelInfo.tier_info,
                next_level_info: levelInfo.next_level_info,
                active_title: activeTitle ? {
                    title_id: activeTitle.title_id,
                    title_name: activeTitle.Title.title_name,
                    title_display: activeTitle.Title.title_display,
                    tier_name: activeTitle.Title.tier_name,
                    color: activeTitle.Title.color
                } : null,
                title_stats: titleStats,
                badge_stats: badgeStats,
                stats: this.gamification_stats
            };
        }

        async updateGamificationStats(stats) {
            const currentStats = this.gamification_stats || {};
            this.gamification_stats = {
                ...currentStats,
                ...stats
            };
            await this.save();
            return this.gamification_stats;
        }
    }

    User.init(
        {
            user_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            name: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            email: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true,
            },
            password: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            role_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Roles',
                    key: 'role_id',
                },
            },
            // Gamification fields - Optional (chỉ có nếu database đã migrate)
            total_points: {
                type: DataTypes.INTEGER,
                allowNull: true, // Đổi thành allowNull: true
                defaultValue: 0,
                comment: 'Tổng điểm tích lũy của người dùng'
            },
            current_level: {
                type: DataTypes.INTEGER,
                allowNull: true, // Đổi thành allowNull: true
                defaultValue: 1,
                comment: 'Cấp độ hiện tại của người dùng'
            },
            experience_points: {
                type: DataTypes.INTEGER,
                allowNull: true, // Đổi thành allowNull: true
                defaultValue: 0,
                comment: 'Điểm kinh nghiệm trong cấp độ hiện tại'
            },
            gamification_stats: {
                type: DataTypes.JSON,
                allowNull: true, // Đổi thành allowNull: true
                defaultValue: {
                    total_quizzes_completed: 0,
                    total_correct_answers: 0,
                    total_questions_answered: 0,
                    average_response_time: 0,
                    best_streak: 0,
                    current_streak: 0,
                    speed_bonus_earned: 0,
                    perfect_scores: 0
                },
                comment: 'Thống kê gamification của người dùng'
            },
        },
        {
            sequelize,
            modelName: 'User',
            tableName: 'Users',
            timestamps: false, // Nếu không cần createdAt và updatedAt
            hooks: {
                // Hook mã hóa mật khẩu trước khi tạo người dùng
                beforeCreate: async (user) => {
                    if (user.password) {
                        const salt = await bcrypt.genSalt(10); // Tạo salt với độ phức tạp 10
                        user.password = await bcrypt.hash(user.password, salt); // Mã hóa mật khẩu
                    }
                },
                // Hook mã hóa mật khẩu trước khi cập nhật người dùng (nếu mật khẩu thay đổi)
                beforeUpdate: async (user) => {
                    if (user.password && user.changed('password')) {
                        const salt = await bcrypt.genSalt(10);
                        user.password = await bcrypt.hash(user.password, salt);
                    }
                },
            },
        }
    );

    return User;
};