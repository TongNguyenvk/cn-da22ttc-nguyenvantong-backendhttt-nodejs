'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class EggDropRule extends Model {
        static associate(models) {
            // Associations
            EggDropRule.belongsTo(models.EggType, { 
                foreignKey: 'egg_type_id', 
                as: 'EggType' 
            });
        }

        /**
         * Get active drop rules by trigger type
         * @param {string} triggerType - Trigger type
         * @returns {Array<EggDropRule>}
         */
        static async getActiveRulesByTrigger(triggerType) {
            return await EggDropRule.findAll({
                where: {
                    trigger_type: triggerType,
                    is_active: true
                },
                include: [{
                    model: sequelize.models.EggType,
                    as: 'EggType',
                    where: { is_active: true }
                }],
                order: [['drop_rate', 'DESC']]
            });
        }

        /**
         * Get trigger condition as object
         * @returns {Object}
         */
        getTriggerConditionObject() {
            try {
                return typeof this.trigger_condition === 'string' 
                    ? JSON.parse(this.trigger_condition) 
                    : this.trigger_condition;
            } catch (error) {
                console.error('Error parsing trigger condition:', error);
                return {};
            }
        }

        /**
         * Check if trigger condition is met
         * @param {Object} triggerData - Data to check against
         * @returns {boolean}
         */
        checkTriggerCondition(triggerData) {
            try {
                const condition = this.getTriggerConditionObject();
                
                for (const [key, value] of Object.entries(condition)) {
                    if (triggerData[key] === undefined || triggerData[key] < value) {
                        return false;
                    }
                }
                return true;
            } catch (error) {
                console.error('Error checking trigger condition:', error);
                return false;
            }
        }

        /**
         * Get drop rate percentage
         * @returns {string}
         */
        getDropRatePercentage() {
            return `${(parseFloat(this.drop_rate) * 100).toFixed(2)}%`;
        }

        /**
         * Get trigger type display name
         * @returns {string}
         */
        getTriggerTypeDisplayName() {
            const triggerNames = {
                'QUIZ_COMPLETION': 'Hoàn Thành Quiz',
                'STREAK_ACHIEVEMENT': 'Thành Tích Chuỗi',
                'PERFECT_SCORE': 'Điểm Tuyệt Đối',
                'LEVEL_UP': 'Lên Cấp',
                'DAILY_LOGIN': 'Đăng Nhập Hàng Ngày'
            };
            return triggerNames[this.trigger_type] || 'Không Xác Định';
        }

        /**
         * Get formatted rule info
         * @returns {Object}
         */
        getFormattedInfo() {
            return {
                rule_id: this.rule_id,
                rule_name: this.rule_name,
                rule_code: this.rule_code,
                trigger_type: this.trigger_type,
                trigger_type_display: this.getTriggerTypeDisplayName(),
                trigger_condition: this.getTriggerConditionObject(),
                egg_type_id: this.egg_type_id,
                drop_rate: this.drop_rate,
                drop_rate_percentage: this.getDropRatePercentage(),
                max_per_day: this.max_per_day,
                is_active: this.is_active,
                created_at: this.created_at
            };
        }
    }

    EggDropRule.init({
        rule_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        rule_name: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        rule_code: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true
        },
        trigger_type: {
            type: DataTypes.STRING(30),
            allowNull: false,
            validate: {
                isIn: [['QUIZ_COMPLETION', 'STREAK_ACHIEVEMENT', 'PERFECT_SCORE', 'LEVEL_UP', 'DAILY_LOGIN']]
            }
        },
        trigger_condition: {
            type: DataTypes.JSONB,
            allowNull: false,
            defaultValue: {}
        },
        egg_type_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'EggTypes',
                key: 'egg_type_id'
            }
        },
        drop_rate: {
            type: DataTypes.DECIMAL(5, 4),
            allowNull: false,
            defaultValue: 0.1000
        },
        max_per_day: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        updated_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        sequelize,
        modelName: 'EggDropRule',
        tableName: 'EggDropRules',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

    return EggDropRule;
};
