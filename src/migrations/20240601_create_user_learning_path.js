'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('UserLearningPaths', {
            path_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'Users', key: 'user_id' },
            },
            subject_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'Subjects', key: 'subject_id' },
            },
            learning_progress: {
                type: Sequelize.JSON,
                allowNull: false,
                defaultValue: {},
            },
            performance_history: {
                type: Sequelize.JSON,
                allowNull: false,
                defaultValue: {},
            },
            recommended_actions: {
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
        await queryInterface.dropTable('UserLearningPaths');
    },
}; 