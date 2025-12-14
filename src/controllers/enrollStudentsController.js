// Enroll nhiều sinh viên vào khóa học
exports.enrollStudentsInCourse = async (req, res) => {
    console.log('🚀 Starting enrollStudentsInCourse...');
    const { sequelize, StudentCourse, User, Course, Role } = require('../models');
    const { Op } = require('sequelize');
    const transaction = await sequelize.transaction();

    try {
        const { course_id, student_ids } = req.body;

        // ===== VALIDATION =====
        if (!course_id) {
            await transaction.rollback();
            return res.status(400).json({
                error: 'course_id là bắt buộc'
            });
        }

        if (!student_ids || !Array.isArray(student_ids) || student_ids.length === 0) {
            await transaction.rollback();
            return res.status(400).json({
                error: 'student_ids phải là array không rỗng'
            });
        }

        console.log('📋 Input data:', {
            course_id,
            student_count: student_ids.length,
            student_ids: student_ids.slice(0, 5) // Show first 5 for logging
        });

        // ===== CHECK COURSE =====
        const course = await Course.findByPk(course_id);
        if (!course) {
            await transaction.rollback();
            return res.status(404).json({
                error: 'Khóa học không tồn tại'
            });
        }

        console.log('✅ Course found:', {
            course_id: course.course_id,
            name: course.name
        });

        // ===== CHECK STUDENTS =====
        const studentRole = await Role.findOne({
            where: { name: { [Op.iLike]: 'student' } }
        });

        const students = await User.findAll({
            where: {
                user_id: student_ids,
                role_id: studentRole.role_id
            },
            attributes: ['user_id', 'name', 'email']
        });

        const foundStudentIds = students.map(s => s.user_id);
        const notFoundIds = student_ids.filter(id => !foundStudentIds.includes(id));

        console.log('👥 Students check:', {
            requested: student_ids.length,
            found: foundStudentIds.length,
            not_found: notFoundIds.length
        });

        // ===== CHECK EXISTING ENROLLMENTS =====
        const existingEnrollments = await StudentCourse.findAll({
            where: {
                user_id: foundStudentIds,
                course_id: course_id
            },
            attributes: ['user_id'],
            transaction
        });

        const alreadyEnrolledIds = existingEnrollments.map(e => e.user_id);
        const newEnrollmentIds = foundStudentIds.filter(id => !alreadyEnrolledIds.includes(id));

        console.log('📊 Enrollment status:', {
            already_enrolled: alreadyEnrolledIds.length,
            need_enrollment: newEnrollmentIds.length
        });

        // ===== CREATE ENROLLMENTS =====
        let newEnrollments = [];
        if (newEnrollmentIds.length > 0) {
            const enrollmentData = newEnrollmentIds.map(userId => ({
                user_id: userId,
                course_id: course_id,
                enrollment_date: new Date()
            }));

            newEnrollments = await StudentCourse.bulkCreate(enrollmentData, {
                transaction,
                returning: true
            });

            console.log(`✅ Successfully enrolled ${newEnrollments.length} students`);
        }

        await transaction.commit();

        // ===== RESPONSE =====
        const result = {
            course_id: parseInt(course_id),
            course_name: course.name,
            summary: {
                total_requested: student_ids.length,
                students_found: foundStudentIds.length,
                successful_enrollments: newEnrollments.length,
                already_enrolled: alreadyEnrolledIds.length,
                not_found_students: notFoundIds.length
            },
            successful_enrollments: newEnrollments.map(e => {
                const student = students.find(s => s.user_id === e.user_id);
                return {
                    enrollment_id: e.enrollment_id,
                    user_id: e.user_id,
                    student_name: student?.name,
                    student_email: student?.email,
                    enrollment_date: e.enrollment_date
                };
            }),
            already_enrolled: alreadyEnrolledIds.map(id => {
                const student = students.find(s => s.user_id === id);
                return {
                    user_id: id,
                    student_name: student?.name,
                    student_email: student?.email
                };
            }),
            not_found_student_ids: notFoundIds
        };

        res.status(200).json({
            success: true,
            message: `Enroll thành công ${newEnrollments.length}/${student_ids.length} sinh viên`,
            data: result
        });

    } catch (error) {
        await transaction.rollback();
        console.log('💥 Error in enrollStudentsInCourse:', error);
        res.status(500).json({
            success: false,
            error: 'Lỗi khi enroll sinh viên vào khóa học',
            details: error.message
        });
    }
};
