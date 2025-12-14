'use strict';
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('CourseResults', {
            result_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Users',
                    key: 'user_id',
                },
            },
            course_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Courses',
                    key: 'course_id',
                },
            },
            average_score: {
                type: Sequelize.FLOAT,
                allowNull: false,
            },
            total_quizzes: {
                type: Sequelize.INTEGER,
                allowNull: false,
            },
            update_time: {
                type: Sequelize.DATE,
                defaultValue: Sequelize.NOW,
            },
        });
    },
    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('CourseResults');
    },
};