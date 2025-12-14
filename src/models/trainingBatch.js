'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class TrainingBatch extends Model {
        static associate(models) {
            // TrainingBatch belongs to Program
            TrainingBatch.belongsTo(models.Program, {
                foreignKey: 'program_id',
                as: 'Program'
            });

            // TrainingBatch has many Semesters
            TrainingBatch.hasMany(models.Semester, {
                foreignKey: 'batch_id',
                as: 'Semesters'
            });

            // TrainingBatch has many TeacherSubjectAssignments
            TrainingBatch.hasMany(models.TeacherSubjectAssignment, {
                foreignKey: 'batch_id',
                as: 'TeacherAssignments'
            });

            // TrainingBatch has many Courses
            TrainingBatch.hasMany(models.Course, {
                foreignKey: 'batch_id',
                as: 'Courses'
            });
        }
    }

    TrainingBatch.init(
        {
            batch_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            program_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Programs',
                    key: 'program_id'
                }
            },
            name: {
                type: DataTypes.STRING(100),
                allowNull: false,
            },
            start_year: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            end_year: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            description: {
                type: DataTypes.TEXT,
            },
        },
        {
            sequelize,
            modelName: 'TrainingBatch',
            tableName: 'TrainingBatches',
        }
    );

    return TrainingBatch;
};