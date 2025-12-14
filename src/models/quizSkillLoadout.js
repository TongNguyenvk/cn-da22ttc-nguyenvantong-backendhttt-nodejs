// backend/src/models/quizSkillLoadout.js
module.exports = (sequelize, DataTypes) => {
    const QuizSkillLoadout = sequelize.define('QuizSkillLoadout', {
        loadout_id: {
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
        skill_slot_1: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'Skills',
                key: 'skill_id'
            }
        },
        skill_slot_2: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'Skills',
                key: 'skill_id'
            }
        },
        skill_slot_3: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'Skills',
                key: 'skill_id'
            }
        },
        skill_slot_4: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'Skills',
                key: 'skill_id'
            }
        },
        created_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        }
    }, {
        tableName: 'QuizSkillLoadouts',
        timestamps: false,
        indexes: [
            {
                unique: true,
                fields: ['quiz_session_id', 'user_id']
            }
        ]
    });

    // Static methods for quiz skill loadout operations
    QuizSkillLoadout.createLoadout = async function (quizSessionId, userId, skillIds) {
        try {
            // Validate skill IDs array
            if (!Array.isArray(skillIds) || skillIds.length !== 4) {
                return {
                    success: false,
                    message: 'Loadout must contain exactly 4 skills'
                };
            }

            // Check for duplicates
            const uniqueSkills = [...new Set(skillIds)];
            if (uniqueSkills.length !== 4) {
                return {
                    success: false,
                    message: 'Loadout cannot contain duplicate skills'
                };
            }

            // Verify user owns all skills
            const userSkills = await sequelize.models.UserSkill.findAll({
                where: {
                    user_id: userId,
                    skill_id: { [sequelize.Sequelize.Op.in]: skillIds }
                }
            });

            if (userSkills.length !== 4) {
                return {
                    success: false,
                    message: 'User does not own all selected skills'
                };
            }

            // Check if loadout already exists for this quiz session
            const existingLoadout = await this.findOne({
                where: {
                    quiz_session_id: quizSessionId,
                    user_id: userId
                }
            });

            if (existingLoadout) {
                // Update existing loadout
                await existingLoadout.update({
                    skill_slot_1: skillIds[0],
                    skill_slot_2: skillIds[1],
                    skill_slot_3: skillIds[2],
                    skill_slot_4: skillIds[3]
                });

                return {
                    success: true,
                    message: 'Loadout updated successfully',
                    loadout: existingLoadout
                };
            } else {
                // Create new loadout
                const loadout = await this.create({
                    quiz_session_id: quizSessionId,
                    user_id: userId,
                    skill_slot_1: skillIds[0],
                    skill_slot_2: skillIds[1],
                    skill_slot_3: skillIds[2],
                    skill_slot_4: skillIds[3]
                });

                return {
                    success: true,
                    message: 'Loadout created successfully',
                    loadout: loadout
                };
            }
        } catch (error) {
            return {
                success: false,
                message: 'Failed to create/update loadout',
                error: error.message
            };
        }
    };

    QuizSkillLoadout.getLoadout = async function (quizSessionId, userId) {
        return await this.findOne({
            where: {
                quiz_session_id: quizSessionId,
                user_id: userId
            },
            include: [
                {
                    model: sequelize.models.Skill,
                    as: 'skill1',
                    foreignKey: 'skill_slot_1'
                },
                {
                    model: sequelize.models.Skill,
                    as: 'skill2',
                    foreignKey: 'skill_slot_2'
                },
                {
                    model: sequelize.models.Skill,
                    as: 'skill3',
                    foreignKey: 'skill_slot_3'
                },
                {
                    model: sequelize.models.Skill,
                    as: 'skill4',
                    foreignKey: 'skill_slot_4'
                }
            ]
        });
    };

    QuizSkillLoadout.getAllLoadouts = async function (quizSessionId) {
        return await this.findAll({
            where: { quiz_session_id: quizSessionId },
            include: [
                {
                    model: sequelize.models.User,
                    as: 'user',
                    attributes: ['user_id', 'username', 'full_name']
                },
                {
                    model: sequelize.models.Skill,
                    as: 'skill1',
                    foreignKey: 'skill_slot_1',
                    attributes: ['skill_id', 'skill_name', 'skill_icon', 'category']
                },
                {
                    model: sequelize.models.Skill,
                    as: 'skill2',
                    foreignKey: 'skill_slot_2',
                    attributes: ['skill_id', 'skill_name', 'skill_icon', 'category']
                },
                {
                    model: sequelize.models.Skill,
                    as: 'skill3',
                    foreignKey: 'skill_slot_3',
                    attributes: ['skill_id', 'skill_name', 'skill_icon', 'category']
                },
                {
                    model: sequelize.models.Skill,
                    as: 'skill4',
                    foreignKey: 'skill_slot_4',
                    attributes: ['skill_id', 'skill_name', 'skill_icon', 'category']
                }
            ],
            order: [['created_at', 'ASC']]
        });
    };

    QuizSkillLoadout.getLoadoutSkills = async function (quizSessionId, userId) {
        const loadout = await this.findOne({
            where: {
                quiz_session_id: quizSessionId,
                user_id: userId
            }
        });

        if (!loadout) return [];

        const skillIds = [
            loadout.skill_slot_1,
            loadout.skill_slot_2,
            loadout.skill_slot_3,
            loadout.skill_slot_4
        ];

        const skills = await sequelize.models.Skill.findAll({
            where: {
                skill_id: { [sequelize.Sequelize.Op.in]: skillIds }
            },
            order: [
                sequelize.literal(`CASE skill_id 
                    WHEN ${skillIds[0]} THEN 1 
                    WHEN ${skillIds[1]} THEN 2 
                    WHEN ${skillIds[2]} THEN 3 
                    WHEN ${skillIds[3]} THEN 4 
                END`)
            ]
        });

        return skills;
    };

    QuizSkillLoadout.getRandomSkillFromLoadout = async function (quizSessionId, userId) {
        const skills = await this.getLoadoutSkills(quizSessionId, userId);

        if (skills.length === 0) return null;

        // Return random skill from the 4 equipped skills
        const randomIndex = Math.floor(Math.random() * skills.length);
        return skills[randomIndex];
    };

    QuizSkillLoadout.validateLoadout = async function (quizSessionId, userId) {
        const loadout = await this.getLoadout(quizSessionId, userId);

        if (!loadout) {
            return {
                valid: false,
                message: 'No loadout found for this quiz session'
            };
        }

        // Check if all skills are still active and owned by user
        const skillIds = [
            loadout.skill_slot_1,
            loadout.skill_slot_2,
            loadout.skill_slot_3,
            loadout.skill_slot_4
        ];

        const userSkills = await sequelize.models.UserSkill.findAll({
            where: {
                user_id: userId,
                skill_id: { [sequelize.Sequelize.Op.in]: skillIds }
            },
            include: [{
                model: sequelize.models.Skill,
                as: 'skill',
                where: { is_active: true }
            }]
        });

        if (userSkills.length !== 4) {
            return {
                valid: false,
                message: 'Some skills in loadout are no longer available'
            };
        }

        return {
            valid: true,
            loadout: loadout,
            skills: userSkills.map(us => us.skill)
        };
    };

    QuizSkillLoadout.getLoadoutStatistics = async function (quizSessionId) {
        const loadouts = await this.findAll({
            where: { quiz_session_id: quizSessionId },
            include: [
                {
                    model: sequelize.models.Skill,
                    as: 'skill1',
                    attributes: ['category']
                },
                {
                    model: sequelize.models.Skill,
                    as: 'skill2',
                    attributes: ['category']
                },
                {
                    model: sequelize.models.Skill,
                    as: 'skill3',
                    attributes: ['category']
                },
                {
                    model: sequelize.models.Skill,
                    as: 'skill4',
                    attributes: ['category']
                }
            ]
        });

        const categoryCount = {};
        const skillCount = {};

        loadouts.forEach(loadout => {
            [loadout.skill1, loadout.skill2, loadout.skill3, loadout.skill4].forEach(skill => {
                if (skill) {
                    categoryCount[skill.category] = (categoryCount[skill.category] || 0) + 1;
                }
            });

            [loadout.skill_slot_1, loadout.skill_slot_2, loadout.skill_slot_3, loadout.skill_slot_4].forEach(skillId => {
                skillCount[skillId] = (skillCount[skillId] || 0) + 1;
            });
        });

        return {
            total_participants: loadouts.length,
            category_distribution: categoryCount,
            skill_popularity: skillCount
        };
    };

    QuizSkillLoadout.deleteLoadout = async function (quizSessionId, userId) {
        const result = await this.destroy({
            where: {
                quiz_session_id: quizSessionId,
                user_id: userId
            }
        });

        return result > 0;
    };

    // =====================================================
    // ASSOCIATIONS
    // =====================================================
    QuizSkillLoadout.associate = function (models) {
        // QuizSkillLoadout belongs to User
        QuizSkillLoadout.belongsTo(models.User, {
            foreignKey: 'user_id',
            as: 'User'
        });

        // QuizSkillLoadout belongs to Skills (4 slots)
        QuizSkillLoadout.belongsTo(models.Skill, {
            foreignKey: 'skill_slot_1',
            as: 'Skill1'
        });
        QuizSkillLoadout.belongsTo(models.Skill, {
            foreignKey: 'skill_slot_2',
            as: 'Skill2'
        });
        QuizSkillLoadout.belongsTo(models.Skill, {
            foreignKey: 'skill_slot_3',
            as: 'Skill3'
        });
        QuizSkillLoadout.belongsTo(models.Skill, {
            foreignKey: 'skill_slot_4',
            as: 'Skill4'
        });
    };

    return QuizSkillLoadout;
};
