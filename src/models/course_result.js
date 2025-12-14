'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class CourseResult extends Model {
        static associate(models) {
            CourseResult.belongsTo(models.User, { foreignKey: 'user_id' });
            CourseResult.belongsTo(models.Course, { foreignKey: 'course_id' });
        }
    }

    CourseResult.init(
        {
            result_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            user_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Users',
                    key: 'user_id',
                },
            },
            course_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Courses',
                    key: 'course_id',
                },
            },
            average_score: {
                type: DataTypes.FLOAT,
                allowNull: false,
            },
            total_quizzes: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            update_time: {
                type: DataTypes.DATE,
            },
        },
        {
            sequelize,
            modelName: 'CourseResult',
            tableName: 'CourseResults',
        }
    );

    return CourseResult;
};