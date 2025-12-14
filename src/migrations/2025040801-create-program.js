'use strict';
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('Programs', {
            program_id: {
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
        });
    },
    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('Programs');
    },
};