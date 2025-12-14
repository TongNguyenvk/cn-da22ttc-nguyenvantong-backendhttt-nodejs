'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class TypeOfKnowledge extends Model {
        static associate(models) {
            TypeOfKnowledge.belongsTo(models.Group, { foreignKey: 'khoi_id' });
            TypeOfKnowledge.hasMany(models.Subject, { foreignKey: 'noidung_id' });
        }
    }

    TypeOfKnowledge.init(
        {
            noidung_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            khoi_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Groups',
                    key: 'khoi_id',
                },
            },
            description: {
                type: DataTypes.STRING,
                allowNull: false,
            },
        },
        {
            sequelize,
            modelName: 'TypeOfKnowledge',
            tableName: 'TypeOfKnowledges',
        }
    );

    return TypeOfKnowledge;
};