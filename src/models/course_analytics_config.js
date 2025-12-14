'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CourseAnalyticsConfig extends Model {
    static associate(models) {
      CourseAnalyticsConfig.belongsTo(models.Course, { foreignKey: 'course_id', as: 'Course' });
    }
  }

  CourseAnalyticsConfig.init({
    config_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, autoIncrementIdentity: true },
    course_id: { type: DataTypes.INTEGER, allowNull: false },
    thresholds: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    feature_flags: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    modelName: 'CourseAnalyticsConfig',
    tableName: 'CourseAnalyticsConfigs',
    timestamps: false,
    indexes: [ { unique: true, fields: ['course_id'], name: 'uniq_course_analytics_config' } ]
  });

  return CourseAnalyticsConfig;
};
