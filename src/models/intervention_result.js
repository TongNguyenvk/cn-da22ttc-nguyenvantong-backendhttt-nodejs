'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class InterventionResult extends Model {
    static associate(models) {
      InterventionResult.belongsTo(models.CourseIntervention, { foreignKey: 'intervention_id', as: 'Intervention' });
    }
  }

  InterventionResult.init({
    result_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, autoIncrementIdentity: true },
    intervention_id: { type: DataTypes.INTEGER, allowNull: false },
    metrics_before: { type: DataTypes.JSONB, allowNull: true },
    metrics_after: { type: DataTypes.JSONB, allowNull: true },
    improvement: { type: DataTypes.JSONB, allowNull: true },
    evaluated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    modelName: 'InterventionResult',
    tableName: 'InterventionResults',
    timestamps: false,
    indexes: [ { fields: ['intervention_id'] } ]
  });

  return InterventionResult;
};
