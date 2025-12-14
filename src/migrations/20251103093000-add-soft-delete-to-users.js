'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add is_active and deleted_at columns to Users if not exist
    const table = 'Users';
    const tableDesc = await queryInterface.describeTable(table);

    if (!tableDesc['is_active']) {
      await queryInterface.addColumn(table, 'is_active', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Soft delete flag: false means deactivated'
      });
    }

    if (!tableDesc['deleted_at']) {
      await queryInterface.addColumn(table, 'deleted_at', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Soft delete timestamp'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const table = 'Users';
    const tableDesc = await queryInterface.describeTable(table);

    if (tableDesc['deleted_at']) {
      await queryInterface.removeColumn(table, 'deleted_at');
    }
    if (tableDesc['is_active']) {
      await queryInterface.removeColumn(table, 'is_active');
    }
  }
};
