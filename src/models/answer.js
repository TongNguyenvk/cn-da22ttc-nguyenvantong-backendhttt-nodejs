'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Answer extends Model {
        static associate(models) {
            Answer.belongsTo(models.Question, { foreignKey: 'question_id' });
            if (models.MediaFile) {
                Answer.hasMany(models.MediaFile, { foreignKey: 'answer_id', as: 'MediaFiles' });
            }
        }
    }

    Answer.init(
        {
            answer_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            question_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Questions',
                    key: 'question_id',
                },
            },
            answer_text: {
                type: DataTypes.TEXT,
                allowNull: false,
            },
            iscorrect: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
            },
            answer_data: {
                type: DataTypes.JSONB,
                allowNull: true
            },
            answer_type: {
                type: DataTypes.STRING(30),
                allowNull: true
            },
            display_order: {
                type: DataTypes.INTEGER,
                allowNull: true
            },
            answer_explanation: {
                type: DataTypes.TEXT,
                allowNull: true
            }
        },
        {
            sequelize,
            modelName: 'Answer',
            tableName: 'Answers',
        }
    );

    return Answer;
};