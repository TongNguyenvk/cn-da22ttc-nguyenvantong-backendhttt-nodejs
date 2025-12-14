'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Semester extends Model {
        static associate(models) {
            // Semester belongs to TrainingBatch
            Semester.belongsTo(models.TrainingBatch, {
                foreignKey: 'batch_id',
                as: 'TrainingBatch'
            });

            // Semester has many TeacherSubjectAssignments
            Semester.hasMany(models.TeacherSubjectAssignment, {
                foreignKey: 'semester_id',
                as: 'TeacherAssignments'
            });

            // Semester has many Courses
            Semester.hasMany(models.Course, {
                foreignKey: 'semester_id',
                as: 'Courses'
            });
        }

        // Static methods
        static async getActiveSemester() {
            return await this.findOne({
                where: { is_active: true }
            });
        }

        static async getCurrentSemester() {
            const now = new Date();
            return await this.findOne({
                where: {
                    start_date: { [sequelize.Sequelize.Op.lte]: now },
                    end_date: { [sequelize.Sequelize.Op.gte]: now }
                }
            });
        }

        static async setActiveSemester(semesterId) {
            const transaction = await sequelize.transaction();
            try {
                // Deactivate all semesters
                await this.update(
                    { is_active: false },
                    { where: {}, transaction }
                );

                // Activate the selected semester
                const result = await this.update(
                    { is_active: true },
                    { where: { semester_id: semesterId }, transaction }
                );

                await transaction.commit();
                return result;
            } catch (error) {
                await transaction.rollback();
                throw error;
            }
        }

        // Instance methods
        isCurrentSemester() {
            const now = new Date();
            return this.start_date <= now && this.end_date >= now;
        }

        getDisplayName() {
            return `${this.name} (${this.academic_year})`;
        }

        getDuration() {
            const start = new Date(this.start_date);
            const end = new Date(this.end_date);
            const diffTime = Math.abs(end - start);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays;
        }

        // Validation methods
        async validateDates() {
            if (this.start_date >= this.end_date) {
                throw new Error('Ngày bắt đầu phải nhỏ hơn ngày kết thúc');
            }

            // Check for overlapping semesters in the same academic year
            const overlapping = await this.constructor.findOne({
                where: {
                    semester_id: { [sequelize.Sequelize.Op.ne]: this.semester_id },
                    academic_year: this.academic_year,
                    [sequelize.Sequelize.Op.or]: [
                        {
                            start_date: {
                                [sequelize.Sequelize.Op.between]: [this.start_date, this.end_date]
                            }
                        },
                        {
                            end_date: {
                                [sequelize.Sequelize.Op.between]: [this.start_date, this.end_date]
                            }
                        },
                        {
                            [sequelize.Sequelize.Op.and]: [
                                { start_date: { [sequelize.Sequelize.Op.lte]: this.start_date } },
                                { end_date: { [sequelize.Sequelize.Op.gte]: this.end_date } }
                            ]
                        }
                    ]
                }
            });

            if (overlapping) {
                throw new Error(`Học kỳ bị trùng lặp với: ${overlapping.name}`);
            }
        }
    }

    Semester.init(
        {
            semester_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            name: {
                type: DataTypes.STRING(100),
                allowNull: false,
                validate: {
                    notEmpty: {
                        msg: 'Tên học kỳ không được để trống'
                    },
                    len: {
                        args: [1, 100],
                        msg: 'Tên học kỳ phải từ 1-100 ký tự'
                    }
                }
            },
            academic_year: {
                type: DataTypes.STRING(20),
                allowNull: false,
                validate: {
                    notEmpty: {
                        msg: 'Năm học không được để trống'
                    },
                    is: {
                        args: /^\d{4}-\d{4}$/,
                        msg: 'Năm học phải có định dạng YYYY-YYYY (vd: 2024-2025)'
                    }
                }
            },
            semester_number: {
                type: DataTypes.INTEGER,
                allowNull: false,
                validate: {
                    isIn: {
                        args: [[1, 2, 3]],
                        msg: 'Học kỳ phải là 1, 2, hoặc 3 (hè)'
                    }
                }
            },
            start_date: {
                type: DataTypes.DATEONLY,
                allowNull: false,
                validate: {
                    notNull: {
                        msg: 'Ngày bắt đầu không được để trống'
                    },
                    isDate: {
                        msg: 'Ngày bắt đầu phải là ngày hợp lệ'
                    }
                }
            },
            end_date: {
                type: DataTypes.DATEONLY,
                allowNull: false,
                validate: {
                    notNull: {
                        msg: 'Ngày kết thúc không được để trống'
                    },
                    isDate: {
                        msg: 'Ngày kết thúc phải là ngày hợp lệ'
                    }
                }
            },
            is_active: {
                type: DataTypes.BOOLEAN,
                defaultValue: false
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true
            }
        },
        {
            sequelize,
            modelName: 'Semester',
            tableName: 'Semesters',
            timestamps: true,
            underscored: true,
            hooks: {
                beforeSave: async (semester) => {
                    await semester.validateDates();
                }
            }
        }
    );

    return Semester;
};
