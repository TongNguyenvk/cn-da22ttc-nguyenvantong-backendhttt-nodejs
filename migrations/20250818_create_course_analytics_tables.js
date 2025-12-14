'use strict';

/**
 * Creates course-level analytics support tables (rollups + interventions + config).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // CourseAnalyticsConfigs
    await queryInterface.createTable('CourseAnalyticsConfigs', {
      config_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      course_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Courses', key: 'course_id' },
        onDelete: 'CASCADE'
      },
      thresholds: { // JSON: {low_mastery:0.6, high_mastery:0.85, min_attempts:5, alert_drop:0.15, ...}
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      feature_flags: { // JSON booleans for toggling analytics features
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await queryInterface.addIndex('CourseAnalyticsConfigs', ['course_id']);
    await queryInterface.addConstraint('CourseAnalyticsConfigs', {
      fields: ['course_id'],
      type: 'unique',
      name: 'uniq_course_analytics_config'
    });

    // CourseAnalyticsRollups
    await queryInterface.createTable('CourseAnalyticsRollups', {
      rollup_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      course_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Courses', key: 'course_id' },
        onDelete: 'CASCADE'
      },
      snapshot_date: { type: Sequelize.DATEONLY, allowNull: false },
      metrics: { // JSON aggregate metrics
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      confidence: { type: Sequelize.DECIMAL(5,4), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await queryInterface.addIndex('CourseAnalyticsRollups', ['course_id', 'snapshot_date'], { unique: true, name: 'uniq_course_date_rollup' });
    await queryInterface.addIndex('CourseAnalyticsRollups', ['snapshot_date']);

    // CourseLORollups
    await queryInterface.createTable('CourseLORollups', {
      lo_rollup_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      course_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Courses', key: 'course_id' },
        onDelete: 'CASCADE'
      },
      lo_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'LOs', key: 'lo_id' },
        onDelete: 'CASCADE'
      },
      snapshot_date: { type: Sequelize.DATEONLY, allowNull: false },
      stats: { // LO stats JSON
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      confidence: { type: Sequelize.DECIMAL(5,4), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await queryInterface.addIndex('CourseLORollups', ['course_id', 'lo_id', 'snapshot_date'], { unique: true, name: 'uniq_course_lo_date_rollup' });
    await queryInterface.addIndex('CourseLORollups', ['lo_id']);

    // CourseInterventions
    await queryInterface.createTable('CourseInterventions', {
      intervention_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      course_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Courses', key: 'course_id' },
        onDelete: 'CASCADE'
      },
      lo_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'LOs', key: 'lo_id' },
        onDelete: 'SET NULL'
      },
      type: { type: Sequelize.STRING(50), allowNull: false },
      target_group: { type: Sequelize.STRING(50), allowNull: true },
      reason: { type: Sequelize.TEXT, allowNull: true },
      parameters: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      status: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'pending' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      scheduled_at: { type: Sequelize.DATE, allowNull: true },
      executed_at: { type: Sequelize.DATE, allowNull: true }
    });
    await queryInterface.addIndex('CourseInterventions', ['course_id']);
    await queryInterface.addIndex('CourseInterventions', ['status']);

    // InterventionResults
    await queryInterface.createTable('InterventionResults', {
      result_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      intervention_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'CourseInterventions', key: 'intervention_id' },
        onDelete: 'CASCADE'
      },
      metrics_before: { type: Sequelize.JSONB, allowNull: true },
      metrics_after: { type: Sequelize.JSONB, allowNull: true },
      improvement: { type: Sequelize.JSONB, allowNull: true },
      evaluated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await queryInterface.addIndex('InterventionResults', ['intervention_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('InterventionResults');
    await queryInterface.dropTable('CourseInterventions');
    await queryInterface.dropTable('CourseLORollups');
    await queryInterface.dropTable('CourseAnalyticsRollups');
    await queryInterface.dropTable('CourseAnalyticsConfigs');
  }
};
