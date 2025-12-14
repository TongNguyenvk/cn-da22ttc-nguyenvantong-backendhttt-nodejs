"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class CodeSubmission extends Model {
    static associate(models) {
      // Quan hệ với User
      CodeSubmission.belongsTo(models.User, {
        foreignKey: "user_id",
        as: "User",
      });

      // Quan hệ với Question (câu hỏi lập trình)
      CodeSubmission.belongsTo(models.Question, {
        foreignKey: "question_id",
        as: "Question",
      });

      // Quan hệ với Quiz (nếu thuộc một quiz)
      CodeSubmission.belongsTo(models.Quiz, {
        foreignKey: "quiz_id",
        as: "Quiz",
      });
    }

    /**
     * Get latest submission for user and question
     */
    static async getLatestSubmission(userId, questionId) {
      return await CodeSubmission.findOne({
        where: {
          user_id: userId,
          question_id: questionId,
        },
        order: [["submitted_at", "DESC"]],
        include: [
          {
            model: sequelize.models.User,
            as: "User",
            attributes: ["user_id", "name", "email"],
          },
          {
            model: sequelize.models.Question,
            as: "Question",
            attributes: ["question_id", "question_text"],
          },
        ],
      });
    }

    /**
     * Get submission statistics for a question
     */
    static async getQuestionSubmissionStats(questionId) {
      const stats = await CodeSubmission.findAll({
        where: { question_id: questionId },
        attributes: [
          [
            sequelize.fn("COUNT", sequelize.col("submission_id")),
            "total_submissions",
          ],
          [
            sequelize.fn(
              "COUNT",
              sequelize.fn("DISTINCT", sequelize.col("user_id"))
            ),
            "unique_users",
          ],
          [sequelize.fn("AVG", sequelize.col("score")), "avg_score"],
          [sequelize.fn("MAX", sequelize.col("score")), "max_score"],
          [sequelize.fn("MIN", sequelize.col("score")), "min_score"],
        ],
        raw: true,
      });

      return (
        stats[0] || {
          total_submissions: 0,
          unique_users: 0,
          avg_score: 0,
          max_score: 0,
          min_score: 0,
        }
      );
    }

    /**
     * Get user's submission history for a question
     */
    static async getUserSubmissionHistory(userId, questionId, limit = 10) {
      return await CodeSubmission.findAll({
        where: {
          user_id: userId,
          question_id: questionId,
        },
        order: [["submitted_at", "DESC"]],
        limit,
        attributes: [
          "submission_id",
          "language",
          "score",
          "status",
          "submitted_at",
          "execution_time",
          "memory_usage",
        ],
      });
    }
  }

  CodeSubmission.init(
    {
      submission_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        autoIncrementIdentity: true,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Users",
          key: "user_id",
        },
      },
      question_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Questions",
          key: "question_id",
        },
      },
      quiz_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "Quizzes",
          key: "quiz_id",
        },
        comment: "Null nếu là practice, có giá trị nếu thuộc quiz",
      },
      // Code và metadata
      code: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: "Code được submit bởi user",
      },
      language: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "javascript",
        comment: "Ngôn ngữ lập trình",
      },
      // Execution results
      status: {
        type: DataTypes.ENUM(
          "pending", // Đang chờ chấm
          "running", // Đang chạy
          "accepted", // Accepted/Correct
          "wrong_answer", // Sai output
          "time_limit", // Vượt thời gian
          "memory_limit", // Vượt memory
          "runtime_error", // Lỗi runtime
          "compile_error", // Lỗi compile
          "system_error" // Lỗi hệ thống
        ),
        allowNull: false,
        defaultValue: "pending",
      },
      score: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        defaultValue: 0,
        comment: "Điểm số từ 0-100",
      },
      execution_time: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Thời gian thực thi (ms)",
      },
      memory_usage: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Bộ nhớ sử dụng (KB)",
      },
      // Test results
      test_results: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "Kết quả chạy test cases",
        defaultValue: {
          passed: 0,
          total: 0,
          details: [],
        },
      },
      // AI Analysis từ Cerebras GPT-OSS-120B
      ai_analysis: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "Phân tích từ Cerebras AI",
        defaultValue: null,
      },
      // Feedback cho user
      feedback: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Feedback từ AI hoặc giảng viên",
      },
      // Timestamps
      submitted_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      analyzed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Thời điểm AI phân tích xong",
      },
      // Metadata
      submission_metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        comment: "Metadata bổ sung (browser, editor settings, etc.)",
      },
    },
    {
      sequelize,
      modelName: "CodeSubmission",
      tableName: "CodeSubmissions",
      timestamps: false, // Sử dụng custom timestamps
      indexes: [
        {
          fields: ["user_id", "question_id"],
        },
        {
          fields: ["quiz_id"],
        },
        {
          fields: ["status"],
        },
        {
          fields: ["submitted_at"],
        },
        {
          fields: ["score"],
        },
      ],
    }
  );

  return CodeSubmission;
};
