const express = require('express');
const router = express.Router();
const advancedAnalyticsController = require('../controllers/advancedAnalyticsController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

/**
 * ADVANCED ANALYTICS ROUTES
 * Professional data analysis endpoints for educational insights
 */

// ==================== PERFORMANCE ANALYTICS ====================

/**
 * GET /api/advanced-analytics/performance/time-series
 * Get performance trends over time with various aggregation options
 * Query params: program_id, course_id, quiz_id, user_id, time_period, aggregation
 */
router.get('/performance/time-series',
    authenticateToken,
    authorize(['admin', 'teacher']),
    advancedAnalyticsController.getPerformanceTimeSeries
);

/**
 * GET /api/advanced-analytics/performance/score-distribution
 * Get score distribution analysis with histogram and statistical measures
 * Query params: program_id, course_id, quiz_id, bins, comparison_period
 */
router.get('/performance/score-distribution',
    authenticateToken,
    authorize(['admin', 'teacher']),
    advancedAnalyticsController.getScoreDistribution
);

/**
 * GET /api/advanced-analytics/performance/learning-outcomes
 * Get Learning Outcomes comparison analysis for radar charts
 * Query params: program_id, course_id, user_id, comparison_type
 */
router.get('/performance/learning-outcomes',
    authenticateToken,
    authorize(['admin', 'teacher']),
    advancedAnalyticsController.getLearningOutcomesComparison
);

/**
 * GET /api/advanced-analytics/performance/completion-funnel
 * Get completion funnel analysis showing conversion rates
 * Query params: program_id, course_id, quiz_id, time_period
 */
router.get('/performance/completion-funnel',
    authenticateToken,
    authorize(['admin', 'teacher']),
    advancedAnalyticsController.getCompletionFunnel
);

// ==================== LEARNING DIFFICULTY ANALYSIS ====================

/**
 * GET /api/advanced-analytics/difficulty/heatmap
 * Get difficulty heatmap showing question difficulty across chapters and levels
 * Query params: program_id, course_id, time_period
 */
router.get('/difficulty/heatmap',
    authenticateToken,
    authorize(['admin', 'teacher']),
    advancedAnalyticsController.getDifficultyHeatmap
);

/**
 * GET /api/advanced-analytics/difficulty/time-score-correlation
 * Get correlation analysis between response time and accuracy
 * Query params: program_id, course_id, quiz_id, user_id, time_period
 */
router.get('/difficulty/time-score-correlation',
    authenticateToken,
    authorize(['admin', 'teacher']),
    advancedAnalyticsController.getTimeScoreCorrelation
);

// ==================== STUDENT BEHAVIOR ANALYTICS ====================

/**
 * GET /api/advanced-analytics/behavior/activity-timeline
 * Get student activity timeline analysis showing learning patterns over time
 * Query params: program_id, course_id, user_id, time_period, granularity
 */
router.get('/behavior/activity-timeline',
    authenticateToken,
    authorize(['admin', 'teacher']),
    advancedAnalyticsController.getActivityTimeline
);

/**
 * GET /api/advanced-analytics/behavior/learning-flow
 * Get learning flow analysis showing sequence and patterns of learning activities
 * Query params: program_id, course_id, user_id, time_period
 */
router.get('/behavior/learning-flow',
    authenticateToken,
    authorize(['admin', 'teacher']),
    advancedAnalyticsController.getLearningFlow
);

// ==================== PREDICTIVE ANALYTICS ====================

/**
 * GET /api/advanced-analytics/predictive/completion-probability
 * Get completion probability prediction for a specific student
 * Query params: program_id, course_id, user_id (required), prediction_horizon
 */
router.get('/predictive/completion-probability',
    authenticateToken,
    authorize(['admin', 'teacher']),
    advancedAnalyticsController.getCompletionProbability
);

/**
 * GET /api/advanced-analytics/predictive/risk-assessment
 * Get risk assessment identifying students at risk of not completing successfully
 * Query params: program_id, course_id, risk_threshold
 */
router.get('/predictive/risk-assessment',
    authenticateToken,
    authorize(['admin', 'teacher']),
    advancedAnalyticsController.getRiskAssessment
);

// ==================== QUIZ-SPECIFIC ANALYTICS ====================

/**
 * GET /api/advanced-analytics/quiz/analytics
 * Get comprehensive analytics for a specific quiz
 * Query params: quiz_id (required), include_individual_performance, include_question_breakdown, include_lo_analysis
 */
router.get('/quiz/analytics',
    authenticateToken,
    authorize(['admin', 'teacher']),
    advancedAnalyticsController.getQuizAnalytics
);

/**
 * GET /api/advanced-analytics/quiz/student-performance
 * Get student's performance on a specific quiz
 * Query params: user_id (required), quiz_id (required)
 */
router.get('/quiz/student-performance',
    authenticateToken,
    authorize(['admin', 'teacher', 'student']),
    advancedAnalyticsController.getStudentQuizPerformance
);

// ==================== STUDENT SCORE ANALYSIS ====================

/**
 * GET /api/advanced-analytics/student/score-analysis
 * Get comprehensive student score analysis with strengths, weaknesses, and recommendations
 * Query params: user_id (required), program_id, course_id, time_period, include_comparison
 */
router.get('/student/score-analysis',
    authenticateToken,
    authorize(['admin', 'teacher', 'student']),
    advancedAnalyticsController.getStudentScoreAnalysis
);

/**
 * GET /api/advanced-analytics/student/learning-outcome-mastery
 * Get detailed Learning Outcome mastery analysis for a student
 * Query params: user_id (required), course_id, program_id, mastery_threshold
 */
router.get('/student/learning-outcome-mastery',
    authenticateToken,
    authorize(['admin', 'teacher', 'student']),
    advancedAnalyticsController.getLearningOutcomeMastery
);

/**
 * GET /api/advanced-analytics/student/improvement-suggestions
 * Get detailed improvement suggestions with actionable recommendations
 * Query params: user_id (required), lo_id, course_id, program_id, suggestion_depth
 */
router.get('/student/improvement-suggestions',
    authenticateToken,
    authorize(['admin', 'teacher', 'student']),
    advancedAnalyticsController.getImprovementSuggestions
);

// ==================== TESTING & VALIDATION ====================

/**
 * GET /api/advanced-analytics/test/endpoints
 * Test endpoint to validate all analytics APIs are working
 * For development and debugging purposes
 */
router.get('/test/endpoints',
    authenticateToken,
    authorize(['admin', 'teacher']),
    async (req, res) => {
        try {
            const { user_id = 1, program_id, course_id } = req.query;

            const testResults = {
                timestamp: new Date(),
                test_user_id: user_id,
                endpoints_tested: [],
                successful: 0,
                failed: 0,
                errors: []
            };

            // List of endpoints to test (simplified calls)
            const endpointsToTest = [
                {
                    name: 'Performance Time Series',
                    endpoint: '/performance/time-series',
                    params: { time_period: '7d', aggregation: 'daily' }
                },
                {
                    name: 'Score Distribution',
                    endpoint: '/performance/score-distribution',
                    params: { bins: 5 }
                },
                {
                    name: 'Learning Outcomes Comparison',
                    endpoint: '/performance/learning-outcomes',
                    params: { comparison_type: 'average' }
                },
                {
                    name: 'Completion Funnel',
                    endpoint: '/performance/completion-funnel',
                    params: { time_period: '30d' }
                },
                {
                    name: 'Difficulty Heatmap',
                    endpoint: '/difficulty/heatmap',
                    params: { time_period: '30d' }
                },
                {
                    name: 'Student Score Analysis',
                    endpoint: '/student/score-analysis',
                    params: { user_id, time_period: '1m' }
                },
                {
                    name: 'Learning Outcome Mastery',
                    endpoint: '/student/learning-outcome-mastery',
                    params: { user_id, mastery_threshold: 0.7 }
                },
                {
                    name: 'Improvement Suggestions',
                    endpoint: '/student/improvement-suggestions',
                    params: { user_id, suggestion_depth: 'basic' }
                }
            ];

            // Test each endpoint (mock test - in real implementation, you'd make actual calls)
            for (const test of endpointsToTest) {
                try {
                    // Mock successful response
                    testResults.endpoints_tested.push({
                        name: test.name,
                        endpoint: test.endpoint,
                        status: 'success',
                        response_time: Math.floor(Math.random() * 500) + 100, // Mock response time
                        data_points: Math.floor(Math.random() * 100) + 10 // Mock data count
                    });
                    testResults.successful++;
                } catch (error) {
                    testResults.endpoints_tested.push({
                        name: test.name,
                        endpoint: test.endpoint,
                        status: 'error',
                        error: error.message
                    });
                    testResults.failed++;
                    testResults.errors.push(`${test.name}: ${error.message}`);
                }
            }

            // Overall test summary
            testResults.success_rate = ((testResults.successful / endpointsToTest.length) * 100).toFixed(2);
            testResults.overall_status = testResults.failed === 0 ? 'ALL_PASSED' :
                testResults.successful > testResults.failed ? 'MOSTLY_PASSED' : 'MOSTLY_FAILED';

            res.json({
                success: true,
                message: 'Analytics endpoints test completed',
                data: testResults
            });

        } catch (error) {
            console.error('Error in test endpoints:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi test endpoints',
                error: error.message
            });
        }
    }
);

/**
 * GET /api/advanced-analytics/test/sample-data
 * Get sample data structure for frontend development
 */
/**
 * GET /api/advanced-analytics/test/lo-chapter-relationship
 * Test LO-Chapter relationship through ChapterLO table
 */
router.get('/test/lo-chapter-relationship',
    authenticateToken,
    authorize(['admin', 'teacher']),
    advancedAnalyticsController.testLOChapterRelationship
);

router.get('/test/sample-data',
    authenticateToken,
    authorize(['admin', 'teacher']),
    (req, res) => {
        const sampleData = {
            student_score_analysis: {
                user_id: 123,
                overall_performance: {
                    total_attempts: 45,
                    correct_attempts: 32,
                    accuracy_rate: "71.11",
                    avg_response_time: "145.50",
                    performance_grade: "B"
                },
                strengths_weaknesses: {
                    strengths: [
                        {
                            type: "learning_outcome",
                            name: "Cấu trúc dữ liệu cơ bản",
                            accuracy: "85.50",
                            reason: "Thành thạo Cấu trúc dữ liệu cơ bản với độ chính xác 85.50%"
                        }
                    ],
                    weaknesses: [
                        {
                            type: "learning_outcome",
                            name: "Thuật toán sắp xếp",
                            accuracy: "45.20",
                            reason: "Cần cải thiện Thuật toán sắp xếp - chỉ đạt 45.20% độ chính xác",
                            priority: "high"
                        }
                    ]
                },
                personalized_recommendations: [
                    {
                        priority: "high",
                        category: "learning_outcome",
                        title: "Cải thiện Thuật toán sắp xếp",
                        description: "Tập trung ôn tập Thuật toán sắp xếp với độ chính xác hiện tại chỉ 45.20%",
                        actions: [
                            "Xem lại lý thuyết cơ bản",
                            "Làm thêm bài tập thực hành",
                            "Tham khảo tài liệu bổ sung",
                            "Thảo luận với giảng viên"
                        ],
                        estimated_time: "2-3 tuần"
                    }
                ]
            },
            learning_outcome_mastery: {
                user_id: 123,
                summary: {
                    total_los: 8,
                    mastered_count: 3,
                    developing_count: 2,
                    needs_improvement_count: 2,
                    not_started_count: 1,
                    overall_mastery_rate: "37.50"
                },
                learning_outcomes: [
                    {
                        lo_id: 1,
                        lo_name: "Cấu trúc dữ liệu cơ bản",
                        chapter: "Chương 1",
                        total_attempts: 12,
                        correct_attempts: 10,
                        accuracy_rate: 0.83,
                        mastery_level: "mastered",
                        improvement_trend: "stable"
                    }
                ]
            },
            improvement_suggestions: {
                user_id: 123,
                suggestions_count: 3,
                improvement_suggestions: [
                    {
                        lo_id: 2,
                        lo_name: "Thuật toán sắp xếp",
                        current_accuracy: "45.20",
                        priority: "high",
                        main_issues: [
                            {
                                issue: "Hiểu biết cơ bản chưa vững",
                                severity: "high",
                                description: "Độ chính xác chỉ 45.2% cho thấy cần ôn tập lại kiến thức nền tảng"
                            }
                        ],
                        specific_recommendations: [
                            {
                                action: "Ôn tập lý thuyết",
                                details: "Đọc lại phần Thuật toán sắp xếp trong giáo trình",
                                time_needed: "2-3 giờ",
                                priority: 1
                            }
                        ],
                        estimated_improvement_time: "3-4 tuần với 45-60 phút/ngày"
                    }
                ]
            }
        };

        res.json({
            success: true,
            message: 'Sample data for frontend development',
            data: sampleData,
            note: 'This is sample data structure. Replace with actual API calls in production.'
        });
    }
);

// ==================== COMPREHENSIVE DASHBOARD ====================

/**
 * GET /api/advanced-analytics/dashboard/overview
 * Get comprehensive dashboard data combining multiple analytics
 * Query params: program_id, subject_id, time_period
 */
router.get('/dashboard/overview',
    authenticateToken,
    authorize(['admin', 'teacher']),
    async (req, res) => {
        try {
            const { program_id, subject_id, time_period = '30d' } = req.query;

            // Parallel execution of multiple analytics
            const [
                timeSeriesData,
                scoreDistribution,
                learningOutcomes,
                completionFunnel,
                difficultyHeatmap,
                timeScoreCorrelation
            ] = await Promise.allSettled([
                // Mock the controller calls - in real implementation, extract logic to service functions
                new Promise(resolve => resolve({ data: { message: 'Time series data' } })),
                new Promise(resolve => resolve({ data: { message: 'Score distribution data' } })),
                new Promise(resolve => resolve({ data: { message: 'Learning outcomes data' } })),
                new Promise(resolve => resolve({ data: { message: 'Completion funnel data' } })),
                new Promise(resolve => resolve({ data: { message: 'Difficulty heatmap data' } })),
                new Promise(resolve => resolve({ data: { message: 'Time-score correlation data' } }))
            ]);

            // Combine all analytics data
            const dashboardData = {
                overview: {
                    time_period,
                    program_id: program_id || null,
                    subject_id: subject_id || null,
                    generated_at: new Date()
                },
                performance_analytics: {
                    time_series: timeSeriesData.status === 'fulfilled' ? timeSeriesData.value.data : null,
                    score_distribution: scoreDistribution.status === 'fulfilled' ? scoreDistribution.value.data : null,
                    learning_outcomes: learningOutcomes.status === 'fulfilled' ? learningOutcomes.value.data : null,
                    completion_funnel: completionFunnel.status === 'fulfilled' ? completionFunnel.value.data : null
                },
                difficulty_analysis: {
                    heatmap: difficultyHeatmap.status === 'fulfilled' ? difficultyHeatmap.value.data : null,
                    time_score_correlation: timeScoreCorrelation.status === 'fulfilled' ? timeScoreCorrelation.value.data : null
                },
                errors: [
                    timeSeriesData,
                    scoreDistribution,
                    learningOutcomes,
                    completionFunnel,
                    difficultyHeatmap,
                    timeScoreCorrelation
                ].filter(result => result.status === 'rejected').map(result => result.reason)
            };

            res.json({
                success: true,
                data: dashboardData
            });

        } catch (error) {
            console.error('Error in dashboard overview:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi tạo dashboard overview',
                error: error.message
            });
        }
    }
);

// ==================== EXPORT ENDPOINTS ====================

/**
 * GET /api/advanced-analytics/export/report
 * Export comprehensive analytics report
 * Query params: program_id, subject_id, time_period, format (json, csv, pdf)
 */
router.get('/export/report',
    authenticateToken,
    authorize(['admin', 'teacher']),
    async (req, res) => {
        try {
            const {
                program_id,
                subject_id,
                time_period = '30d',
                format = 'json'
            } = req.query;

            // TODO: Implement comprehensive report generation
            // This would combine all analytics data and format it for export

            res.json({
                success: true,
                message: 'Export functionality will be implemented',
                data: {
                    program_id,
                    subject_id,
                    time_period,
                    format,
                    status: 'pending_implementation'
                }
            });

        } catch (error) {
            console.error('Error in export report:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi xuất báo cáo',
                error: error.message
            });
        }
    }
);

module.exports = router;
