const {
  User,
  Question,
  QuizResult,
  UserQuestionHistory,
  LevelRequirement,
} = require("../models");
const AchievementService = require("./achievementService");
const { Op } = require("sequelize");

/**
 * Dynamic Scoring Service - Hệ thống tính điểm động cho Quiz
 * Implements advanced scoring mechanics theo game plan
 */
class DynamicScoringService {
  // =====================================================
  // SCORING CONFIGURATION
  // =====================================================

  static SCORING_CONFIG = {
    // Base points
    BASE_POINTS: {
      CORRECT_ANSWER: 10,
      PARTIAL_CORRECT: 5, // Cho câu trả lời đúng lần 2
      WRONG_ANSWER: 0,
    },

    // Speed bonus tiers (milliseconds)
    SPEED_TIERS: [
      { threshold: 2000, bonus: 15, name: "Lightning Fast" }, // < 2s
      { threshold: 3000, bonus: 10, name: "Very Fast" }, // < 3s
      { threshold: 5000, bonus: 5, name: "Fast" }, // < 5s
      { threshold: 8000, bonus: 2, name: "Quick" }, // < 8s
    ],

    // Streak multipliers
    STREAK_SYSTEM: {
      MIN_STREAK: 3, // Streak bắt đầu từ câu thứ 3
      STREAK_BONUS: 2, // +2 điểm mỗi câu trong streak
      COMBO_THRESHOLDS: [
        { streak: 5, multiplier: 1.2, name: "Hot Streak" },
        { streak: 10, multiplier: 1.5, name: "On Fire" },
        { streak: 15, multiplier: 2.0, name: "Unstoppable" },
        { streak: 20, multiplier: 2.5, name: "Legendary" },
      ],
    },

    // Difficulty multipliers
    DIFFICULTY_MULTIPLIERS: {
      easy: 1.0,
      medium: 1.2,
      hard: 1.5,
      expert: 2.0,
    },

    // Time-based bonuses
    TIME_BONUS: {
      EARLY_FINISH_THRESHOLD: 0.5, // Hoàn thành trước 50% thời gian
      EARLY_FINISH_BONUS: 25, // +25 điểm
      TIME_PRESSURE_THRESHOLD: 0.9, // Còn lại 10% thời gian
      TIME_PRESSURE_MULTIPLIER: 1.3, // x1.3 điểm
    },

    // Perfect quiz bonuses
    PERFECT_BONUSES: {
      PERFECT_SCORE: 50, // 100% correct
      PERFECT_SPEED: 30, // Tất cả câu < 5s
      PERFECT_STREAK: 40, // Không bị gián đoạn streak
      FLAWLESS_VICTORY: 100, // Perfect score + speed + streak
    },
  };

  // =====================================================
  // CORE SCORING METHODS
  // =====================================================

  /**
   * Tính điểm cho một câu trả lời với tất cả bonuses
   */
  static async calculateQuestionScore(params) {
    const {
      userId,
      questionId,
      quizId,
      isCorrect,
      responseTime,
      attemptNumber = 1,
      questionDifficulty = "medium",
      totalQuizTime = null,
      timeRemaining = null,
    } = params;

    if (!isCorrect) {
      return {
        base_points: 0,
        speed_bonus: 0,
        streak_bonus: 0,
        difficulty_bonus: 0,
        time_bonus: 0,
        total_points: 0,
        bonuses: [],
        streak_info: null,
      };
    }

    // 1. Base points
    let basePoints =
      attemptNumber === 1
        ? this.SCORING_CONFIG.BASE_POINTS.CORRECT_ANSWER
        : this.SCORING_CONFIG.BASE_POINTS.PARTIAL_CORRECT;

    // 2. Speed bonus
    const speedBonus = this.calculateSpeedBonus(responseTime);

    // 3. Streak bonus
    const streakInfo = await this.calculateStreakBonus(
      userId,
      quizId,
      isCorrect
    );

    // 4. Difficulty multiplier - ĐẢM BẢO KHÔNG BAO GIỜ LÀ UNDEFINED
    const validDifficulty = questionDifficulty || "medium"; // Đảm bảo có giá trị mặc định
    const difficultyMultiplier =
      this.SCORING_CONFIG.DIFFICULTY_MULTIPLIERS[validDifficulty] ?? 1.0; // Sử dụng ?? để xử lý cả null và undefined

    console.log(
      `[DynamicScoring] Question ${questionId}: difficulty="${questionDifficulty}" -> validDifficulty="${validDifficulty}" -> multiplier=${difficultyMultiplier}`
    );

    // 5. Time pressure bonus
    const timeBonus = this.calculateTimeBonus(totalQuizTime, timeRemaining);

    // Apply multipliers
    let totalPoints = basePoints;
    totalPoints += speedBonus.bonus;
    totalPoints += streakInfo.bonus;
    totalPoints *= difficultyMultiplier;
    totalPoints += timeBonus.bonus;

    // Apply streak multiplier
    if (streakInfo.multiplier > 1) {
      totalPoints *= streakInfo.multiplier;
    }

    totalPoints = Math.round(totalPoints);

    const bonuses = [];
    if (speedBonus?.bonus > 0) bonuses.push(speedBonus.name);
    if (streakInfo?.bonus > 0) bonuses.push(streakInfo.name);
    if (difficultyMultiplier > 1)
      bonuses.push(`${validDifficulty.toUpperCase()} Question`); // Sử dụng validDifficulty thay vì questionDifficulty
    if (timeBonus?.bonus > 0) bonuses.push(timeBonus.name);
    if (streakInfo?.multiplier > 1) bonuses.push(streakInfo.combo_name);

    // ĐẢM BẢO TẤT CẢ GIÁTRỊ TRONG RETURN OBJECT KHÔNG BAO GIỜ UNDEFINED
    const result = {
      base_points: basePoints ?? 0,
      speed_bonus: speedBonus?.bonus ?? 0,
      streak_bonus: streakInfo?.bonus ?? 0,
      difficulty_multiplier: difficultyMultiplier, // Đã được đảm bảo không undefined ở trên
      time_bonus: timeBonus?.bonus ?? 0,
      streak_multiplier: streakInfo?.multiplier ?? 1.0,
      total_points: totalPoints ?? 0,
      bonuses: bonuses ?? [],
      streak_info: {
        current_streak: streakInfo?.current_streak ?? 0,
        is_combo: (streakInfo?.multiplier ?? 1.0) > 1,
        combo_name: streakInfo?.combo_name ?? null,
      },
    };

    // Log để debug
    console.log(
      `[DynamicScoring] Final result for question ${questionId}:`,
      JSON.stringify(result, null, 2)
    );

    return result;
  }

  /**
   * Tính speed bonus theo tiers
   */
  static calculateSpeedBonus(responseTime) {
    for (const tier of this.SCORING_CONFIG.SPEED_TIERS) {
      if (responseTime < tier.threshold) {
        return {
          bonus: tier.bonus,
          name: tier.name,
          threshold: tier.threshold,
        };
      }
    }
    return { bonus: 0, name: null, threshold: null };
  }

  /**
   * Tính streak bonus và combo multipliers
   */
  static async calculateStreakBonus(userId, quizId, isCorrect) {
    try {
      // Lấy lịch sử câu trả lời gần đây trong quiz này
      const recentAnswers = await UserQuestionHistory.findAll({
        where: {
          user_id: userId,
          quiz_id: quizId,
        },
        order: [["attempt_date", "DESC"]],
        limit: 25, // Lấy 25 câu gần nhất để tính streak
      });

      // Tính current streak
      let currentStreak = 0;
      for (const answer of recentAnswers) {
        if (answer.is_correct) {
          currentStreak++;
        } else {
          break;
        }
      }

      // Nếu câu hiện tại đúng, tăng streak
      if (isCorrect) {
        currentStreak++;
      }

      // Tính streak bonus
      let streakBonus = 0;
      let streakName = null;
      if (currentStreak >= this.SCORING_CONFIG.STREAK_SYSTEM.MIN_STREAK) {
        streakBonus = this.SCORING_CONFIG.STREAK_SYSTEM.STREAK_BONUS;
        streakName = `${currentStreak} Streak`;
      }

      // Tính combo multiplier
      let comboMultiplier = 1.0;
      let comboName = null;
      for (const combo of this.SCORING_CONFIG.STREAK_SYSTEM.COMBO_THRESHOLDS) {
        if (currentStreak >= combo.streak) {
          comboMultiplier = combo.multiplier;
          comboName = combo.name;
        }
      }

      return {
        current_streak: currentStreak,
        bonus: streakBonus,
        name: streakName,
        multiplier: comboMultiplier,
        combo_name: comboName,
      };
    } catch (error) {
      console.error("Error calculating streak bonus:", error);
      return {
        current_streak: 0,
        bonus: 0,
        name: null,
        multiplier: 1.0,
        combo_name: null,
      };
    }
  }

  /**
   * Tính time-based bonus
   */
  static calculateTimeBonus(totalQuizTime, timeRemaining) {
    if (!totalQuizTime || !timeRemaining) {
      return { bonus: 0, name: null };
    }

    const timeRatio = timeRemaining / totalQuizTime;

    // Early finish bonus
    if (timeRatio > this.SCORING_CONFIG.TIME_BONUS.EARLY_FINISH_THRESHOLD) {
      return {
        bonus: this.SCORING_CONFIG.TIME_BONUS.EARLY_FINISH_BONUS,
        name: "Early Finish Bonus",
      };
    }

    // Time pressure bonus
    if (
      timeRatio <
      1 - this.SCORING_CONFIG.TIME_BONUS.TIME_PRESSURE_THRESHOLD
    ) {
      return {
        bonus: 0,
        name: "Time Pressure",
        multiplier: this.SCORING_CONFIG.TIME_BONUS.TIME_PRESSURE_MULTIPLIER,
      };
    }

    return { bonus: 0, name: null };
  }

  /**
   * Tính perfect quiz bonuses
   */
  static async calculatePerfectQuizBonuses(userId, quizId, quizResults) {
    const {
      totalQuestions,
      correctAnswers,
      averageResponseTime,
      hadStreakBreak,
      finalScore,
    } = quizResults;

    let perfectBonuses = [];
    let totalBonus = 0;

    // Perfect score (100% correct)
    if (correctAnswers === totalQuestions) {
      perfectBonuses.push({
        type: "perfect_score",
        name: "Perfect Score",
        bonus: this.SCORING_CONFIG.PERFECT_BONUSES.PERFECT_SCORE,
      });
      totalBonus += this.SCORING_CONFIG.PERFECT_BONUSES.PERFECT_SCORE;
    }

    // Perfect speed (all answers < 5s)
    if (averageResponseTime < 5000) {
      perfectBonuses.push({
        type: "perfect_speed",
        name: "Speed Demon",
        bonus: this.SCORING_CONFIG.PERFECT_BONUSES.PERFECT_SPEED,
      });
      totalBonus += this.SCORING_CONFIG.PERFECT_BONUSES.PERFECT_SPEED;
    }

    // Perfect streak (no breaks)
    if (!hadStreakBreak && correctAnswers >= 5) {
      perfectBonuses.push({
        type: "perfect_streak",
        name: "Unbroken Chain",
        bonus: this.SCORING_CONFIG.PERFECT_BONUSES.PERFECT_STREAK,
      });
      totalBonus += this.SCORING_CONFIG.PERFECT_BONUSES.PERFECT_STREAK;
    }

    // Flawless victory (all three perfects)
    if (perfectBonuses.length === 3) {
      perfectBonuses.push({
        type: "flawless_victory",
        name: "FLAWLESS VICTORY",
        bonus: this.SCORING_CONFIG.PERFECT_BONUSES.FLAWLESS_VICTORY,
      });
      totalBonus += this.SCORING_CONFIG.PERFECT_BONUSES.FLAWLESS_VICTORY;
    }

    return {
      perfect_bonuses: perfectBonuses,
      total_bonus: totalBonus,
    };
  }

  /**
   * Process quiz completion với dynamic scoring
   */
  static async processQuizCompletion(userId, quizId, quizData) {
    try {
      const {
        answers, // Array of answer data
        totalQuestions,
        quizDuration,
        timeSpent,
      } = quizData;

      let totalScore = 0;
      let correctAnswers = 0;
      let totalResponseTime = 0;
      let hadStreakBreak = false;
      let detailedResults = [];

      // Process each answer
      for (let i = 0; i < answers.length; i++) {
        const answer = answers[i];
        const questionScore = await this.calculateQuestionScore({
          userId,
          questionId: answer.question_id,
          quizId,
          isCorrect: answer.is_correct,
          responseTime: answer.response_time,
          attemptNumber: answer.attempt_index || 1,  // FIXED: Đổi từ attempt_number → attempt_index
          questionDifficulty: answer.difficulty || "medium",
          totalQuizTime: quizDuration,
          timeRemaining: quizDuration - timeSpent,
        });

        totalScore += questionScore.total_points;
        if (answer.is_correct) correctAnswers++;
        totalResponseTime += answer.response_time;

        if (
          questionScore.streak_info &&
          questionScore.streak_info.current_streak === 0
        ) {
          hadStreakBreak = true;
        }

        detailedResults.push({
          question_id: answer.question_id,
          ...questionScore,
        });
      }

      const averageResponseTime = totalResponseTime / answers.length;

      // Calculate perfect bonuses
      const perfectBonuses = await this.calculatePerfectQuizBonuses(
        userId,
        quizId,
        {
          totalQuestions,
          correctAnswers,
          averageResponseTime,
          hadStreakBreak,
          finalScore: totalScore,
        }
      );

      totalScore += perfectBonuses.total_bonus;

      // Track achievements
      await AchievementService.trackUserAction(userId, "quiz_completed", {
        quiz_id: quizId,
        score: totalScore,
        correct_answers: correctAnswers,
        total_questions: totalQuestions,
        average_response_time: averageResponseTime,
        perfect_score: correctAnswers === totalQuestions,
        speed_demon: averageResponseTime < 5000,
        flawless_victory: perfectBonuses.perfect_bonuses.length === 4,
      });

      return {
        total_score: totalScore,
        correct_answers: correctAnswers,
        total_questions: totalQuestions,
        accuracy: Math.round((correctAnswers / totalQuestions) * 100),
        average_response_time: Math.round(averageResponseTime),
        perfect_bonuses: perfectBonuses.perfect_bonuses,
        detailed_results: detailedResults,
        achievements_unlocked: [], // Will be populated by AchievementService
      };
    } catch (error) {
      console.error("Error processing quiz completion:", error);
      throw error;
    }
  }
}

module.exports = DynamicScoringService;
