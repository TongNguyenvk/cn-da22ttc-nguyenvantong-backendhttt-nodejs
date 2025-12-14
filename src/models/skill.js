// backend/src/models/skill.js
module.exports = (sequelize, DataTypes) => {
    const Skill = sequelize.define('Skill', {
        skill_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        skill_name: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true
        },
        skill_code: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true
        },
        skill_icon: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        category: {
            type: DataTypes.ENUM('ATTACK', 'DEFENSE', 'BURST', 'SPECIAL', 'ULTIMATE'),
            allowNull: false
        },
        tier: {
            type: DataTypes.ENUM('D', 'C', 'B', 'A', 'S'),
            allowNull: false
        },
        cost_type: {
            type: DataTypes.ENUM('SYNCOIN', 'KRISTAL'),
            allowNull: false
        },
        cost_amount: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        effect_description: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        target_type: {
            type: DataTypes.ENUM('SELF', 'LEADER', 'SPECIFIC_PLAYER', 'ALL_OTHERS', 'HIGHEST_STREAK', 'PLAYER_ABOVE'),
            allowNull: false
        },
        duration_type: {
            type: DataTypes.ENUM('INSTANT', 'QUESTIONS', 'PERMANENT'),
            defaultValue: 'INSTANT'
        },
        duration_value: {
            type: DataTypes.INTEGER,
            defaultValue: 1
        },
        cooldown_questions: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        risk_factor: {
            type: DataTypes.DECIMAL(3, 2),
            defaultValue: 0.00
        },
        success_rate: {
            type: DataTypes.DECIMAL(3, 2),
            defaultValue: 1.00
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        created_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        updated_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        }
    }, {
        tableName: 'Skills',
        timestamps: false
    });

    // Static methods for skill operations
    Skill.getAllSkills = async function (options = {}) {
        const { category = null, tier = null, isActive = true } = options;

        const whereClause = { is_active: isActive };
        if (category) whereClause.category = category;
        if (tier) whereClause.tier = tier;

        return await this.findAll({
            where: whereClause,
            order: [
                ['category', 'ASC'],
                ['tier', 'DESC'],
                ['cost_amount', 'ASC']
            ]
        });
    };

    Skill.getSkillsByCategory = async function (category) {
        return await this.findAll({
            where: {
                category: category,
                is_active: true
            },
            order: [['tier', 'DESC'], ['cost_amount', 'ASC']]
        });
    };

    Skill.getSkillsByTier = async function (tier) {
        return await this.findAll({
            where: {
                tier: tier,
                is_active: true
            },
            order: [['category', 'ASC'], ['cost_amount', 'ASC']]
        });
    };

    Skill.getSkillsByCurrency = async function (costType) {
        return await this.findAll({
            where: {
                cost_type: costType,
                is_active: true
            },
            order: [['cost_amount', 'ASC']]
        });
    };

    Skill.getAffordableSkills = async function (userId, userBalances) {
        const { syncoin_balance = 0, kristal_balance = 0 } = userBalances;

        // Get skills user doesn't own yet
        const ownedSkills = await sequelize.models.UserSkill.findAll({
            where: { user_id: userId },
            attributes: ['skill_id']
        });

        const ownedSkillIds = ownedSkills.map(us => us.skill_id);

        const whereClause = {
            is_active: true,
            [sequelize.Sequelize.Op.or]: [
                {
                    cost_type: 'SYNCOIN',
                    cost_amount: { [sequelize.Sequelize.Op.lte]: syncoin_balance }
                },
                {
                    cost_type: 'KRISTAL',
                    cost_amount: { [sequelize.Sequelize.Op.lte]: kristal_balance }
                }
            ]
        };

        if (ownedSkillIds.length > 0) {
            whereClause.skill_id = { [sequelize.Sequelize.Op.notIn]: ownedSkillIds };
        }

        return await this.findAll({
            where: whereClause,
            order: [['tier', 'DESC'], ['cost_amount', 'ASC']]
        });
    };

    Skill.getSkillDetails = async function (skillId) {
        return await this.findOne({
            where: {
                skill_id: skillId,
                is_active: true
            }
        });
    };

    Skill.validateSkillLoadout = async function (skillIds) {
        if (!Array.isArray(skillIds) || skillIds.length !== 4) {
            return {
                valid: false,
                message: 'Loadout must contain exactly 4 skills'
            };
        }

        // Check for duplicates
        const uniqueSkills = [...new Set(skillIds)];
        if (uniqueSkills.length !== 4) {
            return {
                valid: false,
                message: 'Loadout cannot contain duplicate skills'
            };
        }

        // Check if all skills exist and are active
        const skills = await this.findAll({
            where: {
                skill_id: { [sequelize.Sequelize.Op.in]: skillIds },
                is_active: true
            }
        });

        if (skills.length !== 4) {
            return {
                valid: false,
                message: 'One or more skills are invalid or inactive'
            };
        }

        return {
            valid: true,
            skills: skills
        };
    };

    Skill.getSkillStatistics = async function () {
        const stats = await this.findAll({
            attributes: [
                'category',
                [sequelize.fn('COUNT', sequelize.col('skill_id')), 'count'],
                [sequelize.fn('AVG', sequelize.col('cost_amount')), 'avg_cost'],
                [sequelize.fn('MIN', sequelize.col('cost_amount')), 'min_cost'],
                [sequelize.fn('MAX', sequelize.col('cost_amount')), 'max_cost']
            ],
            where: { is_active: true },
            group: ['category'],
            raw: true
        });

        return stats;
    };

    // Instance methods
    Skill.prototype.canBeUsedBy = function (userLevel, userTier) {
        // Add any level/tier restrictions here if needed
        return this.is_active;
    };

    Skill.prototype.calculateEffectiveness = function (gameState) {
        // Calculate skill effectiveness based on current game state
        // This can be expanded based on specific skill logic
        return {
            effectiveness: this.success_rate,
            risk: this.risk_factor,
            recommended: this.success_rate > 0.8 && this.risk_factor < 0.3
        };
    };

    // =====================================================
    // ASSOCIATIONS
    // =====================================================
    Skill.associate = function (models) {
        // Skill has many UserSkills (users who own this skill)
        Skill.hasMany(models.UserSkill, {
            foreignKey: 'skill_id',
            as: 'UserSkills'
        });

        // Skill has many QuizSkillLoadouts (used in quiz loadouts)
        Skill.hasMany(models.QuizSkillLoadout, {
            foreignKey: 'skill_slot_1',
            as: 'LoadoutSlot1'
        });
        Skill.hasMany(models.QuizSkillLoadout, {
            foreignKey: 'skill_slot_2',
            as: 'LoadoutSlot2'
        });
        Skill.hasMany(models.QuizSkillLoadout, {
            foreignKey: 'skill_slot_3',
            as: 'LoadoutSlot3'
        });
        Skill.hasMany(models.QuizSkillLoadout, {
            foreignKey: 'skill_slot_4',
            as: 'LoadoutSlot4'
        });

        // Skill has many SkillUsageHistory (usage tracking)
        Skill.hasMany(models.SkillUsageHistory, {
            foreignKey: 'skill_id',
            as: 'UsageHistory'
        });

        // Skill has many ActiveSkillEffects (active effects)
        Skill.hasMany(models.ActiveSkillEffect, {
            foreignKey: 'skill_id',
            as: 'ActiveEffects'
        });
    };

    return Skill;
};
