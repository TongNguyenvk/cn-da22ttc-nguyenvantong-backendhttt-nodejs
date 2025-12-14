'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('TeacherSubjectAssignments', {
            assignment_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            teacher_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Users',
                    key: 'user_id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
                comment: 'ID của giáo viên được phân công'
            },
            subject_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Subjects',
                    key: 'subject_id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
                comment: 'ID của môn học'
            },
            semester_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Semesters',
                    key: 'semester_id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
                comment: 'ID của học kỳ'
            },
            assigned_by: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Users',
                    key: 'user_id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL',
                comment: 'ID của admin thực hiện phân công'
            },
            assigned_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.NOW,
                comment: 'Thời gian phân công'
            },
            is_active: {
                type: Sequelize.BOOLEAN,
                defaultValue: true,
                comment: 'Trạng thái phân công'
            },
            note: {
                type: Sequelize.TEXT,
                allowNull: true,
                comment: 'Ghi chú về phân công'
            },
            workload_hours: {
                type: Sequelize.INTEGER,
                allowNull: true,
                comment: 'Số giờ giảng dạy dự kiến'
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.NOW
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.NOW
            }
        });

        // Tạo indexes
        await queryInterface.addIndex('TeacherSubjectAssignments', ['teacher_id']);
        await queryInterface.addIndex('TeacherSubjectAssignments', ['subject_id']);
        await queryInterface.addIndex('TeacherSubjectAssignments', ['semester_id']);
        await queryInterface.addIndex('TeacherSubjectAssignments', ['assigned_by']);
        await queryInterface.addIndex('TeacherSubjectAssignments', ['is_active']);
        
        // Unique constraint để đảm bảo không trùng lặp phân công
        await queryInterface.addIndex('TeacherSubjectAssignments', 
            ['teacher_id', 'subject_id', 'semester_id'], {
            name: 'unique_teacher_subject_semester',
            unique: true
        });

        // Index cho tìm kiếm phân công theo thời gian
        await queryInterface.addIndex('TeacherSubjectAssignments', ['assigned_at']);
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('TeacherSubjectAssignments');
    }
};
