// backend/src/services/answerChoiceStatsService.js
// Real-time Answer Choice Statistics Service

const { db } = require("../config/firebase");
const { setCache, getCache } = require("../redis/utils");

class AnswerChoiceStatsService {
  constructor(io) {
    this.io = io;
  }

  /**
   * Track answer choice selection in real-time
   * @param {number} quizId - Quiz ID
   * @param {number} questionId - Question ID
   * @param {number} userId - User ID
   * @param {number} answerId - Selected answer ID
   * @param {boolean} isCorrect - Whether answer is correct
   * @param {Object} userInfo - User information từ controller để tránh query DB
   */
  async trackAnswerChoice(
    quizId,
    questionId,
    userId,
    answerId,
    isCorrect,
    userInfo = null
  ) {
    try {
      const statsKey = `quiz:${quizId}:question:${questionId}:choices`;
      const userChoiceKey = `quiz:${quizId}:question:${questionId}:user:${userId}`;

      // Check if user already answered this question
      const existingChoice = await getCache(userChoiceKey);
      if (existingChoice) {
        // Remove previous choice from stats
        await this.removeChoiceFromStats(statsKey, existingChoice.answer_id);
      }

      // Add new choice to stats
      const choiceStats = await this.addChoiceToStats(
        statsKey,
        answerId,
        isCorrect
      );

      // Store user's choice
      await setCache(
        userChoiceKey,
        {
          answer_id: answerId,
          is_correct: isCorrect,
          timestamp: Date.now(),
          user_info: userInfo, // Cache user info để tránh query DB sau này
        },
        3600
      ); // 1 hour cache

      // Store in Firebase for persistence với user info
      await this.saveToFirebase(
        quizId,
        questionId,
        userId,
        answerId,
        isCorrect,
        userInfo
      );

      // Emit real-time update to all quiz participants
      this.emitChoiceStatsUpdate(quizId, questionId, choiceStats);

      return choiceStats;
    } catch (error) {
      console.error("Error tracking answer choice:", error);
      throw error;
    }
  }

  /**
   * Add choice to statistics
   */
  async addChoiceToStats(statsKey, answerId, isCorrect) {
    try {
      let stats = (await getCache(statsKey)) || {};

      if (!stats[answerId]) {
        stats[answerId] = {
          count: 0,
          correct_count: 0,
          incorrect_count: 0,
          percentage: 0,
        };
      }

      stats[answerId].count += 1;
      if (isCorrect) {
        stats[answerId].correct_count += 1;
      } else {
        stats[answerId].incorrect_count += 1;
      }

      // Calculate total responses and percentages
      const totalResponses = Object.values(stats).reduce(
        (sum, stat) => sum + stat.count,
        0
      );

      Object.keys(stats).forEach((id) => {
        stats[id].percentage =
          totalResponses > 0
            ? ((stats[id].count / totalResponses) * 100).toFixed(1)
            : 0;
      });

      // Cache for 1 hour
      await setCache(statsKey, stats, 3600);
      return stats;
    } catch (error) {
      console.error("Error adding choice to stats:", error);
      throw error;
    }
  }

  /**
   * Remove choice from statistics (when user changes answer)
   */
  async removeChoiceFromStats(statsKey, answerId) {
    try {
      let stats = (await getCache(statsKey)) || {};

      if (stats[answerId] && stats[answerId].count > 0) {
        stats[answerId].count -= 1;

        // Recalculate percentages
        const totalResponses = Object.values(stats).reduce(
          (sum, stat) => sum + stat.count,
          0
        );
        Object.keys(stats).forEach((id) => {
          stats[id].percentage =
            totalResponses > 0
              ? ((stats[id].count / totalResponses) * 100).toFixed(1)
              : 0;
        });

        await setCache(statsKey, stats, 3600);
      }
    } catch (error) {
      console.error("Error removing choice from stats:", error);
    }
  }

  /**
   * Save to Firebase for persistence
   * @param {number} quizId - Quiz ID
   * @param {number} questionId - Question ID
   * @param {number} userId - User ID
   * @param {number} answerId - Answer ID
   * @param {boolean} isCorrect - Whether answer is correct
   * @param {Object} userInfo - User information để tránh query DB
   */
  async saveToFirebase(
    quizId,
    questionId,
    userId,
    answerId,
    isCorrect,
    userInfo = null
  ) {
    try {
      const firebaseRef = db.ref(
        `quiz_sessions/${quizId}/answer_choices/${questionId}/${userId}`
      );

      const choiceData = {
        answer_id: answerId,
        is_correct: isCorrect,
        timestamp: Date.now(),
        user_info: userInfo || {
          user_id: userId,
          // Fallback info nếu không có userInfo
          name: `User ${userId}`,
          cached: false,
        },
      };

      await firebaseRef.set(choiceData);
    } catch (error) {
      console.error("Error saving to Firebase:", error);
      // Không throw error để không ảnh hưởng đến flow chính
    }
  }

  /**
   * Get current choice statistics for a question
   * @param {number} quizId - Quiz ID
   * @param {number} questionId - Question ID
   * @returns {Object} Choice statistics
   */
  async getChoiceStats(quizId, questionId) {
    try {
      const statsKey = `quiz:${quizId}:question:${questionId}:choices`;
      let stats = (await getCache(statsKey)) || {}; // ĐỔI THÀNH let ĐỂ CÓ THỂ GÁN LẠI

      // If no cache, try to rebuild from Firebase
      if (Object.keys(stats).length === 0) {
        console.log(
          `[AnswerChoiceStats] Cache miss for ${statsKey}, rebuilding from Firebase...`
        );
        stats = await this.rebuildStatsFromFirebase(quizId, questionId);
      }

      return stats;
    } catch (error) {
      console.error("Error getting choice stats:", error);
      return {};
    }
  }

  /**
   * Rebuild statistics from Firebase data
   */
  async rebuildStatsFromFirebase(quizId, questionId) {
    try {
      const firebaseRef = db.ref(
        `quiz_sessions/${quizId}/answer_choices/${questionId}`
      );
      const snapshot = await firebaseRef.once("value");
      const data = snapshot.val() || {};

      const stats = {};
      Object.values(data).forEach((choice) => {
        const answerId = choice.answer_id;
        if (!stats[answerId]) {
          stats[answerId] = {
            count: 0,
            correct_count: 0,
            incorrect_count: 0,
            percentage: 0,
          };
        }

        stats[answerId].count += 1;
        if (choice.is_correct) {
          stats[answerId].correct_count += 1;
        } else {
          stats[answerId].incorrect_count += 1;
        }
      });

      // Calculate percentages
      const totalResponses = Object.values(stats).reduce(
        (sum, stat) => sum + stat.count,
        0
      );
      Object.keys(stats).forEach((id) => {
        stats[id].percentage =
          totalResponses > 0
            ? ((stats[id].count / totalResponses) * 100).toFixed(1)
            : 0;
      });

      // Cache the rebuilt stats
      const statsKey = `quiz:${quizId}:question:${questionId}:choices`;
      await setCache(statsKey, stats, 3600);

      return stats;
    } catch (error) {
      console.error("Error rebuilding stats from Firebase:", error);
      return {};
    }
  }

  /**
   * Emit real-time choice statistics update
   */
  emitChoiceStatsUpdate(quizId, questionId, choiceStats) {
    if (this.io) {
      // Emit to all participants in the quiz
      this.io.to(`quiz:${quizId}`).emit("answerChoiceStatsUpdate", {
        quiz_id: quizId,
        question_id: questionId,
        choice_stats: choiceStats,
        timestamp: Date.now(),
      });

      // Emit to teachers monitoring the quiz
      this.io.to(`quiz:${quizId}:teachers`).emit("teacherChoiceStatsUpdate", {
        quiz_id: quizId,
        question_id: questionId,
        choice_stats: choiceStats,
        detailed_stats: this.calculateDetailedStats(choiceStats),
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Calculate detailed statistics for teachers
   */
  calculateDetailedStats(choiceStats) {
    const totalResponses = Object.values(choiceStats).reduce(
      (sum, stat) => sum + stat.count,
      0
    );
    const correctResponses = Object.values(choiceStats).reduce(
      (sum, stat) => sum + stat.correct_count,
      0
    );

    return {
      total_responses: totalResponses,
      correct_responses: correctResponses,
      accuracy_rate:
        totalResponses > 0
          ? ((correctResponses / totalResponses) * 100).toFixed(1)
          : 0,
      response_distribution: choiceStats,
    };
  }

  /**
   * Clear choice statistics for a question (reset)
   */
  async clearChoiceStats(quizId, questionId) {
    try {
      const statsKey = `quiz:${quizId}:question:${questionId}:choices`;
      await setCache(statsKey, {}, 3600);

      // Clear from Firebase
      const firebaseRef = db.ref(
        `quiz_sessions/${quizId}/answer_choices/${questionId}`
      );
      await firebaseRef.remove();

      // Emit clear event
      if (this.io) {
        this.io.to(`quiz:${quizId}`).emit("answerChoiceStatsCleared", {
          quiz_id: quizId,
          question_id: questionId,
          timestamp: Date.now(),
        });
      }

      return true;
    } catch (error) {
      console.error("Error clearing choice stats:", error);
      return false;
    }
  }

  /**
   * Get quiz-wide choice statistics summary
   */
  async getQuizChoiceStatsSummary(quizId) {
    try {
      const { Quiz, Question } = require("../models");

      // Get all questions in the quiz
      const quiz = await Quiz.findByPk(quizId, {
        include: [
          {
            model: Question,
            as: "Questions",
            through: { attributes: [] },
            attributes: ["question_id", "question_text"],
          },
        ],
      });

      if (!quiz) {
        throw new Error("Quiz not found");
      }

      const summary = {
        quiz_id: quizId,
        total_questions: quiz.Questions.length,
        questions_with_responses: 0,
        total_responses: 0,
        overall_accuracy: 0,
        question_stats: [],
      };

      let totalCorrect = 0;
      let totalAnswers = 0;

      for (const question of quiz.Questions) {
        const stats = await this.getChoiceStats(quizId, question.question_id);
        const questionTotal = Object.values(stats).reduce(
          (sum, stat) => sum + stat.count,
          0
        );
        const questionCorrect = Object.values(stats).reduce(
          (sum, stat) => sum + stat.correct_count,
          0
        );

        if (questionTotal > 0) {
          summary.questions_with_responses += 1;
          summary.total_responses += questionTotal;
          totalCorrect += questionCorrect;
          totalAnswers += questionTotal;
        }

        summary.question_stats.push({
          question_id: question.question_id,
          question_text: question.question_text.substring(0, 100) + "...",
          total_responses: questionTotal,
          accuracy_rate:
            questionTotal > 0
              ? ((questionCorrect / questionTotal) * 100).toFixed(1)
              : 0,
          choice_distribution: stats,
        });
      }

      summary.overall_accuracy =
        totalAnswers > 0 ? ((totalCorrect / totalAnswers) * 100).toFixed(1) : 0;

      return summary;
    } catch (error) {
      console.error("Error getting quiz choice stats summary:", error);
      throw error;
    }
  }
}

module.exports = AnswerChoiceStatsService;
