'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CourseIntervention extends Model {
    static associate(models) {
      CourseIntervention.belongsTo(models.Course, { foreignKey: 'course_id', as: 'Course' });
      CourseIntervention.belongsTo(models.LO, { foreignKey: 'lo_id', as: 'LO' });
      CourseIntervention.hasMany(models.InterventionResult, { foreignKey: 'intervention_id', as: 'Results' });
    }
  }

  CourseIntervention.init({
    intervention_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, autoIncrementIdentity: true },
    course_id: { type: DataTypes.INTEGER, allowNull: false },
    lo_id: { type: DataTypes.INTEGER, allowNull: true },
    type: { type: DataTypes.STRING(50), allowNull: false },
    target_group: { type: DataTypes.STRING(50), allowNull: true },
    reason: { type: DataTypes.TEXT, allowNull: true },
    parameters: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'pending' },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    scheduled_at: { type: DataTypes.DATE, allowNull: true },
    executed_at: { type: DataTypes.DATE, allowNull: true }
  }, {
    sequelize,
    modelName: 'CourseIntervention',
    tableName: 'CourseInterventions',
    timestamps: false,
    indexes: [ { fields: ['course_id'] }, { fields: ['status'] } ]
  });

  return CourseIntervention;
};
