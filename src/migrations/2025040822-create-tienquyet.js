'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('TienQuyets', {
            subject_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                references: {
                    model: 'Subjects',
                    key: 'subject_id',
                },
                onDelete: 'CASCADE',
            },
            prerequisite_subject_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                references: {
                    model: 'Subjects',
                    key: 'subject_id',
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
        await queryInterface.dropTable('TienQuyets');
    },
};