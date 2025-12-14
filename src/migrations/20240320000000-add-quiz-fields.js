'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('Quizzes', 'current_question_index', {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0
        });

        await queryInterface.addColumn('Quizzes', 'show_leaderboard', {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('Quizzes', 'current_question_index');
        await queryInterface.removeColumn('Quizzes', 'show_leaderboard');
    }
}; 