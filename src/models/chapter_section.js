'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class ChapterSection extends Model {
        static associate(models) {
            ChapterSection.belongsTo(models.Chapter, { foreignKey: 'chapter_id', as: 'Chapter' });
        }
    }

    ChapterSection.init(
        {
            section_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            chapter_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Chapters',
                    key: 'chapter_id',
                },
            },
            title: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            content: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            order: {
                type: DataTypes.INTEGER,
                allowNull: true,
            }
        },
        {
            sequelize,
            modelName: 'ChapterSection',
            tableName: 'ChapterSections',
            timestamps: false,
        }
    );

    return ChapterSection;
}; 