'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('UserQuestionHistories', {
            history_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'Users', key: 'user_id' },
            },
            question_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'Questions', key: 'question_id' },
            },
            quiz_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'Quizzes', key: 'quiz_id' },
            },
            selected_answer: {
                type: Sequelize.INTEGER,
                allowNull: true,
            },
            is_correct: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
            },
            time_spent: {
                type: Sequelize.INTEGER,
                allowNull: true,
                comment: 'Time spent in seconds',
            },
            attempt_date: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.fn('NOW'),
            },
            difficulty_level: {
                type: Sequelize.ENUM('easy', 'medium', 'hard'),
                allowNull: true,
            },
        });
    },
    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('UserQuestionHistories');
    },
}; 