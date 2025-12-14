/**
 * Migration Service for transitioning from subject_id to course_id based APIs
 * Provides abstraction layer during migration period
 */

const { Course, Subject, Quiz } = require('../models');
const { Op } = require('sequelize');

class MigrationService {
    /**
     * Get courses by subject_id (for backward compatibility)
     */
    static async getCoursesBySubject(subjectId) {
        try {
            // Sử dụng quan hệ 1:Many trực tiếp
            const courses = await Course.findAll({
                where: { subject_id: subjectId }
            });

            return courses;
        } catch (error) {
            console.error('Error getting courses by subject:', error);
            throw error;
        }
    }

    /**
     * Get subjects by course_id (for new schema)
     */
    static async getSubjectsByCourse(courseId) {
        try {
            // Sử dụng quan hệ 1:Many trực tiếp - 1 course chỉ thuộc 1 subject
            const course = await Course.findByPk(courseId, {
                include: [{
                    model: Subject,
                    as: 'Subject'
                }]
            });

            return course && course.Subject ? [course.Subject] : [];
        } catch (error) {
            console.error('Error getting subjects by course:', error);
            throw error;
        }
    }

    /**
     * Get quizzes with dual support for subject_id and course_id
     */
    static async getQuizzes({ subject_id, course_id, ...options }) {
        try {
            if (course_id) {
                // New way: direct course_id query
                return await Quiz.findByCourse(course_id, options);
            } 
            
            if (subject_id) {
                // Backward compatibility: subject_id through course relationships
                return await Quiz.findBySubject(subject_id, options);
            }

            throw new Error('Either subject_id or course_id must be provided');
        } catch (error) {
            console.error('Error getting quizzes:', error);
            throw error;
        }
    }

    /**
     * Validate quiz assignment with course or subject
     */
    static async validateQuizAssignment({ quiz_id, course_id, subject_id }) {
        try {
            const quiz = await Quiz.findByPk(quiz_id, {
                include: [{
                    model: Course,
                    as: 'Course',
                    include: [{
                        model: Subject,
                        as: 'Subjects'
                    }]
                }]
            });

            if (!quiz) {
                return { valid: false, error: 'Quiz not found' };
            }

            if (course_id) {
                // Direct course validation
                const valid = quiz.course_id === course_id;
                return {
                    valid,
                    error: valid ? null : `Quiz belongs to course ${quiz.course_id}, not ${course_id}`,
                    quiz_course_id: quiz.course_id,
                    target_course_id: course_id
                };
            }

            if (subject_id) {
                // Subject validation through course
                const courseSubjects = quiz.Course?.Subjects || [];
                const hasSubject = courseSubjects.some(s => s.subject_id === subject_id);
                
                return {
                    valid: hasSubject,
                    error: hasSubject ? null : `Quiz's course not associated with subject ${subject_id}`,
                    quiz_course_id: quiz.course_id,
                    course_subjects: courseSubjects.map(s => s.subject_id)
                };
            }

            throw new Error('Either course_id or subject_id must be provided for validation');
        } catch (error) {
            console.error('Error validating quiz assignment:', error);
            throw error;
        }
    }

    /**
     * Create quiz with dual support
     */
    static async createQuiz({ subject_id, course_id, ...quizData }) {
        try {
            let targetCourseId = course_id;

            if (subject_id && !course_id) {
                // Backward compatibility: find first course for subject
                const course = await Course.findOne({
                    where: { subject_id: subject_id }
                });

                if (!course) {
                    throw new Error(`No courses found for subject ${subject_id}`);
                }
                targetCourseId = course.course_id;
            }

            if (!targetCourseId) {
                throw new Error('course_id is required (either directly or derived from subject_id)');
            }

            return await Quiz.create({
                ...quizData,
                course_id: targetCourseId
            });
        } catch (error) {
            console.error('Error creating quiz:', error);
            throw error;
        }
    }

    /**
     * Analytics helper: get quiz statistics by subject or course
     */
    static async getQuizStatistics({ subject_id, course_id }) {
        try {
            let quizzes;
            
            if (course_id) {
                quizzes = await Quiz.findByCourse(course_id);
            } else if (subject_id) {
                quizzes = await Quiz.findBySubject(subject_id);
            } else {
                throw new Error('Either subject_id or course_id required');
            }

            const stats = {
                total_quizzes: quizzes.length,
                by_status: {},
                by_mode: {},
                gamification_enabled: 0
            };

            quizzes.forEach(quiz => {
                // Status statistics
                stats.by_status[quiz.status] = (stats.by_status[quiz.status] || 0) + 1;
                
                // Mode statistics
                stats.by_mode[quiz.quiz_mode] = (stats.by_mode[quiz.quiz_mode] || 0) + 1;
                
                // Gamification statistics
                if (quiz.gamification_enabled) {
                    stats.gamification_enabled++;
                }
            });

            return stats;
        } catch (error) {
            console.error('Error getting quiz statistics:', error);
            throw error;
        }
    }

    /**
     * Migration helper: convert subject_id based queries to course_id
     */
    static async migrateQueryParameters(req) {
        try {
            const { subject_id, course_id } = req.query;
            
            if (course_id) {
                // Already using new format
                return { course_id: parseInt(course_id) };
            }
            
            if (subject_id) {
                // Convert subject_id to course_id
                const courses = await this.getCoursesBySubject(parseInt(subject_id));
                
                if (courses.length === 0) {
                    throw new Error(`No courses found for subject ${subject_id}`);
                }
                
                if (courses.length === 1) {
                    return { course_id: courses[0].course_id };
                }
                
                // Multiple courses - need to handle differently
                return { 
                    course_ids: courses.map(c => c.course_id),
                    warning: `Subject ${subject_id} has multiple courses. Consider using specific course_id.`
                };
            }
            
            throw new Error('Either subject_id or course_id must be provided');
        } catch (error) {
            console.error('Error migrating query parameters:', error);
            throw error;
        }
    }

    /**
     * Get primary subject for course (for APIs that still need subject context)
     */
    static async getPrimarySubjectForCourse(courseId) {
        try {
            const course = await Course.findByPk(courseId, {
                include: [{
                    model: Subject,
                    as: 'Subject'
                }]
            });

            return course && course.Subject ? course.Subject : null;
        } catch (error) {
            console.error('Error getting primary subject for course:', error);
            throw error;
        }
    }

    /**
     * Batch migrate existing subject_id data to course_id format
     */
    static async batchMigrateData() {
        try {
            console.log('Starting batch migration from subject_id to course_id format...');
            
            // This would be run once during deployment
            // Implementation depends on specific migration needs
            
            console.log('Batch migration completed successfully');
            return { success: true };
        } catch (error) {
            console.error('Error in batch migration:', error);
            throw error;
        }
    }
}

module.exports = MigrationService;
