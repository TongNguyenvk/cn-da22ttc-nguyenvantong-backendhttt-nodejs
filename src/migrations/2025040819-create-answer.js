'use strict';
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('Answers', {
            answer_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            question_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Questions',
                    key: 'question_id',
                },
            },
            answer_text: {
                type: Sequelize.STRING(255),
                allowNull: false,
            },
            iscorrect: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
            },
        });
    },
    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('Answers');
    },
};