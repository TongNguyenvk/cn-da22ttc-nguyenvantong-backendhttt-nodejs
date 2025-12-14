'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class UserCodeExerciseTracking extends Model {
        static associate(models) {
            UserCodeExerciseTracking.belongsTo(models.User, {
                foreignKey: 'user_id',
                as: 'User'
            });
            UserCodeExerciseTracking.belongsTo(models.Question, {
                foreignKey: 'question_id',
                as: 'Question'
            });
            UserCodeExerciseTracking.belongsTo(models.Quiz, {
                foreignKey: 'quiz_id',
                as: 'Quiz'
            });
            UserCodeExerciseTracking.belongsTo(models.Subject, {
                foreignKey: 'subject_id',
                as: 'Subject'
            });
        }

        /**
         * Get tracking for user, question and quiz
         */
        static async getTracking(userId, questionId, quizId = null) {
            const where = { user_id: userId, question_id: questionId };
            if (quizId) {
                where.quiz_id = quizId;
            }
            return await this.findOne({ where });
        }

        /**
         * Get or create tracking
         */
        static async getOrCreate(userId, questionId, quizId, subjectId) {
            const [tracking, created] = await this.findOrCreate({
                where: { user_id: userId, question_id: questionId, quiz_id: quizId },
                defaults: {
                    user_id: userId,
                    question_id: questionId,
                    quiz_id: quizId,
                    subject_id: subjectId,
                    test_case_performance: {
                        total_test_cases: 0,
                        passed_test_cases: 0,
                        pass_rate: 0,
                        test_cases: {}
                    },
                    submission_history: {
                        total_submissions: 0,
                        successful_submissions: 0,
                        first_submission_date: null,
                        last_submission_date: null,
                        submissions: []
                    },
                    test_run_history: {
                        total_test_runs: 0,
                        average_test_runs_before_submit: 0,
                        runs: []
                    },
                    learning_progress: {
                        mastery_level: 'beginner',
                        improvement_trend: 'stable',
                        stuck_test_cases: [],
                        mastered_test_cases: [],
                        time_to_first_pass: null,
                        time_to_all_pass: null
                    }
                }
            });
            return tracking;
        }
    }

    UserCodeExerciseTracking.init(
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
                }
            },
            question_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Questions',
                    key: 'question_id',
                }
            },
            quiz_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Quizzes',
                    key: 'quiz_id',
                }
            },
            subject_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Subjects',
                    key: 'subject_id',
                }
            },
            test_case_performance: {
                type: DataTypes.JSONB,
                allowNull: false,
                defaultValue: {
                    total_test_cases: 0,
                    passed_test_cases: 0,
                    pass_rate: 0,
                    test_cases: {}
                }
            },
            submission_history: {
                type: DataTypes.JSONB,
                allowNull: false,
                defaultValue: {
                    total_submissions: 0,
                    successful_submissions: 0,
                    first_submission_date: null,
                    last_submission_date: null,
                    submissions: []
                }
            },
            test_run_history: {
                type: DataTypes.JSONB,
                allowNull: false,
                defaultValue: {
                    total_test_runs: 0,
                    average_test_runs_before_submit: 0,
                    runs: []
                }
            },
            learning_progress: {
                type: DataTypes.JSONB,
                allowNull: false,
                defaultValue: {
                    mastery_level: 'beginner',
                    improvement_trend: 'stable',
                    stuck_test_cases: [],
                    mastered_test_cases: [],
                    time_to_first_pass: null,
                    time_to_all_pass: null
                }
            },
            created_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            },
            update_time: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            }
        },
        {
            sequelize,
            modelName: 'UserCodeExerciseTracking',
            tableName: 'UserCodeExerciseTrackings',
            timestamps: false
        }
    );

    return UserCodeExerciseTracking;
};
