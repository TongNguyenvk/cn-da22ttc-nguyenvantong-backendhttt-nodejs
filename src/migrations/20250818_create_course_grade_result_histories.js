'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('CourseGradeResultHistories', {
      history_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      result_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'CourseGradeResults', key: 'result_id' },
        onDelete: 'CASCADE'
      },
      snapshot: { type: Sequelize.JSONB, allowNull: false },
      changed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await queryInterface.addIndex('CourseGradeResultHistories', ['result_id']);
  },
  async down(queryInterface) {
    await queryInterface.dropTable('CourseGradeResultHistories');
  }
};
