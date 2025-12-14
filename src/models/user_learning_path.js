'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class UserLearningPath extends Model {

        static associate(models) {
            UserLearningPath.belongsTo(models.User, {
                foreignKey: 'user_id',
                as: 'User'
            });
            UserLearningPath.belongsTo(models.Subject, {
                foreignKey: 'subject_id',
                as: 'Subject'
            });
        }

    }

    UserLearningPath.init(
        {

            path_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            user_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Users',
                    key: 'user_id',
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
            learning_progress: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    completed_quizzes: [],
                    current_lo: null,
                    next_lo: null,
                    mastery_level: 0
                }
            },
            performance_history: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    quiz_scores: [],
                    lo_mastery: {},
                    improvement_areas: []
                }
            },
            recommended_actions: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    next_quiz: null,
                    focus_areas: [],
                    practice_topics: []
                }
            },
            update_time: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            }

        },
        {
            sequelize,
            modelName: 'UserLearningPath',
            tableName: 'UserLearningPaths',
            timestamps: false
        }
    );

    return UserLearningPath;
}; 