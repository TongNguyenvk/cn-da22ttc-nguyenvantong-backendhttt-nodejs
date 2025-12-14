'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class UserLOTracking extends Model {
        
        static associate(models) {
            UserLOTracking.belongsTo(models.User, {
                foreignKey: 'user_id',
                as: 'User'
            });
            UserLOTracking.belongsTo(models.LO, {
                foreignKey: 'lo_id',
                as: 'LO'
            });
            UserLOTracking.belongsTo(models.Subject, {
                foreignKey: 'subject_id',
                as: 'Subject'
            });
        }
        
    }

    UserLOTracking.init(
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
            lo_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'LOs',
                    key: 'lo_id',
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
                    correct_answers: 0,
                    average_score: 0,
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
            update_time: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            }
            
        },
        {
            sequelize,
            modelName: 'UserLOTracking',
            tableName: 'UserLOTrackings',
            timestamps: false
        }
    );

    return UserLOTracking;
}; 



