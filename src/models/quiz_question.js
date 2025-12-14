'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class QuizQuestion extends Model {
        static associate(models) {
            QuizQuestion.belongsTo(models.Quiz, { foreignKey: 'quiz_id' });
            QuizQuestion.belongsTo(models.Question, { foreignKey: 'question_id' });
        }
    }

    QuizQuestion.init(
        {
            quiz_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                references: {
                    model: 'Quizzes',
                    key: 'quiz_id',
                },
            },
            question_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                references: {
                    model: 'Questions',
                    key: 'question_id',
                },
            },
        },
        {
            sequelize,
            modelName: 'QuizQuestion',
            tableName: 'QuizQuestions',
        }
    );

    return QuizQuestion;
};