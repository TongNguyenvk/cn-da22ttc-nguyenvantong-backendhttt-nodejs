// backend/src/models/skillUsageHistory.js
module.exports = (sequelize, DataTypes) => {
    const SkillUsageHistory = sequelize.define('SkillUsageHistory', {
        usage_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        quiz_session_id: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'Users',
                key: 'user_id'
            }
        },
        skill_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'Skills',
                key: 'skill_id'
            }
        },
        target_user_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'Users',
                key: 'user_id'
            }
        },
        question_number: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        energy_level: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        execution_result: {
            type: DataTypes.ENUM('SUCCESS', 'FAILED', 'BLOCKED', 'INVALID_TARGET'),
            allowNull: false
        },
        effect_data: {
            type: DataTypes.JSONB,
            allowNull: true
        },
        points_affected: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        used_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        }
    }, {
        tableName: 'SkillUsageHistory',
        timestamps: false
    });

    // Static methods for skill usage tracking
    SkillUsageHistory.recordSkillUsage = async function (usageData) {
        const {
            quizSessionId,
            userId,
            skillId,
            targetUserId = null,
            questionNumber,
            energyLevel,
            executionResult,
            effectData = null,
            pointsAffected = 0
        } = usageData;

        try {
            const usage = await this.create({
                quiz_session_id: quizSessionId,
                user_id: userId,
                skill_id: skillId,
                target_user_id: targetUserId,
                question_number: questionNumber,
                energy_level: energyLevel,
                execution_result: executionResult,
                effect_data: effectData,
                points_affected: pointsAffected
            });

            // Update UserSkill statistics
            await sequelize.models.UserSkill.recordSkillUsage(
                userId,
                skillId,
                executionResult === 'SUCCESS'
            );

            return {
                success: true,
                usage: usage
            };
        } catch (error) {
            return {
                success: false,
                message: 'Failed to record skill usage',
                error: error.message
            };
        }
    };

    SkillUsageHistory.getQuizSessionUsage = async function (quizSessionId) {
        return await this.findAll({
            where: { quiz_session_id: quizSessionId },
            include: [
                {
                    model: sequelize.models.User,
                    as: 'user',
                    attributes: ['user_id', 'username', 'full_name']
                },
                {
                    model: sequelize.models.User,
                    as: 'targetUser',
                    attributes: ['user_id', 'username', 'full_name'],
                    required: false
                },
                {
                    model: sequelize.models.Skill,
                    as: 'skill',
                    attributes: ['skill_id', 'skill_name', 'skill_icon', 'category']
                }
            ],
            order: [['question_number', 'ASC'], ['used_at', 'ASC']]
        });
    };

    SkillUsageHistory.getUserUsageInQuiz = async function (quizSessionId, userId) {
        return await this.findAll({
            where: {
                quiz_session_id: quizSessionId,
                user_id: userId
            },
            include: [{
                model: sequelize.models.Skill,
                as: 'skill',
                attributes: ['skill_name', 'skill_icon', 'category']
            }],
            order: [['question_number', 'ASC']]
        });
    };

    SkillUsageHistory.getSkillUsageStats = async function (skillId, options = {}) {
        const { timeframe = null, userId = null } = options;

        let whereClause = { skill_id: skillId };

        if (userId) {
            whereClause.user_id = userId;
        }

        if (timeframe) {
            const timeframeDays = {
                'day': 1,
                'week': 7,
                'month': 30,
                'year': 365
            };

            const days = timeframeDays[timeframe] || 30;
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            whereClause.used_at = {
                [sequelize.Sequelize.Op.gte]: startDate
            };
        }

        const stats = await this.findAll({
            where: whereClause,
            attributes: [
                'execution_result',
                [sequelize.fn('COUNT', sequelize.col('usage_id')), 'count'],
                [sequelize.fn('AVG', sequelize.col('points_affected')), 'avg_points'],
                [sequelize.fn('SUM', sequelize.col('points_affected')), 'total_points']
            ],
            group: ['execution_result'],
            raw: true
        });

        return stats;
    };

    SkillUsageHistory.getMostUsedSkills = async function (options = {}) {
        const { limit = 10, timeframe = null, quizSessionId = null } = options;

        let whereClause = {};

        if (quizSessionId) {
            whereClause.quiz_session_id = quizSessionId;
        }

        if (timeframe) {
            const timeframeDays = {
                'day': 1,
                'week': 7,
                'month': 30,
                'year': 365
            };

            const days = timeframeDays[timeframe] || 30;
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            whereClause.used_at = {
                [sequelize.Sequelize.Op.gte]: startDate
            };
        }

        return await this.findAll({
            where: whereClause,
            attributes: [
                'skill_id',
                [sequelize.fn('COUNT', sequelize.col('usage_id')), 'usage_count'],
                [sequelize.fn('COUNT', sequelize.literal("CASE WHEN execution_result = 'SUCCESS' THEN 1 END")), 'success_count'],
                [sequelize.fn('AVG', sequelize.col('points_affected')), 'avg_points_impact']
            ],
            include: [{
                model: sequelize.models.Skill,
                as: 'skill',
                attributes: ['skill_name', 'skill_icon', 'category', 'tier']
            }],
            group: ['skill_id', 'skill.skill_id'],
            order: [[sequelize.literal('usage_count'), 'DESC']],
            limit: limit
        });
    };

    SkillUsageHistory.getQuestionSkillActivity = async function (quizSessionId, questionNumber) {
        return await this.findAll({
            where: {
                quiz_session_id: quizSessionId,
                question_number: questionNumber
            },
            include: [
                {
                    model: sequelize.models.User,
                    as: 'user',
                    attributes: ['user_id', 'username', 'full_name']
                },
                {
                    model: sequelize.models.Skill,
                    as: 'skill',
                    attributes: ['skill_name', 'skill_icon', 'category']
                }
            ],
            order: [['used_at', 'ASC']]
        });
    };

    SkillUsageHistory.getSkillEffectivenessReport = async function (options = {}) {
        const { skillId = null, userId = null, timeframe = 'month' } = options;

        let whereClause = {};

        if (skillId) whereClause.skill_id = skillId;
        if (userId) whereClause.user_id = userId;

        if (timeframe) {
            const timeframeDays = {
                'day': 1,
                'week': 7,
                'month': 30,
                'year': 365
            };

            const days = timeframeDays[timeframe] || 30;
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            whereClause.used_at = {
                [sequelize.Sequelize.Op.gte]: startDate
            };
        }

        const report = await this.findAll({
            where: whereClause,
            attributes: [
                'skill_id',
                [sequelize.fn('COUNT', sequelize.col('usage_id')), 'total_uses'],
                [sequelize.fn('COUNT', sequelize.literal("CASE WHEN execution_result = 'SUCCESS' THEN 1 END")), 'successful_uses'],
                [sequelize.fn('COUNT', sequelize.literal("CASE WHEN execution_result = 'FAILED' THEN 1 END")), 'failed_uses'],
                [sequelize.fn('COUNT', sequelize.literal("CASE WHEN execution_result = 'BLOCKED' THEN 1 END")), 'blocked_uses'],
                [sequelize.fn('AVG', sequelize.col('points_affected')), 'avg_points_impact'],
                [sequelize.fn('SUM', sequelize.col('points_affected')), 'total_points_impact'],
                [sequelize.literal('ROUND((COUNT(CASE WHEN execution_result = \'SUCCESS\' THEN 1 END)::float / COUNT(usage_id)) * 100, 2)'), 'success_rate']
            ],
            include: [{
                model: sequelize.models.Skill,
                as: 'skill',
                attributes: ['skill_name', 'category', 'tier', 'cost_amount', 'cost_type']
            }],
            group: ['skill_id', 'skill.skill_id'],
            order: [[sequelize.literal('success_rate'), 'DESC']]
        });

        return report;
    };

    SkillUsageHistory.getPlayerSkillTimeline = async function (userId, options = {}) {
        const { limit = 50, quizSessionId = null } = options;

        let whereClause = { user_id: userId };
        if (quizSessionId) {
            whereClause.quiz_session_id = quizSessionId;
        }

        return await this.findAll({
            where: whereClause,
            include: [
                {
                    model: sequelize.models.Skill,
                    as: 'skill',
                    attributes: ['skill_name', 'skill_icon', 'category']
                },
                {
                    model: sequelize.models.User,
                    as: 'targetUser',
                    attributes: ['username', 'full_name'],
                    required: false
                }
            ],
            order: [['used_at', 'DESC']],
            limit: limit
        });
    };

    // =====================================================
    // ASSOCIATIONS
    // =====================================================
    SkillUsageHistory.associate = function (models) {
        // SkillUsageHistory belongs to User
        SkillUsageHistory.belongsTo(models.User, {
            foreignKey: 'user_id',
            as: 'User'
        });

        // SkillUsageHistory belongs to Skill
        SkillUsageHistory.belongsTo(models.Skill, {
            foreignKey: 'skill_id',
            as: 'Skill'
        });

        // SkillUsageHistory belongs to target User (if applicable)
        SkillUsageHistory.belongsTo(models.User, {
            foreignKey: 'target_user_id',
            as: 'TargetUser'
        });
    };

    return SkillUsageHistory;
};
