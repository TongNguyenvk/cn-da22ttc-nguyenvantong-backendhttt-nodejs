'use strict';
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('LOs', {
            lo_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            subject_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Subjects',
                    key: 'subject_id',
                },
            },
            name: {
                type: Sequelize.STRING(50),
            },
            description: {
                type: Sequelize.STRING(100),
            },
        });
    },
    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('LOs');
    },
};