'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class UserQuizTracking extends Model {
        
        static associate(models) {
            UserQuizTracking.belongsTo(models.User, {
                foreignKey: 'user_id',
                as: 'User'
            });
            UserQuizTracking.belongsTo(models.Quiz, {
                foreignKey: 'quiz_id',
                as: 'Quiz'
            });
            UserQuizTracking.belongsTo(models.Subject, {
                foreignKey: 'subject_id',
                as: 'Subject'
            });
        }
        
    }

    UserQuizTracking.init(
        {
            
            tracking_id: {
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
            performance_metrics: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    total_attempts: 0,
                    average_score: 0,
                    best_score: 0,
                    completion_time: 0,
                    last_attempt_date: null
                }
            },
            difficulty_breakdown: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    easy: { attempts: 0, correct: 0 },
                    medium: { attempts: 0, correct: 0 },
                    hard: { attempts: 0, correct: 0 }
                }
            },
            lo_performance: {
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
            modelName: 'UserQuizTracking',
            tableName: 'UserQuizTrackings',
            timestamps: false
        }
    );

    return UserQuizTracking;
}; 



