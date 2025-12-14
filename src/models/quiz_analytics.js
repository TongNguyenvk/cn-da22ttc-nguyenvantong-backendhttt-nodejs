'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class QuizAnalytics extends Model {

        static associate(models) {
            QuizAnalytics.belongsTo(models.Quiz, {
                foreignKey: 'quiz_id',
                as: 'Quiz'
            });
            QuizAnalytics.belongsTo(models.Subject, {
                foreignKey: 'subject_id',
                as: 'Subject'
            });
        }

    }

    QuizAnalytics.init(
        {

            analytics_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            quiz_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Quizzes',
                    key: 'quiz_id',
                },
            },
            subject_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Subjects',
                    key: 'subject_id',
                },
            },
            participation_metrics: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    total_participants: 0,
                    completion_rate: 0,
                    average_time_spent: 0,
                    dropout_rate: 0
                }
            },
            performance_metrics: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    average_score: 0,
                    highest_score: 0,
                    lowest_score: 0,
                    pass_rate: 0
                }
            },
            question_analysis: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    total_questions: 0,
                    average_difficulty: 0,
                    question_breakdown: {
                        easy: { count: 0, correct_rate: 0 },
                        medium: { count: 0, correct_rate: 0 },
                        hard: { count: 0, correct_rate: 0 }
                    }
                }
            },
            lo_analysis: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {}
            },
            update_time: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            }

        },
        {
            sequelize,
            modelName: 'QuizAnalytics',
            tableName: 'QuizAnalytics',
            timestamps: false
        }
    );

    return QuizAnalytics;
}; 