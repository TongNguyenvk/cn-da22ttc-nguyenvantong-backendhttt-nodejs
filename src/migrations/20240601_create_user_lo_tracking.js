'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('UserLOTrackings', {
            tracking_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'Users', key: 'user_id' },
            },
            lo_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'LOs', key: 'lo_id' },
            },
            subject_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'Subjects', key: 'subject_id' },
            },
            performance_metrics: {
                type: Sequelize.JSON,
                allowNull: false,
                defaultValue: {},
            },
            difficulty_breakdown: {
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
        await queryInterface.dropTable('UserLOTrackings');
    },
}; 