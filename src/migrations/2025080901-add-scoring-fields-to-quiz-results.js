'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add columns that exist in the model but are missing in the DB
    const table = 'QuizResults';

    // Helper to add column if it doesn't exist (for idempotence across environments)
    async function addColumnIfMissing(columnName, attributes) {
      try {
        const tableDef = await queryInterface.describeTable(table);
        if (!tableDef[columnName]) {
          await queryInterface.addColumn(table, columnName, attributes);
        }
      } catch (err) {
        // Fallback: try to add column directly if describeTable fails in some envs
        await queryInterface.addColumn(table, columnName, attributes);
      }
    }

    await addColumnIfMissing('raw_total_points', {
      type: Sequelize.FLOAT,
      allowNull: true,
      comment: 'Sum of earned points before normalization'
    });

    await addColumnIfMissing('max_points', {
      type: Sequelize.FLOAT,
      allowNull: true,
      comment: 'Maximum achievable points'
    });

    await addColumnIfMissing('bonuses_total', {
      type: Sequelize.FLOAT,
      allowNull: true,
      comment: 'Total bonus points applied'
    });

    await addColumnIfMissing('synced_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Timestamp when realtime data was last fully synced'
    });
  },

  async down(queryInterface, Sequelize) {
    const table = 'QuizResults';

    // Remove columns (ignore errors if column already removed)
    async function removeColumnIfExists(columnName) {
      try {
        const tableDef = await queryInterface.describeTable(table);
        if (tableDef[columnName]) {
          await queryInterface.removeColumn(table, columnName);
        }
      } catch (err) {
        // Ignore
      }
    }

    await removeColumnIfExists('raw_total_points');
    await removeColumnIfExists('max_points');
    await removeColumnIfExists('bonuses_total');
    await removeColumnIfExists('synced_at');
  }
};

