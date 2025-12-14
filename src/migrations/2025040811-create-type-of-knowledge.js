'use strict';
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('TypeOfKnowledges', {
            noidung_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            khoi_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Groups',
                    key: 'khoi_id',
                },
            },
            description: {
                type: Sequelize.STRING(100),
            },
        });
    },
    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('TypeOfKnowledges');
    },
};