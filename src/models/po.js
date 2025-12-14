'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class PO extends Model {
        static associate(models) {
            PO.belongsTo(models.Program, { foreignKey: 'program_id' });
            PO.belongsToMany(models.PLO, { through: models.POsPLOs, foreignKey: 'po_id' });
        }
    }

    PO.init(
        {
            po_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            name: {
                type: DataTypes.STRING(100),
                allowNull: false,
            },
            description: {
                type: DataTypes.TEXT,
            },
            program_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Programs',
                    key: 'program_id',
                },
            },
        },
        {
            sequelize,
            modelName: 'PO',
            tableName: 'POs',
        }
    );

    return PO;
};