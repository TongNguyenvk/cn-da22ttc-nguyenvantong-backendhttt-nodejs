// backend/src/services/quizRacingService.js
// Real-time Quiz Racing Service (Skills System Removed)

const { setCache, getCache, deleteCache } = require("../redis/utils");

class QuizRacingService {
  constructor(io) {
    this.io = io;
  }

  // =====================================================
  // QUIZ RACING SESSION MANAGEMENT
  // =====================================================

  /**
   * Initialize quiz racing session
   */
  async initializeQuizRacing(quizSessionId, participants, totalQuestions) {
    try {
      const sessionData = {
        quiz_session_id: quizSessionId,
        participants: participants.map((p) => ({
          user_id: p.user_id,
          username: p.username,
          current_score: 0,
          current_streak: 0,
          position: 0,
        })),
        total_questions: totalQuestions,
        current_question_index: 0,
        round_number: 1,
        session_start_time: Date.now(),
        quiz_timer: null,
      };

      // Cache session data
      await setCache(
        `quiz_racing:${quizSessionId}`,
        JSON.stringify(sessionData),
        7200
      );

      // Emit session initialized
      this.io.to(`quiz:${quizSessionId}`).emit("quiz-racing-initialized", {
        session_id: quizSessionId,
        participants: sessionData.participants,
        total_questions: totalQuestions,
        timestamp: Date.now(),
      });

      return { success: true, session_data: sessionData };
    } catch (error) {
      console.error("Error initializing quiz racing:", error);
      return { success: false, error: error.message };
    }
  }

  // =====================================================
  // SESSION DATA MANAGEMENT
  // =====================================================

  async getSessionData(quizSessionId) {
    try {
      const data = await getCache(`quiz_racing:${quizSessionId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error("Error getting session data:", error);
      return null;
    }
  }

  async updateSessionData(quizSessionId, sessionData) {
    try {
      await setCache(
        `quiz_racing:${quizSessionId}`,
        JSON.stringify(sessionData),
        7200
      );
      return true;
    } catch (error) {
      console.error("Error updating session data:", error);
      return false;
    }
  }

  // =====================================================
  // ROUND COMPLETION SYSTEM
  // =====================================================

  /**
   * Complete a round and handle top finisher events
   */
  async completeRound({
    quiz_id,
    user_id,
    round_number,
    round_score,
    skipped_round,
  }) {
    try {
      const sessionKey = `round_completion:${quiz_id}:${round_number}`;

      // Get or initialize round completion data
      let roundData = await getCache(sessionKey);
      if (!roundData) {
        roundData = {
          quiz_id,
          round_number,
          finishers: [],
          total_participants: 0,
          start_time: Date.now(),
        };
      } else {
        roundData = JSON.parse(roundData);
      }

      // Get user data
      const { User } = require("../models");
      const user = await User.findByPk(user_id);
      if (!user) {
        return { success: false, message: "User not found" };
      }

      // Check if user already completed this round
      const existingFinisher = roundData.finishers.find(
        (f) => f.user_id === user_id
      );
      if (existingFinisher) {
        return {
          success: false,
          message: "Round already completed by this user",
        };
      }

      // Get current total score from session
      let totalScore = round_score;
      try {
        const userScoreKey = `user_total_score:${quiz_id}:${user_id}`;
        const existingScore = await getCache(userScoreKey);
        if (existingScore) {
          totalScore = parseInt(existingScore) + round_score;
        } else {
          totalScore = round_score;
        }
        await setCache(userScoreKey, totalScore.toString(), 7200);
      } catch (error) {
        console.warn("Error updating total score:", error);
      }

      // Add finisher to round data
      const finisher = {
        user_id,
        username: user.username,
        full_name: user.name || user.username,
        round_score,
        total_score: totalScore,
        finish_time: Date.now(),
        skipped_round,
      };

      roundData.finishers.push(finisher);

      // Sort finishers by score (highest first), then by time (earliest first)
      roundData.finishers.sort((a, b) => {
        if (a.skipped_round && !b.skipped_round) return 1;
        if (!a.skipped_round && b.skipped_round) return -1;
        if (a.round_score !== b.round_score)
          return b.round_score - a.round_score;
        return a.finish_time - b.finish_time;
      });

      // Calculate rank changes
      const previousRank = await this.getUserPreviousRank(quiz_id, user_id);
      const currentRank =
        roundData.finishers.findIndex((f) => f.user_id === user_id) + 1;

      const rankChange = {
        previous_rank: previousRank,
        current_rank: currentRank,
        moved_up: previousRank > currentRank,
      };

      // Check if this user is in top 3 and not skipped
      const position =
        roundData.finishers.findIndex(
          (f) => f.user_id === user_id && !f.skipped_round
        ) + 1;

      // Save updated round data
      await setCache(sessionKey, JSON.stringify(roundData), 7200);

      // Emit top finisher event if in top 3
      if (position <= 3 && !skipped_round) {
        await this.emitTopFinisherEvent(
          quiz_id,
          round_number,
          finisher,
          position
        );
      }

      // Emit leaderboard update
      await this.emitLeaderboardUpdate(quiz_id, roundData.finishers);

      return {
        success: true,
        round_result: {
          user_id,
          username: user.username,
          round_number,
          round_score,
          total_score: totalScore,
          rank_change: rankChange,
        },
      };
    } catch (error) {
      console.error("Error completing round:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Emit top finisher event with celebration
   */
  async emitTopFinisherEvent(quiz_id, round_number, finisher, position) {
    try {
      const finishOrders = ["1st", "2nd", "3rd"];
      const celebrationTypes = ["gold", "silver", "bronze"];
      const medals = ["🥇", "🥈", "🥉"];

      const eventData = {
        type: "round_top_finisher",
        round_number,
        finisher: {
          position,
          user_id: finisher.user_id,
          username: finisher.username,
          full_name: finisher.full_name,
          round_score: finisher.round_score,
          finish_order: finishOrders[position - 1],
        },
        message: `${medals[position - 1]} ${finisher.full_name} về đích ${
          finishOrders[position - 1]
        } vòng ${round_number}!`,
        celebration_type: celebrationTypes[position - 1],
        timestamp: Date.now(),
      };

      // Emit to all users in the quiz
      this.io.to(`quiz:${quiz_id}`).emit("round-top-finisher", eventData);

      console.log(
        `🏆 Top finisher event emitted: ${finisher.full_name} - Position ${position} - Round ${round_number}`
      );
    } catch (error) {
      console.error("Error emitting top finisher event:", error);
    }
  }

  /**
   * Emit leaderboard update
   */
  async emitLeaderboardUpdate(quiz_id, finishers) {
    try {
      const leaderboardData = {
        quiz_id,
        leaderboard: finishers.map((f, index) => ({
          rank: index + 1,
          user_id: f.user_id,
          username: f.username,
          full_name: f.full_name,
          total_score: f.total_score,
          round_score: f.round_score,
          skipped_round: f.skipped_round,
        })),
        timestamp: Date.now(),
      };

      this.io.to(`quiz:${quiz_id}`).emit("leaderboard-update", leaderboardData);
    } catch (error) {
      console.error("Error emitting leaderboard update:", error);
    }
  }

  /**
   * Get user's previous rank
   */
  async getUserPreviousRank(quiz_id, user_id) {
    try {
      const userRankKey = `user_rank:${quiz_id}:${user_id}`;
      const previousRank = await getCache(userRankKey);
      return previousRank ? parseInt(previousRank) : 999;
    } catch (error) {
      console.warn("Error getting previous rank:", error);
      return 999;
    }
  }
}

module.exports = QuizRacingService;
