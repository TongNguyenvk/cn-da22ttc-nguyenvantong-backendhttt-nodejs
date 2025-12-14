const { TeacherSubjectAssignment, User, Subject, Semester, Role, Course, TrainingBatch } = require('../models');
const { Op } = require('sequelize');

// Phân công giáo viên dạy môn học (Admin only)
exports.assignTeacher = async (req, res) => {
    try {
        const { teacher_id, subject_id, semester_id, batch_id, note, workload_hours } = req.body;
        const assignedByUserId = req.user.user_id;

        // Validate required fields
        if (!teacher_id || !subject_id || !semester_id || !batch_id) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu thông tin bắt buộc: teacher_id, subject_id, semester_id, batch_id'
            });
        }

        // Check if teacher exists and is a teacher
        const teacher = await User.findByPk(teacher_id, { include: [{ model: Role }] });
        if (!teacher) {
            return res.status(400).json({
                success: false,
                message: 'Giáo viên không tồn tại'
            });
        }
        if (teacher.Role?.name !== 'teacher') {
            return res.status(400).json({
                success: false,
                message: 'Người dùng này không phải là giáo viên'
            });
        }

        // Check if subject exists
        const subject = await Subject.findByPk(subject_id);
        if (!subject) {
            return res.status(400).json({
                success: false,
                message: 'Môn học không tồn tại'
            });
        }

        // Check if semester exists
        const semester = await Semester.findByPk(semester_id);
        if (!semester) {
            return res.status(400).json({
                success: false,
                message: 'Học kỳ không tồn tại'
            });
        }

        // Check if batch exists
        const batch = await TrainingBatch.findByPk(batch_id);
        if (!batch) {
            return res.status(400).json({
                success: false,
                message: 'Khóa đào tạo không tồn tại'
            });
        }

        // Check if assignment already exists
        const existingAssignment = await TeacherSubjectAssignment.findOne({
            where: {
                teacher_id,
                subject_id,
                semester_id
            }
        });
        if (existingAssignment) {
            return res.status(400).json({
                success: false,
                message: 'Giáo viên đã được phân công dạy môn này trong học kỳ này'
            });
        }

        const assignment = await TeacherSubjectAssignment.create({
            teacher_id,
            subject_id,
            semester_id,
            batch_id,
            assigned_by: assignedByUserId,
            note,
            workload_hours
        });

        res.status(201).json({
            success: true,
            message: 'Phân công giáo viên thành công',
            data: assignment
        });
    } catch (error) {
        if (error.message.includes('không phải là giáo viên') || 
            error.message.includes('không tồn tại') ||
            error.message.includes('đã được phân công')) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi khi phân công giáo viên',
            error: error.message
        });
    }
};

// Lấy danh sách phân công theo học kỳ (Admin)
exports.getAssignmentsBySemester = async (req, res) => {
    try {
        const { semester_id } = req.params;
        const { page = 1, limit = 20, is_active = true } = req.query;
        const offset = (page - 1) * limit;

        const where = { semester_id };
        if (is_active !== undefined) {
            where.is_active = is_active === 'true';
        }

        const assignments = await TeacherSubjectAssignment.findAndCountAll({
            where,
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                {
                    model: User,
                    as: 'Teacher',
                    attributes: ['user_id', 'name', 'email'],
                    include: [{
                        model: Role,
                        attributes: ['name']
                    }]
                },
                {
                    model: Subject,
                    as: 'Subject',
                    attributes: ['subject_id', 'name', 'description']
                },
                {
                    model: Semester,
                    as: 'Semester',
                    attributes: ['semester_id', 'name', 'academic_year']
                },
                {
                    model: User,
                    as: 'AssignedBy',
                    attributes: ['user_id', 'name']
                },
                {
                    model: Course,
                    as: 'Courses',
                    attributes: ['course_id', 'name'],
                    required: false
                }
            ],
            order: [['assigned_at', 'DESC']]
        });

        res.status(200).json({
            success: true,
            data: {
                totalItems: assignments.count,
                totalPages: Math.ceil(assignments.count / limit),
                currentPage: parseInt(page),
                assignments: assignments.rows.map(assignment => ({
                    ...assignment.toJSON(),
                    display_info: assignment.getDisplayInfo(),
                    can_create_course: assignment.canCreateCourse(),
                    course_count: assignment.Courses?.length || 0
                }))
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách phân công',
            error: error.message
        });
    }
};

// Lấy danh sách môn học được phân công cho giáo viên (Teacher)
exports.getMyAssignments = async (req, res) => {
    try {
        const teacherId = req.user.user_id;
        const { semester_id, is_active = true } = req.query;

        const assignments = await TeacherSubjectAssignment.getTeacherAssignments(
            teacherId,
            semester_id
        );

        // Filter by is_active if specified
        const filteredAssignments = is_active === 'true' 
            ? assignments.filter(a => a.is_active)
            : assignments;

        const mapped = filteredAssignments.map(assignment => {
            const json = assignment.toJSON();
            let programId = null;
            let programName = null;
            const programs = json.Subject?.Programs || [];
            if (programs.length === 1) {
                programId = programs[0].program_id;
                programName = programs[0].name;
            } else if (programs.length > 1) {
                // Strategy: pick smallest program_id deterministically
                const sorted = [...programs].sort((a, b) => a.program_id - b.program_id);
                programId = sorted[0].program_id;
                programName = sorted[0].name;
            }
            return {
                ...json,
                program_id: programId,
                program_name: programName,
                display_info: assignment.getDisplayInfo(),
                can_create_course: assignment.canCreateCourse()
            };
        });

        res.status(200).json({
            success: true,
            data: {
                teacher_id: teacherId,
                assignments: mapped
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách phân công của tôi',
            error: error.message
        });
    }
};

// Lấy phân công theo ID
exports.getAssignmentById = async (req, res) => {
    try {
        const { id } = req.params;

        const assignment = await TeacherSubjectAssignment.findByPk(id, {
            include: [
                {
                    model: User,
                    as: 'Teacher',
                    attributes: ['user_id', 'name', 'email']
                },
                {
                    model: Subject,
                    as: 'Subject',
                    attributes: ['subject_id', 'name', 'description'],
                    include: [{
                        model: require('../models').Program,
                        as: 'Programs',
                        attributes: ['program_id', 'name'],
                        through: { attributes: [] },
                        required: false
                    }]
                },
                {
                    model: Semester,
                    as: 'Semester',
                    attributes: ['semester_id', 'name', 'academic_year', 'start_date', 'end_date']
                },
                {
                    model: User,
                    as: 'AssignedBy',
                    attributes: ['user_id', 'name']
                },
                {
                    model: Course,
                    as: 'Courses',
                    include: [
                        { model: User, as: 'Teacher', attributes: ['user_id', 'name'] }
                    ]
                }
            ]
        });

        if (!assignment) {
            return res.status(404).json({
                success: false,
                message: 'Phân công không tồn tại'
            });
        }

        // Check permission: admin can see all, teacher can only see their own
        if (req.roleName === 'teacher' && assignment.teacher_id !== req.user.user_id) {
            return res.status(403).json({
                success: false,
                message: 'Bạn không có quyền xem phân công này'
            });
        }

        const json = assignment.toJSON();
        const programs = json.Subject?.Programs || [];
        let programId = null;
        if (programs.length === 1) {
            programId = programs[0].program_id;
        } else if (programs.length > 1) {
            programId = [...programs].sort((a, b) => a.program_id - b.program_id)[0].program_id;
        }
        res.status(200).json({
            success: true,
            data: {
                ...json,
                program_id: programId,
                display_info: assignment.getDisplayInfo(),
                can_create_course: assignment.canCreateCourse()
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin phân công',
            error: error.message
        });
    }
};

// Cập nhật phân công (Admin only)
exports.updateAssignment = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const assignment = await TeacherSubjectAssignment.findByPk(id);
        if (!assignment) {
            return res.status(404).json({
                success: false,
                message: 'Phân công không tồn tại'
            });
        }

        // Không cho phép thay đổi core fields nếu đã có course
        const hasCourses = await Course.count({
            where: { assignment_id: id }
        });

        if (hasCourses > 0 && (updateData.teacher_id || updateData.subject_id || updateData.semester_id)) {
            return res.status(400).json({
                success: false,
                message: 'Không thể thay đổi thông tin cơ bản của phân công đã có khóa học'
            });
        }

        // Validate if changing core fields
        if (updateData.teacher_id || updateData.subject_id || updateData.semester_id) {
            const newTeacherId = updateData.teacher_id || assignment.teacher_id;
            const newSubjectId = updateData.subject_id || assignment.subject_id;
            const newSemesterId = updateData.semester_id || assignment.semester_id;

            await TeacherSubjectAssignment.validateAssignment(newTeacherId, newSubjectId, newSemesterId);
        }

        await assignment.update(updateData);

        const updatedAssignment = await TeacherSubjectAssignment.findByPk(id, {
            include: [
                { model: User, as: 'Teacher', attributes: ['user_id', 'name'] },
                { model: Subject, as: 'Subject', attributes: ['subject_id', 'name'] },
                { model: Semester, as: 'Semester', attributes: ['semester_id', 'name'] }
            ]
        });

        res.status(200).json({
            success: true,
            message: 'Cập nhật phân công thành công',
            data: updatedAssignment
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật phân công',
            error: error.message
        });
    }
};

// Hủy phân công (Admin only)
exports.deactivateAssignment = async (req, res) => {
    try {
        const { id } = req.params;

        const assignment = await TeacherSubjectAssignment.findByPk(id);
        if (!assignment) {
            return res.status(404).json({
                success: false,
                message: 'Phân công không tồn tại'
            });
        }

        // Kiểm tra xem có course nào đang hoạt động không
        const activeCourses = await Course.count({
            where: { assignment_id: id }
        });

        if (activeCourses > 0) {
            return res.status(400).json({
                success: false,
                message: `Không thể hủy phân công vì còn ${activeCourses} khóa học đang hoạt động`
            });
        }

        await assignment.deactivate();

        res.status(200).json({
            success: true,
            message: 'Hủy phân công thành công'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi hủy phân công',
            error: error.message
        });
    }
};

// Xóa phân công (Admin only)
exports.deleteAssignment = async (req, res) => {
    try {
        const { id } = req.params;

        const assignment = await TeacherSubjectAssignment.findByPk(id);
        if (!assignment) {
            return res.status(404).json({
                success: false,
                message: 'Phân công không tồn tại'
            });
        }

        // Kiểm tra xem có course nào không
        const courseCount = await Course.count({
            where: { assignment_id: id }
        });

        if (courseCount > 0) {
            return res.status(400).json({
                success: false,
                message: 'Không thể xóa phân công đã có khóa học'
            });
        }

        await assignment.destroy();

        res.status(200).json({
            success: true,
            message: 'Xóa phân công thành công'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa phân công',
            error: error.message
        });
    }
};

// Lấy danh sách giáo viên có thể phân công (Admin)
exports.getAvailableTeachers = async (req, res) => {
    try {
        const { semester_id, subject_id } = req.query;

        let excludeTeacherIds = [];

        // Nếu có semester_id và subject_id, loại trừ giáo viên đã được phân công
        if (semester_id && subject_id) {
            const existingAssignments = await TeacherSubjectAssignment.findAll({
                where: {
                    semester_id,
                    subject_id,
                    is_active: true
                },
                attributes: ['teacher_id']
            });
            excludeTeacherIds = existingAssignments.map(a => a.teacher_id);
        }

        const teachers = await User.findAll({
            where: {
                user_id: {
                    [Op.notIn]: excludeTeacherIds
                }
            },
            include: [{
                model: Role,
                where: { name: 'teacher' },
                attributes: ['name']
            }],
            attributes: ['user_id', 'name', 'email'],
            order: [['name', 'ASC']]
        });

        res.status(200).json({
            success: true,
            data: {
                teachers: teachers.map(teacher => ({
                    user_id: teacher.user_id,
                    name: teacher.name,
                    email: teacher.email
                }))
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách giáo viên',
            error: error.message
        });
    }
};

// Lấy danh sách môn học có thể phân công (Admin)
exports.getAvailableSubjects = async (req, res) => {
    try {
        const { semester_id, teacher_id } = req.query;

        let excludeSubjectIds = [];

        // Nếu có semester_id và teacher_id, loại trừ môn học đã được phân công
        if (semester_id && teacher_id) {
            const existingAssignments = await TeacherSubjectAssignment.findAll({
                where: {
                    semester_id,
                    teacher_id,
                    is_active: true
                },
                attributes: ['subject_id']
            });
            excludeSubjectIds = existingAssignments.map(a => a.subject_id);
        }

        const subjects = await Subject.findAll({
            where: {
                subject_id: {
                    [Op.notIn]: excludeSubjectIds
                }
            },
            attributes: ['subject_id', 'name', 'description'],
            order: [['name', 'ASC']]
        });

        res.status(200).json({
            success: true,
            data: {
                subjects: subjects
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách môn học',
            error: error.message
        });
    }
};

// Thống kê phân công
exports.getAssignmentStatistics = async (req, res) => {
    try {
        const { semester_id } = req.params;

        // Tổng số phân công
        const totalAssignments = await TeacherSubjectAssignment.count({
            where: { semester_id, is_active: true }
        });

        // Số giáo viên được phân công
        const teacherCount = await TeacherSubjectAssignment.count({
            where: { semester_id, is_active: true },
            distinct: true,
            col: 'teacher_id'
        });

        // Số môn học được phân công
        const subjectCount = await TeacherSubjectAssignment.count({
            where: { semester_id, is_active: true },
            distinct: true,
            col: 'subject_id'
        });

        // Số khóa học được tạo từ phân công
        const courseCount = await Course.count({
            where: { semester_id }
        });

        // Top giáo viên có nhiều phân công nhất
        const topTeachers = await TeacherSubjectAssignment.findAll({
            where: { semester_id, is_active: true },
            include: [{
                model: User,
                as: 'Teacher',
                attributes: ['user_id', 'name']
            }],
            group: ['teacher_id', 'Teacher.user_id', 'Teacher.name'],
            attributes: [
                'teacher_id',
                [TeacherSubjectAssignment.sequelize.fn('COUNT', '*'), 'assignment_count']
            ],
            order: [[TeacherSubjectAssignment.sequelize.literal('assignment_count'), 'DESC']],
            limit: 5
        });

        res.status(200).json({
            success: true,
            data: {
                semester_id,
                statistics: {
                    total_assignments: totalAssignments,
                    teacher_count: teacherCount,
                    subject_count: subjectCount,
                    course_count: courseCount,
                    top_teachers: topTeachers
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thống kê phân công',
            error: error.message
        });
    }
};

// Bulk assign teachers to subjects for a semester (Admin only)
exports.bulkAssignTeachers = async (req, res) => {
    const t = await TeacherSubjectAssignment.sequelize.transaction();
    try {
        const { batch_id, semester_id, assignments } = req.body;
        const assignedByUserId = req.user.user_id;

        // Validate required fields
        if (!batch_id || !semester_id || !assignments || !Array.isArray(assignments)) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: 'Thiếu thông tin bắt buộc: batch_id, semester_id, assignments (array)'
            });
        }

        // Validate batch and semester exist
        const batch = await TrainingBatch.findByPk(batch_id, { transaction: t });
        if (!batch) {
            await t.rollback();
            return res.status(404).json({ success: false, message: 'Khóa đào tạo không tồn tại' });
        }

        const semester = await Semester.findOne({
            where: { semester_id, batch_id },
            transaction: t
        });
        if (!semester) {
            await t.rollback();
            return res.status(404).json({ success: false, message: 'Học kỳ không tồn tại hoặc không thuộc khóa đào tạo này' });
        }

        const results = [];
        const errors = [];

        for (const assignment of assignments) {
            const { subject_id, teacher_id, note, workload_hours } = assignment;

            try {
                // Validate subject exists in program
                const programSubject = await require('../models').ProgramSubject.findOne({
                    where: { program_id: batch.program_id, subject_id },
                    transaction: t
                });
                if (!programSubject) {
                    errors.push({ subject_id, error: 'Môn học không thuộc chương trình đào tạo này' });
                    continue;
                }

                // Validate teacher exists and is a teacher
                const teacher = await User.findByPk(teacher_id, {
                    include: [{ model: Role }],
                    transaction: t
                });
                if (!teacher || teacher.Role?.name !== 'teacher') {
                    errors.push({ subject_id, teacher_id, error: 'Giáo viên không hợp lệ' });
                    continue;
                }

                // Check if assignment already exists
                const existing = await TeacherSubjectAssignment.findOne({
                    where: { teacher_id, subject_id, semester_id, batch_id },
                    transaction: t
                });

                if (existing) {
                    // Update existing assignment
                    await existing.update({
                        note,
                        workload_hours,
                        assigned_by: assignedByUserId,
                        is_active: true
                    }, { transaction: t });
                    results.push({ subject_id, teacher_id, action: 'updated', assignment_id: existing.assignment_id });
                } else {
                    // Create new assignment
                    const newAssignment = await TeacherSubjectAssignment.create({
                        teacher_id,
                        subject_id,
                        semester_id,
                        batch_id,
                        note,
                        workload_hours,
                        assigned_by: assignedByUserId,
                        is_active: true
                    }, { transaction: t });
                    results.push({ subject_id, teacher_id, action: 'created', assignment_id: newAssignment.assignment_id });
                }

            } catch (error) {
                errors.push({ subject_id, teacher_id, error: error.message });
            }
        }

        await t.commit();

        return res.status(200).json({
            success: true,
            message: `Đã xử lý ${assignments.length} phân công`,
            data: {
                successful: results,
                failed: errors
            }
        });

    } catch (error) {
        await t.rollback();
        return res.status(500).json({
            success: false,
            message: 'Lỗi khi thực hiện phân công hàng loạt',
            error: error.message
        });
    }
};
