'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class ProgramOutcomeTracking extends Model {
        static associate(models) {
            // Quan hệ với User (Student)
            ProgramOutcomeTracking.belongsTo(models.User, {
                foreignKey: 'user_id',
                as: 'Student'
            });

            // Quan hệ với Program
            ProgramOutcomeTracking.belongsTo(models.Program, {
                foreignKey: 'program_id',
                as: 'Program'
            });

            // Quan hệ với PO
            ProgramOutcomeTracking.belongsTo(models.PO, {
                foreignKey: 'po_id',
                as: 'PO'
            });

            // Quan hệ với PLO
            ProgramOutcomeTracking.belongsTo(models.PLO, {
                foreignKey: 'plo_id',
                as: 'PLO'
            });
        }
    }

    ProgramOutcomeTracking.init(
        {
            tracking_id: {
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
            po_id: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: {
                    model: 'POs',
                    key: 'po_id',
                },
                comment: 'Null nếu tracking PLO'
            },
            plo_id: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: {
                    model: 'PLOs',
                    key: 'plo_id',
                },
                comment: 'Null nếu tracking PO'
            },
            // Loại outcome đang track
            outcome_type: {
                type: DataTypes.ENUM('PO', 'PLO'),
                allowNull: false
            },
            // Điểm số hiện tại
            current_score: {
                type: DataTypes.FLOAT,
                allowNull: false,
                defaultValue: 0,
                validate: {
                    min: 0,
                    max: 100
                }
            },
            // Điểm mục tiêu
            target_score: {
                type: DataTypes.FLOAT,
                allowNull: false,
                defaultValue: 70,
                validate: {
                    min: 0,
                    max: 100
                }
            },
            // Trạng thái đạt được
            achievement_status: {
                type: DataTypes.ENUM('not_started', 'in_progress', 'achieved', 'exceeded', 'at_risk'),
                allowNull: false,
                defaultValue: 'not_started'
            },
            // Lịch sử điểm số theo thời gian
            score_history: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: [],
                comment: 'Array of {date, score, source_subject_id, assessment_type}'
            },
            // Phân tích chi tiết
            detailed_analysis: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    contributing_subjects: {},  // {subject_id: {score, weight, contribution}}
                    assessment_breakdown: {},   // {assessment_type: {count, average_score}}
                    improvement_trend: 0,       // Xu hướng cải thiện (positive/negative)
                    consistency_score: 0        // Độ ổn định trong các đánh giá
                }
            },
            // Dự đoán và khuyến nghị
            predictions: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    predicted_final_score: 0,
                    probability_of_achievement: 0,
                    estimated_completion_date: null,
                    risk_factors: [],
                    recommended_interventions: []
                }
            },
            // Milestone tracking
            milestones: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    checkpoints: [],  // {date, expected_score, actual_score, status}
                    next_milestone: null,
                    completion_percentage: 0
                }
            },
            // Metadata
            evidence_count: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
                comment: 'Số lượng bằng chứng đánh giá'
            },
            last_assessment_date: {
                type: DataTypes.DATE,
                allowNull: true
            },
            first_assessment_date: {
                type: DataTypes.DATE,
                allowNull: true
            },
            // Trọng số trong chương trình
            program_weight: {
                type: DataTypes.FLOAT,
                allowNull: false,
                defaultValue: 1.0,
                comment: 'Trọng số của PO/PLO này trong chương trình'
            },
            // Ghi chú và nhận xét
            notes: {
                type: DataTypes.TEXT,
                allowNull: true
            },
            // Trạng thái active
            is_active: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true
            },
            // Thời gian cập nhật cuối
            last_updated: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            }
        },
        {
            sequelize,
            modelName: 'ProgramOutcomeTracking',
            tableName: 'ProgramOutcomeTracking',
            timestamps: true,
            indexes: [
                {
                    fields: ['user_id', 'program_id', 'po_id', 'plo_id'],
                    unique: true,
                    where: {
                        is_active: true
                    }
                },
                {
                    fields: ['user_id', 'program_id']
                },
                {
                    fields: ['outcome_type']
                },
                {
                    fields: ['achievement_status']
                },
                {
                    fields: ['last_assessment_date']
                },
                {
                    fields: ['is_active']
                }
            ]
        }
    );

    return ProgramOutcomeTracking;
};
