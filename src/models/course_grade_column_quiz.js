'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class CourseGradeColumnQuiz extends Model {
        static associate(models) {
            // Quan hệ với CourseGradeColumn
            CourseGradeColumnQuiz.belongsTo(models.CourseGradeColumn, { 
                foreignKey: 'column_id',
                as: 'GradeColumn'
            });

            // Quan hệ với Quiz
            CourseGradeColumnQuiz.belongsTo(models.Quiz, { 
                foreignKey: 'quiz_id',
                as: 'Quiz'
            });

            // Quan hệ với User (người gán)
            CourseGradeColumnQuiz.belongsTo(models.User, { 
                foreignKey: 'assigned_by',
                as: 'AssignedByUser'
            });
        }

        // Static methods
        static async validateQuizAssignment(columnId, quizId) {
            try {
                // Kiểm tra quiz đã được gán vào cột khác chưa
                const existingAssignment = await this.findOne({
                    where: { quiz_id: quizId }
                });

                if (existingAssignment && existingAssignment.column_id !== columnId) {
                    return {
                        isValid: false,
                        message: 'Quiz này đã được gán vào cột điểm khác'
                    };
                }

                // Lấy thông tin cột điểm
                const gradeColumn = await sequelize.models.CourseGradeColumn.findByPk(columnId);
                if (!gradeColumn) {
                    return {
                        isValid: false,
                        message: 'Cột điểm không tồn tại'
                    };
                }

                // Lấy thông tin quiz
                const quiz = await sequelize.models.Quiz.findByPk(quizId);
                if (!quiz) {
                    return {
                        isValid: false,
                        message: 'Quiz không tồn tại'
                    };
                }

                // Kiểm tra quiz có thuộc về cùng course không (quiz.course_id được lưu trực tiếp)
                if (quiz.course_id !== gradeColumn.course_id) {
                    return {
                        isValid: false,
                        message: 'Quiz không thuộc về khóa học này'
                    };
                }

                return { isValid: true };
            } catch (error) {
                console.error('Error validating quiz assignment:', error);
                return {
                    isValid: false,
                    message: 'Lỗi khi kiểm tra quiz assignment'
                };
            }
        }

        static async getQuizzesByColumn(columnId) {
            return await this.findAll({
                where: { column_id: columnId },
                include: [{
                    model: sequelize.models.Quiz,
                    as: 'Quiz',
                    include: [{
                        model: sequelize.models.Subject,
                        as: 'Subject'
                    }]
                }],
                order: [['assigned_at', 'ASC']]
            });
        }

        static async removeQuizFromColumn(columnId, quizId) {
            return await this.destroy({
                where: {
                    column_id: columnId,
                    quiz_id: quizId
                }
            });
        }
    }

    CourseGradeColumnQuiz.init(
        {
            mapping_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            column_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'CourseGradeColumns',
                    key: 'column_id',
                },
                onDelete: 'CASCADE'
            },
            quiz_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Quizzes',
                    key: 'quiz_id',
                },
                onDelete: 'CASCADE'
            },
            weight_percentage: {
                type: DataTypes.DECIMAL(5, 2),
                allowNull: true,
                validate: {
                    min: 0.01,
                    max: 100
                },
                comment: 'Tỷ lệ phần trăm của quiz trong cột điểm (nếu có phân bổ)'
            },
            assigned_by: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: {
                    model: 'Users',
                    key: 'user_id',
                }
            },
            assigned_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            }
        },
        {
            sequelize,
            modelName: 'CourseGradeColumnQuiz',
            tableName: 'CourseGradeColumnQuizzes',
            timestamps: false,
            indexes: [
                {
                    fields: ['column_id']
                },
                {
                    fields: ['quiz_id']
                },
                {
                    unique: true,
                    fields: ['column_id', 'quiz_id'],
                    name: 'idx_unique_column_quiz'
                }
            ]
        }
    );

    return CourseGradeColumnQuiz;
};
