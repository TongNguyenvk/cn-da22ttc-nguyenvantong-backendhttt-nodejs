'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CourseGradeResultHistory extends Model {
    static associate(models) {
      CourseGradeResultHistory.belongsTo(models.CourseGradeResult, { foreignKey: 'result_id', as: 'Result' });
    }
  }

  CourseGradeResultHistory.init({
    history_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    result_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'CourseGradeResults', key: 'result_id' }, onDelete: 'CASCADE' },
    snapshot: { type: DataTypes.JSONB, allowNull: false },
    changed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    modelName: 'CourseGradeResultHistory',
    tableName: 'CourseGradeResultHistories',
    timestamps: false,
    indexes: [ { fields: ['result_id'] } ]
  });

  return CourseGradeResultHistory;
};
