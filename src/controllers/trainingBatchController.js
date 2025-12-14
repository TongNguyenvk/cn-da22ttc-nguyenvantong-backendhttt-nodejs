const { TrainingBatch, Program, Semester, TeacherSubjectAssignment, Course, Subject, User, ProgramSubject, Role } = require('../models');
const { Op } = require('sequelize');

// ---------------- Helper utilities ----------------
const respondSuccess = (res, data, status = 200) => res.status(status).json({ success: true, data });
const respondError = (res, status, message, error) => res.status(status).json({ success: false, message, ...(error ? { error } : {}) });

const validateTrainingBatchPayload = ({ program_id, name, start_year, end_year, description }, isUpdate = false) => {
    if (!isUpdate && (!program_id || !name || !start_year || !end_year)) return 'program_id, name, start_year, end_year là bắt buộc';
    if (name && name.length > 100) return 'Tên khóa đào tạo không được vượt quá 100 ký tự';
    if (start_year && end_year && start_year > end_year) return 'Năm bắt đầu phải nhỏ hơn hoặc bằng năm kết thúc';
    return null;
};

// --------------- Training Batch endpoints ---------------

// Lấy danh sách tất cả khóa đào tạo (có phân trang + filter optional)
exports.getAllTrainingBatches = async (req, res) => {
    try {
        const { page = 1, limit = 10, search, program_id } = req.query;
        const offset = (page - 1) * limit;
        const where = {};
        if (search) {
            where[Op.or] = [
                { name: { [Op.iLike]: `%${search}%` } },
                { description: { [Op.iLike]: `%${search}%` } }
            ];
        }
        if (program_id) {
            where.program_id = program_id;
        }
        const batches = await TrainingBatch.findAndCountAll({
            where,
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                { model: Program, as: 'Program', attributes: ['program_id', 'name'] },
                { model: Semester, as: 'Semesters', attributes: ['semester_id', 'name'] },
                { model: TeacherSubjectAssignment, as: 'TeacherAssignments', attributes: ['assignment_id', 'subject_id'] },
                { model: Course, as: 'Courses', attributes: ['course_id', 'name'] },
            ],
            order: [['batch_id', 'ASC']]
        });

        return respondSuccess(res, {
            pagination: {
                totalItems: batches.count,
                totalPages: Math.ceil(batches.count / limit),
                currentPage: parseInt(page),
                pageSize: parseInt(limit)
            },
            records: batches.rows
        });
    } catch (error) {
        return respondError(res, 500, 'Lỗi khi lấy danh sách khóa đào tạo', error.message);
    }
};

// Lấy thông tin chi tiết một khóa đào tạo
exports.getTrainingBatchById = async (req, res) => {
    try {
        const batch = await TrainingBatch.findByPk(req.params.id, {
            include: [
                { model: Program, as: 'Program', attributes: ['program_id', 'name', 'description'] },
                { model: Semester, as: 'Semesters', attributes: ['semester_id', 'name', 'academic_year', 'start_date', 'end_date'] },
                { model: TeacherSubjectAssignment, as: 'TeacherAssignments', include: [{ model: User, as: 'Teacher', attributes: ['user_id', 'name'] }, { model: Subject, as: 'Subject', attributes: ['subject_id', 'name'] }] },
                { model: Course, as: 'Courses', attributes: ['course_id', 'name', 'description'] },
            ],
        });

        if (!batch) return respondError(res, 404, 'Khóa đào tạo không tồn tại');
        return respondSuccess(res, batch);
    } catch (error) {
        return respondError(res, 500, 'Lỗi khi lấy thông tin khóa đào tạo', error.message);
    }
};

// Tạo một khóa đào tạo mới
exports.createTrainingBatch = async (req, res) => {
    try {
        const { program_id, name, start_year, end_year, description } = req.body;
        const validationMsg = validateTrainingBatchPayload({ program_id, name, start_year, end_year, description });
        if (validationMsg) return respondError(res, 400, validationMsg);

        // Kiểm tra program tồn tại
        const program = await Program.findByPk(program_id);
        if (!program) return respondError(res, 404, 'Chương trình đào tạo không tồn tại');

        const newBatch = await TrainingBatch.create({ program_id, name, start_year, end_year, description });
        return respondSuccess(res, newBatch, 201);
    } catch (error) {
        if (error.name === 'SequelizeValidationError') {
            return respondError(res, 400, 'Lỗi validation', error.errors.map(e => ({ field: e.path, message: e.message })));
        }
        if (error.name === 'SequelizeUniqueConstraintError') {
            return respondError(res, 400, 'Tên khóa đào tạo đã tồn tại');
        }
        return respondError(res, 500, 'Lỗi khi tạo khóa đào tạo', error.message);
    }
};

// Cập nhật thông tin một khóa đào tạo
exports.updateTrainingBatch = async (req, res) => {
    try {
        const { program_id, name, start_year, end_year, description } = req.body;
        const validationMsg = validateTrainingBatchPayload({ program_id, name, start_year, end_year, description }, true);
        if (validationMsg) return respondError(res, 400, validationMsg);

        const batch = await TrainingBatch.findByPk(req.params.id);
        if (!batch) return respondError(res, 404, 'Khóa đào tạo không tồn tại');

        // Kiểm tra program nếu có thay đổi
        if (program_id) {
            const program = await Program.findByPk(program_id);
            if (!program) return respondError(res, 404, 'Chương trình đào tạo không tồn tại');
        }

        await batch.update({ program_id, name, start_year, end_year, description });
        return respondSuccess(res, batch);
    } catch (error) {
        if (error.name === 'SequelizeValidationError') {
            return respondError(res, 400, 'Lỗi validation', error.errors.map(e => ({ field: e.path, message: e.message })));
        }
        return respondError(res, 500, 'Lỗi khi cập nhật khóa đào tạo', error.message);
    }
};

// Xóa một khóa đào tạo
exports.deleteTrainingBatch = async (req, res) => {
    try {
        const batch = await TrainingBatch.findByPk(req.params.id);
        if (!batch) return respondError(res, 404, 'Khóa đào tạo không tồn tại');

        await batch.destroy();
        return respondSuccess(res, { message: 'Khóa đào tạo đã được xóa thành công' });
    } catch (error) {
        return respondError(res, 500, 'Lỗi khi xóa khóa đào tạo', error.message);
    }
};

// Lấy danh sách học kỳ của một khóa đào tạo
exports.getSemestersByBatch = async (req, res) => {
    try {
        const batch = await TrainingBatch.findByPk(req.params.id, {
            include: [{ model: Semester, as: 'Semesters', attributes: ['semester_id', 'name', 'academic_year', 'start_date', 'end_date'] }]
        });

        if (!batch) return respondError(res, 404, 'Khóa đào tạo không tồn tại');
        return respondSuccess(res, batch.Semesters);
    } catch (error) {
        return respondError(res, 500, 'Lỗi khi lấy danh sách học kỳ', error.message);
    }
};

// Lấy danh sách phân công của một khóa đào tạo
exports.getAssignmentsByBatch = async (req, res) => {
    try {
        const batch = await TrainingBatch.findByPk(req.params.id, {
            include: [{ model: TeacherSubjectAssignment, as: 'TeacherAssignments', include: [{ model: User, as: 'Teacher', attributes: ['user_id', 'name'] }, { model: Subject, as: 'Subject', attributes: ['subject_id', 'name'] }] }]
        });

        if (!batch) return respondError(res, 404, 'Khóa đào tạo không tồn tại');
        return respondSuccess(res, batch.TeacherAssignments);
    } catch (error) {
        return respondError(res, 500, 'Lỗi khi lấy danh sách phân công', error.message);
    }
};

// Lấy danh sách khóa học của một khóa đào tạo
exports.getCoursesByBatch = async (req, res) => {
    try {
        const batch = await TrainingBatch.findByPk(req.params.id, {
            include: [{ model: Course, as: 'Courses', attributes: ['course_id', 'name', 'description'] }]
        });

        if (!batch) return respondError(res, 404, 'Khóa đào tạo không tồn tại');
        return respondSuccess(res, batch.Courses);
    } catch (error) {
        return respondError(res, 500, 'Lỗi khi lấy danh sách khóa học', error.message);
    }
};

// Lấy thông tin đầy đủ của một khóa đào tạo (bao gồm program, semesters, assignments, courses, subjects)
exports.getTrainingBatchFullDetails = async (req, res) => {
    try {
        const batch = await TrainingBatch.findByPk(req.params.id, {
            include: [
                { 
                    model: Program, 
                    as: 'Program',
                    attributes: ['program_id', 'name', 'description'],
                    include: [
                        {
                            model: Subject,
                            as: 'Subjects',
                            attributes: ['subject_id', 'name', 'description'],
                            through: { attributes: [] }
                        }
                    ]
                },
                { 
                    model: Semester, 
                    as: 'Semesters',
                    attributes: ['semester_id', 'name', 'academic_year', 'start_date', 'end_date', 'is_active'],
                    include: [
                        {
                            model: TeacherSubjectAssignment,
                            as: 'TeacherAssignments',
                            attributes: ['assignment_id', 'teacher_id', 'subject_id', 'workload_hours', 'is_active'],
                            include: [
                                { model: User, as: 'Teacher', attributes: ['user_id', 'name', 'email'] },
                                { model: Subject, as: 'Subject', attributes: ['subject_id', 'name'] }
                            ]
                        }
                    ]
                },
                { 
                    model: TeacherSubjectAssignment, 
                    as: 'TeacherAssignments',
                    attributes: ['assignment_id', 'teacher_id', 'subject_id', 'semester_id', 'workload_hours', 'is_active'],
                    include: [
                        { model: User, as: 'Teacher', attributes: ['user_id', 'name', 'email'] },
                        { model: Subject, as: 'Subject', attributes: ['subject_id', 'name'] },
                        { model: Semester, as: 'Semester', attributes: ['semester_id', 'name', 'academic_year'] }
                    ]
                },
                { 
                    model: Course, 
                    as: 'Courses',
                    attributes: ['course_id', 'name', 'description', 'user_id'],
                    include: [
                        { model: User, as: 'Teacher', attributes: ['user_id', 'name'] },
                        { model: Subject, as: 'Subject', attributes: ['subject_id', 'name'] },
                        { model: Semester, as: 'Semester', attributes: ['semester_id', 'name'] }
                    ]
                }
            ],
        });

        if (!batch) return respondError(res, 404, 'Khóa đào tạo không tồn tại');
        return respondSuccess(res, batch);
    } catch (error) {
        return respondError(res, 500, 'Lỗi khi lấy thông tin đầy đủ khóa đào tạo', error.message);
    }
};

// Lấy danh sách môn học và giáo viên theo khóa đào tạo và học kỳ (để admin assign)
exports.getSubjectsAndTeachersByBatchSemester = async (req, res) => {
    try {
        const { batch_id, semester_id } = req.params;

        // Validate batch exists
        const batch = await TrainingBatch.findByPk(batch_id, {
            include: [{ model: Program, as: 'Program' }]
        });
        if (!batch) return respondError(res, 404, 'Khóa đào tạo không tồn tại');

        // Validate semester exists and belongs to batch
        const semester = await Semester.findOne({
            where: { semester_id, batch_id },
            include: [{ model: TrainingBatch, as: 'TrainingBatch' }]
        });
        if (!semester) return respondError(res, 404, 'Học kỳ không tồn tại hoặc không thuộc khóa đào tạo này');

        // Get program subjects
        const programSubjects = await ProgramSubject.findAll({
            where: { program_id: batch.program_id },
            include: [{
                model: Subject,
                as: 'Subject',
                attributes: ['subject_id', 'name', 'description']
            }],
            order: [['order_index', 'ASC']]
        });

        // Get all teachers
        const teachers = await User.findAll({
            include: [{
                model: Role,
                where: { name: 'teacher' },
                required: true
            }],
            attributes: ['user_id', 'name', 'email']
        });

        // Get existing assignments for this semester
        const existingAssignments = await TeacherSubjectAssignment.findAll({
            where: { semester_id, batch_id },
            attributes: ['subject_id', 'teacher_id']
        });

        // Create assignment map
        const assignmentMap = new Map();
        existingAssignments.forEach(assignment => {
            assignmentMap.set(assignment.subject_id, assignment.teacher_id);
        });

        // Format subjects with assignment status
        const subjectsWithAssignments = programSubjects.map(ps => ({
            subject_id: ps.Subject.subject_id,
            name: ps.Subject.name,
            description: ps.Subject.description,
            order_index: ps.order_index,
            recommended_semester: ps.recommended_semester,
            is_mandatory: ps.is_mandatory,
            assigned_teacher_id: assignmentMap.get(ps.subject_id) || null
        }));

        return respondSuccess(res, {
            batch: {
                batch_id: batch.batch_id,
                name: batch.name,
                program: batch.Program
            },
            semester: {
                semester_id: semester.semester_id,
                name: semester.name,
                academic_year: semester.academic_year
            },
            subjects: subjectsWithAssignments,
            teachers: teachers
        });

    } catch (error) {
        return respondError(res, 500, 'Lỗi khi lấy danh sách môn học và giáo viên', error.message);
    }
};