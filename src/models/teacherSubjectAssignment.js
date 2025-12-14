'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class TeacherSubjectAssignment extends Model {
        static associate(models) {
            // Assignment belongs to Teacher (User)
            TeacherSubjectAssignment.belongsTo(models.User, {
                foreignKey: 'teacher_id',
                as: 'Teacher'
            });

            // Assignment belongs to Subject
            TeacherSubjectAssignment.belongsTo(models.Subject, {
                foreignKey: 'subject_id',
                as: 'Subject'
            });

            // Assignment belongs to Semester
            TeacherSubjectAssignment.belongsTo(models.Semester, {
                foreignKey: 'semester_id',
                as: 'Semester'
            });

            // Assignment belongs to TrainingBatch
            TeacherSubjectAssignment.belongsTo(models.TrainingBatch, {
                foreignKey: 'batch_id',
                as: 'TrainingBatch'
            });

            // Assignment belongs to Admin (User who assigned)
            TeacherSubjectAssignment.belongsTo(models.User, {
                foreignKey: 'assigned_by',
                as: 'AssignedBy'
            });

            // Assignment can have many Courses created from it
            TeacherSubjectAssignment.hasMany(models.Course, {
                foreignKey: 'assignment_id',
                as: 'Courses'
            });
        }

        // Static methods
        static async getTeacherAssignments(teacherId, semesterId = null) {
            const where = {
                teacher_id: teacherId,
                is_active: true
            };

            if (semesterId) {
                where.semester_id = semesterId;
            }

            return await this.findAll({
                where,
                include: [
                    {
                        model: this.sequelize.models.Subject,
                        as: 'Subject',
                        attributes: ['subject_id', 'name', 'description'],
                        include: [
                            {
                                model: this.sequelize.models.Program,
                                as: 'Programs',
                                attributes: ['program_id', 'name'],
                                through: { attributes: [] },
                                required: false
                            }
                        ]
                    },
                    {
                        model: this.sequelize.models.Semester,
                        as: 'Semester',
                        attributes: ['semester_id', 'name', 'academic_year']
                    }
                ],
                order: [['assigned_at', 'DESC']]
            });
        }

        static async getSubjectAssignments(subjectId, semesterId = null) {
            const where = {
                subject_id: subjectId,
                is_active: true
            };

            if (semesterId) {
                where.semester_id = semesterId;
            }

            return await this.findAll({
                where,
                include: [
                    {
                        model: this.sequelize.models.User,
                        as: 'Teacher',
                        attributes: ['user_id', 'name', 'email']
                    },
                    {
                        model: this.sequelize.models.Semester,
                        as: 'Semester',
                        attributes: ['semester_id', 'name', 'academic_year']
                    }
                ]
            });
        }

        static async validateAssignment(teacherId, subjectId, semesterId) {
            // Kiểm tra xem teacher có phải là giáo viên không
            const teacher = await this.sequelize.models.User.findByPk(teacherId, {
                include: [{
                    model: this.sequelize.models.Role,
                    attributes: ['name']
                }]
            });

            if (!teacher || teacher.Role.name !== 'teacher') {
                throw new Error('User không phải là giáo viên');
            }

            // Kiểm tra subject có tồn tại không
            const subject = await this.sequelize.models.Subject.findByPk(subjectId);
            if (!subject) {
                throw new Error('Môn học không tồn tại');
            }

            // Kiểm tra semester có tồn tại không
            const semester = await this.sequelize.models.Semester.findByPk(semesterId);
            if (!semester) {
                throw new Error('Học kỳ không tồn tại');
            }

            // Kiểm tra đã có phân công này chưa
            const existingAssignment = await this.findOne({
                where: {
                    teacher_id: teacherId,
                    subject_id: subjectId,
                    semester_id: semesterId,
                    is_active: true
                }
            });

            if (existingAssignment) {
                throw new Error('Giáo viên đã được phân công môn học này trong học kỳ');
            }

            return { teacher, subject, semester };
        }

        static async assignTeacher(assignmentData, assignedByUserId) {
            const { teacher_id, subject_id, semester_id, note, workload_hours } = assignmentData;

            // Validate assignment
            await this.validateAssignment(teacher_id, subject_id, semester_id);

            // Create assignment
            const assignment = await this.create({
                teacher_id,
                subject_id,
                semester_id,
                assigned_by: assignedByUserId,
                note,
                workload_hours,
                assigned_at: new Date()
            });

            return await this.findByPk(assignment.assignment_id, {
                include: [
                    { model: this.sequelize.models.User, as: 'Teacher', attributes: ['user_id', 'name', 'email'] },
                    { model: this.sequelize.models.Subject, as: 'Subject', attributes: ['subject_id', 'name'] },
                    { model: this.sequelize.models.Semester, as: 'Semester', attributes: ['semester_id', 'name'] }
                ]
            });
        }

        static async getAssignmentsBySemester(semesterId) {
            return await this.findAll({
                where: {
                    semester_id: semesterId,
                    is_active: true
                },
                include: [
                    {
                        model: this.sequelize.models.User,
                        as: 'Teacher',
                        attributes: ['user_id', 'name', 'email']
                    },
                    {
                        model: this.sequelize.models.Subject,
                        as: 'Subject',
                        attributes: ['subject_id', 'name', 'description']
                    },
                    {
                        model: this.sequelize.models.User,
                        as: 'AssignedBy',
                        attributes: ['user_id', 'name']
                    }
                ],
                order: [['assigned_at', 'DESC']]
            });
        }

        // Instance methods
        async deactivate() {
            this.is_active = false;
            return await this.save();
        }

        async updateWorkload(hours) {
            this.workload_hours = hours;
            return await this.save();
        }

        async addNote(note) {
            this.note = note;
            return await this.save();
        }

        // Check if teacher can create course from this assignment
        canCreateCourse() {
            return this.is_active && this.Semester && this.Semester.isCurrentSemester();
        }

        getDisplayInfo() {
            return {
                assignment_id: this.assignment_id,
                teacher_name: this.Teacher?.name,
                subject_name: this.Subject?.name,
                semester_name: this.Semester?.getDisplayName(),
                assigned_at: this.assigned_at,
                workload_hours: this.workload_hours,
                is_active: this.is_active
            };
        }
    }

    TeacherSubjectAssignment.init(
        {
            assignment_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            teacher_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                validate: {
                    notNull: {
                        msg: 'ID giáo viên không được để trống'
                    }
                }
            },
            subject_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                validate: {
                    notNull: {
                        msg: 'ID môn học không được để trống'
                    }
                }
            },
            semester_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                validate: {
                    notNull: {
                        msg: 'ID học kỳ không được để trống'
                    }
                }
            },
            assigned_by: {
                type: DataTypes.INTEGER,
                allowNull: false,
                validate: {
                    notNull: {
                        msg: 'ID người phân công không được để trống'
                    }
                }
            },
            assigned_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            },
            is_active: {
                type: DataTypes.BOOLEAN,
                defaultValue: true
            },
            note: {
                type: DataTypes.TEXT,
                allowNull: true
            },
            workload_hours: {
                type: DataTypes.INTEGER,
                allowNull: true,
                validate: {
                    isValidHours(value) {
                        if (value !== null && value !== undefined) {
                            if (value < 0) {
                                throw new Error('Số giờ giảng dạy phải >= 0');
                            }
                            if (value > 1000) {
                                throw new Error('Số giờ giảng dạy không được vượt quá 1000');
                            }
                        }
                    }
                }
            }
        },
        {
            sequelize,
            modelName: 'TeacherSubjectAssignment',
            tableName: 'TeacherSubjectAssignments',
            timestamps: true,
            underscored: true,
            indexes: [
                {
                    unique: true,
                    fields: ['teacher_id', 'subject_id', 'semester_id'],
                    name: 'unique_teacher_subject_semester'
                }
            ]
        }
    );

    return TeacherSubjectAssignment;
};
