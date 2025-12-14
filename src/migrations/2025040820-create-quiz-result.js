'use strict';
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('QuizResults', {
            result_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Users',
                    key: 'user_id',
                },
            },
            quiz_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Quizzes',
                    key: 'quiz_id',
                },
            },
            score: {
                type: Sequelize.FLOAT,
                allowNull: false,
            },
            status: {
                type: Sequelize.STRING(50),
                allowNull: false,
            },
            update_time: {
                type: Sequelize.DATE,
                defaultValue: Sequelize.NOW,
            },
            completion_time: {
                type: Sequelize.INTEGER,
            },
        });
    },
    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('QuizResults');
    },
};