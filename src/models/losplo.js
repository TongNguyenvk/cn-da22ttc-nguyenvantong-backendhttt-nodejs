'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class LOsPLO extends Model {
        static associate(models) {
            // Định nghĩa quan hệ với LO và PLO
            LOsPLO.belongsTo(models.LO, {
                foreignKey: 'lo_id',
                onDelete: 'CASCADE'
            });
            LOsPLO.belongsTo(models.PLO, {
                foreignKey: 'plo_id',
                onDelete: 'CASCADE'
            });
        }
    }

    LOsPLO.init(
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            lo_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'LOs',
                    key: 'lo_id',
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
            modelName: 'LOsPLO',
            tableName: 'LOsPLOs',
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            indexes: [
                {
                    unique: true,
                    fields: ['lo_id', 'plo_id'],
                    name: 'unique_lo_plo'
                }
            ]
        }
    );

    return LOsPLO;
};