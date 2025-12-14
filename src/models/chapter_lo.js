'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class ChapterLO extends Model {
        static associate(models) {
            // Quan hệ với Chapter
            ChapterLO.belongsTo(models.Chapter, {
                foreignKey: 'chapter_id',
                as: 'Chapter',
            });

            // Quan hệ với LO
            ChapterLO.belongsTo(models.LO, {
                foreignKey: 'lo_id',
                as: 'LO',
            });
        }
    }

    ChapterLO.init(
        {
            chapter_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                primaryKey: true, // Là một phần của khóa chính composite
                references: {
                    model: 'Chapters',
                    key: 'chapter_id',
                },
            },
            lo_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                primaryKey: true, // Là một phần của khóa chính composite
                references: {
                    model: 'LOs',
                    key: 'lo_id',
                },
            },
        },
        {
            sequelize,
            modelName: 'ChapterLO',
            tableName: 'chapter_lo',
            timestamps: false, // Không có cột timestamps trong bảng trung gian
        }
    );

    return ChapterLO;
};