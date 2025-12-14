'use strict';
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('PLOs', {
            plo_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            description: {
                type: Sequelize.STRING(100),
                allowNull: false,
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
        await queryInterface.dropTable('PLOs');
    },
};