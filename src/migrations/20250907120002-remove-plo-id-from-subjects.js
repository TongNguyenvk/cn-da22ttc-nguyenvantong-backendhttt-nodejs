'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        // Xóa cột plo_id từ bảng Subjects vì giờ dùng bảng junction
        await queryInterface.removeColumn('Subjects', 'plo_id');
    },

    async down(queryInterface, Sequelize) {
        // Khôi phục lại cột plo_id
        await queryInterface.addColumn('Subjects', 'plo_id', {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
                model: 'PLOs',
                key: 'plo_id',
            },
        });

        // Migrate dữ liệu từ bảng junction về cột plo_id (chỉ lấy 1 PLO đầu tiên)
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
    },
};
