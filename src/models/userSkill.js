// backend/src/models/userSkill.js
module.exports = (sequelize, DataTypes) => {
    const UserSkill = sequelize.define('UserSkill', {
        user_skill_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
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
        purchased_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        purchase_cost: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        purchase_currency: {
            type: DataTypes.ENUM('SYNCOIN', 'KRISTAL'),
            allowNull: false
        },
        times_used: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        total_success: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        total_failure: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        last_used_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        is_equipped: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        }
    }, {
        tableName: 'UserSkills',
        timestamps: false,
        indexes: [
            {
                unique: true,
                fields: ['user_id', 'skill_id']
            }
        ]
    });

    // Static methods for user skill operations
    UserSkill.getUserSkills = async function (userId, options = {}) {
        const { includeSkillDetails = true, equippedOnly = false } = options;

        const whereClause = { user_id: userId };
        if (equippedOnly) {
            whereClause.is_equipped = true;
        }

        const queryOptions = {
            where: whereClause,
            order: [['purchased_at', 'DESC']]
        };

        if (includeSkillDetails) {
            queryOptions.include = [{
                model: sequelize.models.Skill,
                as: 'Skill',
                where: { is_active: true }
            }];
        }

        return await this.findAll(queryOptions);
    };

    UserSkill.getUserSkillsByCategory = async function (userId, category) {
        return await this.findAll({
            where: { user_id: userId },
            include: [{
                model: sequelize.models.Skill,
                as: 'Skill',
                where: {
                    category: category,
                    is_active: true
                }
            }],
            order: [[{ model: sequelize.models.Skill, as: 'Skill' }, 'tier', 'DESC']]
        });
    };

    UserSkill.getEquippedSkills = async function (userId) {
        return await this.findAll({
            where: {
                user_id: userId,
                is_equipped: true
            },
            include: [{
                model: sequelize.models.Skill,
                as: 'Skill',
                where: { is_active: true }
            }],
            order: [['user_skill_id', 'ASC']]
        });
    };

    UserSkill.updateEquippedSkills = async function (userId, skillIds) {
        const transaction = await sequelize.transaction();

        try {
            // First, unequip all current skills
            await this.update(
                { is_equipped: false },
                {
                    where: { user_id: userId },
                    transaction
                }
            );

            // Then equip the new skills
            if (skillIds && skillIds.length > 0) {
                await this.update(
                    { is_equipped: true },
                    {
                        where: {
                            user_id: userId,
                            skill_id: { [sequelize.Sequelize.Op.in]: skillIds }
                        },
                        transaction
                    }
                );
            }

            await transaction.commit();
            return {
                success: true,
                message: 'Equipped skills updated successfully'
            };
        } catch (error) {
            await transaction.rollback();
            return {
                success: false,
                message: 'Failed to update equipped skills',
                error: error.message
            };
        }
    };

    UserSkill.purchaseSkill = async function (userId, skillId) {
        const transaction = await sequelize.transaction();

        try {
            // Check if user already owns this skill
            const existingSkill = await this.findOne({
                where: {
                    user_id: userId,
                    skill_id: skillId
                },
                transaction
            });

            if (existingSkill) {
                await transaction.rollback();
                return {
                    success: false,
                    message: 'User already owns this skill'
                };
            }

            // Get skill details
            const skill = await sequelize.models.Skill.findByPk(skillId, { transaction });
            if (!skill || !skill.is_active) {
                await transaction.rollback();
                return {
                    success: false,
                    message: 'Skill not found or inactive'
                };
            }

            // Get user's current balance
            const user = await sequelize.models.User.findByPk(userId, {
                attributes: ['syncoin_balance', 'kristal_balance'],
                transaction
            });

            if (!user) {
                await transaction.rollback();
                return {
                    success: false,
                    message: 'User not found'
                };
            }

            // Check if user has enough currency
            const currentBalance = skill.cost_type === 'SYNCOIN'
                ? user.syncoin_balance || 0
                : user.kristal_balance || 0;

            if (currentBalance < skill.cost_amount) {
                await transaction.rollback();
                return {
                    success: false,
                    message: `Insufficient ${skill.cost_type.toLowerCase()}. Need ${skill.cost_amount}, have ${currentBalance}`
                };
            }

            // Deduct currency from user
            const newBalance = currentBalance - skill.cost_amount;
            const updateField = skill.cost_type === 'SYNCOIN' ? 'syncoin_balance' : 'kristal_balance';

            await sequelize.models.User.update(
                { [updateField]: newBalance },
                {
                    where: { user_id: userId },
                    transaction
                }
            );

            // Add skill to user's inventory
            const userSkill = await this.create({
                user_id: userId,
                skill_id: skillId,
                purchase_cost: skill.cost_amount,
                purchase_currency: skill.cost_type
            }, { transaction });

            // Note: SkillPurchaseHistory will be created in separate model file

            await transaction.commit();

            return {
                success: true,
                message: 'Skill purchased successfully',
                userSkill: userSkill,
                balance_before: currentBalance,
                balance_after: newBalance
            };
        } catch (error) {
            await transaction.rollback();
            return {
                success: false,
                message: 'Failed to purchase skill',
                error: error.message
            };
        }
    };

    UserSkill.recordSkillUsage = async function (userId, skillId, success = true) {
        const userSkill = await this.findOne({
            where: {
                user_id: userId,
                skill_id: skillId
            }
        });

        if (userSkill) {
            const updateData = {
                times_used: userSkill.times_used + 1,
                last_used_at: new Date()
            };

            if (success) {
                updateData.total_success = userSkill.total_success + 1;
            } else {
                updateData.total_failure = userSkill.total_failure + 1;
            }

            await userSkill.update(updateData);
            return userSkill;
        }

        return null;
    };

    UserSkill.getUserSkillStats = async function (userId) {
        const stats = await this.findAll({
            where: { user_id: userId },
            include: [{
                model: sequelize.models.Skill,
                as: 'Skill',
                attributes: ['skill_name', 'category', 'tier']
            }],
            attributes: [
                'skill_id',
                'times_used',
                'total_success',
                'total_failure',
                'last_used_at',
                [sequelize.literal('CASE WHEN times_used > 0 THEN ROUND((total_success::float / times_used) * 100, 2) ELSE 0 END'), 'success_rate']
            ],
            order: [['times_used', 'DESC']]
        });

        return stats;
    };

    UserSkill.getMostUsedSkills = async function (userId, limit = 5) {
        return await this.findAll({
            where: {
                user_id: userId,
                times_used: { [sequelize.Sequelize.Op.gt]: 0 }
            },
            include: [{
                model: sequelize.models.Skill,
                as: 'Skill',
                attributes: ['skill_name', 'skill_icon', 'category']
            }],
            order: [['times_used', 'DESC']],
            limit: limit
        });
    };

    UserSkill.getSkillEffectiveness = async function (userId, skillId) {
        const userSkill = await this.findOne({
            where: {
                user_id: userId,
                skill_id: skillId
            },
            include: [{
                model: sequelize.models.Skill,
                as: 'Skill'
            }]
        });

        if (!userSkill) return null;

        const successRate = userSkill.times_used > 0
            ? (userSkill.total_success / userSkill.times_used) * 100
            : 0;

        return {
            skill_name: userSkill.Skill.skill_name,
            times_used: userSkill.times_used,
            success_rate: Math.round(successRate * 100) / 100,
            total_success: userSkill.total_success,
            total_failure: userSkill.total_failure,
            last_used: userSkill.last_used_at,
            effectiveness_rating: successRate >= 80 ? 'Excellent' :
                successRate >= 60 ? 'Good' :
                    successRate >= 40 ? 'Average' : 'Poor'
        };
    };

    // =====================================================
    // ASSOCIATIONS
    // =====================================================
    UserSkill.associate = function (models) {
        // UserSkill belongs to User
        UserSkill.belongsTo(models.User, {
            foreignKey: 'user_id',
            as: 'User'
        });

        // UserSkill belongs to Skill
        UserSkill.belongsTo(models.Skill, {
            foreignKey: 'skill_id',
            as: 'Skill'
        });
    };

    return UserSkill;
};
