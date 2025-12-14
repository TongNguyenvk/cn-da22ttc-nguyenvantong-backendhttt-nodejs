'use strict';

const {
    UserCodeExerciseTracking,
    QuestionTestCaseAnalytics,
    Question,
    Subject,
    QuizResult,
    Quiz,
    QuizQuestion
} = require('../models');

class CodeExerciseTrackingService {

    /**
     * Get subject_id for a question
     */
    async _getSubjectIdForQuestion(questionId) {
        const { sequelize } = require('../models');

        // Try method 1: via quiz → course
        let result = await sequelize.query(`
            SELECT c.subject_id
            FROM "Questions" q
            JOIN "QuizQuestions" qq ON q.question_id = qq.question_id
            JOIN "Quizzes" qz ON qq.quiz_id = qz.quiz_id
            JOIN "Courses" c ON qz.course_id = c.course_id
            WHERE q.question_id = :questionId
            LIMIT 1
        `, {
            replacements: { questionId },
            type: sequelize.QueryTypes.SELECT
        });

        if (result && result.length > 0) {
            return result[0].subject_id;
        }

        // Try method 2: via LO → chapter
        result = await sequelize.query(`
            SELECT ch.subject_id
            FROM "Questions" q
            JOIN "LOs" lo ON q.lo_id = lo.lo_id
            JOIN "chapter_lo" cl ON lo.lo_id = cl.lo_id
            JOIN "Chapters" ch ON cl.chapter_id = ch.chapter_id
            WHERE q.question_id = :questionId
            LIMIT 1
        `, {
            replacements: { questionId },
            type: sequelize.QueryTypes.SELECT
        });

        if (result && result.length > 0) {
            return result[0].subject_id;
        }

        // Fallback: use default subject
        console.warn(`No subject found for question ${questionId}, using default subject_id = 1`);
        return 1;
    }

    /**
     * Track test run (before submit)
     */
    async trackTestRun(userId, questionId, quizId, testRunData) {
        try {
            // Get subject_id
            const subjectId = await this._getSubjectIdForQuestion(questionId);

            // Get or create tracking
            const tracking = await UserCodeExerciseTracking.getOrCreate(
                userId,
                questionId,
                quizId,
                subjectId
            );

            // Update test run history
            const testRunHistory = tracking.test_run_history || {};
            testRunHistory.total_test_runs = (testRunHistory.total_test_runs || 0) + 1;

            // Track compile errors count
            if (testRunData.has_compile_error) {
                testRunHistory.total_compile_errors = (testRunHistory.total_compile_errors || 0) + 1;
            }

            // Add run to history (keep last 20)
            testRunHistory.runs = testRunHistory.runs || [];
            testRunHistory.runs.push({
                timestamp: new Date(),
                passed: testRunData.passed,
                total: testRunData.total,
                has_compile_error: testRunData.has_compile_error || false,
                compile_error_message: testRunData.compile_error_message || null,
                has_runtime_error: testRunData.has_runtime_error || false,
                failed_test_cases: testRunData.failed_test_cases || []
            });

            if (testRunHistory.runs.length > 20) {
                testRunHistory.runs = testRunHistory.runs.slice(-20);
            }

            // Update test case performance
            const testCasePerf = tracking.test_case_performance || {};
            testCasePerf.test_cases = testCasePerf.test_cases || {};

            // Update each test case
            if (testRunData.results) {
                testRunData.results.forEach(result => {
                    const tcId = String(result.test_case_id);
                    const tc = testCasePerf.test_cases[tcId] || {
                        test_case_id: result.test_case_id,
                        description: result.description || '',
                        total_attempts: 0,
                        passed_attempts: 0,
                        failed_attempts: 0,
                        pass_rate: 0,
                        common_errors: []
                    };

                    tc.total_attempts++;
                    if (result.passed) {
                        tc.passed_attempts++;
                    } else {
                        tc.failed_attempts++;

                        // Track common errors
                        if (result.error) {
                            const existingError = tc.common_errors.find(e => e.error === result.error);
                            if (existingError) {
                                existingError.count++;
                            } else {
                                tc.common_errors.push({ error: result.error, count: 1 });
                            }

                            // Keep only top 5 errors
                            tc.common_errors.sort((a, b) => b.count - a.count);
                            tc.common_errors = tc.common_errors.slice(0, 5);
                        }
                    }

                    tc.pass_rate = tc.passed_attempts / tc.total_attempts;
                    tc.last_attempt_date = new Date();

                    testCasePerf.test_cases[tcId] = tc;
                });
            }

            // Update overall test case performance
            const testCases = Object.values(testCasePerf.test_cases);
            testCasePerf.total_test_cases = testCases.length;
            testCasePerf.passed_test_cases = testCases.filter(tc => tc.passed_attempts > 0).length;
            
            // Calculate current pass rate (from latest run)
            const currentPassRate = testRunData.total > 0 
                ? testRunData.passed / testRunData.total 
                : 0;
            
            // Calculate average pass rate (from all runs)
            const runs = testRunHistory.runs || [];
            const averagePassRate = runs.length > 0
                ? runs.reduce((sum, r) => sum + (r.passed / r.total), 0) / runs.length
                : currentPassRate;
            
            // Calculate best pass rate (highest ever achieved)
            const bestPassRate = runs.length > 0
                ? Math.max(...runs.map(r => r.passed / r.total))
                : currentPassRate;
            
            // Store all three metrics
            testCasePerf.current_pass_rate = currentPassRate;
            testCasePerf.average_pass_rate = averagePassRate;
            testCasePerf.best_pass_rate = bestPassRate;
            testCasePerf.pass_rate = averagePassRate;  // Default to average for analytics

            // Save - use set() and save() for JSONB fields
            console.log(`[Tracking] Updating tracking ${tracking.tracking_id} with:`, {
                test_runs: testRunHistory.total_test_runs,
                test_cases: Object.keys(testCasePerf.test_cases).length
            });

            tracking.test_run_history = testRunHistory;
            tracking.test_case_performance = testCasePerf;
            tracking.update_time = new Date();
            tracking.changed('test_run_history', true);
            tracking.changed('test_case_performance', true);
            await tracking.save();

            console.log(`[Tracking] Test run tracked for user ${userId}, question ${questionId}`);
            return tracking;

        } catch (error) {
            console.error('[Tracking] Error tracking test run:', error);
            return null; // Don't throw, just log
        }
    }

    /**
     * Update tracking on code submission
     */
    async updateOnSubmission(userId, questionId, quizId, submissionData) {
        try {
            // Get subject_id
            const subjectId = await this._getSubjectIdForQuestion(questionId);

            // Get or create tracking
            const tracking = await UserCodeExerciseTracking.getOrCreate(
                userId,
                questionId,
                quizId,
                subjectId
            );

            // Update submission history
            const submissionHistory = tracking.submission_history || {};
            submissionHistory.total_submissions = (submissionHistory.total_submissions || 0) + 1;

            const allPassed = submissionData.passed_test_cases === submissionData.total_test_cases;
            if (allPassed) {
                submissionHistory.successful_submissions = (submissionHistory.successful_submissions || 0) + 1;
            }

            if (!submissionHistory.first_submission_date) {
                submissionHistory.first_submission_date = new Date();
            }
            submissionHistory.last_submission_date = new Date();

            // Add to submissions array (keep last 10)
            submissionHistory.submissions = submissionHistory.submissions || [];
            submissionHistory.submissions.push({
                submission_id: submissionData.submission_id,
                date: new Date(),
                passed_test_cases: submissionData.passed_test_cases,
                total_test_cases: submissionData.total_test_cases,
                pass_rate: submissionData.passed_test_cases / submissionData.total_test_cases,
                language: submissionData.language,
                status: submissionData.status
            });

            if (submissionHistory.submissions.length > 10) {
                submissionHistory.submissions = submissionHistory.submissions.slice(-10);
            }

            // Update test case performance from submission
            const testCasePerf = tracking.test_case_performance || {};
            testCasePerf.test_cases = testCasePerf.test_cases || {};

            if (submissionData.test_results) {
                submissionData.test_results.forEach(result => {
                    const tcId = String(result.test_case_id);
                    const tc = testCasePerf.test_cases[tcId] || {
                        test_case_id: result.test_case_id,
                        description: result.description || '',
                        total_attempts: 0,
                        passed_attempts: 0,
                        failed_attempts: 0,
                        pass_rate: 0,
                        first_pass_date: null
                    };

                    if (result.passed && !tc.first_pass_date) {
                        tc.first_pass_date = new Date();
                    }

                    testCasePerf.test_cases[tcId] = tc;
                });
            }

            // Update learning progress
            const learningProgress = await this._updateLearningProgress(
                tracking,
                submissionHistory,
                testCasePerf
            );

            // Calculate average test runs before submit
            const testRunHistory = tracking.test_run_history || {};
            if (testRunHistory.total_test_runs > 0) {
                testRunHistory.average_test_runs_before_submit =
                    testRunHistory.total_test_runs / submissionHistory.total_submissions;
            }

            // Save - use set() and save() for JSONB fields
            console.log(`[Tracking] Updating tracking ${tracking.tracking_id} on submission:`, {
                total_submissions: submissionHistory.total_submissions,
                successful: submissionHistory.successful_submissions,
                test_cases: Object.keys(testCasePerf.test_cases).length
            });

            tracking.submission_history = submissionHistory;
            tracking.test_case_performance = testCasePerf;
            tracking.test_run_history = testRunHistory;
            tracking.learning_progress = learningProgress;
            tracking.update_time = new Date();
            tracking.changed('submission_history', true);
            tracking.changed('test_case_performance', true);
            tracking.changed('test_run_history', true);
            tracking.changed('learning_progress', true);
            await tracking.save();

            // Update question analytics (async, don't wait)
            this._updateQuestionAnalytics(questionId, submissionData).catch(err => {
                console.error('[Tracking] Error updating question analytics:', err);
            });

            // Update or create quiz result if quiz_id is provided
            if (quizId) {
                this._updateQuizResult(userId, quizId, questionId, submissionData).catch(err => {
                    console.error('[Tracking] Error updating quiz result:', err);
                });
            }

            console.log(`[Tracking] Submission tracked for user ${userId}, question ${questionId}`);
            return tracking;

        } catch (error) {
            console.error('[Tracking] Error updating on submission:', error);
            throw error;
        }
    }

    /**
     * Update learning progress
     */
    async _updateLearningProgress(tracking, submissionHistory, testCasePerf) {
        const progress = tracking.learning_progress || {};

        // Calculate mastery level based on pass rate
        const passRate = testCasePerf.pass_rate || 0;
        if (passRate >= 0.9) {
            progress.mastery_level = 'expert';
        } else if (passRate >= 0.7) {
            progress.mastery_level = 'advanced';
        } else if (passRate >= 0.5) {
            progress.mastery_level = 'intermediate';
        } else {
            progress.mastery_level = 'beginner';
        }

        // Determine improvement trend
        const submissions = submissionHistory.submissions || [];
        if (submissions.length >= 3) {
            const recent = submissions.slice(-3);
            const recentAvg = recent.reduce((sum, s) => sum + s.pass_rate, 0) / recent.length;
            const older = submissions.slice(0, -3);

            if (older.length > 0) {
                const olderAvg = older.reduce((sum, s) => sum + s.pass_rate, 0) / older.length;
                if (recentAvg > olderAvg + 0.1) {
                    progress.improvement_trend = 'improving';
                } else if (recentAvg < olderAvg - 0.1) {
                    progress.improvement_trend = 'declining';
                } else {
                    progress.improvement_trend = 'stable';
                }
            }
        }

        // Identify stuck and mastered test cases
        const testCases = Object.values(testCasePerf.test_cases || {});
        progress.stuck_test_cases = testCases
            .filter(tc => tc.total_attempts >= 3 && tc.pass_rate === 0)
            .map(tc => tc.test_case_id);

        progress.mastered_test_cases = testCases
            .filter(tc => tc.pass_rate >= 0.8)
            .map(tc => tc.test_case_id);

        // Calculate time to first pass and all pass
        if (submissionHistory.first_submission_date) {
            const firstPass = testCases.find(tc => tc.first_pass_date);
            if (firstPass && !progress.time_to_first_pass) {
                progress.time_to_first_pass =
                    new Date(firstPass.first_pass_date) - new Date(submissionHistory.first_submission_date);
            }

            const allPassed = testCases.every(tc => tc.passed_attempts > 0);
            if (allPassed && !progress.time_to_all_pass) {
                progress.time_to_all_pass =
                    new Date() - new Date(submissionHistory.first_submission_date);
            }
        }

        return progress;
    }

    /**
     * Update question analytics (for teacher view)
     */
    async _updateQuestionAnalytics(questionId, submissionData) {
        // This will be implemented later for teacher analytics
        // For now, just log
        console.log(`[Analytics] Would update analytics for question ${questionId}`);
    }

    /**
     * Get user's tracking for a question
     */
    async getUserTracking(userId, questionId) {
        return await UserCodeExerciseTracking.getTracking(userId, questionId);
    }

    /**
     * Get user's analytics across all questions
     */
    async getUserAnalytics(userId, subjectId = null) {
        const where = { user_id: userId };
        if (subjectId) where.subject_id = subjectId;

        const trackings = await UserCodeExerciseTracking.findAll({
            where,
            include: [{
                model: Question,
                as: 'Question',
                attributes: ['question_id', 'question_text', 'level_id']
            }]
        });

        return this._aggregateUserAnalytics(trackings);
    }

    /**
     * Aggregate user analytics
     */
    _aggregateUserAnalytics(trackings) {
        if (trackings.length === 0) {
            return {
                total_questions_attempted: 0,
                total_submissions: 0,
                average_pass_rate: 0,
                mastery_distribution: {},
                total_test_runs: 0
            };
        }

        const totalSubmissions = trackings.reduce((sum, t) =>
            sum + (t.submission_history?.total_submissions || 0), 0);

        const avgPassRate = trackings.reduce((sum, t) =>
            sum + (t.test_case_performance?.pass_rate || 0), 0) / trackings.length;

        const masteryDist = { beginner: 0, intermediate: 0, advanced: 0, expert: 0 };
        trackings.forEach(t => {
            const level = t.learning_progress?.mastery_level || 'beginner';
            masteryDist[level]++;
        });

        const totalTestRuns = trackings.reduce((sum, t) =>
            sum + (t.test_run_history?.total_test_runs || 0), 0);

        return {
            total_questions_attempted: trackings.length,
            total_submissions: totalSubmissions,
            average_pass_rate: avgPassRate,
            mastery_distribution: masteryDist,
            total_test_runs: totalTestRuns,
            questions: trackings.map(t => ({
                question_id: t.question_id,
                question_text: t.Question?.question_text,
                pass_rate: t.test_case_performance?.pass_rate || 0,
                mastery_level: t.learning_progress?.mastery_level || 'beginner',
                total_submissions: t.submission_history?.total_submissions || 0
            }))
        };
    }

    /**
     * Update or create quiz result when submitting code
     * Score is based on AI analysis (overall_score from submission)
     */
    async _updateQuizResult(userId, quizId, questionId, submissionData) {
        try {
            const { CodeSubmission } = require('../models');

            // Get all questions in quiz
            const quizQuestions = await QuizQuestion.findAll({
                where: { quiz_id: quizId },
                attributes: ['question_id']
            });

            if (quizQuestions.length === 0) {
                console.warn(`[QuizResult] No questions found for quiz ${quizId}`);
                return;
            }

            const totalQuestions = quizQuestions.length;

            // Get all submissions for this user in this quiz
            const allSubmissions = await CodeSubmission.findAll({
                where: {
                    user_id: userId,
                    quiz_id: quizId,
                    status: { [require('sequelize').Op.ne]: 'pending' } // Only completed analysis
                },
                attributes: ['question_id', 'score', 'status', 'submitted_at'],
                order: [['submitted_at', 'DESC']]
            });

            // Get best submission for each question (highest score)
            const questionScores = {};
            for (const submission of allSubmissions) {
                const qid = submission.question_id;
                if (!questionScores[qid] || submission.score > questionScores[qid]) {
                    questionScores[qid] = submission.score || 0;
                }
            }

            // Calculate total score (sum of best scores, normalized to 0-10)
            let totalScore = 0;
            let maxPoints = totalQuestions * 100; // Each question max 100 points from AI

            for (const qq of quizQuestions) {
                const bestScore = questionScores[qq.question_id] || 0;
                totalScore += bestScore;
            }

            // Normalize score to 0-10 scale
            const normalizedScore = maxPoints > 0 ? (totalScore / maxPoints) * 10 : 0;

            // Determine status based on completion
            const attemptedQuestions = Object.keys(questionScores).length;
            const allQuestionsAttempted = attemptedQuestions === totalQuestions;
            const status = allQuestionsAttempted ? 'completed' : 'in_progress';

            // Find or create quiz result
            let quizResult = await QuizResult.findOne({
                where: {
                    user_id: userId,
                    quiz_id: quizId
                }
            });

            if (quizResult) {
                // Update existing result
                await quizResult.update({
                    score: normalizedScore,
                    status: status,
                    raw_total_points: totalScore,
                    max_points: maxPoints,
                    update_time: new Date()
                });
                console.log(`[QuizResult] Updated quiz result ${quizResult.result_id}: score ${normalizedScore.toFixed(2)}/10 (${attemptedQuestions}/${totalQuestions} questions)`);
            } else {
                // Create new result
                quizResult = await QuizResult.create({
                    user_id: userId,
                    quiz_id: quizId,
                    score: normalizedScore,
                    status: status,
                    raw_total_points: totalScore,
                    max_points: maxPoints,
                    update_time: new Date(),
                    completion_time: 0 // Code practice doesn't have time limit
                });
                console.log(`[QuizResult] Created quiz result ${quizResult.result_id}: score ${normalizedScore.toFixed(2)}/10 (${attemptedQuestions}/${totalQuestions} questions)`);
            }

            return quizResult;

        } catch (error) {
            console.error('[QuizResult] Error updating quiz result:', error);
            throw error;
        }
    }
}

module.exports = new CodeExerciseTrackingService();
