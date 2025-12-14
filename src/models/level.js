'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Level extends Model {
        static associate(models) {
            Level.hasMany(models.Question, { foreignKey: 'level_id' });
        }
    }

    Level.init(
        {
            level_id: {
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
            modelName: 'Level',
            tableName: 'Levels',
        }
    );

    return Level;
};