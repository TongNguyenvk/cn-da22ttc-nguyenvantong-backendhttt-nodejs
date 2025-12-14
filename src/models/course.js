'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Course extends Model {
        static associate(models) {
            Course.belongsTo(models.User, {
                foreignKey: 'user_id',
                as: 'Teacher'
            });
            Course.belongsTo(models.TrainingBatch, { foreignKey: 'batch_id' });
            Course.belongsToMany(models.User, {
                through: models.StudentCourse,
                foreignKey: 'course_id',
                as: 'Students'
            });
            
            // Course belongs to Subject (Many:1 relationship)
            Course.belongsTo(models.Subject, {
                foreignKey: 'subject_id',
                as: 'Subject'
            });

            // NEW: Course belongs to Semester
            Course.belongsTo(models.Semester, {
                foreignKey: 'semester_id',
                as: 'Semester'
            });

            // NEW: Course belongs to TeacherSubjectAssignment (optional)
            Course.belongsTo(models.TeacherSubjectAssignment, {
                foreignKey: 'assignment_id',
                as: 'Assignment'
            });

            // NEW: Course can be cloned from another course
            Course.belongsTo(models.Course, {
                foreignKey: 'original_course_id',
                as: 'OriginalCourse'
            });

            // NEW: Course can have many cloned courses
            Course.hasMany(models.Course, {
                foreignKey: 'original_course_id',
                as: 'ClonedCourses'
            });

            // Course has many Quizzes (1:Many relationship)
            Course.hasMany(models.Quiz, { 
                foreignKey: 'course_id',
                as: 'Quizzes'
            });

            Course.hasMany(models.CourseResult, { foreignKey: 'course_id' });

            // Quan hệ với các bảng mới cho tính năng cột điểm quá trình
            Course.hasMany(models.CourseGradeColumn, {
                foreignKey: 'course_id',
                as: 'GradeColumns'
            });
            Course.hasMany(models.CourseGradeResult, {
                foreignKey: 'course_id',
                as: 'GradeResults'
            });
        }

        // Static methods
        static async getCoursesBySemester(semesterId, teacherId = null) {
            const where = { semester_id: semesterId };
            if (teacherId) {
                where.user_id = teacherId;
            }

            return await this.findAll({
                where,
                include: [
                    { model: this.sequelize.models.User, as: 'Teacher', attributes: ['user_id', 'name'] },
                    { model: this.sequelize.models.Subject, as: 'Subject', attributes: ['subject_id', 'name'] },
                    { model: this.sequelize.models.Semester, as: 'Semester', attributes: ['semester_id', 'name'] }
                ],
                order: [['course_id', 'DESC']]
            });
        }

        static async getClonableCourses(teacherId = null) {
            const where = {
                [this.sequelize.Sequelize.Op.or]: [
                    { is_template: true },
                    { user_id: teacherId } // Teacher can clone their own courses
                ]
            };

            return await this.findAll({
                where,
                include: [
                    { model: this.sequelize.models.User, as: 'Teacher', attributes: ['user_id', 'name'] },
                    { model: this.sequelize.models.Subject, as: 'Subject', attributes: ['subject_id', 'name'] },
                    { model: this.sequelize.models.Semester, as: 'Semester', attributes: ['semester_id', 'name'] },
                    {
                        model: this.sequelize.models.Quiz,
                        as: 'Quizzes',
                        attributes: ['quiz_id', 'name'],
                        include: [{
                            model: this.sequelize.models.Question,
                            attributes: ['question_id'],
                            through: { attributes: [] }
                        }]
                    }
                ],
                order: [['course_id', 'DESC']]
            });
        }

        static async createFromAssignment(assignmentId, courseData, teacherId) {
            const assignment = await this.sequelize.models.TeacherSubjectAssignment.findByPk(assignmentId, {
                include: [
                    { model: this.sequelize.models.Subject, as: 'Subject' },
                    { model: this.sequelize.models.Semester, as: 'Semester' }
                ]
            });

            if (!assignment) {
                throw new Error('Phân công không tồn tại');
            }

            if (assignment.teacher_id !== teacherId) {
                throw new Error('Bạn không có quyền tạo khóa học từ phân công này');
            }

            if (!assignment.is_active) {
                throw new Error('Phân công không còn hoạt động');
            }

            // Create course with assignment data
            const course = await this.create({
                ...courseData,
                user_id: teacherId,
                subject_id: assignment.subject_id,
                semester_id: assignment.semester_id,
                assignment_id: assignmentId,
                batch_id: courseData.batch_id // This should be provided
            });

            return await this.findByPk(course.course_id, {
                include: [
                    { model: this.sequelize.models.User, as: 'Teacher', attributes: ['user_id', 'name'] },
                    { model: this.sequelize.models.Subject, as: 'Subject', attributes: ['subject_id', 'name'] },
                    { model: this.sequelize.models.Semester, as: 'Semester', attributes: ['semester_id', 'name'] },
                    { model: this.sequelize.models.TeacherSubjectAssignment, as: 'Assignment' }
                ]
            });
        }

        // Helper methods
        async getSubject() {
            return await this.getSubject();
        }

        async getQuizzes(options = {}) {
            return await this.getQuizzes(options);
        }
    }

    Course.init(
        {
            course_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            user_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Users',
                    key: 'user_id',
                },
            },
            name: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            description: {
                type: DataTypes.TEXT,
            },
            batch_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'TrainingBatches',
                    key: 'batch_id',
                },
            },
            subject_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Subjects',
                    key: 'subject_id',
                },
                comment: 'Course belongs to a Subject'
            },
            semester_id: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: {
                    model: 'Semesters',
                    key: 'semester_id',
                },
                comment: 'Course belongs to a Semester'
            },
            assignment_id: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: {
                    model: 'TeacherSubjectAssignments',
                    key: 'assignment_id',
                },
                comment: 'Course created from TeacherSubjectAssignment'
            },
            original_course_id: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: {
                    model: 'Courses',
                    key: 'course_id',
                },
                comment: 'Original course if this is a cloned course'
            },
            is_template: {
                type: DataTypes.BOOLEAN,
                defaultValue: false,
                comment: 'Whether this course can be used as a template for cloning'
            },
            grade_config: {
                type: DataTypes.JSONB,
                allowNull: true,
                defaultValue: {
                    final_exam_weight: 50,
                    process_weight: 50
                },
                comment: 'Cấu hình tỷ lệ điểm: final_exam_weight (%) và process_weight (%)'
            },
        },
        {
            sequelize,
            modelName: 'Course',
            tableName: 'Courses',
        }
    );

    return Course;
};