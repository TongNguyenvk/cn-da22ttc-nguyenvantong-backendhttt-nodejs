'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class LearningAnalytics extends Model {
        static associate(models) {
            // Quan hệ với Program
            LearningAnalytics.belongsTo(models.Program, {
                foreignKey: 'program_id',
                as: 'Program'
            });

            // Quan hệ với Subject (optional)
            LearningAnalytics.belongsTo(models.Subject, {
                foreignKey: 'subject_id',
                as: 'Subject'
            });

            // Quan hệ với User (analyzer)
            LearningAnalytics.belongsTo(models.User, {
                foreignKey: 'created_by',
                as: 'Analyzer'
            });
        }
    }

    LearningAnalytics.init(
        {
            analytics_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            program_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Programs',
                    key: 'program_id',
                },
            },
            subject_id: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: {
                    model: 'Subjects',
                    key: 'subject_id',
                },
                comment: 'Null nếu phân tích toàn chương trình'
            },
            // Loại phân tích
            analysis_type: {
                type: DataTypes.ENUM('program_overview', 'subject_analysis', 'student_cohort', 'temporal_analysis', 'comparative_analysis'),
                allowNull: false
            },
            // Phạm vi thời gian
            time_period: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {},
                comment: '{start_date, end_date, semester, academic_year}'
            },
            // Dữ liệu tổng quan
            overview_metrics: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    total_students: 0,
                    total_assessments: 0,
                    average_performance: 0,
                    completion_rate: 0,
                    engagement_score: 0
                }
            },
            // Phân tích theo PO/PLO
            outcome_analysis: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {},
                comment: 'Phân tích chi tiết theo từng PO/PLO'
            },
            // Phân tích theo Learning Outcomes
            lo_performance: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {},
                comment: 'Hiệu suất theo từng LO'
            },
            // Phân tích theo độ khó
            difficulty_distribution: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    easy: { count: 0, avg_score: 0, pass_rate: 0 },
                    medium: { count: 0, avg_score: 0, pass_rate: 0 },
                    hard: { count: 0, avg_score: 0, pass_rate: 0 }
                }
            },
            // Phân tích xu hướng thời gian
            temporal_trends: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {},
                comment: 'Xu hướng theo thời gian: weekly, monthly, semester'
            },
            // Phân tích nhóm sinh viên
            student_segmentation: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    high_performers: { count: 0, characteristics: [] },
                    average_performers: { count: 0, characteristics: [] },
                    at_risk_students: { count: 0, characteristics: [] },
                    improvement_needed: { count: 0, characteristics: [] }
                }
            },
            // Phân tích tương quan
            correlation_analysis: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {},
                comment: 'Tương quan giữa các yếu tố: LO-PO, difficulty-performance, time-score'
            },
            // Dự đoán và khuyến nghị
            predictive_insights: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    performance_predictions: {},
                    risk_assessments: {},
                    intervention_recommendations: [],
                    resource_optimization: {}
                }
            },
            // Benchmarking
            benchmark_comparisons: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    vs_previous_periods: {},
                    vs_other_programs: {},
                    vs_national_standards: {},
                    improvement_areas: []
                }
            },
            // Chất lượng dữ liệu
            data_quality: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    completeness_score: 0,
                    reliability_score: 0,
                    sample_size: 0,
                    confidence_intervals: {},
                    data_sources: []
                }
            },
            // Visualizations metadata
            visualization_config: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    charts_generated: [],
                    dashboard_layout: {},
                    export_formats: []
                }
            },
            // Trạng thái phân tích
            analysis_status: {
                type: DataTypes.ENUM('processing', 'completed', 'error', 'archived'),
                allowNull: false,
                defaultValue: 'processing'
            },
            // Metadata
            created_by: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Users',
                    key: 'user_id',
                }
            },
            processing_time: {
                type: DataTypes.INTEGER,
                allowNull: true,
                comment: 'Thời gian xử lý tính bằng milliseconds'
            },
            data_snapshot_date: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
                comment: 'Thời điểm snapshot dữ liệu để phân tích'
            },
            // Cấu hình phân tích
            analysis_config: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {},
                comment: 'Cấu hình parameters cho phân tích'
            },
            // Tags để phân loại
            tags: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: [],
                comment: 'Tags để dễ tìm kiếm và phân loại'
            },
            // Ghi chú
            notes: {
                type: DataTypes.TEXT,
                allowNull: true
            }
        },
        {
            sequelize,
            modelName: 'LearningAnalytics',
            tableName: 'LearningAnalytics',
            timestamps: true,
            indexes: [
                {
                    fields: ['program_id']
                },
                {
                    fields: ['subject_id']
                },
                {
                    fields: ['analysis_type']
                },
                {
                    fields: ['analysis_status']
                },
                {
                    fields: ['created_by']
                },
                {
                    fields: ['data_snapshot_date']
                },
                {
                    fields: ['createdAt']
                }
            ]
        }
    );

    return LearningAnalytics;
};
