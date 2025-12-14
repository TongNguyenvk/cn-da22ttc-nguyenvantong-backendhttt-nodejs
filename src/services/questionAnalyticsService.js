// services/questionAnalyticsService.js
/**
 * Service for analyzing question difficulty and student performance in real-time
 * Detects misconceptions and provides teaching insights
 */

const { Question, Answer, Level, LO } = require("../models");
const { db } = require("../config/firebase");

class QuestionAnalyticsService {
  /**
   * Analyze live question difficulty based on real-time student responses
   * @param {number} quizId - Quiz ID
   * @param {number} questionId - Question ID
   * @param {Object} participants - Firebase participants data
   * @returns {Object} Comprehensive question analytics
   */
  async analyzeLiveQuestionDifficulty(quizId, questionId, participants) {
    try {
      // Get question details from database
      const question = await Question.findByPk(questionId, {
        include: [
          { model: Level, as: "Level" },
          { model: LO, as: "LO" },
          { model: Answer, as: "Answers" }
        ]
      });

      if (!question) {
        console.warn(`Question ${questionId} not found`);
        return null;
      }

      // Calculate real-time statistics from participants
      const stats = this.calculateQuestionStats(questionId, participants);

      // Expected correct rate based on difficulty level
      const expectedRate = this.getExpectedCorrectRate(question.Level?.name);

      // Calculate deviation
      const deviation = stats.correct_rate - expectedRate;

      // Detect misconceptions
      const misconceptions = this.detectMisconceptions(
        question.Answers,
        stats.answer_counts,
        stats.times_by_answer
      );

      // Segment students by performance
      const segments = this.segmentStudents(
        questionId,
        participants,
        stats.class_avg_time
      );

      return {
        question_id: questionId,
        question_text: question.question_text,
        lo: question.LO ? {
          lo_id: question.LO.lo_id,
          name: question.LO.name
        } : null,
        level: question.Level ? {
          level_id: question.Level.level_id,
          name: question.Level.name
        } : null,

        live_stats: {
          answered_count: stats.answered_count,
          not_answered_count: stats.not_answered_count,
          correct_count: stats.correct_count,
          incorrect_count: stats.incorrect_count,
          current_correct_rate: Math.round(stats.correct_rate * 10) / 10,
          avg_response_time: Math.round(stats.avg_time * 10) / 10,
          median_response_time: Math.round(stats.median_time * 10) / 10,

          answer_choice_breakdown: this.formatAnswerBreakdown(
            question.Answers,
            stats.answer_counts,
            stats.times_by_answer,
            stats.answered_count
          )
        },

        insights: {
          difficulty_assessment: this.assessDifficulty(deviation),
          expected_correct_rate: expectedRate,
          actual_correct_rate: Math.round(stats.correct_rate * 10) / 10,
          deviation: Math.round(deviation * 10) / 10,
          
          common_misconception: misconceptions,
          
          teaching_suggestion: this.generateTeachingSuggestion(
            deviation,
            misconceptions,
            stats.correct_rate
          )
        },

        student_segments: segments
      };
    } catch (error) {
      console.error("Error in analyzeLiveQuestionDifficulty:", error);
      return null;
    }
  }

  /**
   * Calculate statistics for a specific question from participants data
   */
  calculateQuestionStats(questionId, participants) {
    const stats = {
      answered_count: 0,
      not_answered_count: 0,
      correct_count: 0,
      incorrect_count: 0,
      answer_counts: {},
      times_by_answer: {},
      all_times: [],
      class_avg_time: 0
    };

    if (!participants) {
      return { ...stats, correct_rate: 0, avg_time: 0, median_time: 0 };
    }

    const totalParticipants = Object.keys(participants).length;

    Object.values(participants).forEach(participant => {
      const answer = participant.answers?.[questionId];
      
      if (answer) {
        stats.answered_count++;
        
        // Count correct/incorrect
        if (answer.is_correct) {
          stats.correct_count++;
        } else {
          stats.incorrect_count++;
        }

        // Track answer choices
        const answerId = answer.answer_id;
        stats.answer_counts[answerId] = (stats.answer_counts[answerId] || 0) + 1;
        
        // Track response times
        const responseTime = answer.response_time || 0;
        stats.all_times.push(responseTime / 1000); // Convert to seconds
        
        if (!stats.times_by_answer[answerId]) {
          stats.times_by_answer[answerId] = [];
        }
        stats.times_by_answer[answerId].push(responseTime / 1000);
      }
    });

    stats.not_answered_count = totalParticipants - stats.answered_count;

    // Calculate rates and averages
    stats.correct_rate = stats.answered_count > 0
      ? (stats.correct_count / stats.answered_count) * 100
      : 0;

    stats.avg_time = stats.all_times.length > 0
      ? stats.all_times.reduce((a, b) => a + b, 0) / stats.all_times.length
      : 0;

    stats.median_time = this.calculateMedian(stats.all_times);
    stats.class_avg_time = stats.avg_time;

    return stats;
  }

  /**
   * Get expected correct rate based on difficulty level
   */
  getExpectedCorrectRate(levelName) {
    if (!levelName) return 60;

    const level = levelName.toLowerCase();
    const expectedRates = {
      easy: 80,
      medium: 60,
      hard: 40
    };

    return expectedRates[level] || 60;
  }

  /**
   * Assess difficulty based on deviation from expected
   */
  assessDifficulty(deviation) {
    if (deviation >= 20) return "Much easier than expected";
    if (deviation >= 10) return "Easier than expected";
    if (deviation >= -10) return "As expected";
    if (deviation >= -20) return "Harder than expected";
    return "Much harder than expected";
  }

  /**
   * Detect common misconceptions
   */
  detectMisconceptions(answers, answerCounts, timesByAnswer) {
    if (!answers || answers.length === 0) {
      return { detected: false };
    }

    // Find wrong answers that were chosen frequently and quickly
    for (const answer of answers) {
      if (!answer.iscorrect) {
        const count = answerCounts[answer.answer_id] || 0;
        const times = timesByAnswer[answer.answer_id] || [];
        
        if (times.length === 0) continue;

        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const totalAnswered = Object.values(answerCounts).reduce((a, b) => a + b, 0);
        
        if (totalAnswered === 0) continue;

        const percentage = (count / totalAnswered) * 100;

        // Misconception detected if:
        // - More than 30% chose this wrong answer
        // - Average response time is quick (<7 seconds)
        if (percentage > 30 && avgTime < 7) {
          return {
            detected: true,
            misconception: `Many students confidently chose wrong answer`,
            wrong_answer: answer.answer_text,
            percentage: Math.round(percentage * 10) / 10,
            avg_time: Math.round(avgTime * 10) / 10,
            evidence: `${percentage.toFixed(1)}% selected this wrong answer quickly (avg ${avgTime.toFixed(1)}s)`,
            suggestion: "This indicates a common misconception that should be addressed immediately"
          };
        }
      }
    }

    return { detected: false };
  }

  /**
   * Format answer breakdown for display
   */
  formatAnswerBreakdown(answers, answerCounts, timesByAnswer, totalAnswered) {
    if (!answers || answers.length === 0) return [];

    return answers.map(answer => {
      const count = answerCounts[answer.answer_id] || 0;
      const times = timesByAnswer[answer.answer_id] || [];
      const avgTime = times.length > 0
        ? times.reduce((a, b) => a + b, 0) / times.length
        : 0;

      const percentage = totalAnswered > 0 ? (count / totalAnswered) * 100 : 0;

      // Determine confidence level based on response time
      let confidenceLevel = "Medium";
      if (avgTime < 5) confidenceLevel = "High";
      else if (avgTime > 10) confidenceLevel = "Low";

      return {
        answer_id: answer.answer_id,
        answer_text: answer.answer_text,
        is_correct: answer.iscorrect,
        selected_count: count,
        percentage: Math.round(percentage * 10) / 10,
        avg_response_time: Math.round(avgTime * 10) / 10,
        confidence_level: confidenceLevel
      };
    }).sort((a, b) => b.selected_count - a.selected_count);
  }

  /**
   * Segment students by performance on this question
   */
  segmentStudents(questionId, participants, classAvgTime) {
    const segments = {
      quick_correct: 0,    // Fast + Correct = Mastery
      slow_correct: 0,     // Slow + Correct = Learning
      quick_incorrect: 0,  // Fast + Wrong = Misconception
      slow_incorrect: 0    // Slow + Wrong = Struggling
    };

    if (!participants) return segments;

    Object.values(participants).forEach(participant => {
      const answer = participant.answers?.[questionId];
      if (!answer) return;

      const responseTime = (answer.response_time || 0) / 1000; // Convert to seconds
      const isQuick = responseTime < classAvgTime;

      if (answer.is_correct) {
        if (isQuick) {
          segments.quick_correct++;
        } else {
          segments.slow_correct++;
        }
      } else {
        if (isQuick) {
          segments.quick_incorrect++;
        } else {
          segments.slow_incorrect++;
        }
      }
    });

    return segments;
  }

  /**
   * Generate teaching suggestion based on analysis
   */
  generateTeachingSuggestion(deviation, misconceptions, correctRate) {
    const suggestions = [];

    // Low performance
    if (correctRate < 40) {
      suggestions.push("Consider pausing to review this concept before continuing");
    }

    // Much harder than expected
    if (deviation < -20) {
      suggestions.push("This question is significantly harder than expected - review teaching approach");
    }

    // Misconception detected
    if (misconceptions.detected) {
      suggestions.push("Address the common misconception immediately to prevent it from spreading");
    }

    // Good performance
    if (correctRate > 80) {
      suggestions.push("Students mastered this concept well - can move forward confidently");
    }

    return suggestions.length > 0
      ? suggestions.join(". ")
      : "Continue monitoring student performance";
  }

  /**
   * Calculate median from array of numbers
   */
  calculateMedian(arr) {
    if (arr.length === 0) return 0;

    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }
}

module.exports = new QuestionAnalyticsService();
