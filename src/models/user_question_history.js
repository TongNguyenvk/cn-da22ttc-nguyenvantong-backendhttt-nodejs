'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class UserQuestionHistory extends Model {

        static associate(models) {
            UserQuestionHistory.belongsTo(models.User, {
                foreignKey: 'user_id',
                as: 'User'
            });
            UserQuestionHistory.belongsTo(models.Question, {
                foreignKey: 'question_id',
                as: 'Question'
            });
            UserQuestionHistory.belongsTo(models.Quiz, {
                foreignKey: 'quiz_id',
                as: 'Quiz'
            });
        }

    }

    UserQuestionHistory.init(
        {

            history_id: {
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
            question_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Questions',
                    key: 'question_id',
                },
            },
            quiz_id: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: {
                    model: 'Quizzes',
                    key: 'quiz_id',
                },
            },
            selected_answer: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            is_correct: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
            },
            time_spent: {
                type: DataTypes.INTEGER,
                allowNull: true,
                comment: 'Time spent in ms or seconds depending on capture'
            },
            attempt_date: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            },
            difficulty_level: {
                type: DataTypes.ENUM('easy', 'medium', 'hard'),
                allowNull: true
            },
            attempt_index: {
                type: DataTypes.INTEGER,
                allowNull: true,
                comment: 'Attempt number for this question within quiz'
            },
            points_earned: {
                type: DataTypes.DECIMAL(10, 2),
                allowNull: true,
                defaultValue: 0,
                comment: 'Points earned for this attempt (with penalties applied)'
            },
            scoring_breakdown: {
                type: DataTypes.JSONB,
                allowNull: true,
                defaultValue: {},
                comment: 'Detailed scoring breakdown including bonuses, multipliers, etc.'
            },
            bonuses_earned: {
                type: DataTypes.ARRAY(DataTypes.TEXT),
                allowNull: true,
                defaultValue: [],
                comment: 'Array of bonus types earned (e.g., speed_bonus, streak_bonus)'
            },
            streak_at_time: {
                type: DataTypes.INTEGER,
                allowNull: true,
                defaultValue: 0,
                comment: 'Current streak value when this answer was submitted'
            }

        },
        {
            sequelize,
            modelName: 'UserQuestionHistory',
            tableName: 'UserQuestionHistories',
            timestamps: false,
            indexes: [
                { unique: true, fields: ['user_id', 'quiz_id', 'question_id', 'attempt_index'] }
            ]
        }
    );

    return UserQuestionHistory;
};



