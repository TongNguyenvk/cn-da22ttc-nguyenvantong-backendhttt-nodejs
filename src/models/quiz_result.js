'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class QuizResult extends Model {
        static associate(models) {
            QuizResult.belongsTo(models.User, {
                foreignKey: 'user_id',
                as: 'Student'
            });
            QuizResult.belongsTo(models.Quiz, {
                foreignKey: 'quiz_id',
                as: 'Quiz'
            });
        }
    }

    QuizResult.init(
        {
            result_id: {
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
            score: {
                type: DataTypes.FLOAT,
                allowNull: false,
            },
            status: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            update_time: {
                type: DataTypes.DATE,
            },
            completion_time: {
                type: DataTypes.INTEGER,
            },
            raw_total_points: {
                type: DataTypes.FLOAT,
                allowNull: true,
                comment: 'Sum of earned points before normalization'
            },
            max_points: {
                type: DataTypes.FLOAT,
                allowNull: true,
                comment: 'Maximum achievable points'
            },
            bonuses_total: {
                type: DataTypes.FLOAT,
                allowNull: true,
                comment: 'Total bonus points applied'
            },
            synced_at: {
                type: DataTypes.DATE,
                allowNull: true,
                comment: 'Timestamp when realtime data was last fully synced'
            }
        },
        {
            sequelize,
            modelName: 'QuizResult',
            tableName: 'QuizResults',
            timestamps: false  // CRITICAL FIX: Disable createdAt/updatedAt (không có trong DB schema)
        }
    );

    return QuizResult;
};