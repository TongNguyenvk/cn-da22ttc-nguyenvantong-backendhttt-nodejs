'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('StudentCourses', {
            user_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                references: {
                    model: 'Users',
                    key: 'user_id',
                },
                onDelete: 'CASCADE',
            },
            course_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                references: {
                    model: 'Courses',
                    key: 'course_id',
                },
                onDelete: 'CASCADE',
            },
            createdAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
            updatedAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('StudentCourses');
    },
};