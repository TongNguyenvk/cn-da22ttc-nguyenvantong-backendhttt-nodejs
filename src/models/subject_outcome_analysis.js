'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class SubjectOutcomeAnalysis extends Model {
        static associate(models) {
            // Quan hệ với Subject
            SubjectOutcomeAnalysis.belongsTo(models.Subject, {
                foreignKey: 'subject_id',
                as: 'Subject'
            });

            // Quan hệ với Program
            SubjectOutcomeAnalysis.belongsTo(models.Program, {
                foreignKey: 'program_id',
                as: 'Program'
            });
        }
    }

    SubjectOutcomeAnalysis.init(
        {
            analysis_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            subject_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Subjects',
                    key: 'subject_id',
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
            // Thống kê tổng quan môn học
            subject_statistics: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    total_students_enrolled: 0,
                    total_students_completed: 0,
                    completion_rate: 0,
                    average_score: 0,
                    pass_rate: 0,
                    dropout_rate: 0
                }
            },
            // Phân tích theo PO (Program Outcomes)
            po_achievement: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {},
                comment: 'Tỷ lệ đạt PO: {po_id: {target_score, actual_average, achievement_rate, student_count}}'
            },
            // Phân tích theo PLO (Program Learning Outcomes)
            plo_achievement: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {},
                comment: 'Tỷ lệ đạt PLO: {plo_id: {target_score, actual_average, achievement_rate, mastery_distribution}}'
            },
            // Phân tích theo Learning Outcomes của môn học
            lo_performance: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {},
                comment: 'Hiệu suất theo LO: {lo_id: {average_score, difficulty_level, question_count, correct_rate}}'
            },
            // Phân tích theo độ khó
            difficulty_analysis: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    easy: { question_count: 0, average_score: 0, pass_rate: 0 },
                    medium: { question_count: 0, average_score: 0, pass_rate: 0 },
                    hard: { question_count: 0, average_score: 0, pass_rate: 0 }
                }
            },
            // Xu hướng theo thời gian
            temporal_trends: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {},
                comment: 'Xu hướng theo thời gian: {period: {average_score, enrollment, completion_rate}}'
            },
            // Phân tích so sánh
            comparative_analysis: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    vs_program_average: 0,
                    vs_previous_semester: 0,
                    ranking_in_program: 0,
                    benchmark_comparison: {}
                }
            },
            // Khuyến nghị cải thiện
            improvement_recommendations: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    weak_areas: [],
                    suggested_interventions: [],
                    resource_recommendations: [],
                    teaching_method_suggestions: []
                }
            },
            // Dữ liệu chất lượng
            data_quality_metrics: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    sample_size: 0,
                    data_completeness: 0,
                    confidence_level: 0,
                    last_assessment_date: null
                }
            },
            // Kỳ học phân tích
            analysis_semester: {
                type: DataTypes.STRING,
                allowNull: false,
                comment: 'Ví dụ: 2024-1, 2024-2'
            },
            // Năm học
            academic_year: {
                type: DataTypes.STRING,
                allowNull: false,
                comment: 'Ví dụ: 2023-2024'
            },
            // Ngày tạo phân tích
            analysis_date: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            },
            // Trạng thái phân tích
            analysis_status: {
                type: DataTypes.ENUM('draft', 'completed', 'reviewed', 'approved'),
                allowNull: false,
                defaultValue: 'draft'
            },
            // Người thực hiện phân tích
            analyzed_by: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: {
                    model: 'Users',
                    key: 'user_id',
                },
                comment: 'ID của giảng viên hoặc admin thực hiện phân tích'
            }
        },
        {
            sequelize,
            modelName: 'SubjectOutcomeAnalysis',
            tableName: 'SubjectOutcomeAnalysis',
            timestamps: true,
            indexes: [
                {
                    fields: ['subject_id', 'analysis_semester', 'academic_year'],
                    unique: true
                },
                {
                    fields: ['program_id']
                },
                {
                    fields: ['analysis_semester']
                },
                {
                    fields: ['academic_year']
                },
                {
                    fields: ['analysis_status']
                },
                {
                    fields: ['analysis_date']
                }
            ]
        }
    );

    return SubjectOutcomeAnalysis;
};
