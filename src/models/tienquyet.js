'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class TienQuyet extends Model {
        static associate(models) {
            TienQuyet.belongsTo(models.Subject, { as: 'Subject', foreignKey: 'subject_id' });
            TienQuyet.belongsTo(models.Subject, { as: 'PrerequisiteSubjects', foreignKey: 'prerequisite_subject_id' });
        }
    }

    TienQuyet.init(
        {
            subject_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                references: {
                    model: 'Subjects',
                    key: 'subject_id',
                },
            },
            prerequisite_subject_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                references: {
                    model: 'Subjects',
                    key: 'subject_id',
                },
            },
        },
        {
            sequelize,
            modelName: 'TienQuyet',
            tableName: 'TienQuyets',
        }
    );

    return TienQuyet;
};