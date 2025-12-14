const {
    Course,
    CourseGradeColumn,
    CourseGradeColumnQuiz,
    CourseGradeResult,
    Quiz,
    Subject,
    User,
    QuizResult,
    sequelize
} = require('../models');
const { Op } = require('sequelize');
const CourseGradeService = require('../services/courseGradeService');
const XLSX = require('xlsx');

// Lấy danh sách cột điểm của khóa học
exports.getGradeColumns = async (req, res) => {
    try {
        const { id: courseId } = req.params;

        // Kiểm tra khóa học tồn tại
        const course = await Course.findByPk(courseId);
        if (!course) {
            return res.status(404).json({ 
                success: false, 
                message: 'Khóa học không tồn tại' 
            });
        }

        // Lấy danh sách cột điểm
        const gradeColumns = await CourseGradeColumn.findAll({
            where: { course_id: courseId },
            include: [{
                model: Quiz,
                as: 'Quizzes',
                through: { attributes: ['assigned_at'] },
                include: [{
                    model: Course,
                    as: 'Course',
                    attributes: ['course_id', 'name'],
                    include: [{
                        model: Subject,
                        as: 'Subject',
                        attributes: ['subject_id', 'name']
                    }]
                }]
            }],
            order: [['column_order', 'ASC']]
        });

        // Tính tổng tỷ lệ phần trăm
        const totalWeight = gradeColumns.reduce((sum, col) => 
            sum + parseFloat(col.weight_percentage), 0
        );

        res.status(200).json({
            success: true,
            data: {
                course_id: courseId,
                course_name: course.name,
                grade_columns: gradeColumns,
                total_weight: totalWeight,
                is_weight_valid: totalWeight === 100
            }
        });
    } catch (error) {
        console.error('Error getting grade columns:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Lỗi khi lấy danh sách cột điểm', 
            error: error.message 
        });
    }
};

// Tạo cột điểm mới
exports.createGradeColumn = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
        const { id: courseId } = req.params;
        const { column_name, weight_percentage, description } = req.body;

        // Validation
        if (!column_name || !weight_percentage) {
            await transaction.rollback();
            return res.status(400).json({ 
                success: false, 
                message: 'Tên cột và tỷ lệ phần trăm là bắt buộc' 
            });
        }

        if (weight_percentage <= 0 || weight_percentage > 100) {
            await transaction.rollback();
            return res.status(400).json({ 
                success: false, 
                message: 'Tỷ lệ phần trăm phải từ 0.01 đến 100' 
            });
        }

        // Kiểm tra khóa học tồn tại
        const course = await Course.findByPk(courseId);
        if (!course) {
            await transaction.rollback();
            return res.status(404).json({ 
                success: false, 
                message: 'Khóa học không tồn tại' 
            });
        }

        // Kiểm tra tổng tỷ lệ phần trăm không vượt quá 100%
        const validation = await CourseGradeColumn.validateWeightPercentages(courseId);
        if (validation.currentTotal + parseFloat(weight_percentage) > 100) {
            await transaction.rollback();
            return res.status(400).json({ 
                success: false, 
                message: `Tổng tỷ lệ phần trăm sẽ vượt quá 100%. Hiện tại: ${validation.currentTotal}%, thêm: ${weight_percentage}%` 
            });
        }

        // Lấy thứ tự cột tiếp theo
        const maxOrder = await CourseGradeColumn.max('column_order', {
            where: { course_id: courseId }
        });
        const nextOrder = (maxOrder || 0) + 1;

        // Tạo cột điểm mới
        const newColumn = await CourseGradeColumn.create({
            course_id: courseId,
            column_name,
            weight_percentage,
            column_order: nextOrder,
            description
        }, { transaction });

        await transaction.commit();

        res.status(201).json({
            success: true,
            message: 'Tạo cột điểm thành công',
            data: newColumn
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error creating grade column:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Lỗi khi tạo cột điểm', 
            error: error.message 
        });
    }
};

// Cập nhật cột điểm
exports.updateGradeColumn = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
        const { id: courseId, columnId } = req.params;
        const { column_name, weight_percentage, description, column_order } = req.body;

        // Tìm cột điểm
        const gradeColumn = await CourseGradeColumn.findOne({
            where: { column_id: columnId, course_id: courseId }
        });

        if (!gradeColumn) {
            await transaction.rollback();
            return res.status(404).json({ 
                success: false, 
                message: 'Cột điểm không tồn tại' 
            });
        }

        // Validation tỷ lệ phần trăm nếu có thay đổi
        if (weight_percentage !== undefined) {
            if (weight_percentage <= 0 || weight_percentage > 100) {
                await transaction.rollback();
                return res.status(400).json({ 
                    success: false, 
                    message: 'Tỷ lệ phần trăm phải từ 0.01 đến 100' 
                });
            }

            // Kiểm tra tổng tỷ lệ phần trăm
            const validation = await CourseGradeColumn.validateWeightPercentages(courseId, columnId);
            if (validation.currentTotal + parseFloat(weight_percentage) > 100) {
                await transaction.rollback();
                return res.status(400).json({ 
                    success: false, 
                    message: `Tổng tỷ lệ phần trăm sẽ vượt quá 100%. Hiện tại (không tính cột này): ${validation.currentTotal}%, thêm: ${weight_percentage}%` 
                });
            }
        }

        // Cập nhật thông tin
        const updateData = {};
        if (column_name !== undefined) updateData.column_name = column_name;
        if (weight_percentage !== undefined) updateData.weight_percentage = weight_percentage;
        if (description !== undefined) updateData.description = description;
        if (column_order !== undefined) updateData.column_order = column_order;

        await gradeColumn.update(updateData, { transaction });

        await transaction.commit();

        res.status(200).json({
            success: true,
            message: 'Cập nhật cột điểm thành công',
            data: gradeColumn
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error updating grade column:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Lỗi khi cập nhật cột điểm', 
            error: error.message 
        });
    }
};

// Xóa cột điểm
exports.deleteGradeColumn = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
        const { id: courseId, columnId } = req.params;

        // Tìm cột điểm
        const gradeColumn = await CourseGradeColumn.findOne({
            where: { column_id: columnId, course_id: courseId }
        });

        if (!gradeColumn) {
            await transaction.rollback();
            return res.status(404).json({ 
                success: false, 
                message: 'Cột điểm không tồn tại' 
            });
        }

        // Kiểm tra xem có quiz nào được gán vào cột này không
        const assignedQuizzes = await CourseGradeColumnQuiz.count({
            where: { column_id: columnId }
        });

        if (assignedQuizzes > 0) {
            await transaction.rollback();
            return res.status(400).json({ 
                success: false, 
                message: 'Không thể xóa cột điểm đã có quiz được gán. Vui lòng gỡ bỏ tất cả quiz trước khi xóa.' 
            });
        }

        // Xóa cột điểm
        await gradeColumn.destroy({ transaction });

        await transaction.commit();

        res.status(200).json({
            success: true,
            message: 'Xóa cột điểm thành công'
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error deleting grade column:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa cột điểm',
            error: error.message
        });
    }
};

// Gán quiz vào cột điểm với tỷ lệ phân bổ điểm
exports.assignQuizzesToColumn = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const { id: courseId, columnId } = req.params;
    let { quiz_assignments, mode } = req.body; // mode optional: 'replace' (default) | 'merge'
        const assignedBy = req.user?.user_id;

        // Backward compatibility: nếu frontend cũ gửi { quiz_ids: [1,2,3] }
        if ((!quiz_assignments || !Array.isArray(quiz_assignments)) && Array.isArray(req.body.quiz_ids)) {
            quiz_assignments = req.body.quiz_ids.map(qid => ({ quiz_id: qid }));
        }

        // Validation
    if (!quiz_assignments || !Array.isArray(quiz_assignments) || quiz_assignments.length === 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Danh sách quiz assignments là bắt buộc và phải là mảng'
            });
        }

        // Validate format của quiz_assignments
        for (const assignment of quiz_assignments) {
            if (!assignment.quiz_id || typeof assignment.quiz_id !== 'number') {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Mỗi assignment phải có quiz_id hợp lệ'
                });
            }

            if (assignment.weight_percentage !== undefined) {
                if (typeof assignment.weight_percentage !== 'number' ||
                    assignment.weight_percentage <= 0 ||
                    assignment.weight_percentage > 100) {
                    await transaction.rollback();
                    return res.status(400).json({
                        success: false,
                        message: 'weight_percentage phải là số từ 0.01 đến 100'
                    });
                }
            }
        }

        // Validate tổng tỷ lệ phần trăm nếu có
        const totalWeight = quiz_assignments
            .filter(a => a.weight_percentage !== undefined)
            .reduce((sum, a) => sum + a.weight_percentage, 0);

        if (totalWeight > 0 && Math.abs(totalWeight - 100) > 0.01) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `Tổng tỷ lệ phần trăm phải bằng 100%. Hiện tại: ${totalWeight}%`
            });
        }

        // Kiểm tra cột điểm tồn tại
        const gradeColumn = await CourseGradeColumn.findOne({
            where: { column_id: columnId, course_id: courseId }
        });

        if (!gradeColumn) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Cột điểm không tồn tại'
            });
        }

        // Validate từng quiz
        const validationResults = [];
        for (const assignment of quiz_assignments) {
            const validation = await CourseGradeColumnQuiz.validateQuizAssignment(columnId, assignment.quiz_id);
            if (!validation.isValid) {
                validationResults.push({ quiz_id: assignment.quiz_id, error: validation.message });
            }
        }

        if (validationResults.length > 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Một số quiz không hợp lệ',
                errors: validationResults
            });
        }

        if (mode !== 'merge') {
            // Mặc định: replace toàn bộ
            await CourseGradeColumnQuiz.destroy({
                where: { column_id: columnId },
                transaction
            });
        } else {
            // merge: chỉ thêm hoặc update weight; giữ nguyên quiz khác
            for (const assignment of quiz_assignments) {
                const existing = await CourseGradeColumnQuiz.findOne({ where: { column_id: columnId, quiz_id: assignment.quiz_id } });
                if (existing) {
                    if (assignment.weight_percentage) {
                        await existing.update({ weight_percentage: assignment.weight_percentage }, { transaction });
                    }
                }
            }
            // Sau đó filter ra những quiz mới chưa có
            quiz_assignments = quiz_assignments.filter(a => !a.weight_percentage || !(a.quiz_id && a.weight_percentage && a._processed));
        }

        // Tạo các assignment mới với weight_percentage
        const assignments = quiz_assignments.map(assignment => ({
            column_id: columnId,
            quiz_id: assignment.quiz_id,
            weight_percentage: assignment.weight_percentage || null,
            assigned_by: assignedBy
        }));

        if (assignments.length > 0) {
            await CourseGradeColumnQuiz.bulkCreate(assignments, { transaction });
        }

        await transaction.commit();

        res.status(200).json({
            success: true,
            message: 'Gán quiz vào cột điểm thành công',
            data: {
                column_id: columnId,
                assigned_quizzes: quiz_assignments.length,
                assignments: assignments.map(a => ({
                    quiz_id: a.quiz_id,
                    weight_percentage: a.weight_percentage
                }))
            }
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error assigning quizzes to column:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi gán quiz vào cột điểm',
            error: error.message
        });
    }
};

// Bỏ gán quiz khỏi cột điểm
exports.unassignQuizzesFromColumn = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const { id: courseId, columnId } = req.params;
        const { quiz_ids } = req.body;

        // Validation
        if (!quiz_ids || !Array.isArray(quiz_ids) || quiz_ids.length === 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Danh sách quiz ID là bắt buộc và phải là mảng'
            });
        }

        // Kiểm tra cột điểm tồn tại và thuộc về course
        const gradeColumn = await CourseGradeColumn.findOne({
            where: {
                column_id: columnId,
                course_id: courseId
            }
        });

        if (!gradeColumn) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Cột điểm không tồn tại hoặc không thuộc về khóa học này'
            });
        }

        // Xóa các assignment cụ thể
        const deletedCount = await CourseGradeColumnQuiz.destroy({
            where: {
                column_id: columnId,
                quiz_id: quiz_ids
            },
            transaction
        });

        await transaction.commit();

        res.status(200).json({
            success: true,
            message: 'Bỏ gán quiz khỏi cột điểm thành công',
            data: {
                column_id: columnId,
                unassigned_quizzes: deletedCount,
                quiz_ids: quiz_ids
            }
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error unassigning quizzes from column:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi bỏ gán quiz khỏi cột điểm',
            error: error.message
        });
    }
};

// Bỏ gán tất cả quiz khỏi cột điểm
exports.unassignAllQuizzesFromColumn = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const { id: courseId, columnId } = req.params;

        // Kiểm tra cột điểm tồn tại và thuộc về course
        const gradeColumn = await CourseGradeColumn.findOne({
            where: {
                column_id: columnId,
                course_id: courseId
            }
        });

        if (!gradeColumn) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Cột điểm không tồn tại hoặc không thuộc về khóa học này'
            });
        }

        // Lấy danh sách quiz hiện tại để trả về
        const currentAssignments = await CourseGradeColumnQuiz.findAll({
            where: { column_id: columnId },
            attributes: ['quiz_id']
        });

        // Xóa tất cả assignment của cột này
        const deletedCount = await CourseGradeColumnQuiz.destroy({
            where: { column_id: columnId },
            transaction
        });

        await transaction.commit();

        res.status(200).json({
            success: true,
            message: 'Bỏ gán tất cả quiz khỏi cột điểm thành công',
            data: {
                column_id: columnId,
                unassigned_quizzes: deletedCount,
                quiz_ids: currentAssignments.map(a => a.quiz_id)
            }
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error unassigning all quizzes from column:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi bỏ gán tất cả quiz khỏi cột điểm',
            error: error.message
        });
    }
};

// Convenience: assign quizzes by subject for a course
exports.assignQuizzesBySubject = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { id: courseId } = req.params;
        const { course_id, quiz_ids = [], mode = 'replace', allow_partial = false, quiz_assignments } = req.body;
        const assignedBy = req.user?.user_id;

        if (!course_id) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: 'course_id là bắt buộc' });
        }

        // Kiểm tra course tồn tại
        const course = await Course.findByPk(course_id);
        if (!course) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: 'Khóa học không tồn tại' });
        }

        // Lấy tất cả quiz thuộc course
        const quizzes = await Quiz.findAll({ where: { course_id }, attributes: ['quiz_id'] });
        const quizSet = new Set(quizzes.map(q => q.quiz_id));

        // Build assignments list: support quiz_ids (legacy) or quiz_assignments (weighted)
        let assignments = [];
        if (Array.isArray(quiz_assignments) && quiz_assignments.length > 0) {
            assignments = quiz_assignments.map(a => ({ quiz_id: a.quiz_id, weight_percentage: a.weight_percentage }));
        } else if (Array.isArray(quiz_ids) && quiz_ids.length > 0) {
            assignments = quiz_ids.map(id => ({ quiz_id: id }));
        } else {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: 'quiz_ids hoặc quiz_assignments là bắt buộc' });
        }

        // Validate against course quizzes
        const invalid = [];
        const validAssignments = [];
        for (const a of assignments) {
            if (!quizSet.has(a.quiz_id)) {
                invalid.push({ quiz_id: a.quiz_id, error: 'Quiz không thuộc khóa học được chỉ định hoặc không tồn tại' });
            } else {
                validAssignments.push(a);
            }
        }

        if (invalid.length > 0 && !allow_partial) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: 'Một số quiz không hợp lệ', errors: invalid });
        }

        // Delegate to existing assign logic by reusing assignQuizzesToColumn code path: call internal function style
        // For simplicity, directly perform similar operations as assignQuizzesToColumn but only on validAssignments

        // Expect columnId passed as query param? For this endpoint we require column_id in body
        const { column_id } = req.body;
        if (!column_id) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: 'column_id là bắt buộc trong body' });
        }

        // Reuse validation and insert logic (simplified)
        // Validate grade column
        const gradeColumn = await CourseGradeColumn.findOne({ where: { column_id, course_id: courseId } });
        if (!gradeColumn) {
            await transaction.rollback();
            return res.status(404).json({ success: false, message: 'Cột điểm không tồn tại' });
        }

        // If mode != merge, remove existing assignments
        if (mode !== 'merge') {
            await CourseGradeColumnQuiz.destroy({ where: { column_id }, transaction });
        }

        const toCreate = validAssignments.map(a => ({ column_id, quiz_id: a.quiz_id, weight_percentage: a.weight_percentage || null, assigned_by: assignedBy }));
        if (toCreate.length > 0) await CourseGradeColumnQuiz.bulkCreate(toCreate, { transaction });

        await transaction.commit();

        res.status(200).json({ success: true, message: 'Gán quiz theo subject thành công', data: { assigned: toCreate.map(t => ({ quiz_id: t.quiz_id, weight_percentage: t.weight_percentage })), skipped: invalid } });
    } catch (error) {
        await transaction.rollback();
        console.error('Error assignQuizzesBySubject:', error);
        res.status(500).json({ success: false, message: 'Lỗi khi gán quiz theo subject', error: error.message });
    }
};

// Lấy danh sách quiz có thể gán vào cột điểm
exports.getAvailableQuizzes = async (req, res) => {
    try {
        const { id: courseId } = req.params;

        // Lấy tất cả quiz thuộc khóa học trực tiếp
        const quizzes = await Quiz.findAll({
            where: { course_id: courseId },
            include: [{
                model: Course,
                as: 'Course',
                attributes: ['course_id', 'name'],
                include: [{
                    model: Subject,
                    as: 'Subject',
                    attributes: ['subject_id', 'name']
                }]
            }],
            attributes: ['quiz_id', 'name', 'status', 'start_time', 'end_time']
        });

        // Lấy danh sách quiz đã được gán
        const assignedQuizzes = await CourseGradeColumnQuiz.findAll({
            include: [{
                model: CourseGradeColumn,
                as: 'GradeColumn',
                where: { course_id: courseId }
            }],
            attributes: ['quiz_id', 'column_id']
        });

        const assignedQuizIds = assignedQuizzes.map(aq => aq.quiz_id);

        // Phân loại quiz
        const availableQuizzes = quizzes.filter(quiz => !assignedQuizIds.includes(quiz.quiz_id));
        const assignedQuizzesWithColumn = quizzes.filter(quiz => assignedQuizIds.includes(quiz.quiz_id))
            .map(quiz => {
                const assignment = assignedQuizzes.find(aq => aq.quiz_id === quiz.quiz_id);
                return {
                    ...quiz.toJSON(),
                    assigned_to_column: assignment.column_id
                };
            });

        res.status(200).json({
            success: true,
            data: {
                available_quizzes: availableQuizzes,
                assigned_quizzes: assignedQuizzesWithColumn,
                total_quizzes: quizzes.length
            }
        });
    } catch (error) {
        console.error('Error getting available quizzes:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách quiz',
            error: error.message
        });
    }
};

// Tính toán và lưu điểm cho sinh viên
exports.calculateStudentGrade = async (req, res) => {
    try {
        const { id: courseId } = req.params;
        const { user_id, final_exam_score } = req.body;

        // Validation
        if (!user_id) {
            return res.status(400).json({
                success: false,
                message: 'ID sinh viên là bắt buộc'
            });
        }

        if (final_exam_score !== null && final_exam_score !== undefined) {
            if (final_exam_score < 0 || final_exam_score > 10) {
                return res.status(400).json({
                    success: false,
                    message: 'Điểm thi kết thúc phải từ 0 đến 10'
                });
            }
        }

        // Kiểm tra khóa học tồn tại
        const course = await Course.findByPk(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Khóa học không tồn tại'
            });
        }

        // Kiểm tra sinh viên tồn tại
        const student = await User.findByPk(user_id);
        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Sinh viên không tồn tại'
            });
        }

        // Tính toán và lưu điểm
        const result = await CourseGradeService.saveOrUpdateGradeResult(
            courseId,
            user_id,
            final_exam_score
        );

        res.status(200).json({
            success: true,
            message: 'Tính toán điểm thành công',
            data: {
                student: {
                    user_id: student.user_id,
                    name: student.name,
                    email: student.email
                },
                grade_result: result
            }
        });
    } catch (error) {
        console.error('Error calculating student grade:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tính toán điểm',
            error: error.message
        });
    }
};

// Cập nhật điểm thi kết thúc môn
exports.updateFinalExamScore = async (req, res) => {
    try {
        const { id: courseId } = req.params;
        const { user_id, final_exam_score } = req.body;

        // Validation
        if (!user_id || final_exam_score === undefined || final_exam_score === null) {
            return res.status(400).json({
                success: false,
                message: 'ID sinh viên và điểm thi kết thúc là bắt buộc'
            });
        }

        // Cập nhật điểm
        const result = await CourseGradeService.updateFinalExamScore(
            courseId,
            user_id,
            final_exam_score
        );

        res.status(200).json({
            success: true,
            message: 'Cập nhật điểm thi kết thúc thành công',
            data: result
        });
    } catch (error) {
        console.error('Error updating final exam score:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật điểm thi kết thúc',
            error: error.message
        });
    }
};

// Tính toán lại điểm cho tất cả sinh viên
exports.recalculateAllGrades = async (req, res) => {
    try {
        const { id: courseId } = req.params;

        // Kiểm tra khóa học tồn tại
        const course = await Course.findByPk(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Khóa học không tồn tại'
            });
        }

        // Tính toán lại điểm cho tất cả sinh viên
        const results = await CourseGradeService.recalculateAllGrades(courseId);

        res.status(200).json({
            success: true,
            message: `Tính toán lại điểm thành công cho ${results.length} sinh viên`,
            data: {
                course_id: courseId,
                course_name: course.name,
                updated_students: results.length,
                results: results
            }
        });
    } catch (error) {
        console.error('Error recalculating all grades:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tính toán lại điểm',
            error: error.message
        });
    }
};

// Lấy danh sách kết quả điểm (endpoint mới đơn giản cho frontend)
exports.getCourseGradeResults = async (req, res) => {
    try {
        const { id: courseId } = req.params;
        const results = await CourseGradeResult.findAll({
            where: { course_id: courseId },
            include: [{ model: User, as: 'Student', attributes: ['user_id','name','email'] }]
        });
        res.status(200).json({ success: true, data: results });
    } catch (error) {
        console.error('Error getCourseGradeResults:', error);
        res.status(500).json({ success:false, message:'Lỗi lấy kết quả điểm', error: error.message });
    }
};

// Xuất kết quả học tập khóa học
exports.exportCourseResults = async (req, res) => {
    try {
        const { id: courseId } = req.params;
        const { format = 'json' } = req.query; // json hoặc excel

        // Kiểm tra khóa học tồn tại
        const course = await Course.findByPk(courseId, {
            include: [{
                model: CourseGradeColumn,
                as: 'GradeColumns',
                where: { is_active: true },
                required: false,
                order: [['column_order', 'ASC']]
            }]
        });

        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Khóa học không tồn tại'
            });
        }

        // Lấy danh sách sinh viên và kết quả điểm
        const results = await CourseGradeResult.findAll({
            where: { course_id: courseId },
            include: [{
                model: User,
                as: 'Student',
                attributes: ['user_id', 'name', 'email']
            }],
            order: [['Student', 'name', 'ASC']]
        });

        // FIX LỖI 1: Kiểm tra và thông báo nếu không có dữ liệu
        console.log(`[Export] Found ${results.length} grade results for course ${courseId}`);
        
        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy kết quả điểm cho khóa học này',
                hint: 'Vui lòng tính điểm cho sinh viên trước khi xuất kết quả. Sử dụng API POST /api/courses/:id/calculate-all-grades hoặc đảm bảo sinh viên đã hoàn thành quiz.',
                course_id: courseId,
                course_name: course.name
            });
        }

        // Log sample data for debugging
        if (results.length > 0) {
            console.log('[Export] Sample data:', {
                student: results[0].Student?.name,
                column_scores: results[0].column_scores,
                process_average: results[0].process_average,
                total_score: results[0].total_score
            });
        }

        // Chuẩn bị dữ liệu xuất
        const exportData = results.map(result => {
            const student = result.Student;
            const studentCode = student.email.split('@')[0]; // Lấy mã SV từ email

            // Tạo object kết quả
            const row = {
                student_code: studentCode,
                student_name: student.name,
                email: student.email
            };

            // Thêm điểm từng cột quá trình
            if (course.GradeColumns && course.GradeColumns.length > 0) {
                course.GradeColumns.forEach(column => {
                    const columnScore = result.column_scores[column.column_id];
                    row[`column_${column.column_id}`] = columnScore ? columnScore.average_score : null;
                });
            }

            // Thêm điểm tổng hợp
            row.process_average = result.process_average;
            row.final_exam_score = result.final_exam_score;
            row.total_score = result.total_score;
            row.grade = result.grade;

            return row;
        });

        // Chuẩn bị response data theo format chuẩn
        const responseData = {
            course_info: {
                course_id: parseInt(courseId),
                course_name: course.name,
                export_date: new Date().toISOString(),
                total_students: exportData.length
            },
            grade_columns: course.GradeColumns ? course.GradeColumns.map(col => ({
                column_id: col.column_id,
                column_name: col.column_name,
                weight_percentage: parseFloat(col.weight_percentage),
                column_order: col.column_order
            })) : [],
            student_results: exportData
        };

        if (format === 'excel') {
            // Xuất Excel
            return await this.exportToExcel(res, responseData);
        } else {
            // JSON: Bổ sung cấu trúc metadata + data (frontend guide) nhưng vẫn giữ data gốc để backward compatible
            const metadata = {
                course_id: responseData.course_info.course_id,
                course_name: responseData.course_info.course_name,
                export_date: responseData.course_info.export_date,
                total_students: responseData.course_info.total_students,
                grade_columns: responseData.grade_columns
            };
            res.status(200).json({
                success: true,
                message: 'Xuất kết quả học tập thành công',
                // Cấu trúc mới
                metadata,
                data: responseData.student_results,
                // Giữ trường cũ (có thể loại bỏ sau khi frontend cập nhật)
                original: responseData
            });
        }
    } catch (error) {
        console.error('Error exporting course results:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xuất kết quả học tập',
            error: error.message
        });
    }
};

// Helper function để xuất Excel
exports.exportToExcel = async (res, responseData) => {
    try {
        // Tạo workbook
        const workbook = XLSX.utils.book_new();

        // Tạo header cho sheet chính
        const headers = [
            'Mã sinh viên',
            'Họ tên',
            'Email'
        ];

        // Thêm header cho các cột điểm quá trình
        responseData.grade_columns.forEach(col => {
            headers.push(`${col.column_name} (${col.weight_percentage}%)`);
        });

        // Thêm header cho điểm tổng hợp
        headers.push('Điểm TB quá trình', 'Điểm thi kết thúc', 'Điểm tổng kết', 'Xếp loại');

        // Chuẩn bị dữ liệu cho sheet
        const sheetData = [headers];

        responseData.student_results.forEach(row => {
            const rowData = [
                row.student_code,
                row.student_name,
                row.email
            ];

            // Thêm điểm các cột quá trình
            responseData.grade_columns.forEach(col => {
                rowData.push(row[`column_${col.column_id}`] || '');
            });

            // Thêm điểm tổng hợp
            rowData.push(
                row.process_average || '',
                row.final_exam_score || '',
                row.total_score || '',
                row.grade || ''
            );

            sheetData.push(rowData);
        });

        // Tạo worksheet
        const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

        // Thiết lập độ rộng cột
        const colWidths = [
            { wch: 15 }, // Mã sinh viên
            { wch: 25 }, // Họ tên
            { wch: 30 }, // Email
        ];

        // Thêm độ rộng cho các cột điểm
        responseData.grade_columns.forEach(() => {
            colWidths.push({ wch: 15 });
        });

        // Thêm độ rộng cho điểm tổng hợp
        colWidths.push({ wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 12 });

        worksheet['!cols'] = colWidths;

        // Thêm worksheet vào workbook
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Kết quả học tập');

        // Tạo sheet thông tin khóa học
        const infoData = [
            ['Thông tin khóa học'],
            ['Tên khóa học:', responseData.course_info.course_name],
            ['Mã khóa học:', responseData.course_info.course_id],
            ['Ngày xuất:', new Date().toLocaleDateString('vi-VN')],
            ['Tổng số sinh viên:', responseData.course_info.total_students],
            [''],
            ['Cấu trúc điểm quá trình:']
        ];

        responseData.grade_columns.forEach(col => {
            infoData.push([`- ${col.column_name}:`, `${col.weight_percentage}%`]);
        });

        const infoWorksheet = XLSX.utils.aoa_to_sheet(infoData);
        infoWorksheet['!cols'] = [{ wch: 20 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(workbook, infoWorksheet, 'Thông tin');

        // Tạo buffer
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Thiết lập response headers
        const fileName = `ket_qua_hoc_tap_${responseData.course_info.course_id}_${Date.now()}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Length', buffer.length);

        // Gửi file
        res.send(buffer);
    } catch (error) {
        console.error('Error creating Excel file:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo file Excel',
            error: error.message
        });
    }
};

// Tính toán điểm cho tất cả sinh viên trong khóa học
exports.calculateAllStudentGrades = async (req, res) => {
    try {
        const { id: courseId } = req.params;

        // Kiểm tra khóa học tồn tại
        const course = await Course.findByPk(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Khóa học không tồn tại'
            });
        }

        // Lấy danh sách sinh viên đã đăng ký khóa học
        const students = await User.findAll({
            include: [{
                model: Course,
                where: { course_id: courseId },
                through: { attributes: [] }
            }],
            where: {
                role_id: await User.findOne({
                    include: [{
                        model: sequelize.models.Role,
                        where: { name: 'student' }
                    }]
                }).then(user => user?.role_id)
            },
            attributes: ['user_id', 'name', 'email']
        });

        if (students.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Khóa học chưa có sinh viên nào đăng ký'
            });
        }

        // Tính toán điểm cho từng sinh viên
        const results = [];
        const errors = [];

        for (const student of students) {
            try {
                const gradeResult = await CourseGradeService.saveOrUpdateGradeResult(
                    courseId,
                    student.user_id,
                    null // final_exam_score sẽ được tính sau
                );

                results.push({
                    student: {
                        user_id: student.user_id,
                        name: student.name,
                        email: student.email
                    },
                    grade_result: gradeResult
                });
            } catch (error) {
                errors.push({
                    student: {
                        user_id: student.user_id,
                        name: student.name,
                        email: student.email
                    },
                    error: error.message
                });
            }
        }

        res.status(200).json({
            success: true,
            message: `Tính toán điểm thành công cho ${results.length}/${students.length} sinh viên`,
            data: {
                course_id: parseInt(courseId),
                course_name: course.name,
                total_students: students.length,
                successful_calculations: results.length,
                failed_calculations: errors.length,
                results: results,
                errors: errors
            }
        });
    } catch (error) {
        console.error('Error calculating all student grades:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tính toán điểm cho tất cả sinh viên',
            error: error.message
        });
    }
};

// DEBUG API: Kiểm tra mối quan hệ Quiz-Subject-Course
exports.debugQuizCourseRelationship = async (req, res) => {
    try {
        const { id: courseId } = req.params;
        const { quiz_ids } = req.query; // ?quiz_ids=122,123

        // Lấy thông tin course
        const course = await Course.findByPk(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course không tồn tại'
            });
        }

        // Lấy thông tin subject của course
        const courseWithSubject = await Course.findByPk(courseId, {
            include: [{
                model: Subject,
                as: 'Subject',
                attributes: ['subject_id', 'name']
            }]
        });

        // Lấy tất cả quiz của course trực tiếp
        const courseQuizzes = await Quiz.findAll({
            where: { course_id: courseId },
            include: [{
                model: Course,
                as: 'Course',
                attributes: ['course_id', 'name'],
                include: [{
                    model: Subject,
                    as: 'Subject',
                    attributes: ['subject_id', 'name']
                }]
            }],
            attributes: ['quiz_id', 'name', 'course_id', 'status']
        });

        // Nếu có quiz_ids cụ thể, kiểm tra chúng
        let specificQuizzes = [];
        if (quiz_ids) {
            const quizIdArray = quiz_ids.split(',').map(id => parseInt(id));
            specificQuizzes = await Quiz.findAll({
                where: { quiz_id: quizIdArray },
                include: [{
                    model: Course,
                    as: 'Course',
                    attributes: ['course_id', 'name'],
                    include: [{
                        model: Subject,
                        as: 'Subject',
                        attributes: ['subject_id', 'name']
                    }]
                }],
                attributes: ['quiz_id', 'name', 'course_id']
            });
        }

        // Phân tích kết quả
        const analysis = {
            course: {
                course_id: course.course_id,
                name: course.name
            },
            subject: courseWithSubject?.Subject || null,
            course_quizzes: courseQuizzes,
            specific_quizzes: specificQuizzes.map(quiz => ({
                quiz_id: quiz.quiz_id,
                name: quiz.name,
                course_id: quiz.course_id,
                belongs_to_course: quiz.course_id === parseInt(courseId),
                issue: quiz.course_id !== parseInt(courseId) ?
                    `Quiz thuộc course ${quiz.course_id}, không phải course ${courseId}` : null
            })),
            summary: {
                subject_name: courseWithSubject?.Subject?.name || 'Không có môn học',
                total_course_quizzes: courseQuizzes.length,
                checked_quizzes: specificQuizzes.length,
                valid_quizzes: specificQuizzes.filter(q => q.course_id === parseInt(courseId)).length,
                invalid_quizzes: specificQuizzes.filter(q => q.course_id !== parseInt(courseId)).length
            }
        };

        res.status(200).json({
            success: true,
            message: 'Debug thông tin mối quan hệ Quiz-Subject-Course',
            data: analysis
        });

    } catch (error) {
        console.error('Error debugging quiz-course relationship:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi debug mối quan hệ',
            error: error.message
        });
    }
};

// Tạo khóa học với cột điểm trong một API
exports.createCourseWithGradeColumns = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const {
            // Thông tin khóa học (user_id bỏ qua – lấy từ token để bảo đảm ownership)
            user_id: body_user_id,
            name,
            description,
            start_date,
            end_date,
            program_id,
            grade_config,
            // Danh sách cột điểm
            grade_columns
        } = req.body;

        const authUserId = req.user?.user_id;
        if (!authUserId) {
            await transaction.rollback();
            return res.status(401).json({ success: false, message: 'Không xác thực được user từ token' });
        }

        if (body_user_id && parseInt(body_user_id) !== parseInt(authUserId)) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: 'user_id trong body không khớp với token. Không được phép tạo khóa học thay người khác.' });
        }

        // Validation cơ bản
    if (!name || !program_id) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
        message: 'name và program_id là bắt buộc (user_id lấy từ token)'
            });
        }

        if (!grade_columns || !Array.isArray(grade_columns) || grade_columns.length === 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'grade_columns là bắt buộc và phải là mảng không rỗng'
            });
        }

        // Validation tỷ lệ phần trăm
        const totalWeight = grade_columns.reduce((sum, col) => sum + parseFloat(col.weight_percentage || 0), 0);
        if (Math.abs(totalWeight - 100) > 0.01) { // Cho phép sai số nhỏ do floating point
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `Tổng tỷ lệ phần trăm phải bằng 100%. Hiện tại: ${totalWeight}%`
            });
        }

        // Validation từng cột điểm
        for (let i = 0; i < grade_columns.length; i++) {
            const column = grade_columns[i];
            if (!column.column_name || !column.weight_percentage) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: `Cột điểm thứ ${i + 1}: column_name và weight_percentage là bắt buộc`
                });
            }

            if (column.weight_percentage <= 0 || column.weight_percentage > 100) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: `Cột điểm thứ ${i + 1}: weight_percentage phải từ 0.01 đến 100`
                });
            }
        }

        // Kiểm tra user và program tồn tại
    const user = await User.findByPk(authUserId);
        if (!user) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Người dùng không tồn tại'
            });
        }

        const program = await sequelize.models.Program.findByPk(program_id);
        if (!program) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Chương trình đào tạo không tồn tại'
            });
        }

        // Tạo khóa học
        const courseData = {
            user_id: authUserId,
            name,
            description,
            start_date,
            end_date,
            program_id,
            grade_config: grade_config || { final_exam_weight: 50, process_weight: 50 }
        };

        const newCourse = await Course.create(courseData, { transaction });

        // Tạo các cột điểm
        const createdColumns = [];
        for (let i = 0; i < grade_columns.length; i++) {
            const column = grade_columns[i];
            const columnData = {
                course_id: newCourse.course_id,
                column_name: column.column_name,
                weight_percentage: column.weight_percentage,
                column_order: i + 1, // Thứ tự theo index
                description: column.description || null,
                is_active: true
            };

            const createdColumn = await CourseGradeColumn.create(columnData, { transaction });
            createdColumns.push(createdColumn);
        }

        await transaction.commit();

        // Trả về kết quả
        res.status(201).json({
            success: true,
            message: 'Tạo khóa học và cột điểm thành công',
            data: {
                course: newCourse,
                grade_columns: createdColumns,
                summary: {
                    course_id: newCourse.course_id,
                    course_name: newCourse.name,
                    total_columns: createdColumns.length,
                    total_weight: totalWeight,
                    grade_config: newCourse.grade_config
                }
            }
        });

    } catch (error) {
        await transaction.rollback();
        console.error('Error creating course with grade columns:', error);

        // Handle specific error types
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({
                success: false,
                message: 'Khóa học với thông tin này đã tồn tại. Vui lòng thử lại hoặc liên hệ admin để fix database sequence.',
                error_type: 'UNIQUE_CONSTRAINT_VIOLATION',
                details: error.errors?.map(e => e.message) || []
            });
        }

        if (error.name === 'SequelizeValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Dữ liệu không hợp lệ',
                error_type: 'VALIDATION_ERROR',
                details: error.errors?.map(e => e.message) || []
            });
        }

        if (error.name === 'SequelizeForeignKeyConstraintError') {
            return res.status(400).json({
                success: false,
                message: 'Tham chiếu dữ liệu không hợp lệ (user_id hoặc program_id không tồn tại)',
                error_type: 'FOREIGN_KEY_VIOLATION'
            });
        }

        // Generic error
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi tạo khóa học và cột điểm',
            error_type: 'INTERNAL_SERVER_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};
