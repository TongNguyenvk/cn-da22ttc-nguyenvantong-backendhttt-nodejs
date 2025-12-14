'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class QuestionTestCaseAnalytics extends Model {
        static associate(models) {
            QuestionTestCaseAnalytics.belongsTo(models.Question, {
                foreignKey: 'question_id',
                as: 'Question'
            });
        }

        /**
         * Get or create analytics for question
         */
        static async getOrCreate(questionId) {
            const [analytics, created] = await this.findOrCreate({
                where: { question_id: questionId },
                defaults: {
                    question_id: questionId,
                    test_case_analytics: {},
                    overall_analytics: {
                        total_students_attempted: 0,
                        students_passed_all: 0,
                        overall_pass_rate: 0,
                        average_attempts_to_pass: 0,
                        hardest_test_case: null,
                        easiest_test_case: null
                    }
                }
            });
            return analytics;
        }
    }

    QuestionTestCaseAnalytics.init(
        {
            analytics_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            question_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                unique: true,
                references: {
                    model: 'Questions',
                    key: 'question_id',
                }
            },
            test_case_analytics: {
                type: DataTypes.JSONB,
                allowNull: false,
                defaultValue: {}
            },
            overall_analytics: {
                type: DataTypes.JSONB,
                allowNull: false,
                defaultValue: {
                    total_students_attempted: 0,
                    students_passed_all: 0,
                    overall_pass_rate: 0,
                    average_attempts_to_pass: 0,
                    hardest_test_case: null,
                    easiest_test_case: null
                }
            },
            created_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            },
            update_time: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            }
        },
        {
            sequelize,
            modelName: 'QuestionTestCaseAnalytics',
            tableName: 'QuestionTestCaseAnalytics',
            timestamps: false
        }
    );

    return QuestionTestCaseAnalytics;
};
