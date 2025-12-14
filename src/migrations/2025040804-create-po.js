'use strict';
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('POs', {
            po_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            name: {
                type: Sequelize.STRING(50),
                allowNull: false,
            },
            description: {
                type: Sequelize.STRING(100),
            },
            program_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Programs',
                    key: 'program_id',
                },
            },
        });
    },
    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('POs');
    },
};