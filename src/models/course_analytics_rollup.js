'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CourseAnalyticsRollup extends Model {
    static associate(models) {
      CourseAnalyticsRollup.belongsTo(models.Course, { foreignKey: 'course_id', as: 'Course' });
    }
  }

  CourseAnalyticsRollup.init({
    rollup_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, autoIncrementIdentity: true },
    course_id: { type: DataTypes.INTEGER, allowNull: false },
    snapshot_date: { type: DataTypes.DATEONLY, allowNull: false },
    metrics: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    confidence: { type: DataTypes.DECIMAL(5,4), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    modelName: 'CourseAnalyticsRollup',
    tableName: 'CourseAnalyticsRollups',
    timestamps: false,
    indexes: [ { unique: true, fields: ['course_id', 'snapshot_date'], name: 'uniq_course_date_rollup' } ]
  });

  return CourseAnalyticsRollup;
};
