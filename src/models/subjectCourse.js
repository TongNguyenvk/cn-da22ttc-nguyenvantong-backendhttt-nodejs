'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class SubjectCourse extends Model {
        static associate(models) {
            // Association with Subject
            SubjectCourse.belongsTo(models.Subject, {
                foreignKey: 'subject_id',
                as: 'Subject'
            });

            // Association with Course
            SubjectCourse.belongsTo(models.Course, {
                foreignKey: 'course_id',
                as: 'Course'
            });
        }

        // Instance method to set this relationship as primary
        async setPrimary() {
            const transaction = await sequelize.transaction();
            
            try {
                // Set all other relationships for this course as non-primary
                await SubjectCourse.update(
                    { is_primary: false },
                    { 
                        where: { 
                            course_id: this.course_id,
                            subject_course_id: { [sequelize.Sequelize.Op.ne]: this.subject_course_id }
                        },
                        transaction
                    }
                );

                // Set this relationship as primary
                await this.update({ is_primary: true }, { transaction });
                
                await transaction.commit();
                return this;
            } catch (error) {
                await transaction.rollback();
                throw error;
            }
        }

        // Static method to create relationship
        static async createRelationship(subjectId, courseId, isPrimary = false) {
            const transaction = await sequelize.transaction();
            
            try {
                // Check if relationship already exists
                const existing = await SubjectCourse.findOne({
                    where: { subject_id: subjectId, course_id: courseId },
                    transaction
                });

                if (existing) {
                    if (isPrimary && !existing.is_primary) {
                        return await existing.setPrimary();
                    }
                    return existing;
                }

                // If setting as primary, make sure no other primary exists for this course
                if (isPrimary) {
                    await SubjectCourse.update(
                        { is_primary: false },
                        { 
                            where: { course_id: courseId },
                            transaction
                        }
                    );
                }

                // Create new relationship
                const relationship = await SubjectCourse.create({
                    subject_id: subjectId,
                    course_id: courseId,
                    is_primary: isPrimary
                }, { transaction });

                await transaction.commit();
                return relationship;
            } catch (error) {
                await transaction.rollback();
                throw error;
            }
        }

        // Get primary subject for a course
        static async getPrimarySubjectForCourse(courseId) {
            return await SubjectCourse.findOne({
                where: { 
                    course_id: courseId,
                    is_primary: true
                },
                include: [{
                    model: sequelize.models.Subject,
                    as: 'Subject'
                }]
            });
        }
    }

    SubjectCourse.init({
        subject_course_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        subject_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'Subjects',
                key: 'subject_id'
            }
        },
        course_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'Courses', 
                key: 'course_id'
            }
        },
        is_primary: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
            comment: 'Indicates if this is the primary subject for the course'
        },
        created_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        updated_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        }
    }, {
        sequelize,
        modelName: 'SubjectCourse',
        tableName: 'SubjectCourses',
        timestamps: false, // We handle timestamps manually
        indexes: [
            {
                unique: true,
                fields: ['subject_id', 'course_id']
            },
            {
                fields: ['subject_id']
            },
            {
                fields: ['course_id']
            },
            {
                fields: ['is_primary'],
                where: {
                    is_primary: true
                }
            }
        ]
    });

    return SubjectCourse;
};
