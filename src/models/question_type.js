'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class QuestionType extends Model {
        static associate(models) {
            QuestionType.hasMany(models.Question, { foreignKey: 'question_type_id' });
        }
    }

    QuestionType.init(
        {
            question_type_id: {
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
            modelName: 'QuestionType',
            tableName: 'QuestionTypes',
        }
    );

    return QuestionType;
};