'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('UserQuestionHistories', 'points_earned', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
      comment: 'Points earned for this attempt (with penalties applied)'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('UserQuestionHistories', 'points_earned');
  }
};
