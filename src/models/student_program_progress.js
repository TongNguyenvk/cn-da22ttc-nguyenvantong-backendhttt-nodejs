'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class StudentProgramProgress extends Model {
        static associate(models) {
            // Quan hệ với User (Student)
            StudentProgramProgress.belongsTo(models.User, {
                foreignKey: 'user_id',
                as: 'Student'
            });

            // Quan hệ với Program
            StudentProgramProgress.belongsTo(models.Program, {
                foreignKey: 'program_id',
                as: 'Program'
            });
        }
    }

    StudentProgramProgress.init(
        {
            progress_id: {
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
            program_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Programs',
                    key: 'program_id',
                },
            },
            // Tiến độ tổng thể
            overall_progress: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    total_subjects: 0,
                    completed_subjects: 0,
                    in_progress_subjects: 0,
                    completion_percentage: 0,
                    gpa: 0,
                    credits_earned: 0,
                    total_credits_required: 0
                }
            },
            // Tiến độ theo PO (Program Outcomes)
            po_progress: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {},
                comment: 'Tiến độ theo từng PO: {po_id: {average_score, completion_rate, subjects_count}}'
            },
            // Tiến độ theo PLO (Program Learning Outcomes)
            plo_progress: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {},
                comment: 'Tiến độ theo từng PLO: {plo_id: {average_score, mastery_level, assessment_count}}'
            },
            // Phân tích theo thời gian
            semester_progress: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {},
                comment: 'Tiến độ theo học kỳ: {semester: {subjects, gpa, credits}}'
            },
            // Điểm mạnh và yếu
            strengths_weaknesses: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    strong_areas: [], // Các LO/PO có điểm cao
                    weak_areas: [],   // Các LO/PO cần cải thiện
                    improvement_suggestions: []
                }
            },
            // Dự đoán và khuyến nghị
            predictions: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    graduation_probability: 0,
                    expected_graduation_date: null,
                    at_risk_subjects: [],
                    recommended_actions: []
                }
            },
            // Thời gian cập nhật cuối
            last_updated: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            },
            // Trạng thái sinh viên
            student_status: {
                type: DataTypes.ENUM('active', 'on_leave', 'graduated', 'dropped_out'),
                allowNull: false,
                defaultValue: 'active'
            },
            // Ngày bắt đầu chương trình
            program_start_date: {
                type: DataTypes.DATE,
                allowNull: true
            },
            // Ngày dự kiến tốt nghiệp
            expected_graduation_date: {
                type: DataTypes.DATE,
                allowNull: true
            }
        },
        {
            sequelize,
            modelName: 'StudentProgramProgress',
            tableName: 'StudentProgramProgress',
            timestamps: false, // Tắt timestamps vì table không có created_at, updated_at
            indexes: [
                {
                    fields: ['user_id', 'program_id'],
                    unique: true
                },
                {
                    fields: ['program_id']
                },
                {
                    fields: ['student_status']
                },
                {
                    fields: ['last_updated']
                }
            ]
        }
    );

    return StudentProgramProgress;
};
