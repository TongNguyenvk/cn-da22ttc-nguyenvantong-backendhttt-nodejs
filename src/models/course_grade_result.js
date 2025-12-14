'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class CourseGradeResult extends Model {
        static associate(models) {
            // Quan hệ với Course
            CourseGradeResult.belongsTo(models.Course, { 
                foreignKey: 'course_id',
                as: 'Course'
            });

            // Quan hệ với User (sinh viên)
            CourseGradeResult.belongsTo(models.User, { 
                foreignKey: 'user_id',
                as: 'Student'
            });
        }

        // Instance methods
        calculateGrade() {
            if (!this.total_score) return 'F';
            
            const score = parseFloat(this.total_score);
            if (score >= 9.0) return 'A+';
            if (score >= 8.5) return 'A';
            if (score >= 8.0) return 'B+';
            if (score >= 7.0) return 'B';
            if (score >= 6.5) return 'C+';
            if (score >= 5.5) return 'C';
            if (score >= 5.0) return 'D+';
            if (score >= 4.0) return 'D';
            return 'F';
        }

        async updateGrade() {
            this.grade = this.calculateGrade();
            this.last_updated = new Date();
            return await this.save();
        }

        // Static methods
        static async calculateAndSaveResult(courseId, userId) {
            const { CourseGradeColumn, CourseGradeColumnQuiz, QuizResult, Course } = sequelize.models;
            
            // Lấy cấu hình khóa học
            const course = await Course.findByPk(courseId);
            if (!course) throw new Error('Khóa học không tồn tại');

            const gradeConfig = course.grade_config || { final_exam_weight: 50, process_weight: 50 };

            // Lấy tất cả cột điểm của khóa học
            const gradeColumns = await CourseGradeColumn.findAll({
                where: { course_id: courseId, is_active: true },
                order: [['column_order', 'ASC']]
            });

            if (gradeColumns.length === 0) {
                throw new Error('Khóa học chưa có cột điểm nào');
            }

            // Tính điểm từng cột
            const columnScores = {};
            let processAverage = 0;

            for (const column of gradeColumns) {
                const averageScore = await column.getAverageScore(userId);
                columnScores[column.column_id] = averageScore;
                
                if (averageScore !== null) {
                    processAverage += averageScore * (parseFloat(column.weight_percentage) / 100);
                }
            }

            // Lấy điểm thi kết thúc môn (tạm thời để null, sẽ nhập thủ công)
            const finalExamScore = null;

            // Tính điểm tổng kết
            let totalScore = null;
            if (processAverage > 0 && finalExamScore !== null) {
                totalScore = (processAverage * gradeConfig.process_weight / 100) + 
                           (finalExamScore * gradeConfig.final_exam_weight / 100);
            }

            // Tìm hoặc tạo kết quả
            let [result, created] = await this.findOrCreate({
                where: { course_id: courseId, user_id: userId },
                defaults: {
                    column_scores: columnScores,
                    process_average: processAverage > 0 ? processAverage : null,
                    final_exam_score: finalExamScore,
                    total_score: totalScore,
                    grade: totalScore ? this.prototype.calculateGrade.call({ total_score: totalScore }) : null
                }
            });

            if (!created) {
                // Cập nhật kết quả hiện có
                result.column_scores = columnScores;
                result.process_average = processAverage > 0 ? processAverage : null;
                result.final_exam_score = finalExamScore;
                result.total_score = totalScore;
                result.grade = totalScore ? result.calculateGrade() : null;
                result.last_updated = new Date();
                await result.save();
            }

            return result;
        }

        static async updateFinalExamScore(courseId, userId, finalExamScore) {
            const result = await this.findOne({
                where: { course_id: courseId, user_id: userId }
            });

            if (!result) {
                throw new Error('Không tìm thấy kết quả học tập của sinh viên');
            }

            // Lấy cấu hình khóa học
            const course = await sequelize.models.Course.findByPk(courseId);
            const gradeConfig = course.grade_config || { final_exam_weight: 50, process_weight: 50 };

            // Cập nhật điểm thi kết thúc
            result.final_exam_score = finalExamScore;

            // Tính lại điểm tổng kết
            if (result.process_average !== null && finalExamScore !== null) {
                result.total_score = (result.process_average * gradeConfig.process_weight / 100) + 
                                   (finalExamScore * gradeConfig.final_exam_weight / 100);
                result.grade = result.calculateGrade();
            }

            result.last_updated = new Date();
            await result.save();

            return result;
        }

        static async getCourseResults(courseId) {
            return await this.findAll({
                where: { course_id: courseId },
                include: [{
                    model: sequelize.models.User,
                    as: 'Student',
                    attributes: ['user_id', 'name', 'email']
                }],
                order: [['Student', 'name', 'ASC']]
            });
        }
    }

    CourseGradeResult.init(
        {
            result_id: {
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
            user_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Users',
                    key: 'user_id',
                },
                onDelete: 'CASCADE'
            },
            column_scores: {
                type: DataTypes.JSONB,
                allowNull: true,
                defaultValue: {}
            },
            process_average: {
                type: DataTypes.DECIMAL(4, 2),
                allowNull: true,
                validate: {
                    min: 0,
                    max: 10
                }
            },
            final_exam_score: {
                type: DataTypes.DECIMAL(4, 2),
                allowNull: true,
                validate: {
                    min: 0,
                    max: 10
                }
            },
            total_score: {
                type: DataTypes.DECIMAL(4, 2),
                allowNull: true,
                validate: {
                    min: 0,
                    max: 10
                }
            },
            grade: {
                type: DataTypes.STRING(10),
                allowNull: true,
                validate: {
                    isIn: [['A+', 'A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F']]
                }
            },
            calculated_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            },
            last_updated: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            }
        },
        {
            sequelize,
            modelName: 'CourseGradeResult',
            tableName: 'CourseGradeResults',
            timestamps: false,
            indexes: [
                {
                    fields: ['course_id']
                },
                {
                    fields: ['user_id']
                },
                {
                    unique: true,
                    fields: ['course_id', 'user_id'],
                    name: 'idx_unique_course_user_result'
                }
            ]
        }
    );

    return CourseGradeResult;
};
