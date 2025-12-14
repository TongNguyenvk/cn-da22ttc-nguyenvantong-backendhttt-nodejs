'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Program extends Model {
        static associate(models) {
            Program.hasMany(models.PO, { foreignKey: 'program_id' });
            Program.hasMany(models.PLO, { foreignKey: 'program_id' });
            Program.hasMany(models.TrainingBatch, { foreignKey: 'program_id' });
            // Many-to-Many with Subjects via ProgramSubjects
            if (models.ProgramSubject) {
                Program.belongsToMany(models.Subject, {
                    through: models.ProgramSubject,
                    foreignKey: 'program_id',
                    otherKey: 'subject_id',
                    as: 'Subjects'
                });
            }
        }
    }

    Program.init(
        {
            program_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            name: {
                type: DataTypes.STRING(50),
                allowNull: false,
            },
            description: {
                type: DataTypes.STRING(100),
            },
        },
        {
            sequelize,
            modelName: 'Program',
            tableName: 'Programs',
        }
    );

    return Program;
};