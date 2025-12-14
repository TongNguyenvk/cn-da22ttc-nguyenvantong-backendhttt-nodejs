'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Subject extends Model {
        static associate(models) {
            // Subject has many Courses (1:Many relationship)
            Subject.hasMany(models.Course, {
                foreignKey: 'subject_id',
                as: 'Courses'
            });

            // Keep other existing relationships
            Subject.belongsTo(models.TypeSubject, { foreignKey: 'type_id' });
            Subject.belongsTo(models.TypeOfKnowledge, { foreignKey: 'noidung_id' });
            // Quan hệ nhiều-nhiều với PLO thông qua bảng junction SubjectPLOs
            Subject.belongsToMany(models.PLO, { 
                through: models.SubjectPLO, 
                foreignKey: 'subject_id',
                otherKey: 'plo_id',
                as: 'PLOs'
            });

            // Quan hệ với Chapter
            Subject.hasMany(models.Chapter, { foreignKey: 'subject_id', as: 'Chapters' });

            // Direct relationship with LO
            Subject.hasMany(models.LO, { 
                foreignKey: 'subject_id',
                as: 'LearningOutcomes' 
            });

            // Quan hệ nhiều-nhiều với chính nó thông qua TienQuyet
            Subject.belongsToMany(models.Subject, {
                as: 'PrerequisiteSubjects',
                through: models.TienQuyet,
                foreignKey: 'subject_id',
                otherKey: 'prerequisite_subject_id',
            });

            // Many-to-Many with Programs via ProgramSubjects
            if (models.ProgramSubject) {
                Subject.belongsToMany(models.Program, {
                    through: models.ProgramSubject,
                    foreignKey: 'subject_id',
                    otherKey: 'program_id',
                    as: 'Programs'
                });
            }
        }

        // Helper methods
        async getCourses() {
            return await this.sequelize.models.Course.findAll({
                where: { subject_id: this.subject_id },
                include: [{
                    model: this.sequelize.models.Subject,
                    as: 'Subject'
                }]
            });
        }

        async getQuizzes() {
            // Get all quizzes from all courses in this subject
            const courses = await this.getCourses({
                include: [{
                    model: this.sequelize.models.Quiz,
                    as: 'Quizzes'
                }]
            });
            
            const allQuizzes = [];
            courses.forEach(course => {
                if (course.Quizzes) {
                    allQuizzes.push(...course.Quizzes);
                }
            });
            
            return allQuizzes;
        }
    }

    Subject.init(
        {
            subject_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            // KEEP: No direct course relationships in Subject
            type_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'TypeSubjects',
                    key: 'type_id',
                },
            },
            noidung_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'TypeOfKnowledges',
                    key: 'noidung_id',
                },
            },
            name: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            description: {
                type: DataTypes.TEXT,
            },
            created_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
            },
        },
        {
            sequelize,
            modelName: 'Subject',
            tableName: 'Subjects',
            timestamps: false, // Không sử dụng timestamps mặc định (createdAt, updatedAt)
        }
    );

    return Subject;
};