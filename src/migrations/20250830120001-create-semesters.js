'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('Semesters', {
            semester_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            name: {
                type: Sequelize.STRING(100),
                allowNull: false,
                comment: 'Tên học kỳ: HK1 2024-2025, HK2 2024-2025'
            },
            academic_year: {
                type: Sequelize.STRING(20),
                allowNull: false,
                comment: 'Năm học: 2024-2025'
            },
            semester_number: {
                type: Sequelize.INTEGER,
                allowNull: false,
                comment: 'Học kỳ trong năm: 1, 2, 3 (hè)'
            },
            start_date: {
                type: Sequelize.DATEONLY,
                allowNull: false,
                comment: 'Ngày bắt đầu học kỳ'
            },
            end_date: {
                type: Sequelize.DATEONLY,
                allowNull: false,
                comment: 'Ngày kết thúc học kỳ'
            },
            is_active: {
                type: Sequelize.BOOLEAN,
                defaultValue: false,
                comment: 'Học kỳ hiện tại đang hoạt động'
            },
            description: {
                type: Sequelize.TEXT,
                allowNull: true,
                comment: 'Mô tả thêm về học kỳ'
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
        await queryInterface.addIndex('Semesters', ['academic_year']);
        await queryInterface.addIndex('Semesters', ['is_active']);
        await queryInterface.addIndex('Semesters', ['start_date', 'end_date']);
        
        // Unique constraint để đảm bảo chỉ có 1 học kỳ active
        await queryInterface.addIndex('Semesters', ['is_active'], {
            name: 'unique_active_semester',
            unique: true,
            where: {
                is_active: true
            }
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('Semesters');
    }
};
