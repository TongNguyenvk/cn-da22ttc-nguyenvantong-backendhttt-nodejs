'use strict';
module.exports = (sequelize, DataTypes) => {
  class ProgramSubject extends sequelize.Sequelize.Model {
    static associate(models) {
      ProgramSubject.belongsTo(models.Program, { foreignKey: 'program_id', as: 'Program' });
      ProgramSubject.belongsTo(models.Subject, { foreignKey: 'subject_id', as: 'Subject' });
    }
  }
  ProgramSubject.init({
    program_subject_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, autoIncrementIdentity: true },
    program_id: { type: DataTypes.INTEGER, allowNull: false },
    subject_id: { type: DataTypes.INTEGER, allowNull: false },
    order_index: { type: DataTypes.INTEGER },
    recommended_semester: { type: DataTypes.INTEGER },
    is_mandatory: { type: DataTypes.BOOLEAN, defaultValue: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, {
    sequelize,
    modelName: 'ProgramSubject',
    tableName: 'ProgramSubjects',
    underscored: true,
    timestamps: true,
    indexes: [
      { unique: true, fields: ['program_id', 'subject_id'] }
    ]
  });
  return ProgramSubject;
};
