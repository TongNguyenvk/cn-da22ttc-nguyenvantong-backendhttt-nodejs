'use strict';
/**
 * Service to build daily course & LO analytics rollups from base tables.
 */
const { sequelize, CourseAnalyticsRollup, CourseLORollup, Course, LO, QuizResult, UserQuestionHistory, Question } = require('../models');
const { Op } = require('sequelize');

async function computeCourseRollup(courseId, date = new Date()) {
  const snapshotDate = date.toISOString().slice(0,10);

  // Aggregate quiz-level performance
  const [quizAgg] = await sequelize.query(`
    SELECT 
      COUNT(DISTINCT qr.user_id) AS active_students,
      AVG(qr.score) AS avg_score,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY qr.score) AS median_score,
      AVG(CASE WHEN qr.score >= 5 THEN 1 ELSE 0 END) AS pass_rate,
      COUNT(*) AS attempts
    FROM "QuizResults" qr
    WHERE qr.course_id = :courseId
  `,{ replacements:{ courseId }, type: sequelize.QueryTypes.SELECT });

  // Difficulty breakdown & avg mastery proxy by correct ratio in UQH
  const [difficultyAgg] = await sequelize.query(`
    SELECT jsonb_object_agg(level_name, jsonb_build_object('attempts', attempts, 'correct_rate', correct_rate)) AS difficulty_breakdown
    FROM (
      SELECT q.level::text AS level_name,
             COUNT(uqh.user_question_history_id) AS attempts,
             COALESCE(AVG(CASE WHEN uqh.is_correct THEN 1 ELSE 0 END),0) AS correct_rate
      FROM "UserQuestionHistory" uqh
      JOIN "Questions" q ON q.question_id = uqh.question_id
      WHERE uqh.course_id = :courseId
      GROUP BY q.level
    ) s;
  `,{ replacements:{ courseId }, type: sequelize.QueryTypes.SELECT });

  const metrics = {
    ...quizAgg,
    difficulty_breakdown: difficultyAgg?.difficulty_breakdown || {},
  };

  // Simple confidence: sqrt(n/(n+25)) with n=attempts
  const attempts = parseInt(quizAgg.attempts || 0,10);
  const confidence = attempts ? Math.sqrt(attempts/(attempts+25)).toFixed(4) : null;

  await CourseAnalyticsRollup.upsert({ course_id: courseId, snapshot_date: snapshotDate, metrics, confidence });
  return { course_id: courseId, snapshot_date: snapshotDate, metrics, confidence };
}

async function computeCourseLORollups(courseId, date = new Date()) {
  const snapshotDate = date.toISOString().slice(0,10);
  const los = await LO.findAll({ include: [], raw: true });

  const results = [];
  for (const lo of los) {
    const [stat] = await sequelize.query(`
      SELECT 
        COUNT(uqh.user_question_history_id) AS attempts,
        SUM(CASE WHEN uqh.is_correct THEN 1 ELSE 0 END) AS correct,
        COALESCE(AVG(CASE WHEN uqh.is_correct THEN 1 ELSE 0 END),0) AS accuracy
      FROM "UserQuestionHistory" uqh
      JOIN "Questions" q ON q.question_id = uqh.question_id
      WHERE uqh.course_id = :courseId AND q.lo_id = :loId
    `,{ replacements:{ courseId, loId: lo.lo_id }, type: sequelize.QueryTypes.SELECT });

    const attempts = parseInt(stat.attempts||0,10);
    const confidence = attempts ? Math.sqrt(attempts/(attempts+15)).toFixed(4) : null;
    const stats = { attempts: attempts, correct: parseInt(stat.correct||0,10), accuracy: parseFloat(stat.accuracy||0), updated_from: 'daily_job' };
    await CourseLORollup.upsert({ course_id: courseId, lo_id: lo.lo_id, snapshot_date: snapshotDate, stats, confidence });
    results.push({ course_id: courseId, lo_id: lo.lo_id, snapshot_date: snapshotDate, stats, confidence });
  }
  return results;
}

module.exports = { computeCourseRollup, computeCourseLORollups };
