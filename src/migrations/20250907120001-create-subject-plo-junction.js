'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        // Tạo bảng junction SubjectPLOs cho quan hệ nhiều-nhiều
        await queryInterface.createTable('SubjectPLOs', {
            id: {
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
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
            },
            plo_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'PLOs',
                    key: 'plo_id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.fn('NOW'),
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.fn('NOW'),
            },
        });

        // Tạo unique constraint để đảm bảo không có duplicate
        await queryInterface.addConstraint('SubjectPLOs', {
            fields: ['subject_id', 'plo_id'],
            type: 'unique',
            name: 'unique_subject_plo'
        });

        // Migrate dữ liệu từ quan hệ cũ sang bảng junction mới
        // Chỉ migrate những record có plo_id không null
        await queryInterface.sequelize.query(`
            INSERT INTO "SubjectPLOs" (subject_id, plo_id, created_at, updated_at)
            SELECT subject_id, plo_id, NOW(), NOW()
            FROM "Subjects"
            WHERE plo_id IS NOT NULL
        `);
    },

    async down(queryInterface, Sequelize) {
        // Trước khi xóa bảng junction, khôi phục lại cột plo_id nếu cần
        const tableInfo = await queryInterface.describe('Subjects');
        
        if (!tableInfo.plo_id) {
            // Thêm lại cột plo_id vào bảng Subjects
            await queryInterface.addColumn('Subjects', 'plo_id', {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'PLOs',
                    key: 'plo_id',
                },
            });

            // Migrate dữ liệu ngược lại (chỉ lấy 1 PLO đầu tiên nếu có nhiều)
            await queryInterface.sequelize.query(`
                UPDATE "Subjects" 
                SET plo_id = (
                    SELECT plo_id 
                    FROM "SubjectPLOs" 
                    WHERE "SubjectPLOs".subject_id = "Subjects".subject_id 
                    LIMIT 1
                )
                WHERE EXISTS (
                    SELECT 1 
                    FROM "SubjectPLOs" 
                    WHERE "SubjectPLOs".subject_id = "Subjects".subject_id
                )
            `);
        }

        // Xóa bảng junction
        await queryInterface.dropTable('SubjectPLOs');
    },
};
