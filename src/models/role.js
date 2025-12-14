'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Role extends Model {
        static associate(models) {
            Role.hasMany(models.User, { foreignKey: 'role_id' });
        }
    }

    Role.init(
        {
            role_id: {
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
            modelName: 'Role',
            tableName: 'Roles',
            timestamps: false,
            underscored: true
        }
    );

    return Role;
};