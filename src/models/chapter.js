'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Chapter extends Model {
        static associate(models) {
            // Quan hệ many-to-one với Subject
            Chapter.belongsTo(models.Subject, {
                foreignKey: 'subject_id',
                as: 'Subject',
            });

            // Quan hệ one-to-many với Question

            // Quan hệ nhiều-nhiều với LO thông qua model ChapterLO
            Chapter.belongsToMany(models.LO, {
                through: models.ChapterLO, // Sử dụng model ChapterLO thay vì tên bảng
                foreignKey: 'chapter_id',
                otherKey: 'lo_id',
                as: 'LOs',
            });

            // Quan hệ one-to-many với ChapterSection
            Chapter.hasMany(models.ChapterSection, { foreignKey: 'chapter_id', as: 'Sections' });
        }
    }

    Chapter.init(
        {
            chapter_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            subject_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Subjects',
                    key: 'subject_id',
                },
            },
            name: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            description: {
                type: DataTypes.TEXT,
            },
        },
        {
            sequelize,
            modelName: 'Chapter',
            tableName: 'Chapters',
            timestamps: false,
        }
    );

    return Chapter;
};