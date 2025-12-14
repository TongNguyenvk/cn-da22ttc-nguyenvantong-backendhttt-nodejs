const {
    Course,
    CourseGradeColumn,
    CourseGradeColumnQuiz,
    CourseGradeResult,
    Quiz,
    QuizResult,
    User,
    sequelize
} = require('../models');
const { Op } = require('sequelize');

class CourseGradeService {
    /**
     * Tính điểm trung bình của một cột điểm cho một sinh viên
     * @param {number} columnId - ID của cột điểm
     * @param {number} userId - ID của sinh viên
     * @returns {Promise<number|null>} Điểm trung bình hoặc null nếu không có kết quả
     */
    static async calculateColumnAverage(columnId, userId) {
        try {
            // Lấy tất cả quiz thuộc cột điểm này (kèm trọng số nếu có)
            const columnQuizzes = await CourseGradeColumnQuiz.findAll({
                where: { column_id: columnId },
                include: [{ model: Quiz, as: 'Quiz', attributes: ['quiz_id', 'name'] }]
            });

            if (columnQuizzes.length === 0) {
                return null;
            }

            // Lấy kết quả quiz của sinh viên
            const quizIds = columnQuizzes.map(cq => cq.quiz_id);
            const quizResults = await QuizResult.findAll({
                where: {
                    user_id: userId,
                    quiz_id: quizIds
                },
                attributes: ['quiz_id', 'score']
            });

            if (quizResults.length === 0) {
                return null;
            }

            // Kiểm tra có dùng weighted hay không
            const weightExists = columnQuizzes.some(cq => cq.weight_percentage !== null && cq.weight_percentage !== undefined);
            if (weightExists) {
                // Map quiz_id -> weight
                const weightMap = {};
                let weightSum = 0;
                columnQuizzes.forEach(cq => {
                    if (cq.weight_percentage) {
                        weightMap[cq.quiz_id] = parseFloat(cq.weight_percentage);
                        weightSum += parseFloat(cq.weight_percentage);
                    }
                });
                // Nếu tổng weight không = 100, normalise
                if (weightSum > 0 && Math.abs(weightSum - 100) > 0.001) {
                    Object.keys(weightMap).forEach(k => { weightMap[k] = (weightMap[k] / weightSum) * 100; });
                    weightSum = 100;
                }
                let weightedSum = 0; let appliedWeight = 0;
                quizResults.forEach(r => {
                    const w = weightMap[r.quiz_id];
                    if (w) { weightedSum += r.score * w; appliedWeight += w; }
                });
                if (appliedWeight === 0) {
                    // Fallback average nếu không có kết quả nào có weight
                    const totalScore = quizResults.reduce((sum, result) => sum + result.score, 0);
                    return Math.round((totalScore / quizResults.length) * 100) / 100;
                }
                return Math.round(((weightedSum / appliedWeight)) * 100) / 100;
            } else {
                const totalScore = quizResults.reduce((sum, result) => sum + result.score, 0);
                return Math.round((totalScore / quizResults.length) * 100) / 100; // Làm tròn 2 chữ số thập phân
            }
        } catch (error) {
            console.error('Error calculating column average:', error);
            throw error;
        }
    }

    /**
     * Tính điểm trung bình quá trình cho một sinh viên
     * @param {number} courseId - ID của khóa học
     * @param {number} userId - ID của sinh viên
     * @returns {Promise<{columnScores: Object, processAverage: number|null}>}
     */
    static async calculateProcessAverage(courseId, userId) {
        try {
            // Lấy tất cả cột điểm của khóa học
            const gradeColumns = await CourseGradeColumn.findAll({
                where: {
                    course_id: courseId,
                    is_active: true
                },
                order: [['column_order', 'ASC']]
            });

            if (gradeColumns.length === 0) {
                return { columnScores: {}, processAverage: null };
            }

            // Tính điểm từng cột
            const columnScores = {};
            let weightedSum = 0;
            let totalWeight = 0;

            for (const column of gradeColumns) {
                const columnAverage = await this.calculateColumnAverage(column.column_id, userId);
                columnScores[column.column_id] = {
                    column_name: column.column_name,
                    weight_percentage: parseFloat(column.weight_percentage),
                    average_score: columnAverage
                };

                // Chỉ tính vào trung bình nếu có điểm
                if (columnAverage !== null) {
                    weightedSum += columnAverage * parseFloat(column.weight_percentage);
                    totalWeight += parseFloat(column.weight_percentage);
                }
            }

            // Tính điểm trung bình quá trình
            const processAverage = totalWeight > 0 ?
                Math.round((weightedSum / totalWeight) * 100) / 100 : null;

            return { columnScores, processAverage };
        } catch (error) {
            console.error('Error calculating process average:', error);
            throw error;
        }
    }

    /**
     * Tính điểm tổng kết cho một sinh viên
     * @param {number} courseId - ID của khóa học
     * @param {number} userId - ID của sinh viên
     * @param {number|null} finalExamScore - Điểm thi kết thúc môn
     * @returns {Promise<Object>} Kết quả tính điểm đầy đủ
     */
    static async calculateFinalGrade(courseId, userId, finalExamScore = null) {
        try {
            // Lấy cấu hình khóa học
            const course = await Course.findByPk(courseId);
            if (!course) {
                throw new Error('Khóa học không tồn tại');
            }

            const gradeConfig = course.grade_config || {
                final_exam_weight: 50,
                process_weight: 50
            };

            // Tính điểm trung bình quá trình
            const { columnScores, processAverage } = await this.calculateProcessAverage(courseId, userId);

            // Tính điểm tổng kết
            let totalScore = null;
            if (processAverage !== null && finalExamScore !== null) {
                const processWeight = gradeConfig.process_weight / 100;
                const finalWeight = gradeConfig.final_exam_weight / 100;
                totalScore = Math.round((processAverage * processWeight + finalExamScore * finalWeight) * 100) / 100;
            }

            // Xếp loại
            const grade = totalScore !== null ? this.calculateGradeLevel(totalScore) : null;

            return {
                column_scores: columnScores,
                process_average: processAverage,
                final_exam_score: finalExamScore,
                total_score: totalScore,
                grade: grade,
                grade_config: gradeConfig
            };
        } catch (error) {
            console.error('Error calculating final grade:', error);
            throw error;
        }
    }

    /**
     * Xếp loại dựa trên điểm số
     * @param {number} score - Điểm số
     * @returns {string} Xếp loại
     */
    static calculateGradeLevel(score) {
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

    /**
     * Lưu hoặc cập nhật kết quả điểm của sinh viên
     * @param {number} courseId - ID của khóa học
     * @param {number} userId - ID của sinh viên
     * @param {number|null} finalExamScore - Điểm thi kết thúc môn
     * @returns {Promise<Object>} Kết quả đã lưu
     */
    static async saveOrUpdateGradeResult(courseId, userId, finalExamScore = null) {
        const transaction = await sequelize.transaction();

        try {
            // Tính toán điểm
            const gradeData = await this.calculateFinalGrade(courseId, userId, finalExamScore);

            // Tìm hoặc tạo kết quả
            let [result, created] = await CourseGradeResult.findOrCreate({
                where: { course_id: courseId, user_id: userId },
                defaults: {
                    column_scores: gradeData.column_scores,
                    process_average: gradeData.process_average,
                    final_exam_score: gradeData.final_exam_score,
                    total_score: gradeData.total_score,
                    grade: gradeData.grade
                },
                transaction
            });

            if (!created) {
                // Snapshot trước update
                await sequelize.models.CourseGradeResultHistory.create({
                    result_id: result.result_id,
                    snapshot: result.toJSON()
                }, { transaction });
                await result.update({
                    column_scores: gradeData.column_scores,
                    process_average: gradeData.process_average,
                    final_exam_score: gradeData.final_exam_score,
                    total_score: gradeData.total_score,
                    grade: gradeData.grade,
                    last_updated: new Date()
                }, { transaction });
            } else {
                await sequelize.models.CourseGradeResultHistory.create({
                    result_id: result.result_id,
                    snapshot: result.toJSON()
                }, { transaction });
            }

            await transaction.commit();
            return result;
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    /**
     * Cập nhật điểm thi kết thúc môn cho sinh viên
     * @param {number} courseId - ID của khóa học
     * @param {number} userId - ID của sinh viên
     * @param {number} finalExamScore - Điểm thi kết thúc môn
     * @returns {Promise<Object>} Kết quả đã cập nhật
     */
    static async updateFinalExamScore(courseId, userId, finalExamScore) {
        try {
            if (finalExamScore < 0 || finalExamScore > 10) {
                throw new Error('Điểm thi kết thúc phải từ 0 đến 10');
            }

            return await this.saveOrUpdateGradeResult(courseId, userId, finalExamScore);
        } catch (error) {
            console.error('Error updating final exam score:', error);
            throw error;
        }
    }

    /**
     * Tính toán lại điểm cho tất cả sinh viên trong khóa học
     * @param {number} courseId - ID của khóa học
     * @returns {Promise<Array>} Danh sách kết quả đã cập nhật
     */
    static async recalculateAllGrades(courseId) {
        try {
            // Lấy danh sách sinh viên trong khóa học
            const course = await Course.findByPk(courseId, {
                include: [{
                    model: User,
                    as: 'Students',
                    through: { attributes: [] },
                    where: { role_id: 3 }, // Assuming role_id 3 is student
                    attributes: ['user_id', 'name', 'email']
                }]
            });

            if (!course) {
                throw new Error('Khóa học không tồn tại');
            }

            const results = [];
            for (const student of course.Students) {
                // Lấy điểm thi kết thúc hiện tại (nếu có)
                const existingResult = await CourseGradeResult.findOne({
                    where: { course_id: courseId, user_id: student.user_id }
                });

                const finalExamScore = existingResult ? existingResult.final_exam_score : null;

                // Tính toán lại và lưu
                const updatedResult = await this.saveOrUpdateGradeResult(
                    courseId,
                    student.user_id,
                    finalExamScore
                );

                results.push({
                    user_id: student.user_id,
                    name: student.name,
                    email: student.email,
                    result: updatedResult
                });
            }

            return results;
        } catch (error) {
            console.error('Error recalculating all grades:', error);
            throw error;
        }
    }
}

module.exports = CourseGradeService;
