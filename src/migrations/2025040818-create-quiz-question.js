'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('QuizQuestions', {
            quiz_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                references: {
                    model: 'Quizzes',
                    key: 'quiz_id',
                },
                onDelete: 'CASCADE',
            },
            question_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                references: {
                    model: 'Questions',
                    key: 'question_id',
                },
                onDelete: 'CASCADE',
            },
            createdAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
            updatedAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('QuizQuestions');
    },
};