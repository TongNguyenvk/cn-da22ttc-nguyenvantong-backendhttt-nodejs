'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class SubjectPLO extends Model {
        static associate(models) {
            // Định nghĩa quan hệ với Subject và PLO
            SubjectPLO.belongsTo(models.Subject, { 
                foreignKey: 'subject_id',
                onDelete: 'CASCADE'
            });
            SubjectPLO.belongsTo(models.PLO, { 
                foreignKey: 'plo_id',
                onDelete: 'CASCADE'
            });
        }
    }

    SubjectPLO.init(
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            subject_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Subjects',
                    key: 'subject_id',
                },
            },
            plo_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'PLOs',
                    key: 'plo_id',
                },
            },
            created_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
            },
            updated_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
            },
        },
        {
            sequelize,
            modelName: 'SubjectPLO',
            tableName: 'SubjectPLOs',
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            indexes: [
                {
                    unique: true,
                    fields: ['subject_id', 'plo_id'],
                    name: 'unique_subject_plo'
                }
            ]
        }
    );

    return SubjectPLO;
};
