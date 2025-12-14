'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        // Thêm cột semester_id vào bảng Courses
        await queryInterface.addColumn('Courses', 'semester_id', {
            type: Sequelize.INTEGER,
            allowNull: true, // Allow null for backward compatibility
            references: {
                model: 'Semesters',
                key: 'semester_id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
            comment: 'ID của học kỳ mà khóa học thuộc về'
        });

        // Thêm cột assignment_id để liên kết với phân công giáo viên
        await queryInterface.addColumn('Courses', 'assignment_id', {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
                model: 'TeacherSubjectAssignments',
                key: 'assignment_id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
            comment: 'ID của phân công giáo viên mà khóa học được tạo từ đó'
        });

        // Thêm cột original_course_id cho tính năng clone course
        await queryInterface.addColumn('Courses', 'original_course_id', {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
                model: 'Courses',
                key: 'course_id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
            comment: 'ID của khóa học gốc nếu khóa học này được clone'
        });

        // Thêm cột is_template để đánh dấu course mẫu có thể clone
        await queryInterface.addColumn('Courses', 'is_template', {
            type: Sequelize.BOOLEAN,
            defaultValue: false,
            comment: 'Đánh dấu khóa học có thể được sử dụng làm mẫu để clone'
        });

        // Tạo indexes
        await queryInterface.addIndex('Courses', ['semester_id']);
        await queryInterface.addIndex('Courses', ['assignment_id']);
        await queryInterface.addIndex('Courses', ['original_course_id']);
        await queryInterface.addIndex('Courses', ['is_template']);
    },

    async down(queryInterface, Sequelize) {
        // Xóa indexes trước
        await queryInterface.removeIndex('Courses', ['semester_id']);
        await queryInterface.removeIndex('Courses', ['assignment_id']);
        await queryInterface.removeIndex('Courses', ['original_course_id']);
        await queryInterface.removeIndex('Courses', ['is_template']);

        // Xóa columns
        await queryInterface.removeColumn('Courses', 'semester_id');
        await queryInterface.removeColumn('Courses', 'assignment_id');
        await queryInterface.removeColumn('Courses', 'original_course_id');
        await queryInterface.removeColumn('Courses', 'is_template');
    }
};
