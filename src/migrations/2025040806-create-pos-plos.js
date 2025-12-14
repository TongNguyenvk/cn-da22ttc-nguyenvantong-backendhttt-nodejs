'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('POsPLOs', {
            po_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                references: {
                    model: 'POs',
                    key: 'po_id',
                },
                onDelete: 'CASCADE',
            },
            plo_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                references: {
                    model: 'PLOs',
                    key: 'plo_id',
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
        await queryInterface.dropTable('POsPLOs');
    },
};