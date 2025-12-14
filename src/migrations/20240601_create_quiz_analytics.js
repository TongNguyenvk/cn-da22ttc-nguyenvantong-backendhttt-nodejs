'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('QuizAnalytics', {
            analytics_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            quiz_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'Quizzes', key: 'quiz_id' },
            },
            subject_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'Subjects', key: 'subject_id' },
            },
            participation_metrics: {
                type: Sequelize.JSON,
                allowNull: false,
                defaultValue: {},
            },
            performance_metrics: {
                type: Sequelize.JSON,
                allowNull: false,
                defaultValue: {},
            },
            question_analysis: {
                type: Sequelize.JSON,
                allowNull: false,
                defaultValue: {},
            },
            lo_analysis: {
                type: Sequelize.JSON,
                allowNull: false,
                defaultValue: {},
            },
            update_time: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.fn('NOW'),
            },
        });
    },
    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('QuizAnalytics');
    },
}; 