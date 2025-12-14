'use strict';
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('Questions', {
            question_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            question_type_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'QuestionTypes',
                    key: 'question_type_id',
                },
            },
            level_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Levels',
                    key: 'level_id',
                },
            },
            question_text: {
                type: Sequelize.TEXT,
                allowNull: false,
            },
            lo_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'LOs',
                    key: 'lo_id',
                },
            },
        });
    },
    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('Questions');
    },
};