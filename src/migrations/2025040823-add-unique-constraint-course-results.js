'use strict';
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addConstraint('CourseResults', {
            fields: ['user_id', 'course_id'],
            type: 'unique',
            name: 'unique_user_course',
        });
    },
    async down(queryInterface, Sequelize) {
        await queryInterface.removeConstraint('CourseResults', 'unique_user_course');
    },
};