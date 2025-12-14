'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Quiz extends Model {
        static associate(models) {
            // NEW: Quiz belongs to Course directly
            Quiz.belongsTo(models.Course, { 
                foreignKey: 'course_id',
                as: 'Course'
            });

            // DEPRECATED: Remove Subject association (Quiz no longer directly belongs to Subject)
            // Quiz.belongsTo(models.Subject, { foreignKey: 'subject_id' });

            Quiz.belongsToMany(models.Question, { 
                through: models.QuizQuestion, 
                foreignKey: 'quiz_id',
                as: 'Questions'
            });
            Quiz.hasMany(models.QuizResult, { foreignKey: 'quiz_id' });

            // New relationships for gamification and analytics
            Quiz.hasMany(models.CourseGradeColumnQuiz, {
                foreignKey: 'quiz_id',
                as: 'GradeColumnAssignments'
            });
        }

        // Helper methods for new schema
        async getSubjects() {
            // Get subjects through course relationship
            const course = await this.getCourse({
                include: [{
                    model: this.sequelize.models.Subject,
                    as: 'Subjects',
                    through: { attributes: [] }
                }]
            });
            
            return course ? course.Subjects : [];
        }

        async getPrimarySubject() {
            // Get primary subject for this quiz's course - sử dụng quan hệ 1:Many trực tiếp
            const course = await this.getCourse({
                include: [{
                    model: this.sequelize.models.Subject,
                    as: 'Subject'
                }]
            });
            
            return course && course.Subject ? course.Subject : null;
        }

        async validateCourseAssignment(courseId) {
            // Validate that this quiz belongs to the specified course
            return this.course_id === courseId;
        }

        // Static methods for querying
        static async findByCourse(courseId, options = {}) {
            return await Quiz.findAll({
                where: { course_id: courseId },
                ...options
            });
        }

        static async findBySubject(subjectId, options = {}) {
            // Find quizzes by subject through direct course relationships
            const courses = await this.sequelize.models.Course.findAll({
                where: { subject_id: subjectId },
                attributes: ['course_id']
            });
            
            const courseIds = courses.map(c => c.course_id);

            if (courseIds.length === 0) {
                return [];
            }

            return await Quiz.findAll({
                where: { course_id: courseIds },
                include: [{
                    model: this.sequelize.models.Course,
                    as: 'Course',
                    include: [{
                        model: this.sequelize.models.Subject,
                        as: 'Subject',
                        where: { subject_id: subjectId }
                    }]
                }],
                ...options
            });
        }
    }

    Quiz.init(
        {
            quiz_id: {
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
                comment: 'Quiz belongs to course directly'
            },
            // REMOVED: subject_id (now accessed through course->subject relationship)
            name: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            duration: {
                type: DataTypes.INTEGER,
            },
            start_time: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            end_time: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            update_time: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            },
            status: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: 'pending',
                validate: {
                    isIn: [['pending', 'active', 'ended', 'finished']]
                }
            },
            pin: {
                type: DataTypes.STRING,
                allowNull: true,
                unique: true
            },
            current_question_index: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            },
            show_leaderboard: {
                type: DataTypes.BOOLEAN,
                defaultValue: false
            },
            adaptive_config: {
                type: DataTypes.JSON,
                allowNull: true,
                comment: 'Configuration for adaptive quiz generation'
            },
            quiz_mode: {
                type: DataTypes.ENUM('assessment', 'practice', 'code_practice'),
                allowNull: false,
                defaultValue: 'assessment',
                comment: 'Quiz mode: assessment (no gamification), practice (with gamification), or code_practice (code exercises)'
            },
            code_config: {
                type: DataTypes.JSONB,
                allowNull: true,
                comment: 'Configuration for code_practice mode: { allow_multiple_submissions, show_test_results, enable_ai_analysis, time_limit_per_question }'
            },
            gamification_enabled: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
                comment: 'Whether gamification features are enabled for this quiz'
            },
            avatar_system_enabled: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
                comment: 'Whether avatar system is enabled for this quiz'
            },
            level_progression_enabled: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
                comment: 'Whether level progression is enabled for this quiz'
            },
            real_time_leaderboard_enabled: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
                comment: 'Whether real-time leaderboard is enabled for this quiz'
            }
        },
        {
            sequelize,
            modelName: 'Quiz',
            tableName: 'Quizzes',
            timestamps: false
        }
    );

    return Quiz;
};