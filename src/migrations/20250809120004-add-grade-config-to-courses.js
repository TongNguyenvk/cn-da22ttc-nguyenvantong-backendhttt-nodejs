'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Courses', 'grade_config', {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: {
        final_exam_weight: 50,
        process_weight: 50
      },
      comment: 'Cấu hình tỷ lệ điểm: final_exam_weight (%) và process_weight (%)'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Courses', 'grade_config');
  }
};
