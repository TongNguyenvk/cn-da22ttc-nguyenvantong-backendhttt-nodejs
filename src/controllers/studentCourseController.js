const { StudentCourse, User, Course, Program, Subject, Role, sequelize } = require('../models');
const { Op } = require('sequelize');

exports.getAllStudentCourses = async (req, res) => {
    try {
        const studentCourses = await StudentCourse.findAll({
            include: [
                { model: User, attributes: ['user_id', 'name'] },
                { model: Course, attributes: ['course_id', 'name'] },
            ],
        });

        res.status(200).json({
            success: true,
            data: studentCourses
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách StudentCourse',
            error: error.message
        });
    }
};

exports.getStudentCourseById = async (req, res) => {
    try {
        const { user_id, course_id } = req.params;

        const studentCourse = await StudentCourse.findOne({
            where: { user_id, course_id },
            include: [
                { model: User, attributes: ['user_id', 'name'] },
                { model: Course, attributes: ['course_id', 'name'] },
            ],
        });

        if (!studentCourse) {
            return res.status(404).json({
                success: false,
                message: 'StudentCourse không tồn tại'
            });
        }

        res.status(200).json({
            success: true,
            data: studentCourse
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin StudentCourse',
            error: error.message
        });
    }
};

// Đăng ký sinh viên vào khóa học
exports.enrollStudent = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const { courseId } = req.params;
        const { user_id, enrollment_date } = req.body;

        // Validation
        if (!user_id) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'User ID là bắt buộc'
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

        // Kiểm tra sinh viên tồn tại và có role student
        const student = await User.findOne({
            where: { user_id: user_id },
            include: [{
                model: Role,
                where: { name: 'student' }
            }],
            attributes: ['user_id', 'name', 'email']
        });

        if (!student) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Sinh viên không tồn tại hoặc không có quyền'
            });
        }

        // Kiểm tra đã đăng ký chưa
        const existingEnrollment = await StudentCourse.findOne({
            where: {
                user_id: user_id,
                course_id: courseId
            }
        });

        if (existingEnrollment) {
            await transaction.rollback();
            return res.status(409).json({
                success: false,
                message: 'Sinh viên đã đăng ký khóa học này'
            });
        }

        // Tạo đăng ký mới
        const enrollment = await StudentCourse.create({
            user_id: user_id,
            course_id: courseId,
            enrollment_date: enrollment_date || new Date()
        }, { transaction });

        await transaction.commit();

        res.status(201).json({
            success: true,
            message: 'Đăng ký khóa học thành công',
            data: {
                enrollment_id: enrollment.enrollment_id,
                user_id: enrollment.user_id,
                course_id: enrollment.course_id,
                enrollment_date: enrollment.enrollment_date,
                student_name: student.name,
                course_name: course.name
            }
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error enrolling student:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi đăng ký sinh viên vào khóa học',
            error: error.message
        });
    }
};

// Legacy function - giữ lại để backward compatibility
exports.createStudentCourse = exports.enrollStudent;

// Hủy đăng ký sinh viên khỏi khóa học
exports.unenrollStudent = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const { courseId, userId } = req.params;

        // Kiểm tra đăng ký tồn tại
        const enrollment = await StudentCourse.findOne({
            where: {
                user_id: userId,
                course_id: courseId
            },
            include: [
                {
                    model: User,
                    attributes: ['name', 'email']
                },
                {
                    model: Course,
                    attributes: ['name']
                }
            ]
        });

        if (!enrollment) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy đăng ký khóa học'
            });
        }

        // Xóa đăng ký
        await enrollment.destroy({ transaction });

        await transaction.commit();

        res.status(200).json({
            success: true,
            message: 'Hủy đăng ký khóa học thành công',
            data: {
                user_id: parseInt(userId),
                course_id: parseInt(courseId),
                student_name: enrollment.User?.name,
                course_name: enrollment.Course?.name
            }
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error unenrolling student:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi hủy đăng ký sinh viên khỏi khóa học',
            error: error.message
        });
    }
};

// Legacy function - giữ lại để backward compatibility
exports.deleteStudentCourse = exports.unenrollStudent;

// Đăng ký nhiều sinh viên vào khóa học
exports.enrollMultipleStudents = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const { courseId } = req.params;
        const { user_ids, enrollment_date } = req.body;

        // Validation
        if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Danh sách user IDs là bắt buộc và phải là mảng'
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

        // Lấy role_id của student
        const studentRole = await Role.findOne({
            where: { name: 'student' }
        });

        if (!studentRole) {
            await transaction.rollback();
            return res.status(500).json({
                success: false,
                message: 'Không tìm thấy role student'
            });
        }

        // Kiểm tra tất cả user_ids có tồn tại và là student không
        const students = await User.findAll({
            where: {
                user_id: user_ids,
                role_id: studentRole.role_id
            },
            attributes: ['user_id', 'name', 'email']
        });

        const foundUserIds = students.map(s => s.user_id);
        const notFoundUserIds = user_ids.filter(id => !foundUserIds.includes(id));

        if (notFoundUserIds.length > 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Một số user ID không tồn tại hoặc không phải sinh viên',
                invalid_user_ids: notFoundUserIds
            });
        }

        // Kiểm tra sinh viên nào đã đăng ký
        const existingEnrollments = await StudentCourse.findAll({
            where: {
                user_id: user_ids,
                course_id: courseId
            },
            attributes: ['user_id']
        });

        const alreadyEnrolledIds = existingEnrollments.map(e => e.user_id);
        const newEnrollmentIds = user_ids.filter(id => !alreadyEnrolledIds.includes(id));

        if (newEnrollmentIds.length === 0) {
            await transaction.rollback();
            return res.status(409).json({
                success: false,
                message: 'Tất cả sinh viên đã đăng ký khóa học này',
                already_enrolled_ids: alreadyEnrolledIds
            });
        }

        // Tạo đăng ký mới
        const enrollmentData = newEnrollmentIds.map(userId => ({
            user_id: userId,
            course_id: courseId,
            enrollment_date: enrollment_date || new Date()
        }));

        const newEnrollments = await StudentCourse.bulkCreate(enrollmentData, {
            transaction,
            returning: true
        });

        await transaction.commit();

        res.status(201).json({
            success: true,
            message: `Đăng ký thành công ${newEnrollments.length}/${user_ids.length} sinh viên`,
            data: {
                course_id: parseInt(courseId),
                course_name: course.name,
                total_requested: user_ids.length,
                successful_enrollments: newEnrollments.length,
                already_enrolled: alreadyEnrolledIds.length,
                new_enrollments: newEnrollments.map(e => ({
                    enrollment_id: e.enrollment_id,
                    user_id: e.user_id,
                    student_name: students.find(s => s.user_id === e.user_id)?.name
                })),
                already_enrolled_ids: alreadyEnrolledIds
            }
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error enrolling multiple students:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi đăng ký nhiều sinh viên vào khóa học',
            error: error.message
        });
    }
};

// Lấy danh sách sinh viên trong khóa học
exports.getStudentsInCourse = async (req, res) => {
    try {
        const { courseId } = req.params;
        const { page = 1, limit = 50, search, sort_by = 'enrollment_date', sort_order = 'DESC' } = req.query;

        // Kiểm tra khóa học tồn tại
        const course = await Course.findByPk(courseId, {
            attributes: ['course_id', 'name', 'description']
        });

        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Khóa học không tồn tại'
            });
        }

        // Build where clause cho search
        const whereClause = { course_id: courseId };
        const userWhereClause = {};

        if (search) {
            userWhereClause[Op.or] = [
                { name: { [Op.iLike]: `%${search}%` } },
                { email: { [Op.iLike]: `%${search}%` } }
            ];
        }

        // Pagination
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Query
        const { count, rows: enrollments } = await StudentCourse.findAndCountAll({
            where: whereClause,
            include: [{
                model: User,
                where: userWhereClause,
                attributes: ['user_id', 'name', 'email'],
                include: [{
                    model: Role,
                    attributes: ['name']
                }]
            }],
            order: [
                sort_by === 'student_name' ? [User, 'name', sort_order] :
                sort_by === 'email' ? [User, 'email', sort_order] :
                sort_by === 'enrollment_date' ? ['user_id', sort_order] : // Fallback if enrollment_date doesn't exist
                [sort_by, sort_order]
            ],
            limit: parseInt(limit),
            offset: offset,
            distinct: true
        });

        // Format response
        const students = enrollments.map(enrollment => ({
            user_id: enrollment.User.user_id,
            student_code: enrollment.User.email.split('@')[0], // Extract student code from email
            student_name: enrollment.User.name,
            email: enrollment.User.email,
            role: enrollment.User.Role?.name,
            enrollment_date: enrollment.enrollment_date || new Date(),
            // Include enrollment_id only if it exists (after full migration)
            ...(enrollment.enrollment_id && { enrollment_id: enrollment.enrollment_id })
        }));

        res.status(200).json({
            success: true,
            message: 'Lấy danh sách sinh viên thành công',
            data: {
                course_info: {
                    course_id: course.course_id,
                    course_name: course.name,
                    description: course.description
                },
                students: students,
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total_items: count,
                    total_pages: Math.ceil(count / parseInt(limit)),
                    has_next: parseInt(page) < Math.ceil(count / parseInt(limit)),
                    has_prev: parseInt(page) > 1
                }
            }
        });
    } catch (error) {
        console.error('Error getting students in course:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách sinh viên trong khóa học',
            error: error.message
        });
    }
};

// Lấy danh sách khóa học của sinh viên
exports.getCoursesOfStudent = async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 20, search } = req.query;

        // Kiểm tra sinh viên tồn tại
        const student = await User.findByPk(userId, {
            include: [{
                model: Role,
                where: { name: 'student' }
            }],
            attributes: ['user_id', 'name', 'email']
        });

        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Sinh viên không tồn tại hoặc không có quyền'
            });
        }

        // Build where clause
        const courseWhereClause = {};
        if (search) {
            courseWhereClause[Op.or] = [
                { name: { [Op.iLike]: `%${search}%` } },
                { description: { [Op.iLike]: `%${search}%` } }
            ];
        }

        // Pagination
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Query
        const { count, rows: enrollments } = await StudentCourse.findAndCountAll({
            where: { user_id: userId },
            include: [{
                model: Course,
                where: courseWhereClause,
                attributes: ['course_id', 'name', 'description', 'subject_id'],
                include: [
                    {
                        model: User,
                        as: 'Teacher',
                        attributes: ['name', 'email']
                    },
                    {
                        model: Subject,
                        as: 'Subject',
                        attributes: ['subject_id', 'name', 'description']
                    }
                ]
            }],
            order: [['enrollment_date', 'DESC']],
            limit: parseInt(limit),
            offset: offset,
            distinct: true
        });

        // Format response
        const courses = enrollments.map(enrollment => ({
            enrollment_id: enrollment.enrollment_id,
            course_id: enrollment.Course.course_id,
            course_name: enrollment.Course.name,
            description: enrollment.Course.description,
            teacher_name: enrollment.Course.Teacher?.name,
            teacher_email: enrollment.Course.Teacher?.email,
            subject_name: enrollment.Course.Subject?.name,
            subject_description: enrollment.Course.Subject?.description,
            enrollment_date: enrollment.enrollment_date
        }));

        res.status(200).json({
            success: true,
            message: 'Lấy danh sách khóa học của sinh viên thành công',
            data: {
                student_info: {
                    user_id: student.user_id,
                    student_name: student.name,
                    email: student.email,
                    student_code: student.email.split('@')[0]
                },
                courses: courses,
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total_items: count,
                    total_pages: Math.ceil(count / parseInt(limit)),
                    has_next: parseInt(page) < Math.ceil(count / parseInt(limit)),
                    has_prev: parseInt(page) > 1
                }
            }
        });
    } catch (error) {
        console.error('Error getting courses of student:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách khóa học của sinh viên',
            error: error.message
        });
    }
};