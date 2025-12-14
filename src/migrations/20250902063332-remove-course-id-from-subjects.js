'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Kiểm tra và xóa cột course_id nếu tồn tại
    const tableInfo = await queryInterface.describeTable('Subjects');
    
    if (tableInfo.course_id) {
      console.log('Removing course_id column from Subjects table...');
      await queryInterface.removeColumn('Subjects', 'course_id');
    } else {
      console.log('course_id column does not exist in Subjects table, skipping...');
    }
  },

  async down (queryInterface, Sequelize) {
    // Thêm lại cột course_id nếu cần rollback (không khuyến khích)
    await queryInterface.addColumn('Subjects', 'course_id', {
      type: Sequelize.INTEGER,
      allowNull: true, // Cho phép NULL để tránh lỗi khi rollback
      references: {
        model: 'Courses',
        key: 'course_id'
      }
    });
  }
};
