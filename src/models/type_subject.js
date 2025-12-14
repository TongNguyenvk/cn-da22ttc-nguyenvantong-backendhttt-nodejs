'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class TypeSubject extends Model {
        static associate(models) {
            TypeSubject.hasMany(models.Subject, { foreignKey: 'type_id' });
        }
    }

    TypeSubject.init(
        {
            type_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            description: {
                type: DataTypes.STRING,
                allowNull: false,
            },
        },
        {
            sequelize,
            modelName: 'TypeSubject',
            tableName: 'TypeSubjects',
        }
    );

    return TypeSubject;
};