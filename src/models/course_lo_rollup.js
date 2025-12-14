'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CourseLORollup extends Model {
    static associate(models) {
      CourseLORollup.belongsTo(models.Course, { foreignKey: 'course_id', as: 'Course' });
      CourseLORollup.belongsTo(models.LO, { foreignKey: 'lo_id', as: 'LO' });
    }
  }

  CourseLORollup.init({
    lo_rollup_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, autoIncrementIdentity: true },
    course_id: { type: DataTypes.INTEGER, allowNull: false },
    lo_id: { type: DataTypes.INTEGER, allowNull: false },
    snapshot_date: { type: DataTypes.DATEONLY, allowNull: false },
    stats: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    confidence: { type: DataTypes.DECIMAL(5,4), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    modelName: 'CourseLORollup',
    tableName: 'CourseLORollups',
    timestamps: false,
    indexes: [ { unique: true, fields: ['course_id', 'lo_id', 'snapshot_date'], name: 'uniq_course_lo_date_rollup' } ]
  });

  return CourseLORollup;
};
