'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        // Thêm cột name vào bảng PLOs
        await queryInterface.addColumn('PLOs', 'name', {
            type: Sequelize.STRING(50),
            allowNull: false,
            defaultValue: '', // Giá trị mặc định tạm thời
        });

        // Cập nhật dữ liệu cho cột name dựa vào plo_id
        await queryInterface.sequelize.query(`
            UPDATE "PLOs" SET name = 'PLO' || plo_id WHERE name = '' OR name IS NULL;
        `);
    },

    async down(queryInterface, Sequelize) {
        // Xóa cột name khỏi bảng PLOs
        await queryInterface.removeColumn('PLOs', 'name');
    },
};
