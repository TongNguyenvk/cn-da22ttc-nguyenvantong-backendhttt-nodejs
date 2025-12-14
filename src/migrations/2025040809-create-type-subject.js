'use strict';
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('TypeSubjects', {
            type_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            description: {
                type: Sequelize.STRING(100),
            },
        });
    },
    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('TypeSubjects');
    },
};