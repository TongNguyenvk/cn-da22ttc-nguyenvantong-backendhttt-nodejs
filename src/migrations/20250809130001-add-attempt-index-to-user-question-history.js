'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Thêm column attempt_index vào bảng UserQuestionHistories
    await queryInterface.addColumn('UserQuestionHistories', 'attempt_index', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: 'Attempt number for this question within quiz'
    });

    // Cập nhật dữ liệu hiện có - set attempt_index = 1 cho tất cả records hiện tại
    await queryInterface.sequelize.query(`
      UPDATE "UserQuestionHistories" 
      SET attempt_index = 1 
      WHERE attempt_index IS NULL;
    `);

    // Tạo unique index mới
    await queryInterface.addIndex('UserQuestionHistories', 
      ['user_id', 'quiz_id', 'question_id', 'attempt_index'], 
      {
        unique: true,
        name: 'idx_user_question_history_unique_attempt'
      }
    );
  },

  down: async (queryInterface, Sequelize) => {
    // Xóa index trước
    await queryInterface.removeIndex('UserQuestionHistories', 'idx_user_question_history_unique_attempt');
    
    // Xóa column
    await queryInterface.removeColumn('UserQuestionHistories', 'attempt_index');
  }
};
