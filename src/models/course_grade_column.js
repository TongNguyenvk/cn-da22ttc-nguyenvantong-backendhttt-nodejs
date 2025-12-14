'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class CourseGradeColumn extends Model {
        static associate(models) {
            // Quan hệ với Course
            CourseGradeColumn.belongsTo(models.Course, { 
                foreignKey: 'course_id',
                as: 'Course'
            });

            // Quan hệ với CourseGradeColumnQuiz (một cột có nhiều quiz)
            CourseGradeColumn.hasMany(models.CourseGradeColumnQuiz, { 
                foreignKey: 'column_id',
                as: 'ColumnQuizzes'
            });

            // Quan hệ nhiều-nhiều với Quiz thông qua CourseGradeColumnQuiz
            CourseGradeColumn.belongsToMany(models.Quiz, {
                through: models.CourseGradeColumnQuiz,
                foreignKey: 'column_id',
                otherKey: 'quiz_id',
                as: 'Quizzes'
            });
        }

        // Instance methods
        async getAverageScore(userId) {
            const { CourseGradeColumnQuiz, QuizResult } = sequelize.models;
            
            // Lấy tất cả quiz thuộc cột này
            const columnQuizzes = await CourseGradeColumnQuiz.findAll({
                where: { column_id: this.column_id },
                include: [{
                    model: sequelize.models.Quiz,
                    as: 'Quiz'
                }]
            });

            if (columnQuizzes.length === 0) return null;

            // Lấy kết quả quiz của user
            const quizIds = columnQuizzes.map(cq => cq.quiz_id);
            const quizResults = await QuizResult.findAll({
                where: {
                    user_id: userId,
                    quiz_id: quizIds
                }
            });

            if (quizResults.length === 0) return null;

            // Tính điểm trung bình
            const totalScore = quizResults.reduce((sum, result) => sum + result.score, 0);
            return totalScore / quizResults.length;
        }

        // Static methods
        static async validateWeightPercentages(courseId, excludeColumnId = null) {
            const whereClause = { course_id: courseId, is_active: true };
            if (excludeColumnId) {
                whereClause.column_id = { [sequelize.Sequelize.Op.ne]: excludeColumnId };
            }

            const columns = await this.findAll({
                where: whereClause
            });

            const totalWeight = columns.reduce((sum, col) => sum + parseFloat(col.weight_percentage), 0);
            return { isValid: totalWeight <= 100, currentTotal: totalWeight };
        }
    }

    CourseGradeColumn.init(
        {
            column_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            course_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Courses',
                    key: 'course_id',
                },
                onDelete: 'CASCADE'
            },
            column_name: {
                type: DataTypes.STRING(255),
                allowNull: false,
                validate: {
                    notEmpty: {
                        msg: 'Tên cột điểm không được để trống'
                    },
                    len: {
                        args: [1, 255],
                        msg: 'Tên cột điểm phải từ 1-255 ký tự'
                    }
                }
            },
            weight_percentage: {
                type: DataTypes.DECIMAL(5, 2),
                allowNull: false,
                validate: {
                    min: {
                        args: [0.01],
                        msg: 'Tỷ lệ phần trăm phải lớn hơn 0'
                    },
                    max: {
                        args: [100],
                        msg: 'Tỷ lệ phần trăm không được vượt quá 100'
                    }
                }
            },
            column_order: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 1,
                validate: {
                    min: {
                        args: [1],
                        msg: 'Thứ tự cột phải lớn hơn 0'
                    }
                }
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true
            },
            is_active: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true
            }
        },
        {
            sequelize,
            modelName: 'CourseGradeColumn',
            tableName: 'CourseGradeColumns',
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            indexes: [
                {
                    fields: ['course_id']
                },
                {
                    unique: true,
                    fields: ['course_id', 'column_order'],
                    name: 'idx_course_grade_columns_order'
                }
            ]
        }
    );

    return CourseGradeColumn;
};
