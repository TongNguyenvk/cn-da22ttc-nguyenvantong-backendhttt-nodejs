'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class POsPLOs extends Model {
        static associate(models) {
            POsPLOs.belongsTo(models.PO, { foreignKey: 'po_id' });
            POsPLOs.belongsTo(models.PLO, { foreignKey: 'plo_id' });
        }
    }

    POsPLOs.init(
        {
            po_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                references: {
                    model: 'POs',
                    key: 'po_id',
                },
            },
            plo_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                references: {
                    model: 'PLOs',
                    key: 'plo_id',
                },
            },
        },
        {
            sequelize,
            modelName: 'POsPLOs',
            tableName: 'POsPLOs',
        }
    );

    return POsPLOs;
};