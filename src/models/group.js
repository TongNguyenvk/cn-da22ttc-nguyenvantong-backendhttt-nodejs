'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Group extends Model {
        static associate(models) {
            Group.hasMany(models.TypeOfKnowledge, { foreignKey: 'khoi_id' });
        }
    }

    Group.init(
        {
            khoi_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            name: {
                type: DataTypes.STRING,
                allowNull: false,
            },
        },
        {
            sequelize,
            modelName: 'Group',
            tableName: 'Groups',
        }
    );

    return Group;
};