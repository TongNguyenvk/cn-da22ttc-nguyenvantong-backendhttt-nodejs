'use strict';
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('Quizzes', {
            quiz_id: {
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
                allowNull: false,
            },
            duration: {
                type: Sequelize.INTEGER,
                allowNull: false,
            },
            start_time: {
                type: Sequelize.DATE,
            },
            end_time: {
                type: Sequelize.DATE,
            },
            update_time: {
                type: Sequelize.DATEONLY,
            },
        });
    },
    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('Quizzes');
    },
};