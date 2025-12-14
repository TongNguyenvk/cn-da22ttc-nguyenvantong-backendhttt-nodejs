const { 
    Semester, 
    TeacherSubjectAssignment, 
    Course, 
    User, 
    Subject, 
    TrainingBatch,
    TypeSubject,
    TypeOfKnowledge,
    PLO,
    ProgramSubject,
    Program
} = require('../models');
const { Op } = require('sequelize');

// Lấy tất cả học kỳ
exports.getAllSemesters = async (req, res) => {
    try {
        const { page = 1, limit = 10, academic_year, is_active } = req.query;
        const offset = (page - 1) * limit;

        const where = {};
        if (academic_year) {
            where.academic_year = academic_year;
        }
        if (is_active !== undefined) {
            where.is_active = is_active === 'true';
        }

        const semesters = await Semester.findAndCountAll({
            where,
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                {
                    model: TrainingBatch,
                    as: 'TrainingBatch',
                    attributes: ['batch_id', 'name'],
                    required: false
                },
                {
                    model: TeacherSubjectAssignment,
                    as: 'TeacherAssignments',
                    attributes: ['assignment_id', 'teacher_id', 'subject_id'],
                    required: false
                },
                {
                    model: Course,
                    as: 'Courses',
                    attributes: ['course_id', 'name'],
                    required: false
                }
            ],
            order: [['academic_year', 'DESC'], ['semester_number', 'ASC']]
        });

        res.status(200).json({
            success: true,
            data: {
                totalItems: semesters.count,
                totalPages: Math.ceil(semesters.count / limit),
                currentPage: parseInt(page),
                semesters: semesters.rows.map(semester => ({
                    ...semester.toJSON(),
                    display_name: semester.getDisplayName(),
                    duration_days: semester.getDuration(),
                    is_current: semester.isCurrentSemester(),
                    assignment_count: semester.TeacherAssignments?.length || 0,
                    course_count: semester.Courses?.length || 0
                }))
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách học kỳ',
            error: error.message
        });
    }
};

// Lấy học kỳ theo ID
exports.getSemesterById = async (req, res) => {
    try {
        const semester = await Semester.findByPk(req.params.id, {
            include: [
                {
                    model: TrainingBatch,
                    as: 'TrainingBatch',
                    attributes: ['batch_id', 'name', 'start_year', 'end_year']
                },
                {
                    model: TeacherSubjectAssignment,
                    as: 'TeacherAssignments',
                    include: [
                        { model: User, as: 'Teacher', attributes: ['user_id', 'name', 'email'] },
                        { model: Subject, as: 'Subject', attributes: ['subject_id', 'name'] }
                    ]
                },
                {
                    model: Course,
                    as: 'Courses',
                    include: [
                        { model: User, as: 'Teacher', attributes: ['user_id', 'name'] },
                        { model: Subject, as: 'Subject', attributes: ['subject_id', 'name'] }
                    ]
                }
            ]
        });

        if (!semester) {
            return res.status(404).json({
                success: false,
                message: 'Học kỳ không tồn tại'
            });
        }

        res.status(200).json({
            success: true,
            data: {
                ...semester.toJSON(),
                display_name: semester.getDisplayName(),
                duration_days: semester.getDuration(),
                is_current: semester.isCurrentSemester()
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin học kỳ',
            error: error.message
        });
    }
};

// Tạo học kỳ mới (Admin only)
exports.createSemester = async (req, res) => {
    try {
        const { name, academic_year, semester_number, start_date, end_date, batch_id, description } = req.body;

        // Validate required fields
        if (!name || !academic_year || !semester_number || !start_date || !end_date || !batch_id) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu thông tin bắt buộc'
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

        const semester = await Semester.create({
            name,
            academic_year,
            semester_number,
            start_date,
            end_date,
            batch_id,
            description,
            is_active: false // Admin sẽ phải kích hoạt sau
        });

        res.status(201).json({
            success: true,
            message: 'Tạo học kỳ thành công',
            data: {
                ...semester.toJSON(),
                display_name: semester.getDisplayName(),
                duration_days: semester.getDuration()
            }
        });
    } catch (error) {
        if (error.name === 'SequelizeValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Dữ liệu không hợp lệ',
                errors: error.errors.map(err => err.message)
            });
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo học kỳ',
            error: error.message
        });
    }
};

// Cập nhật học kỳ (Admin only)
exports.updateSemester = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const semester = await Semester.findByPk(id);
        if (!semester) {
            return res.status(404).json({
                success: false,
                message: 'Học kỳ không tồn tại'
            });
        }

        // Không cho phép cập nhật nếu học kỳ đã có phân công hoặc khóa học
        const hasAssignments = await TeacherSubjectAssignment.count({
            where: { semester_id: id }
        });

        const hasCourses = await Course.count({
            where: { semester_id: id }
        });

        if ((hasAssignments > 0 || hasCourses > 0) && (updateData.start_date || updateData.end_date)) {
            return res.status(400).json({
                success: false,
                message: 'Không thể thay đổi ngày của học kỳ đã có phân công hoặc khóa học'
            });
        }

        await semester.update(updateData);

        res.status(200).json({
            success: true,
            message: 'Cập nhật học kỳ thành công',
            data: {
                ...semester.toJSON(),
                display_name: semester.getDisplayName(),
                duration_days: semester.getDuration()
            }
        });
    } catch (error) {
        if (error.name === 'SequelizeValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Dữ liệu không hợp lệ',
                errors: error.errors.map(err => err.message)
            });
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật học kỳ',
            error: error.message
        });
    }
};

// Xóa học kỳ (Admin only)
exports.deleteSemester = async (req, res) => {
    try {
        const { id } = req.params;

        const semester = await Semester.findByPk(id);
        if (!semester) {
            return res.status(404).json({
                success: false,
                message: 'Học kỳ không tồn tại'
            });
        }

        // Kiểm tra xem có phân công hoặc khóa học nào không
        const hasAssignments = await TeacherSubjectAssignment.count({
            where: { semester_id: id }
        });

        const hasCourses = await Course.count({
            where: { semester_id: id }
        });

        if (hasAssignments > 0 || hasCourses > 0) {
            return res.status(400).json({
                success: false,
                message: 'Không thể xóa học kỳ đã có phân công hoặc khóa học'
            });
        }

        await semester.destroy();

        res.status(200).json({
            success: true,
            message: 'Xóa học kỳ thành công'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa học kỳ',
            error: error.message
        });
    }
};

// Lấy học kỳ đang hoạt động
exports.getActiveSemester = async (req, res) => {
    try {
        const semester = await Semester.getActiveSemester();

        if (!semester) {
            return res.status(404).json({
                success: false,
                message: 'Không có học kỳ nào đang hoạt động'
            });
        }

        res.status(200).json({
            success: true,
            data: {
                ...semester.toJSON(),
                display_name: semester.getDisplayName(),
                duration_days: semester.getDuration(),
                is_current: semester.isCurrentSemester()
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy học kỳ hoạt động',
            error: error.message
        });
    }
};

// Lấy học kỳ hiện tại (theo thời gian)
exports.getCurrentSemester = async (req, res) => {
    try {
        const semester = await Semester.getCurrentSemester();

        if (!semester) {
            return res.status(404).json({
                success: false,
                message: 'Không có học kỳ nào đang diễn ra'
            });
        }

        res.status(200).json({
            success: true,
            data: {
                ...semester.toJSON(),
                display_name: semester.getDisplayName(),
                duration_days: semester.getDuration(),
                is_current: true
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy học kỳ hiện tại',
            error: error.message
        });
    }
};

// Kích hoạt học kỳ (Admin only)
exports.setActiveSemester = async (req, res) => {
    try {
        const { id } = req.params;

        const semester = await Semester.findByPk(id);
        if (!semester) {
            return res.status(404).json({
                success: false,
                message: 'Học kỳ không tồn tại'
            });
        }

        await Semester.setActiveSemester(id);

        res.status(200).json({
            success: true,
            message: 'Kích hoạt học kỳ thành công',
            data: {
                ...semester.toJSON(),
                is_active: true
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi kích hoạt học kỳ',
            error: error.message
        });
    }
};

// Lấy thống kê học kỳ
exports.getSemesterStatistics = async (req, res) => {
    try {
        const { id } = req.params;

        const semester = await Semester.findByPk(id);
        if (!semester) {
            return res.status(404).json({
                success: false,
                message: 'Học kỳ không tồn tại'
            });
        }

        // Đếm số phân công
        const assignmentCount = await TeacherSubjectAssignment.count({
            where: { semester_id: id, is_active: true }
        });

        // Đếm số khóa học
        const courseCount = await Course.count({
            where: { semester_id: id }
        });

        // Đếm số giáo viên được phân công
        const teacherCount = await TeacherSubjectAssignment.count({
            where: { semester_id: id, is_active: true },
            distinct: true,
            col: 'teacher_id'
        });

        // Đếm số môn học được phân công
        const subjectCount = await TeacherSubjectAssignment.count({
            where: { semester_id: id, is_active: true },
            distinct: true,
            col: 'subject_id'
        });

        res.status(200).json({
            success: true,
            data: {
                semester: {
                    ...semester.toJSON(),
                    display_name: semester.getDisplayName(),
                    is_current: semester.isCurrentSemester()
                },
                statistics: {
                    assignment_count: assignmentCount,
                    course_count: courseCount,
                    teacher_count: teacherCount,
                    subject_count: subjectCount
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thống kê học kỳ',
            error: error.message
        });
    }
};

// Lấy danh sách môn học theo học kỳ (Dùng ProgramSubjects)
exports.getSubjectsBySemester = async (req, res) => {
    try {
        const { id: semesterId } = req.params;
        const { 
            program_id = 1,  // Default: Chương trình Công nghệ thông tin
            type_id, 
            noidung_id,
            search 
        } = req.query;

        // Kiểm tra học kỳ có tồn tại không
        const semester = await Semester.findByPk(semesterId);
        if (!semester) {
            return res.status(404).json({
                success: false,
                message: 'Học kỳ không tồn tại'
            });
        }

        // Build where clause cho Subject
        const subjectWhere = {};
        if (type_id) {
            subjectWhere.type_id = type_id;
        }
        if (noidung_id) {
            subjectWhere.noidung_id = noidung_id;
        }
        if (search) {
            subjectWhere.name = { [Op.iLike]: `%${search}%` };
        }

        // Lấy môn học từ ProgramSubjects (recommended_semester là semester_id)
        const programSubjects = await ProgramSubject.findAll({
            where: {
                program_id,
                recommended_semester: semesterId,
                is_active: true
            },
            include: [
                {
                    model: Subject,
                    as: 'Subject',
                    where: Object.keys(subjectWhere).length > 0 ? subjectWhere : undefined,
                    required: true,
                    include: [
                        { 
                            model: TypeSubject, 
                            as: 'TypeSubject',
                            attributes: ['type_id', 'description'],
                            required: false
                        },
                        { 
                            model: TypeOfKnowledge, 
                            as: 'TypeOfKnowledge',
                            attributes: ['noidung_id', 'description'],
                            required: false
                        },
                        {
                            model: PLO,
                            as: 'PLOs',
                            attributes: ['plo_id', 'name', 'description'],
                            through: { attributes: [] },
                            required: false
                        }
                    ]
                },
                {
                    model: Program,
                    as: 'Program',
                    attributes: ['program_id', 'name'],
                    required: false
                }
            ],
            order: [
                ['order_index', 'ASC'],
                ['program_subject_id', 'ASC']
            ]
        });

        // Lấy thông tin phân công giáo viên (nếu có)
        const subjectIds = programSubjects.map(ps => ps.subject_id);
        const assignments = subjectIds.length > 0 ? await TeacherSubjectAssignment.findAll({
            where: {
                subject_id: { [Op.in]: subjectIds },
                semester_id: semesterId,
                is_active: true
            },
            include: [
                { 
                    model: User, 
                    as: 'Teacher', 
                    attributes: ['user_id', 'name', 'email'],
                    required: false
                }
            ]
        }) : [];

        // Merge data: Subject + Teacher assignments
        const subjects = programSubjects.map(ps => {
            const subject = ps.Subject.toJSON();
            const subjectAssignments = assignments.filter(a => a.subject_id === ps.subject_id);
            
            return {
                ...subject,
                // Thông tin từ ProgramSubject
                order_index: ps.order_index,
                is_mandatory: ps.is_mandatory,
                recommended_semester: ps.recommended_semester,
                
                // Thông tin giáo viên
                teachers: subjectAssignments
                    .filter(a => a.Teacher)
                    .map(a => ({
                        user_id: a.Teacher.user_id,
                        name: a.Teacher.name,
                        email: a.Teacher.email
                    })),
                
                // Thông tin assignments
                assignments: subjectAssignments.map(a => ({
                    assignment_id: a.assignment_id,
                    teacher_id: a.teacher_id,
                    workload_hours: a.workload_hours,
                    is_active: a.is_active,
                    created_at: a.created_at
                }))
            };
        });

        res.status(200).json({
            success: true,
            data: {
                semester: {
                    semester_id: semester.semester_id,
                    name: semester.name,
                    academic_year: semester.academic_year,
                    display_name: semester.getDisplayName(),
                    is_active: semester.is_active,
                    is_current: semester.isCurrentSemester()
                },
                program_id: parseInt(program_id),
                totalSubjects: subjects.length,
                subjects
            }
        });
    } catch (error) {
        console.error('Error in getSubjectsBySemester:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách môn học theo học kỳ',
            error: error.message
        });
    }
};
