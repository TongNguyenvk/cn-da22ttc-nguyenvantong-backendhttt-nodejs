'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class LO extends Model {
        static associate(models) {
            // NEW: Direct relationship with Subject
            LO.belongsTo(models.Subject, { 
                foreignKey: 'subject_id',
                as: 'Subject' 
            });
            
            // Quan hệ one-to-many với Question
            LO.hasMany(models.Question, { foreignKey: 'lo_id' });

            // Quan hệ nhiều-nhiều với Chapter thông qua model ChapterLO
            LO.belongsToMany(models.Chapter, {
                through: models.ChapterLO, // Sử dụng model ChapterLO thay vì tên bảng
                foreignKey: 'lo_id',
                otherKey: 'chapter_id',
                as: 'Chapters',
            });

            // Quan hệ nhiều-nhiều với PLO thông qua bảng junction LOsPLOs
            LO.belongsToMany(models.PLO, { 
                through: models.LOsPLO, 
                foreignKey: 'lo_id',
                otherKey: 'plo_id',
                as: 'PLOs'
            });
        }
    }

    LO.init(
        {
            lo_id: {
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
            modelName: 'LO',
            tableName: 'LOs',
            timestamps: false,
        }
    );

    return LO;
};