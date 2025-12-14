const {
  User,
  Question,
  QuizResult,
  UserQuestionHistory,
  LevelRequirement,
} = require("../models");
const { Op } = require("sequelize");

/**
 * Assessment Service - Xử lý logic cho Assessment Mode
 * Không có gamification, chỉ tính điểm thuần túy
 */
class AssessmentService {
  // =====================================================
  // ASSESSMENT SCORING CONFIGURATION
  // =====================================================

  static ASSESSMENT_CONFIG = {
    // Base points - đơn giản
    BASE_POINTS: {
      CORRECT_ANSWER: 10,
      WRONG_ANSWER: 0,
    },

    // Không có speed bonus, streak bonus, difficulty multiplier
    // Chỉ tính điểm dựa trên đúng/sai
  };

  // =====================================================
  // CORE ASSESSMENT METHODS
  // =====================================================

  /**
   * Tính điểm đơn giản cho assessment mode
   */
  static async calculateAssessmentScore(params) {
    const {
      userId,
      questionId,
      quizId,
      isCorrect,
      responseTime,
      questionDifficulty = "medium",
    } = params;

    // Chỉ tính điểm dựa trên đúng/sai
    const basePoints = isCorrect
      ? this.ASSESSMENT_CONFIG.BASE_POINTS.CORRECT_ANSWER
      : 0;

    // TRẢ VỀ CẤU TRÚC DỮ LIỆU ĐẦY ĐỦ, NHẤT QUÁN VỚI DynamicScoringService
    const result = {
      base_points: basePoints,
      speed_bonus: 0,
      streak_bonus: 0,
      difficulty_multiplier: 1.0, // QUAN TRỌNG: Trả về difficulty_multiplier thay vì difficulty_bonus
      time_bonus: 0,
      streak_multiplier: 1.0, // Thêm field này để nhất quán
      total_points: basePoints,
      bonuses: [],
      streak_info: {
        current_streak: 0,
        is_combo: false,
        combo_name: null,
      },
      mode: "assessment",
    };

    // Log để debug
    console.log(
      `[AssessmentService] Simple scoring for question ${questionId}:`,
      JSON.stringify(result, null, 2)
    );

    return result;
  }

  /**
   * Xử lý hoàn thành quiz trong assessment mode
   */
  static async processAssessmentCompletion(userId, quizId, quizData) {
    try {
      const { totalQuestions, correctAnswers, totalTime, responseTimes } =
        quizData;

      // Tính điểm tổng đơn giản
      const totalScore =
        correctAnswers * this.ASSESSMENT_CONFIG.BASE_POINTS.CORRECT_ANSWER;
      const percentage = (correctAnswers / totalQuestions) * 100;

      // Lưu kết quả assessment
      const assessmentResult = {
        user_id: userId,
        quiz_id: quizId,
        total_score: totalScore,
        correct_answers: correctAnswers,
        total_questions: totalQuestions,
        percentage: percentage,
        total_time: totalTime,
        mode: "assessment",
        created_at: new Date(),
      };

      // Không tăng level, không cộng điểm gamification
      // Chỉ lưu kết quả đánh giá thuần túy

      return {
        success: true,
        assessment_result: assessmentResult,
        mode: "assessment",
      };
    } catch (error) {
      console.error("Error processing assessment completion:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Lấy leaderboard cho assessment mode (chỉ hiển thị sau khi hoàn thành)
   */
  static async getAssessmentLeaderboard(quizId) {
    try {
      const results = await QuizResult.findAll({
        where: {
          quiz_id: quizId,
        },
        include: [
          {
            model: User,
            attributes: ["user_id", "username", "full_name"],
          },
        ],
        order: [
          ["total_score", "DESC"],
          ["created_at", "ASC"],
        ],
      });

      return results.map((result, index) => ({
        position: index + 1,
        user_id: result.User.user_id,
        username: result.User.username,
        full_name: result.User.full_name,
        score: result.total_score,
        percentage: result.percentage,
        correct_answers: result.correct_answers,
        total_questions: result.total_questions,
      }));
    } catch (error) {
      console.error("Error getting assessment leaderboard:", error);
      return [];
    }
  }

  /**
   * Lưu câu trả lời assessment (không có gamification)
   */
  static async saveAssessmentAnswer(
    quizId,
    userId,
    questionId,
    answerId,
    isCorrect,
    responseTime
  ) {
    try {
      // Tính điểm đơn giản
      const score = isCorrect
        ? this.ASSESSMENT_CONFIG.BASE_POINTS.CORRECT_ANSWER
        : 0;

      // Lưu vào Redis hoặc database
      const answerData = {
        quiz_id: quizId,
        user_id: userId,
        question_id: questionId,
        answer_id: answerId,
        is_correct: isCorrect,
        score: score,
        response_time: responseTime,
        mode: "assessment",
        timestamp: new Date(),
      };

      // Có thể lưu vào Redis để tracking real-time
      // Nhưng không hiển thị leaderboard real-time

      return {
        success: true,
        score: score,
        is_correct: isCorrect,
        mode: "assessment",
      };
    } catch (error) {
      console.error("Error saving assessment answer:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Kiểm tra xem quiz có phải assessment mode không
   */
  static async isAssessmentMode(quizId) {
    try {
      const quiz = await Quiz.findByPk(quizId);
      return quiz && quiz.quiz_mode === "assessment";
    } catch (error) {
      console.error("Error checking quiz mode:", error);
      return false;
    }
  }
}

module.exports = AssessmentService;
