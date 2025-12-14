'use strict';

const {
    UserCodeExerciseTracking,
    CodeSubmission,
    Question,
    User,
    Quiz,
    sequelize
} = require('../models');
const { Op } = require('sequelize');

class TeacherCodeAnalyticsService {

    /**
     * Get overview analytics by quiz_id or course_id
     * Supports both quiz-level and course-level analytics
     * Response format matches Frontend specs (CODE_DOCS.md)
     */
    async getCourseOverview(idValue, idType = 'quiz') {
        let trackings;
        let quizInfo = null;
        
        if (idType === 'quiz') {
            // Get quiz info first
            const quiz = await Quiz.findByPk(idValue, {
                attributes: ['quiz_id', 'name', 'course_id']
            });
            if (quiz) {
                quizInfo = {
                    quiz_id: quiz.quiz_id,
                    name: quiz.name,
                    course_id: quiz.course_id
                };
            }
            
            // Query by quiz_id directly
            trackings = await UserCodeExerciseTracking.findAll({
                where: { quiz_id: idValue },
                include: [
                    {
                        model: User,
                        as: 'User',
                        attributes: ['user_id', 'name', 'email']
                    },
                    {
                        model: Question,
                        as: 'Question',
                        attributes: ['question_id', 'question_text', 'level_id']
                    },
                    {
                        model: Quiz,
                        as: 'Quiz',
                        attributes: ['quiz_id', 'name', 'course_id']
                    }
                ]
            });
        } else if (idType === 'course' || idType === 'assignment') {
            const quizzes = await Quiz.findAll({
                where: { course_id: idValue },
                attributes: ['quiz_id']
            });
            
            const quizIds = quizzes.map(q => q.quiz_id);
            
            if (quizIds.length === 0) {
                return this._emptyAnalytics(quizInfo);
            }
            
            trackings = await UserCodeExerciseTracking.findAll({
                where: { quiz_id: { [Op.in]: quizIds } },
                include: [
                    {
                        model: User,
                        as: 'User',
                        attributes: ['user_id', 'name', 'email']
                    },
                    {
                        model: Question,
                        as: 'Question',
                        attributes: ['question_id', 'question_text', 'level_id']
                    },
                    {
                        model: Quiz,
                        as: 'Quiz',
                        attributes: ['quiz_id', 'name', 'course_id']
                    }
                ]
            });
        } else {
            trackings = await UserCodeExerciseTracking.findAll({
                where: { subject_id: idValue },
                include: [
                    {
                        model: User,
                        as: 'User',
                        attributes: ['user_id', 'name', 'email']
                    },
                    {
                        model: Question,
                        as: 'Question',
                        attributes: ['question_id', 'question_text', 'level_id']
                    }
                ]
            });
        }
        
        if (trackings.length === 0) {
            return this._emptyAnalytics(quizInfo);
        }

        const totalStudents = new Set(trackings.map(t => t.user_id)).size;
        const totalQuestions = new Set(trackings.map(t => t.question_id)).size;
        const totalSubmissions = trackings.reduce((sum, t) => 
            sum + (t.submission_history?.total_submissions || 0), 0);
        const totalTestRuns = trackings.reduce((sum, t) => 
            sum + (t.test_run_history?.total_test_runs || 0), 0);

        const avgPassRate = trackings.length > 0
            ? trackings.reduce((sum, t) => sum + (t.test_case_performance?.pass_rate || 0), 0) / trackings.length
            : 0;

        // Mastery distribution
        const masteryDist = { beginner: 0, intermediate: 0, advanced: 0, expert: 0 };
        trackings.forEach(t => {
            const level = t.learning_progress?.mastery_level || 'beginner';
            masteryDist[level]++;
        });

        // Build student performance map
        const studentPerformance = {};
        trackings.forEach(t => {
            if (!studentPerformance[t.user_id]) {
                studentPerformance[t.user_id] = {
                    user: t.User,
                    questions_attempted: 0,
                    total_submissions: 0,
                    avg_pass_rate: 0,
                    mastery_levels: [],
                    last_activity: null,
                    first_submission: null,
                    last_submission: null
                };
            }
            const sp = studentPerformance[t.user_id];
            sp.questions_attempted++;
            sp.total_submissions += t.submission_history?.total_submissions || 0;
            sp.mastery_levels.push(t.learning_progress?.mastery_level || 'beginner');
            
            // Track activity times
            const lastSub = t.submission_history?.last_submission_date;
            const firstSub = t.submission_history?.first_submission_date;
            if (lastSub && (!sp.last_submission || new Date(lastSub) > new Date(sp.last_submission))) {
                sp.last_submission = lastSub;
            }
            if (firstSub && (!sp.first_submission || new Date(firstSub) < new Date(sp.first_submission))) {
                sp.first_submission = firstSub;
            }
        });

        // Calculate avg pass rate per student
        Object.keys(studentPerformance).forEach(userId => {
            const userTrackings = trackings.filter(t => t.user_id == userId);
            studentPerformance[userId].avg_pass_rate = userTrackings.reduce((sum, t) => 
                sum + (t.test_case_performance?.pass_rate || 0), 0) / userTrackings.length;
        });

        // Students needing help (Frontend format)
        const studentsNeedingHelp = Object.values(studentPerformance)
            .filter(p => p.avg_pass_rate < 0.5 || p.total_submissions > 10)
            .sort((a, b) => a.avg_pass_rate - b.avg_pass_rate)
            .map(p => ({
                user_id: p.user?.user_id,
                name: p.user?.name,
                email: p.user?.email,
                avg_pass_rate: Math.round(p.avg_pass_rate * 100) / 100,
                total_submissions: p.total_submissions,
                status: p.avg_pass_rate < 0.3 ? 'critical' : 'warning',
                last_active: this._formatLastActive(p.last_submission)
            }));

        // Score distribution for charts (Frontend format)
        const scoreDistribution = this._calculateScoreDistribution(studentPerformance);

        // All students list (Frontend format)
        const allStudents = Object.values(studentPerformance)
            .map(p => ({
                user_id: p.user?.user_id,
                name: p.user?.name,
                email: p.user?.email,
                progress_status: this._getProgressStatus(p),
                score: Math.round(p.avg_pass_rate * 100),
                total_attempts: p.total_submissions,
                time_spent: this._calculateTimeSpent(p.first_submission, p.last_submission)
            }))
            .sort((a, b) => b.score - a.score);

        // Top performers
        const topPerformers = Object.values(studentPerformance)
            .sort((a, b) => b.avg_pass_rate - a.avg_pass_rate)
            .slice(0, 10)
            .map(p => ({
                user: p.user,
                avg_pass_rate: p.avg_pass_rate,
                questions_attempted: p.questions_attempted,
                total_submissions: p.total_submissions
            }));

        // Update quiz_info with total_students
        if (quizInfo) {
            quizInfo.total_students = totalStudents;
        }

        return {
            // Frontend expected format
            quiz_info: quizInfo,
            students_needing_help: studentsNeedingHelp,
            charts: {
                mastery_distribution: masteryDist,
                score_distribution: scoreDistribution
            },
            all_students: allStudents,
            // Legacy format (backward compatible)
            overview: {
                total_students: totalStudents,
                total_questions: totalQuestions,
                total_submissions: totalSubmissions,
                total_test_runs: totalTestRuns,
                avg_pass_rate: avgPassRate,
                avg_submissions_per_student: trackings.length > 0 ? totalSubmissions / trackings.length : 0,
                avg_test_runs_per_student: trackings.length > 0 ? totalTestRuns / trackings.length : 0
            },
            mastery_distribution: masteryDist,
            top_performers: topPerformers
        };
    }

    /**
     * Calculate score distribution for chart
     */
    _calculateScoreDistribution(studentPerformance) {
        const ranges = [
            { range: '0-20', min: 0, max: 20, count: 0 },
            { range: '20-40', min: 20, max: 40, count: 0 },
            { range: '40-60', min: 40, max: 60, count: 0 },
            { range: '60-80', min: 60, max: 80, count: 0 },
            { range: '80-100', min: 80, max: 100, count: 0 }
        ];

        Object.values(studentPerformance).forEach(p => {
            const score = p.avg_pass_rate * 100;
            for (const r of ranges) {
                if (score >= r.min && (score < r.max || (r.max === 100 && score <= 100))) {
                    r.count++;
                    break;
                }
            }
        });

        return ranges.map(r => ({ range: r.range, count: r.count }));
    }

    /**
     * Get progress status based on performance
     */
    _getProgressStatus(studentPerf) {
        if (studentPerf.avg_pass_rate >= 0.8) return 'completed';
        if (studentPerf.total_submissions > 0) return 'in_progress';
        return 'not_started';
    }

    /**
     * Format last active time
     */
    _formatLastActive(lastSubmission) {
        if (!lastSubmission) return 'Chưa hoạt động';
        
        const now = new Date();
        const last = new Date(lastSubmission);
        const diffMs = now - last;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Vừa xong';
        if (diffMins < 60) return `${diffMins} phút trước`;
        if (diffHours < 24) return `${diffHours} giờ trước`;
        if (diffDays < 7) return `${diffDays} ngày trước`;
        return last.toLocaleDateString('vi-VN');
    }

    /**
     * Calculate time spent
     */
    _calculateTimeSpent(firstSubmission, lastSubmission) {
        if (!firstSubmission || !lastSubmission) return 'N/A';
        
        const first = new Date(firstSubmission);
        const last = new Date(lastSubmission);
        const diffMs = last - first;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) return '< 1 phút';
        if (diffMins < 60) return `${diffMins} phút`;
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        if (hours < 24) return mins > 0 ? `${hours} giờ ${mins} phút` : `${hours} giờ`;
        const days = Math.floor(hours / 24);
        return `${days} ngày`;
    }

    /**
     * Return empty analytics structure
     */
    _emptyAnalytics(quizInfo = null) {
        return {
            quiz_info: quizInfo ? { ...quizInfo, total_students: 0 } : null,
            students_needing_help: [],
            charts: {
                mastery_distribution: { beginner: 0, intermediate: 0, advanced: 0, expert: 0 },
                score_distribution: [
                    { range: '0-20', count: 0 },
                    { range: '20-40', count: 0 },
                    { range: '40-60', count: 0 },
                    { range: '60-80', count: 0 },
                    { range: '80-100', count: 0 }
                ]
            },
            all_students: [],
            overview: {
                total_students: 0,
                total_questions: 0,
                total_submissions: 0,
                total_test_runs: 0,
                avg_pass_rate: 0,
                avg_submissions_per_student: 0,
                avg_test_runs_per_student: 0
            },
            mastery_distribution: { beginner: 0, intermediate: 0, advanced: 0, expert: 0 },
            top_performers: []
        };
    }

    /**
     * Get detailed student analysis
     * Supports filtering by quiz_id (Frontend preferred) or subject_id (legacy)
     */
    async getStudentDetailedAnalysis(userId, quizId = null, subjectId = null) {
        const where = { user_id: userId };
        if (quizId) {
            where.quiz_id = quizId;
        } else if (subjectId) {
            where.subject_id = subjectId;
        }

        const trackings = await UserCodeExerciseTracking.findAll({
            where,
            include: [
                {
                    model: Question,
                    as: 'Question',
                    attributes: ['question_id', 'question_text', 'level_id', 'lo_id']
                },
                {
                    model: User,
                    as: 'User',
                    attributes: ['user_id', 'name', 'email']
                }
            ],
            order: [['update_time', 'DESC']]
        });

        if (trackings.length === 0) {
            return {
                user_id: userId,
                message: 'No data available for this student'
            };
        }

        // Get student info
        const studentInfo = {
            user_id: userId,
            name: trackings[0].User?.name || 'Unknown',
            email: trackings[0].User?.email || ''
        };

        // Overall metrics
        const totalQuestions = trackings.length;
        const totalSubmissions = trackings.reduce((sum, t) => 
            sum + (t.submission_history?.total_submissions || 0), 0);
        const totalTestRuns = trackings.reduce((sum, t) => 
            sum + (t.test_run_history?.total_test_runs || 0), 0);
        const avgPassRate = trackings.reduce((sum, t) => 
            sum + (t.test_case_performance?.pass_rate || 0), 0) / trackings.length;
        
        // Fetch CodeSubmissions to get AI scores
        const questionIds = trackings.map(t => t.question_id);
        const codeSubmissions = await CodeSubmission.findAll({
            where: {
                user_id: userId,
                question_id: { [Op.in]: questionIds }
            },
            attributes: ['submission_id', 'question_id', 'score', 'submitted_at'],
            order: [['submitted_at', 'DESC']]
        });
        
        // Calculate final score from AI scores (average of best score per question)
        let finalScore = 0;
        if (codeSubmissions.length > 0) {
            // Group by question and get best score for each
            const bestScoresByQuestion = new Map();
            codeSubmissions.forEach(cs => {
                const qId = cs.question_id;
                const currentBest = bestScoresByQuestion.get(qId) || 0;
                if (cs.score > currentBest) {
                    bestScoresByQuestion.set(qId, cs.score);
                }
            });
            
            // Average of best scores
            const totalScore = Array.from(bestScoresByQuestion.values()).reduce((sum, s) => sum + s, 0);
            finalScore = Math.round(totalScore / bestScoresByQuestion.size);
        } else {
            // Fallback to pass_rate if no CodeSubmissions
            finalScore = Math.round(avgPassRate * 100);
        }
        studentInfo.final_score = finalScore;
        studentInfo.status = avgPassRate < 0.5 ? 'stuck' : avgPassRate < 0.8 ? 'in_progress' : 'completed';

        // Strengths and weaknesses
        const strengths = [];
        const weaknesses = [];
        
        trackings.forEach(t => {
            const passRate = t.test_case_performance?.pass_rate || 0;
            const questionData = {
                question_id: t.question_id,
                question_text: t.Question?.question_text,
                pass_rate: passRate,
                attempts: t.submission_history?.total_submissions || 0,
                mastery_level: t.learning_progress?.mastery_level
            };

            if (passRate >= 0.8) {
                strengths.push(questionData);
            } else if (passRate < 0.5) {
                weaknesses.push(questionData);
            }
        });

        // Stuck questions (nhiều attempts nhưng pass rate thấp)
        const stuckQuestions = trackings
            .filter(t => {
                const submissions = t.submission_history?.total_submissions || 0;
                const passRate = t.test_case_performance?.pass_rate || 0;
                return submissions >= 3 && passRate < 0.5;
            })
            .map(t => ({
                question_id: t.question_id,
                question_text: t.Question?.question_text,
                attempts: t.submission_history?.total_submissions,
                pass_rate: t.test_case_performance?.pass_rate,
                stuck_test_cases: t.learning_progress?.stuck_test_cases || [],
                recommendation: this._getRecommendation(t)
            }));

        // Progress over time
        const progressTimeline = this._calculateProgressTimeline(trackings);

        // Test case analysis
        const testCaseAnalysis = this._analyzeTestCases(trackings);

        // Learning patterns
        const learningPatterns = this._analyzeLearningPatterns(trackings);

        // Build submission_history in Frontend format (pass codeSubmissions for AI scores)
        const submissionHistory = this._buildSubmissionHistory(trackings, codeSubmissions);

        // Behavior analysis (Frontend format)
        const behaviorAnalysis = this._buildBehaviorAnalysis(trackings, testCaseAnalysis);

        return {
            // Frontend expected format
            student_info: studentInfo,
            submission_history: submissionHistory,
            behavior_analysis: behaviorAnalysis,
            
            // Legacy format (backward compatible)
            user_id: userId,
            overall_metrics: {
                total_questions_attempted: totalQuestions,
                total_submissions: totalSubmissions,
                total_test_runs: totalTestRuns,
                avg_pass_rate: avgPassRate,
                avg_attempts_per_question: totalSubmissions / totalQuestions,
                avg_test_runs_per_question: totalTestRuns / totalQuestions
            },
            mastery_distribution: this._getMasteryDistribution(trackings),
            strengths: strengths.sort((a, b) => b.pass_rate - a.pass_rate).slice(0, 5),
            weaknesses: weaknesses.sort((a, b) => a.pass_rate - b.pass_rate).slice(0, 5),
            stuck_questions: stuckQuestions,
            progress_timeline: progressTimeline,
            test_case_analysis: testCaseAnalysis,
            learning_patterns: learningPatterns,
            recommendations: this._generateRecommendations(trackings, stuckQuestions)
        };
    }

    /**
     * Build submission history in Frontend format
     * @param {Array} trackings - User code exercise trackings
     * @param {Array} codeSubmissions - Optional: Pre-loaded code submissions with AI scores
     */
    _buildSubmissionHistory(trackings, codeSubmissions = null) {
        const allSubmissions = [];
        
        // Build a map of submission_id -> AI score from CodeSubmissions
        const submissionScoreMap = new Map();
        if (codeSubmissions && Array.isArray(codeSubmissions)) {
            codeSubmissions.forEach(cs => {
                if (cs.submission_id) {
                    submissionScoreMap.set(cs.submission_id, cs.score || 0);
                }
            });
        }
        
        trackings.forEach(t => {
            const submissions = t.submission_history?.submissions || [];
            const totalTestCases = t.test_case_performance?.total_test_cases || 0;
            
            submissions.forEach((sub, index) => {
                // Use AI score from CodeSubmissions if available, else fallback to pass_rate * 100
                let score;
                if (submissionScoreMap.has(sub.submission_id)) {
                    score = submissionScoreMap.get(sub.submission_id);
                } else if (sub.ai_score !== undefined) {
                    score = sub.ai_score;
                } else {
                    score = Math.round((sub.pass_rate || 0) * 100);
                }
                
                allSubmissions.push({
                    submission_id: sub.submission_id || `${t.tracking_id}_${index}`,
                    question_id: t.question_id,
                    attempt_number: index + 1,
                    submitted_at: sub.date,
                    status: this._mapSubmissionStatus(sub.status),
                    score: score,
                    passed_test_cases: sub.passed_count || sub.passed_test_cases || Math.round((sub.pass_rate || 0) * totalTestCases),
                    total_test_cases: totalTestCases,
                    failed_test_cases: sub.failed_test_cases || [],
                    error_detail: sub.error_message || null
                });
            });
        });

        // Sort by date
        return allSubmissions.sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));
    }

    /**
     * Map internal status to Frontend status
     */
    _mapSubmissionStatus(status) {
        const statusMap = {
            'passed': 'accepted',
            'failed': 'wrong_answer',
            'error': 'compile_error',
            'timeout': 'time_limit_exceeded',
            'runtime_error': 'runtime_error'
        };
        return statusMap[status] || status || 'unknown';
    }

    /**
     * Build behavior analysis in Frontend format
     */
    _buildBehaviorAnalysis(trackings, testCaseAnalysis) {
        const totalTestRuns = trackings.reduce((sum, t) => 
            sum + (t.test_run_history?.total_test_runs || 0), 0);
        
        // Calculate average time between submissions
        let totalTimeDiff = 0;
        let timeDiffCount = 0;
        
        trackings.forEach(t => {
            const submissions = t.submission_history?.submissions || [];
            for (let i = 1; i < submissions.length; i++) {
                const prev = new Date(submissions[i-1].date);
                const curr = new Date(submissions[i].date);
                if (!isNaN(prev) && !isNaN(curr)) {
                    totalTimeDiff += (curr - prev);
                    timeDiffCount++;
                }
            }
        });

        const avgTimeBetween = timeDiffCount > 0 
            ? Math.round(totalTimeDiff / timeDiffCount / 60000) 
            : 0;

        // Find most common error
        const mostCommonError = testCaseAnalysis.most_common_errors?.[0]?.error || 'N/A';

        // Generate recommendation
        const avgPassRate = trackings.reduce((sum, t) => 
            sum + (t.test_case_performance?.pass_rate || 0), 0) / trackings.length;
        
        let recommendation = '';
        if (avgPassRate < 0.3) {
            recommendation = 'Sinh viên đang gặp khó khăn nghiêm trọng. Cần hỗ trợ 1-1 hoặc cung cấp tài liệu bổ sung.';
        } else if (avgPassRate < 0.5) {
            recommendation = 'Sinh viên hiểu logic cơ bản nhưng cần luyện tập thêm. Gợi ý: cung cấp bài tập tương tự.';
        } else if (avgPassRate < 0.8) {
            recommendation = 'Sinh viên này hiểu logic nhưng code chưa tối ưu. Cần hướng dẫn thêm về Big O và edge cases.';
        } else {
            recommendation = 'Sinh viên nắm vững kiến thức. Có thể giao bài tập nâng cao.';
        }

        return {
            total_test_runs: totalTestRuns,
            average_time_between_submissions: avgTimeBetween > 0 ? `${avgTimeBetween} phút` : 'N/A',
            most_common_error: mostCommonError,
            recommendation_for_teacher: recommendation
        };
    }

    /**
     * Compare students
     */
    async compareStudents(userIds, subjectId = null) {
        const comparisons = [];

        for (const userId of userIds) {
            const analysis = await this.getStudentDetailedAnalysis(userId, subjectId);
            comparisons.push({
                user_id: userId,
                metrics: analysis.overall_metrics,
                mastery: analysis.mastery_distribution,
                strengths_count: analysis.strengths?.length || 0,
                weaknesses_count: analysis.weaknesses?.length || 0,
                stuck_questions_count: analysis.stuck_questions?.length || 0
            });
        }

        // Rank students
        const ranked = comparisons.sort((a, b) => 
            b.metrics.avg_pass_rate - a.metrics.avg_pass_rate
        );

        return {
            comparison: ranked,
            insights: {
                best_performer: ranked[0],
                needs_most_help: ranked[ranked.length - 1],
                avg_pass_rate: ranked.reduce((sum, c) => sum + c.metrics.avg_pass_rate, 0) / ranked.length
            }
        };
    }

    /**
     * Get question difficulty analysis
     * Response format matches Frontend specs (CODE_DOCS.md)
     */
    async getQuestionDifficultyAnalysis(questionId) {
        // Get question info
        const question = await Question.findByPk(questionId, {
            attributes: ['question_id', 'question_text', 'level_id']
        });

        const trackings = await UserCodeExerciseTracking.findAll({
            where: { question_id: questionId },
            include: [
                {
                    model: User,
                    as: 'User',
                    attributes: ['user_id', 'name', 'email']
                }
            ]
        });

        if (trackings.length === 0) {
            return {
                question_id: questionId,
                question_text: question?.question_text || 'Unknown',
                message: 'No data available for this question'
            };
        }

        const totalStudents = trackings.length;
        const avgPassRate = trackings.reduce((sum, t) => 
            sum + (t.test_case_performance?.pass_rate || 0), 0) / totalStudents;
        const avgAttempts = trackings.reduce((sum, t) => 
            sum + (t.submission_history?.total_submissions || 0), 0) / totalStudents;

        // Determine difficulty rating
        const difficultyRating = avgPassRate >= 0.7 ? 'easy' : 
                                avgPassRate >= 0.4 ? 'medium' : 'hard';

        // Test case difficulty
        const testCaseDifficulty = {};
        trackings.forEach(t => {
            const testCases = t.test_case_performance?.test_cases || {};
            Object.entries(testCases).forEach(([tcId, tc]) => {
                if (!testCaseDifficulty[tcId]) {
                    testCaseDifficulty[tcId] = {
                        test_case_id: tc.test_case_id || parseInt(tcId),
                        description: tc.description || `Test case ${tcId}`,
                        total_attempts: 0,
                        total_students: 0,
                        students_passed: 0,
                        common_errors: {}
                    };
                }
                testCaseDifficulty[tcId].total_attempts += tc.total_attempts || 0;
                testCaseDifficulty[tcId].total_students++;
                if (tc.passed_attempts > 0) {
                    testCaseDifficulty[tcId].students_passed++;
                }
                
                (tc.common_errors || []).forEach(err => {
                    if (!testCaseDifficulty[tcId].common_errors[err.error]) {
                        testCaseDifficulty[tcId].common_errors[err.error] = 0;
                    }
                    testCaseDifficulty[tcId].common_errors[err.error] += err.count;
                });
            });
        });

        // Calculate pass rate per test case and format for Frontend
        const testCasesAnalytics = Object.values(testCaseDifficulty)
            .map(tc => {
                const passRate = tc.total_students > 0 
                    ? Math.round((tc.students_passed / tc.total_students) * 100) 
                    : 0;
                const commonErrorsList = Object.entries(tc.common_errors)
                    .map(([error, count]) => ({ error, count }))
                    .sort((a, b) => b.count - a.count);
                
                return {
                    test_case_id: tc.test_case_id,
                    description: tc.description,
                    pass_rate: passRate,
                    status: passRate >= 70 ? 'good' : passRate >= 40 ? 'moderate' : 'problematic',
                    common_error: commonErrorsList[0]?.error || null,
                    common_errors: commonErrorsList.slice(0, 5)
                };
            })
            .sort((a, b) => a.pass_rate - b.pass_rate);

        // Generate teacher action item
        const problematicTestCases = testCasesAnalytics.filter(tc => tc.status === 'problematic');
        let teacherActionItem = '';
        if (problematicTestCases.length > 0) {
            const worstTC = problematicTestCases[0];
            teacherActionItem = `Test case #${worstTC.test_case_id} "${worstTC.description}" gây khó khăn cho ${100 - worstTC.pass_rate}% sinh viên. Cân nhắc thêm gợi ý (hint) hoặc ví dụ minh họa.`;
        } else if (avgPassRate < 0.5) {
            teacherActionItem = 'Câu hỏi này có tỷ lệ pass thấp. Cân nhắc đơn giản hóa hoặc thêm hướng dẫn.';
        } else {
            teacherActionItem = 'Câu hỏi này có độ khó phù hợp với sinh viên.';
        }

        return {
            // Frontend expected format
            question_id: questionId,
            question_text: question?.question_text || 'Unknown',
            difficulty_rating: difficultyRating,
            test_cases_analytics: testCasesAnalytics,
            teacher_action_item: teacherActionItem,
            
            // Legacy format (backward compatible)
            overall: {
                total_students_attempted: totalStudents,
                avg_pass_rate: avgPassRate,
                avg_attempts: avgAttempts,
                difficulty_rating: difficultyRating
            },
            test_cases: testCasesAnalytics,
            recommendations: this._getQuestionRecommendations(avgPassRate, testCaseDifficulty)
        };
    }

    // Helper methods
    _getMasteryDistribution(trackings) {
        const dist = { beginner: 0, intermediate: 0, advanced: 0, expert: 0 };
        trackings.forEach(t => {
            const level = t.learning_progress?.mastery_level || 'beginner';
            dist[level]++;
        });
        return dist;
    }

    _calculateProgressTimeline(trackings) {
        const timeline = [];
        trackings.forEach(t => {
            const submissions = t.submission_history?.submissions || [];
            submissions.forEach(sub => {
                timeline.push({
                    date: sub.date,
                    question_id: t.question_id,
                    pass_rate: sub.pass_rate,
                    status: sub.status
                });
            });
        });
        return timeline.sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    _analyzeTestCases(trackings) {
        let totalTestCases = 0;
        let passedTestCases = 0;
        const commonErrors = {};

        trackings.forEach(t => {
            const testCases = t.test_case_performance?.test_cases || {};
            Object.values(testCases).forEach(tc => {
                totalTestCases++;
                if (tc.passed_attempts > 0) passedTestCases++;
                
                (tc.common_errors || []).forEach(err => {
                    if (!commonErrors[err.error]) {
                        commonErrors[err.error] = 0;
                    }
                    commonErrors[err.error] += err.count;
                });
            });
        });

        return {
            total_test_cases: totalTestCases,
            passed_test_cases: passedTestCases,
            pass_rate: totalTestCases > 0 ? passedTestCases / totalTestCases : 0,
            most_common_errors: Object.entries(commonErrors)
                .map(([error, count]) => ({ error, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10)
        };
    }

    _analyzeLearningPatterns(trackings) {
        const patterns = {
            avg_test_runs_before_submit: 0,
            improvement_trend: 'stable',
            consistency: 0
        };

        const avgTestRuns = trackings.reduce((sum, t) => 
            sum + (t.test_run_history?.average_test_runs_before_submit || 0), 0) / trackings.length;
        patterns.avg_test_runs_before_submit = avgTestRuns;

        // Analyze improvement trend
        const passRates = trackings.map(t => t.test_case_performance?.pass_rate || 0);
        if (passRates.length >= 3) {
            const recent = passRates.slice(-3).reduce((a, b) => a + b, 0) / 3;
            const older = passRates.slice(0, -3).reduce((a, b) => a + b, 0) / (passRates.length - 3);
            if (recent > older + 0.1) patterns.improvement_trend = 'improving';
            else if (recent < older - 0.1) patterns.improvement_trend = 'declining';
        }

        // Calculate consistency (standard deviation of pass rates)
        const mean = passRates.reduce((a, b) => a + b, 0) / passRates.length;
        const variance = passRates.reduce((sum, rate) => sum + Math.pow(rate - mean, 2), 0) / passRates.length;
        patterns.consistency = 1 - Math.sqrt(variance); // Higher = more consistent

        return patterns;
    }

    _getRecommendation(tracking) {
        const stuckTestCases = tracking.learning_progress?.stuck_test_cases || [];
        if (stuckTestCases.length > 0) {
            return `Focus on test cases: ${stuckTestCases.join(', ')}. Consider reviewing edge cases and error handling.`;
        }
        return 'Review the question requirements and test your code with different inputs.';
    }

    _generateRecommendations(trackings, stuckQuestions) {
        const recommendations = [];

        // Check overall pass rate
        const avgPassRate = trackings.reduce((sum, t) => 
            sum + (t.test_case_performance?.pass_rate || 0), 0) / trackings.length;

        if (avgPassRate < 0.5) {
            recommendations.push({
                priority: 'high',
                category: 'overall_performance',
                message: 'Student is struggling overall. Consider one-on-one tutoring or additional practice materials.',
                action: 'schedule_tutoring'
            });
        }

        // Check stuck questions
        if (stuckQuestions.length > 0) {
            recommendations.push({
                priority: 'high',
                category: 'stuck_questions',
                message: `Student is stuck on ${stuckQuestions.length} question(s). Provide hints or simplified versions.`,
                action: 'provide_hints',
                questions: stuckQuestions.map(q => q.question_id)
            });
        }

        // Check test run patterns
        const avgTestRuns = trackings.reduce((sum, t) => 
            sum + (t.test_run_history?.average_test_runs_before_submit || 0), 0) / trackings.length;

        if (avgTestRuns < 2) {
            recommendations.push({
                priority: 'medium',
                category: 'testing_habits',
                message: 'Student submits without adequate testing. Encourage more test runs before submission.',
                action: 'encourage_testing'
            });
        }

        return recommendations;
    }

    _getQuestionRecommendations(avgPassRate, testCaseDifficulty) {
        const recommendations = [];

        if (avgPassRate < 0.3) {
            recommendations.push({
                priority: 'high',
                message: 'This question is too difficult. Consider simplifying or adding more hints.',
                action: 'simplify_question'
            });
        }

        // Check for problematic test cases
        Object.values(testCaseDifficulty).forEach(tc => {
            if (tc.pass_rate < 0.2) {
                recommendations.push({
                    priority: 'high',
                    message: `Test case "${tc.description}" is very difficult (${Math.round(tc.pass_rate * 100)}% pass rate). Consider adding hints or examples.`,
                    action: 'add_hints',
                    test_case_id: tc.test_case_id
                });
            }
        });

        return recommendations;
    }
}

module.exports = new TeacherCodeAnalyticsService();
