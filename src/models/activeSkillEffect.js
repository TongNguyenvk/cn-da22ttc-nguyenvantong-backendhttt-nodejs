// backend/src/models/activeSkillEffect.js
module.exports = (sequelize, DataTypes) => {
    const ActiveSkillEffect = sequelize.define('ActiveSkillEffect', {
        effect_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        quiz_session_id: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        affected_user_id: {
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
        caster_user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'Users',
                key: 'user_id'
            }
        },
        effect_type: {
            type: DataTypes.STRING(30),
            allowNull: false
        },
        effect_data: {
            type: DataTypes.JSONB,
            allowNull: false
        },
        questions_remaining: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        started_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        expires_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        }
    }, {
        tableName: 'ActiveSkillEffects',
        timestamps: false
    });

    // Static methods for active skill effects management
    ActiveSkillEffect.applySkillEffect = async function (effectData) {
        const {
            quizSessionId,
            affectedUserId,
            skillId,
            casterUserId,
            effectType,
            effectDetails,
            duration = 1
        } = effectData;

        try {
            // Remove any existing effects of the same type on the same user
            await this.update(
                { is_active: false },
                {
                    where: {
                        quiz_session_id: quizSessionId,
                        affected_user_id: affectedUserId,
                        effect_type: effectType,
                        is_active: true
                    }
                }
            );

            // Create new effect
            const effect = await this.create({
                quiz_session_id: quizSessionId,
                affected_user_id: affectedUserId,
                skill_id: skillId,
                caster_user_id: casterUserId,
                effect_type: effectType,
                effect_data: effectDetails,
                questions_remaining: duration
            });

            return {
                success: true,
                effect: effect
            };
        } catch (error) {
            return {
                success: false,
                message: 'Failed to apply skill effect',
                error: error.message
            };
        }
    };

    ActiveSkillEffect.getActiveEffects = async function (quizSessionId, userId = null) {
        const whereClause = {
            quiz_session_id: quizSessionId,
            is_active: true,
            questions_remaining: { [sequelize.Sequelize.Op.gt]: 0 }
        };

        if (userId) {
            whereClause.affected_user_id = userId;
        }

        return await this.findAll({
            where: whereClause,
            include: [
                {
                    model: sequelize.models.User,
                    as: 'affectedUser',
                    attributes: ['user_id', 'username', 'full_name']
                },
                {
                    model: sequelize.models.User,
                    as: 'casterUser',
                    attributes: ['user_id', 'username', 'full_name']
                },
                {
                    model: sequelize.models.Skill,
                    as: 'skill',
                    attributes: ['skill_name', 'skill_icon', 'category']
                }
            ],
            order: [['started_at', 'DESC']]
        });
    };

    ActiveSkillEffect.processQuestionEffects = async function (quizSessionId) {
        const transaction = await sequelize.transaction();

        try {
            // Get all active effects for this quiz session
            const activeEffects = await this.findAll({
                where: {
                    quiz_session_id: quizSessionId,
                    is_active: true,
                    questions_remaining: { [sequelize.Sequelize.Op.gt]: 0 }
                },
                transaction
            });

            const expiredEffects = [];
            const continuingEffects = [];

            // Process each effect
            for (const effect of activeEffects) {
                const newQuestionsRemaining = effect.questions_remaining - 1;

                if (newQuestionsRemaining <= 0) {
                    // Effect expires
                    await effect.update({
                        questions_remaining: 0,
                        is_active: false
                    }, { transaction });

                    expiredEffects.push(effect);
                } else {
                    // Effect continues
                    await effect.update({
                        questions_remaining: newQuestionsRemaining
                    }, { transaction });

                    continuingEffects.push({
                        ...effect.toJSON(),
                        questions_remaining: newQuestionsRemaining
                    });
                }
            }

            await transaction.commit();

            return {
                success: true,
                expired_effects: expiredEffects,
                continuing_effects: continuingEffects
            };
        } catch (error) {
            await transaction.rollback();
            return {
                success: false,
                message: 'Failed to process question effects',
                error: error.message
            };
        }
    };

    ActiveSkillEffect.removeEffect = async function (effectId) {
        const result = await this.update(
            { is_active: false },
            { where: { effect_id: effectId } }
        );

        return result[0] > 0;
    };

    ActiveSkillEffect.removeUserEffects = async function (quizSessionId, userId, effectType = null) {
        const whereClause = {
            quiz_session_id: quizSessionId,
            affected_user_id: userId,
            is_active: true
        };

        if (effectType) {
            whereClause.effect_type = effectType;
        }

        const result = await this.update(
            { is_active: false },
            { where: whereClause }
        );

        return result[0];
    };

    ActiveSkillEffect.hasActiveEffect = async function (quizSessionId, userId, effectType) {
        const effect = await this.findOne({
            where: {
                quiz_session_id: quizSessionId,
                affected_user_id: userId,
                effect_type: effectType,
                is_active: true,
                questions_remaining: { [sequelize.Sequelize.Op.gt]: 0 }
            }
        });

        return effect !== null;
    };

    ActiveSkillEffect.getEffectsByType = async function (quizSessionId, effectType) {
        return await this.findAll({
            where: {
                quiz_session_id: quizSessionId,
                effect_type: effectType,
                is_active: true,
                questions_remaining: { [sequelize.Sequelize.Op.gt]: 0 }
            },
            include: [{
                model: sequelize.models.User,
                as: 'affectedUser',
                attributes: ['user_id', 'username', 'full_name']
            }]
        });
    };

    ActiveSkillEffect.getUserEffectSummary = async function (quizSessionId, userId) {
        const effects = await this.findAll({
            where: {
                quiz_session_id: quizSessionId,
                affected_user_id: userId,
                is_active: true,
                questions_remaining: { [sequelize.Sequelize.Op.gt]: 0 }
            },
            include: [{
                model: sequelize.models.Skill,
                as: 'skill',
                attributes: ['skill_name', 'skill_icon', 'category']
            }]
        });

        const summary = {
            total_effects: effects.length,
            positive_effects: [],
            negative_effects: [],
            neutral_effects: []
        };

        effects.forEach(effect => {
            const effectInfo = {
                effect_id: effect.effect_id,
                effect_type: effect.effect_type,
                skill_name: effect.skill.skill_name,
                skill_icon: effect.skill.skill_icon,
                questions_remaining: effect.questions_remaining,
                effect_data: effect.effect_data
            };

            // Categorize effects based on type
            if (['SHIELD', 'LOCK', 'KING', 'DOUBLE', 'TRIPLE', 'QUINTUPLE', 'PERFECT', 'LUCKY'].includes(effect.effect_type)) {
                summary.positive_effects.push(effectInfo);
            } else if (['BLACKHOLE', 'SLOW', 'STEAL'].includes(effect.effect_type)) {
                summary.negative_effects.push(effectInfo);
            } else {
                summary.neutral_effects.push(effectInfo);
            }
        });

        return summary;
    };

    ActiveSkillEffect.cleanupExpiredEffects = async function (quizSessionId = null) {
        const whereClause = {
            is_active: true,
            questions_remaining: { [sequelize.Sequelize.Op.lte]: 0 }
        };

        if (quizSessionId) {
            whereClause.quiz_session_id = quizSessionId;
        }

        const result = await this.update(
            { is_active: false },
            { where: whereClause }
        );

        return result[0];
    };

    ActiveSkillEffect.getEffectHistory = async function (quizSessionId, options = {}) {
        const { userId = null, limit = 100 } = options;

        const whereClause = { quiz_session_id: quizSessionId };
        if (userId) {
            whereClause.affected_user_id = userId;
        }

        return await this.findAll({
            where: whereClause,
            include: [
                {
                    model: sequelize.models.User,
                    as: 'affectedUser',
                    attributes: ['user_id', 'username', 'full_name']
                },
                {
                    model: sequelize.models.User,
                    as: 'casterUser',
                    attributes: ['user_id', 'username', 'full_name']
                },
                {
                    model: sequelize.models.Skill,
                    as: 'skill',
                    attributes: ['skill_name', 'skill_icon', 'category']
                }
            ],
            order: [['started_at', 'DESC']],
            limit: limit
        });
    };

    // =====================================================
    // ASSOCIATIONS
    // =====================================================
    ActiveSkillEffect.associate = function (models) {
        // ActiveSkillEffect belongs to User (affected user)
        ActiveSkillEffect.belongsTo(models.User, {
            foreignKey: 'affected_user_id',
            as: 'AffectedUser'
        });

        // ActiveSkillEffect belongs to Skill
        ActiveSkillEffect.belongsTo(models.Skill, {
            foreignKey: 'skill_id',
            as: 'Skill'
        });

        // ActiveSkillEffect belongs to User (caster)
        ActiveSkillEffect.belongsTo(models.User, {
            foreignKey: 'caster_user_id',
            as: 'CasterUser'
        });
    };

    return ActiveSkillEffect;
};
