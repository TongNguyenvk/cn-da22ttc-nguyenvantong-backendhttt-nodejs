/**
 * Migration Controller for dual API support
 * Handles both old subject_id and new course_id based endpoints
 */

const MigrationService = require('../services/migrationService');
const { Quiz, Course, Subject } = require('../models');

class MigrationController {
    /**
     * Get quizzes with dual support for subject_id and course_id
     * GET /api/migration/quizzes?subject_id=1 OR ?course_id=1
     */
    static async getQuizzes(req, res) {
        try {
            const { subject_id, course_id, status, quiz_mode } = req.query;

            // Validate parameters
            if (!subject_id && !course_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Either subject_id or course_id is required'
                });
            }

            // Build query options
            const options = {};
            if (status) options.where = { ...options.where, status };
            if (quiz_mode) options.where = { ...options.where, quiz_mode };

            // Get quizzes using migration service
            const quizzes = await MigrationService.getQuizzes({ 
                subject_id: subject_id ? parseInt(subject_id) : null,
                course_id: course_id ? parseInt(course_id) : null,
                ...options
            });

            // Add metadata about the query
            const metadata = {
                query_type: course_id ? 'course_based' : 'subject_based',
                total_count: quizzes.length,
                deprecated_warning: subject_id ? 
                    'subject_id parameter is deprecated. Please use course_id instead.' : null
            };

            res.status(200).json({
                success: true,
                data: quizzes,
                metadata
            });

        } catch (error) {
            console.error('Error in getQuizzes:', error);
            res.status(500).json({
                success: false,
                message: 'Error retrieving quizzes',
                error: error.message
            });
        }
    }

    /**
     * Create quiz with dual support
     * POST /api/migration/quizzes
     */
    static async createQuiz(req, res) {
        try {
            const { subject_id, course_id, ...quizData } = req.body;

            // Validate required fields
            if (!subject_id && !course_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Either subject_id or course_id is required'
                });
            }

            if (!quizData.name || !quizData.duration) {
                return res.status(400).json({
                    success: false,
                    message: 'Quiz name and duration are required'
                });
            }

            // Create quiz using migration service
            const quiz = await MigrationService.createQuiz({
                subject_id: subject_id ? parseInt(subject_id) : null,
                course_id: course_id ? parseInt(course_id) : null,
                ...quizData
            });

            const metadata = {
                created_via: course_id ? 'course_id' : 'subject_id',
                actual_course_id: quiz.course_id,
                deprecated_warning: subject_id ? 
                    'Creating quizzes via subject_id is deprecated. Please use course_id instead.' : null
            };

            res.status(201).json({
                success: true,
                data: quiz,
                metadata
            });

        } catch (error) {
            console.error('Error in createQuiz:', error);
            res.status(500).json({
                success: false,
                message: 'Error creating quiz',
                error: error.message
            });
        }
    }

    /**
     * Validate quiz assignment (for grade column assignment)
     * POST /api/migration/validate-quiz-assignment
     */
    static async validateQuizAssignment(req, res) {
        try {
            const { quiz_id, course_id, subject_id } = req.body;

            if (!quiz_id) {
                return res.status(400).json({
                    success: false,
                    message: 'quiz_id is required'
                });
            }

            if (!course_id && !subject_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Either course_id or subject_id is required'
                });
            }

            const validation = await MigrationService.validateQuizAssignment({
                quiz_id: parseInt(quiz_id),
                course_id: course_id ? parseInt(course_id) : null,
                subject_id: subject_id ? parseInt(subject_id) : null
            });

            res.status(200).json({
                success: true,
                data: validation
            });

        } catch (error) {
            console.error('Error in validateQuizAssignment:', error);
            res.status(500).json({
                success: false,
                message: 'Error validating quiz assignment',
                error: error.message
            });
        }
    }

    /**
     * Get quiz statistics with dual support
     * GET /api/migration/quiz-statistics?subject_id=1 OR ?course_id=1
     */
    static async getQuizStatistics(req, res) {
        try {
            const { subject_id, course_id } = req.query;

            if (!subject_id && !course_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Either subject_id or course_id is required'
                });
            }

            const statistics = await MigrationService.getQuizStatistics({
                subject_id: subject_id ? parseInt(subject_id) : null,
                course_id: course_id ? parseInt(course_id) : null
            });

            const metadata = {
                query_type: course_id ? 'course_based' : 'subject_based',
                deprecated_warning: subject_id ? 
                    'subject_id parameter is deprecated. Please use course_id instead.' : null
            };

            res.status(200).json({
                success: true,
                data: statistics,
                metadata
            });

        } catch (error) {
            console.error('Error in getQuizStatistics:', error);
            res.status(500).json({
                success: false,
                message: 'Error retrieving quiz statistics',
                error: error.message
            });
        }
    }

    /**
     * Get courses by subject (for transition help)
     * GET /api/migration/subject/:subject_id/courses
     */
    static async getCoursesBySubject(req, res) {
        try {
            const { subject_id } = req.params;

            if (!subject_id) {
                return res.status(400).json({
                    success: false,
                    message: 'subject_id is required'
                });
            }

            const courses = await MigrationService.getCoursesBySubject(parseInt(subject_id));

            res.status(200).json({
                success: true,
                data: courses,
                metadata: {
                    subject_id: parseInt(subject_id),
                    course_count: courses.length,
                    migration_note: 'Use these course_ids for new API calls instead of subject_id'
                }
            });

        } catch (error) {
            console.error('Error in getCoursesBySubject:', error);
            res.status(500).json({
                success: false,
                message: 'Error retrieving courses by subject',
                error: error.message
            });
        }
    }

    /**
     * Get subjects by course (for new schema understanding)
     * GET /api/migration/course/:course_id/subjects
     */
    static async getSubjectsByCourse(req, res) {
        try {
            const { course_id } = req.params;

            if (!course_id) {
                return res.status(400).json({
                    success: false,
                    message: 'course_id is required'
                });
            }

            const subjects = await MigrationService.getSubjectsByCourse(parseInt(course_id));

            res.status(200).json({
                success: true,
                data: subjects,
                metadata: {
                    course_id: parseInt(course_id),
                    subject_count: subjects.length
                }
            });

        } catch (error) {
            console.error('Error in getSubjectsByCourse:', error);
            res.status(500).json({
                success: false,
                message: 'Error retrieving subjects by course',
                error: error.message
            });
        }
    }

    /**
     * Convert subject_id query to course_id format
     * GET /api/migration/convert-query?subject_id=1
     */
    static async convertQuery(req, res) {
        try {
            const converted = await MigrationService.migrateQueryParameters(req);

            res.status(200).json({
                success: true,
                data: converted,
                metadata: {
                    original_query: req.query,
                    migration_help: 'Use the returned course_id(s) in your new API calls'
                }
            });

        } catch (error) {
            console.error('Error in convertQuery:', error);
            res.status(500).json({
                success: false,
                message: 'Error converting query parameters',
                error: error.message
            });
        }
    }

    /**
     * Migration status and help
     * GET /api/migration/status
     */
    static async getMigrationStatus(req, res) {
        try {
            // Check database schema status - với quan hệ 1:Many đơn giản không cần SubjectCourse
            const subjectCoursesExist = false; // Sử dụng quan hệ 1:Many trực tiếp
            
            // Sample some data to show current state
            const sampleQuiz = await Quiz.findOne({
                include: [{
                    model: Course,
                    as: 'Course',
                    include: [{
                        model: Subject,
                        as: 'Subjects'
                    }]
                }]
            });

            const status = {
                schema_migrated: subjectCoursesExist,
                sample_quiz: sampleQuiz ? {
                    quiz_id: sampleQuiz.quiz_id,
                    course_id: sampleQuiz.course_id,
                    course_name: sampleQuiz.Course?.name,
                    subjects: sampleQuiz.Course?.Subjects?.map(s => ({
                        subject_id: s.subject_id,
                        name: s.name
                    }))
                } : null,
                migration_notes: {
                    database: subjectCoursesExist ? 'Schema migration completed' : 'Schema migration pending',
                    apis: 'Dual API support active - both subject_id and course_id work',
                    recommended: 'Start using course_id instead of subject_id in new code'
                }
            };

            res.status(200).json({
                success: true,
                data: status
            });

        } catch (error) {
            console.error('Error in getMigrationStatus:', error);
            res.status(500).json({
                success: false,
                message: 'Error retrieving migration status',
                error: error.message
            });
        }
    }
}

module.exports = MigrationController;
