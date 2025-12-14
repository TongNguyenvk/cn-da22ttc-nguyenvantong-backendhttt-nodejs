'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class StudentCourse extends Model {
        static associate(models) {
            StudentCourse.belongsTo(models.User, { foreignKey: 'user_id' });
            StudentCourse.belongsTo(models.Course, { foreignKey: 'course_id' });
        }
    }

    StudentCourse.init(
        {
            user_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                references: {
                    model: 'Users',
                    key: 'user_id',
                },
            },
            course_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                references: {
                    model: 'Courses',
                    key: 'course_id',
                },
            },
            enrollment_date: {
                type: DataTypes.DATE,
                allowNull: true, // Allow null for backward compatibility
                defaultValue: DataTypes.NOW
            },
        },
        {
            sequelize,
            modelName: 'StudentCourse',
            tableName: 'StudentCourses',
        }
    );

    return StudentCourse;
};