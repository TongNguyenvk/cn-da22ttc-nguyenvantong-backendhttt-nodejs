const { Course, User, TrainingBatch, Subject, CourseResult, TypeSubject, TypeOfKnowledge, PLO, Quiz, Chapter, LO, ChapterLO, QuizResult, Semester, TeacherSubjectAssignment } = require('../models');
const cloneCourseService = require('../services/cloneCourseService');

exports.getAllCourses = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const courses = await Course.findAndCountAll({
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                { model: User, as: 'Teacher', attributes: ['user_id', 'name'] },
                { model: TrainingBatch, as: 'TrainingBatch', attributes: ['batch_id', 'name'] },
                { model: Subject, as: 'Subject', attributes: ['subject_id', 'name'] },
                { model: CourseResult, attributes: ['result_id', 'average_score'] },
            ],
        });

        res.status(200).json({
            success: true,
            data: {
                totalItems: courses.count,
                totalPages: Math.ceil(courses.count / limit),
                currentPage: parseInt(page),
                courses: courses.rows,
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách khóa học',
            error: error.message
        });
    }
};

exports.getCourseById = async (req, res) => {
    try {
        const course = await Course.findByPk(req.params.id, {
            include: [
                { model: User, as: 'Teacher', attributes: ['user_id', 'name'] },
                { model: TrainingBatch, as: 'TrainingBatch', attributes: ['batch_id', 'name'] },
                { model: Subject, as: 'Subject', attributes: ['subject_id', 'name'] },
                { model: CourseResult, attributes: ['result_id', 'average_score'] },
            ],
        });

        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Khóa học không tồn tại'
            });
        }

        res.status(200).json({
            success: true,
            data: course
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin khóa học',
            error: error.message
        });
    }
};

exports.createCourse = async (req, res) => {
    try {
        const { user_id, name, description, batch_id, subject_id, semester_id } = req.body;

        if (!user_id || !name || !batch_id) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu các trường bắt buộc'
            });
        }

        const user = await User.findByPk(user_id);
        const batch = await TrainingBatch.findByPk(batch_id);

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Người dùng không tồn tại'
            });
        }

        if (!batch) {
            return res.status(400).json({
                success: false,
                message: 'Khóa đào tạo không tồn tại'
            });
        }

        const newCourse = await Course.create({
            user_id,
            name,
            description,
            batch_id,
            subject_id,
            semester_id,
        });

        res.status(201).json({
            success: true,
            data: newCourse
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo khóa học',
            error: error.message
        });
    }
};

exports.updateCourse = async (req, res) => {
    try {
        const { user_id, name, description, batch_id, subject_id, semester_id } = req.body;

        const course = await Course.findByPk(req.params.id);
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Khóa học không tồn tại'
            });
        }

        if (user_id) {
            const user = await User.findByPk(user_id);
            if (!user) {
                return res.status(400).json({
                    success: false,
                    message: 'Người dùng không tồn tại'
                });
            }
        }

        if (batch_id) {
            const batch = await TrainingBatch.findByPk(batch_id);
            if (!batch) {
                return res.status(400).json({
                    success: false,
                    message: 'Khóa đào tạo không tồn tại'
                });
            }
        }

        await course.update({
            user_id: user_id || course.user_id,
            name: name || course.name,
            description: description || course.description,
            batch_id: batch_id || course.batch_id,
            subject_id: subject_id || course.subject_id,
            semester_id: semester_id || course.semester_id,
        });

        res.status(200).json({
            success: true,
            data: course
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật khóa học',
            error: error.message
        });
    }
};

exports.deleteCourse = async (req, res) => {
    const { sequelize } = require('../models');
    const transaction = await sequelize.transaction();
    
    try {
        const courseId = req.params.id;
        const course = await Course.findByPk(courseId);
        
        if (!course) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Khóa học không tồn tại'
            });
        }

        // Xóa các records liên quan của course
        const { 
            Quiz, 
            QuizResult, 
            UserQuestionHistory, 
            StudentCourse, 
            CourseResult,
            CourseGradeColumn,
            CourseGradeResult
        } = require('../models');

        // Lấy tất cả quiz IDs của course này
        const quizzes = await Quiz.findAll({
            where: { course_id: courseId },
            attributes: ['quiz_id'],
            transaction
        });
        const quizIds = quizzes.map(q => q.quiz_id);

        if (quizIds.length > 0) {
            // Xóa quiz results của các quiz thuộc course này
            await QuizResult.destroy({
                where: { quiz_id: quizIds },
                transaction
            });

            // Xóa question history của các quiz thuộc course này
            await UserQuestionHistory.destroy({
                where: { quiz_id: quizIds },
                transaction
            });

            // Xóa các quiz của course
            await Quiz.destroy({
                where: { course_id: courseId },
                transaction
            });
        }

        // Xóa course results
        await CourseResult.destroy({
            where: { course_id: courseId },
            transaction
        });

        // Xóa student course enrollments
        await StudentCourse.destroy({
            where: { course_id: courseId },
            transaction
        });

        // Xóa grade columns và results
        await CourseGradeResult.destroy({
            where: { course_id: courseId },
            transaction
        });

        await CourseGradeColumn.destroy({
            where: { course_id: courseId },
            transaction
        });

        // Xóa course
        await course.destroy({ transaction });
        await transaction.commit();
        
        res.status(200).json({
            success: true,
            message: 'Xóa khóa học và tất cả dữ liệu liên quan thành công'
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error deleting course:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa khóa học',
            error: error.message
        });
    }
};

// Lấy danh sách subjects theo course
exports.getSubjectsByCourse = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const course = await Course.findByPk(id);
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Khóa học không tồn tại'
            });
        }

        const subjects = await Subject.findAndCountAll({
            where: { course_id: id },
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                { model: TypeSubject, attributes: ['type_id', 'description'] },
                { model: TypeOfKnowledge, attributes: ['noidung_id', 'description'] },
                { model: PLO, attributes: ['plo_id', 'description'] },
                { model: Quiz, attributes: ['quiz_id', 'name'] },
                {
                    model: Chapter,
                    as: 'Chapters',
                    attributes: ['chapter_id', 'name', 'description'],
                    include: [
                        {
                            model: LO,
                            as: 'LOs',
                            attributes: ['lo_id', 'name', 'description']
                        }
                    ]
                },
            ],
        });

        res.status(200).json({
            success: true,
            data: {
                course: {
                    course_id: course.course_id,
                    name: course.name,
                    description: course.description
                },
                totalItems: subjects.count,
                totalPages: Math.ceil(subjects.count / limit),
                currentPage: parseInt(page),
                subjects: subjects.rows,
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách subjects theo course',
            error: error.message
        });
    }
};

// Lấy danh sách courses theo program
exports.getCoursesByProgram = async (req, res) => {
    try {
        const { program_id } = req.params;
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const program = await Program.findByPk(program_id);
        if (!program) {
            return res.status(404).json({
                success: false,
                message: 'Chương trình không tồn tại'
            });
        }

        const courses = await Course.findAndCountAll({
            where: { program_id },
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                { model: User, as: 'Teacher', attributes: ['user_id', 'name'] },
                { model: Subject, as: 'Subject', attributes: ['subject_id', 'name'] },
                { model: CourseResult, attributes: ['result_id', 'average_score'] },
            ],
        });

        res.status(200).json({
            success: true,
            data: {
                program: {
                    program_id: program.program_id,
                    name: program.name,
                    description: program.description
                },
                totalItems: courses.count,
                totalPages: Math.ceil(courses.count / limit),
                currentPage: parseInt(page),
                courses: courses.rows,
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách courses theo program',
            error: error.message
        });
    }
};

exports.getCourseStatistics = async (req, res) => {
    try {
        const { id } = req.params;
        
        const course = await Course.findByPk(id, {
            include: [
                { model: User, as: 'Teacher', attributes: ['user_id', 'name'] },
                { model: Program, attributes: ['program_id', 'name'] },
                { model: Subject, as: 'Subject', attributes: ['subject_id', 'name'] }
            ]
        });

        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        // Get quiz statistics
        const quizzes = await Quiz.findAll({
            where: { course_id: id },
            include: [
                {
                    model: QuizResult,
                    as: 'QuizResults',
                    attributes: ['score', 'status']
                }
            ]
        });

        const quizStats = {
            total_quizzes: quizzes.length,
            total_attempts: quizzes.reduce((sum, quiz) => sum + quiz.QuizResults.length, 0),
            avg_score: 0,
            completion_rate: 0
        };

        if (quizStats.total_attempts > 0) {
            const totalScore = quizzes.reduce((sum, quiz) => 
                sum + quiz.QuizResults.reduce((qSum, result) => qSum + result.score, 0), 0);
            quizStats.avg_score = (totalScore / quizStats.total_attempts).toFixed(2);
            
            const completedAttempts = quizzes.reduce((sum, quiz) => 
                sum + quiz.QuizResults.filter(r => r.status === 'completed').length, 0);
            quizStats.completion_rate = ((completedAttempts / quizStats.total_attempts) * 100).toFixed(2);
        }

        // Get learning outcomes count
        const chapters = await Chapter.findAll({
            where: { course_id: id },
            include: [
                {
                    model: ChapterLO,
                    as: 'ChapterLOs',
                    include: [
                        {
                            model: LO,
                            as: 'LO',
                            attributes: ['lo_id', 'name']
                        }
                    ]
                }
            ]
        });

        const learningOutcomes = chapters.reduce((los, chapter) => {
            chapter.ChapterLOs.forEach(chapterLO => {
                if (chapterLO.LO && !los.find(lo => lo.lo_id === chapterLO.LO.lo_id)) {
                    los.push(chapterLO.LO);
                }
            });
            return los;
        }, []);

        const statistics = {
            course_id: id,
            course_name: course.name,
            teacher: course.Teacher ? course.Teacher.name : 'N/A',
            program: course.Program ? course.Program.name : 'N/A',
            quiz_statistics: quizStats,
            learning_outcomes: {
                total_chapters: chapters.length,
                total_learning_outcomes: learningOutcomes.length,
                outcomes_list: learningOutcomes
            },
            metadata: {
                generated_at: new Date(),
                course_credits: course.credits || 0,
                course_duration: course.duration || 'N/A'
            }
        };

        res.status(200).json({
            success: true,
            data: statistics
        });
    } catch (error) {
        console.error('Course statistics error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thống kê course',
            error: error.message
        });
    }
};

// ==================== NEW METHODS FOR SEMESTER AND CLONE FEATURES ====================

// Lấy courses theo học kỳ
exports.getCoursesBySemester = async (req, res) => {
    try {
        const { semester_id } = req.params;
        const { teacher_id, page = 1, limit = 10 } = req.query;

        const courses = await Course.getCoursesBySemester(semester_id, teacher_id);

        // Phân trang
        const offset = (page - 1) * limit;
        const paginatedCourses = courses.slice(offset, offset + parseInt(limit));

        res.status(200).json({
            success: true,
            data: {
                totalItems: courses.length,
                totalPages: Math.ceil(courses.length / limit),
                currentPage: parseInt(page),
                semester_id: parseInt(semester_id),
                courses: paginatedCourses
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách khóa học theo học kỳ',
            error: error.message
        });
    }
};

// Lấy courses của teacher trong học kỳ cụ thể
exports.getMyCoursesInSemester = async (req, res) => {
    try {
        const teacherId = req.user.user_id;
        const { semester_id } = req.params;

        const courses = await Course.getCoursesBySemester(semester_id, teacherId);

        res.status(200).json({
            success: true,
            data: {
                teacher_id: teacherId,
                semester_id: parseInt(semester_id),
                course_count: courses.length,
                courses: courses
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy khóa học của tôi trong học kỳ',
            error: error.message
        });
    }
};

// Tạo course từ assignment
exports.createCourseFromAssignment = async (req, res) => {
    try {
        const { assignment_id } = req.params;
        const teacherId = req.user.user_id;
        const { clone_from_course_id, ...courseData } = req.body;

        const result = await cloneCourseService.createCourseFromAssignment(
            assignment_id,
            courseData,
            teacherId,
            clone_from_course_id
        );

        res.status(201).json({
            success: true,
            message: 'Tạo khóa học từ phân công thành công',
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo khóa học từ phân công',
            error: error.message
        });
    }
};

// Gán khóa học đã có vào phân công
exports.assignCourseToAssignment = async (req, res) => {
    try {
        const { assignment_id } = req.params;
        const { course_id } = req.body;
        const userId = req.user.user_id;
        const userRole = req.user.role;

        if (!course_id) {
            return res.status(400).json({
                success: false,
                message: 'course_id là bắt buộc'
            });
        }

        const result = await cloneCourseService.assignCourseToAssignment(
            assignment_id,
            course_id,
            userId,
            userRole
        );

        res.status(200).json({
            success: true,
            message: 'Gán khóa học vào phân công thành công',
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi gán khóa học vào phân công',
            error: error.message
        });
    }
};

// Lấy danh sách courses có thể clone
exports.getClonableCourses = async (req, res) => {
    try {
        const teacherId = req.user.user_id;
        const { subject_id, semester_id, search } = req.query;

        const filters = {};
        if (subject_id) filters.subject_id = subject_id;
        if (semester_id) filters.semester_id = semester_id;
        if (search) filters.search = search;

        const courses = await cloneCourseService.getClonableCourses(teacherId, filters);

        res.status(200).json({
            success: true,
            data: {
                teacher_id: teacherId,
                filters: filters,
                course_count: courses.length,
                courses: courses
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách khóa học có thể clone',
            error: error.message
        });
    }
};

// Clone course
exports.cloneCourse = async (req, res) => {
    try {
        const { original_course_id } = req.params;
        const teacherId = req.user.user_id;
        const courseData = req.body;

        const result = await cloneCourseService.cloneCourse(
            original_course_id,
            courseData,
            teacherId
        );

        res.status(201).json({
            success: true,
            message: 'Clone khóa học thành công',
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi clone khóa học',
            error: error.message
        });
    }
};

// Đánh dấu course làm template
exports.setAsTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const teacherId = req.user.user_id;
        const { is_template = true } = req.body;

        const course = await cloneCourseService.setAsTemplate(id, teacherId, is_template);

        res.status(200).json({
            success: true,
            message: `${is_template ? 'Đánh dấu' : 'Bỏ đánh dấu'} course làm template thành công`,
            data: {
                course_id: course.course_id,
                name: course.name,
                is_template: course.is_template
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật trạng thái template',
            error: error.message
        });
    }
};

// Lấy thống kê clone của course
exports.getCloneStatistics = async (req, res) => {
    try {
        const { id } = req.params;

        const statistics = await cloneCourseService.getCloneStatistics(id);

        res.status(200).json({
            success: true,
            data: statistics
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thống kê clone',
            error: error.message
        });
    }
};