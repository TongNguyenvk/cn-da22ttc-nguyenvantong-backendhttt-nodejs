/**
 * AI Tutor Analytics Service
 * Sử dụng Cerebras GPT-OSS-120B với Structured Outputs
 * Fallback sang Groq khi Cerebras bị rate limit
 */

const { AITutorConversation, User, Question } = require("../models");
const { Op, fn, col, literal } = require("sequelize");
const Cerebras = require("@cerebras/cerebras_cloud_sdk").default;
const Groq = require("groq-sdk");

class AITutorAnalyticsService {
  constructor() {
    this.cerebras = new Cerebras({ apiKey: process.env.CEREBRAS_API_KEY });
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    this.modelName = "gpt-oss-120b";
    this.groqModelName = "openai/gpt-oss-120b";

    // JSON Schemas cho Structured Outputs
    this.topicsSchema = {
      type: "object",
      properties: {
        topics: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              frequency: { type: "integer" },
              difficulty_level: {
                type: "string",
                enum: ["easy", "medium", "hard"],
              },
              sample_questions: { type: "array", items: { type: "string" } },
            },
            required: [
              "name",
              "frequency",
              "difficulty_level",
              "sample_questions",
            ],
            additionalProperties: false,
          },
        },
        common_mistakes: { type: "array", items: { type: "string" } },
        teaching_suggestions: { type: "array", items: { type: "string" } },
      },
      required: ["topics", "common_mistakes", "teaching_suggestions"],
      additionalProperties: false,
    };

    this.summarySchema = {
      type: "object",
      properties: {
        concepts_learned: { type: "array", items: { type: "string" } },
        concepts_struggling: { type: "array", items: { type: "string" } },
        progress_summary: { type: "string" },
        next_steps: { type: "array", items: { type: "string" } },
        encouragement: { type: "string" },
      },
      required: [
        "concepts_learned",
        "concepts_struggling",
        "progress_summary",
        "next_steps",
        "encouragement",
      ],
      additionalProperties: false,
    };

    this.faqSchema = {
      type: "object",
      properties: {
        faq: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              answer: { type: "string" },
              frequency: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["question", "answer", "frequency"],
            additionalProperties: false,
          },
        },
      },
      required: ["faq"],
      additionalProperties: false,
    };
  }

  // Helper check rate limit error
  _isRateLimitError(error) {
    return (
      error.status === 429 ||
      error.message?.includes("429") ||
      error.message?.includes("rate") ||
      error.message?.includes("quota") ||
      error.message?.includes("Rate limit")
    );
  }

  // Groq completion với cấu hình chuẩn (JSON mode)
  async _createGroqCompletion(messages) {
    return await this.groq.chat.completions.create({
      messages,
      model: this.groqModelName,
      temperature: 1,
      max_completion_tokens: 65536,
      top_p: 1,
      stream: false,
      reasoning_effort: "high",
      response_format: { type: "json_object" },
      stop: null,
    });
  }

  // Luôn thử Cerebras trước, nếu rate limit thì fallback Groq
  async _createCompletion(messages, schema) {
    try {
      const completion = await this.cerebras.chat.completions.create({
        messages,
        model: this.modelName,
        max_completion_tokens: 8192,
        temperature: 1,
        top_p: 1,
        reasoning_effort: "high",
        response_format: {
          type: "json_schema",
          json_schema: {
            name: schema.name,
            strict: true,
            schema: schema.schema,
          },
        },
      });
      return completion;
    } catch (error) {
      if (this._isRateLimitError(error)) {
        console.log(
          "[AITutorAnalytics] Cerebras rate limited, fallback to Groq"
        );
        return await this._createGroqCompletion(messages);
      }
      throw error;
    }
  }

  async getQuestionChatStats(questionId) {
    try {
      const stats = await AITutorConversation.findAll({
        where: { question_id: questionId, role: "user" },
        attributes: [
          "user_id",
          [fn("COUNT", col("AITutorConversation.id")), "message_count"],
          [
            fn("COUNT", fn("DISTINCT", col("AITutorConversation.session_id"))),
            "session_count",
          ],
          [fn("MIN", col("AITutorConversation.created_at")), "first_chat"],
          [fn("MAX", col("AITutorConversation.created_at")), "last_chat"],
        ],
        group: [
          "AITutorConversation.user_id",
          "user.user_id",
          "user.name",
          "user.email",
        ],
        order: [[literal("message_count"), "DESC"]],
        include: [
          { model: User, as: "user", attributes: ["user_id", "name", "email"] },
        ],
      });

      const totalMessages = await AITutorConversation.count({
        where: { question_id: questionId },
      });
      const uniqueStudents = await AITutorConversation.count({
        where: { question_id: questionId },
        distinct: true,
        col: "user_id",
      });

      return {
        question_id: questionId,
        total_messages: totalMessages,
        unique_students: uniqueStudents,
        avg_messages_per_student:
          uniqueStudents > 0 ? Math.round(totalMessages / uniqueStudents) : 0,
        students: stats.map((s) => ({
          user_id: s.user_id,
          name: s.user?.name || "Unknown",
          email: s.user?.email,
          message_count: parseInt(s.dataValues.message_count),
          session_count: parseInt(s.dataValues.session_count),
          first_chat: s.dataValues.first_chat,
          last_chat: s.dataValues.last_chat,
          needs_attention: parseInt(s.dataValues.message_count) > 10,
        })),
      };
    } catch (error) {
      console.error("[AITutorAnalytics] getQuestionChatStats error:", error);
      throw error;
    }
  }

  async analyzeCommonTopics(questionId, limit = 20) {
    try {
      const messages = await AITutorConversation.findAll({
        where: { question_id: questionId, role: "user" },
        attributes: ["message"],
        order: [["created_at", "DESC"]],
        limit: limit * 5,
      });

      if (messages.length < 3) {
        return {
          question_id: questionId,
          topics: [],
          message: "Chưa đủ dữ liệu để phân tích",
        };
      }

      const studentMessages = messages
        .map((m) => m.message)
        .filter((m) => m.length < 500)
        .slice(0, limit);
      if (studentMessages.length < 3) {
        return {
          question_id: questionId,
          topics: [],
          message: "Chưa đủ câu hỏi của sinh viên để phân tích",
        };
      }

      const prompt = `Phân tích các câu hỏi sau của sinh viên:\n${studentMessages
        .map((m, i) => `${i + 1}. ${m}`)
        .join("\n")}`;

      const completion = await this._createCompletion(
        [
          {
            role: "system",
            content:
              "Phân tích các chủ đề/khái niệm sinh viên hay thắc mắc. Trả về JSON với các field: topics (array of {name, frequency, difficulty_level, sample_questions}), common_mistakes (array), teaching_suggestions (array).",
          },
          { role: "user", content: prompt },
        ],
        { name: "topics_schema", schema: this.topicsSchema }
      );

      const result = JSON.parse(
        completion.choices[0]?.message?.content || "{}"
      );
      return {
        question_id: questionId,
        analyzed_messages: studentMessages.length,
        ...result,
      };
    } catch (error) {
      console.error("[AITutorAnalytics] analyzeCommonTopics error:", error);
      return { question_id: questionId, topics: [], error: error.message };
    }
  }

  async getStudentsNeedingHelp(questionId, threshold = 8) {
    try {
      const stats = await this.getQuestionChatStats(questionId);
      return {
        question_id: questionId,
        threshold,
        students_needing_help: stats.students
          .filter((s) => s.message_count >= threshold)
          .sort((a, b) => b.message_count - a.message_count),
      };
    } catch (error) {
      console.error("[AITutorAnalytics] getStudentsNeedingHelp error:", error);
      throw error;
    }
  }

  async summarizeLearning(userId, questionId = null) {
    try {
      const where = { user_id: userId };
      if (questionId) where.question_id = questionId;

      const messages = await AITutorConversation.findAll({
        where,
        order: [["created_at", "ASC"]],
        limit: 50,
        include: [
          {
            model: Question,
            as: "question",
            attributes: ["question_id", "question_text"],
          },
        ],
      });

      if (messages.length < 4) {
        return {
          user_id: userId,
          question_id: questionId,
          summary: null,
          message: "Chưa đủ lịch sử chat để tóm tắt",
        };
      }

      const conversation = messages
        .filter((m) => m.message.length < 2000)
        .map(
          (m) => `${m.role === "user" ? "Sinh viên" : "AI Tutor"}: ${m.message}`
        )
        .join("\n\n");

      const completion = await this._createCompletion(
        [
          {
            role: "system",
            content:
              "Tóm tắt tiến độ học tập của sinh viên. Trả về JSON với các field: concepts_learned (array), concepts_struggling (array), progress_summary (string), next_steps (array), encouragement (string).",
          },
          { role: "user", content: `Cuộc trò chuyện:\n${conversation}` },
        ],
        { name: "summary_schema", schema: this.summarySchema }
      );

      const summary = JSON.parse(
        completion.choices[0]?.message?.content || "{}"
      );
      return {
        user_id: userId,
        question_id: questionId,
        messages_analyzed: messages.length,
        summary,
      };
    } catch (error) {
      console.error("[AITutorAnalytics] summarizeLearning error:", error);
      return {
        user_id: userId,
        question_id: questionId,
        summary: null,
        error: error.message,
      };
    }
  }

  async getReviewSuggestions(userId) {
    try {
      const questionStats = await AITutorConversation.findAll({
        where: { user_id: userId, question_id: { [Op.ne]: null } },
        attributes: [
          "question_id",
          [fn("COUNT", col("id")), "message_count"],
          [fn("MAX", col("created_at")), "last_chat"],
        ],
        group: ["question_id"],
        include: [
          {
            model: Question,
            as: "question",
            attributes: ["question_id", "question_text"],
          },
        ],
        order: [[literal("message_count"), "DESC"]],
      });

      const suggestions = { needs_review: [], mastered: [], recent: [] };
      const now = new Date();

      questionStats.forEach((q) => {
        const count = parseInt(q.dataValues.message_count);
        const lastChat = new Date(q.dataValues.last_chat);
        const daysSinceChat = (now - lastChat) / (1000 * 60 * 60 * 24);

        const item = {
          question_id: q.question_id,
          question_text: q.question?.question_text?.substring(0, 100) + "...",
          message_count: count,
          last_chat: q.dataValues.last_chat,
          days_since_chat: Math.round(daysSinceChat),
        };

        if (count >= 8) suggestions.needs_review.push(item);
        else if (count <= 3) suggestions.mastered.push(item);
        if (daysSinceChat <= 3) suggestions.recent.push(item);
      });

      return {
        user_id: userId,
        total_questions_chatted: questionStats.length,
        suggestions,
      };
    } catch (error) {
      console.error("[AITutorAnalytics] getReviewSuggestions error:", error);
      throw error;
    }
  }

  async getStudentChatActivity(userId, days = 7) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const dailyStats = await AITutorConversation.findAll({
        where: { user_id: userId, created_at: { [Op.gte]: startDate } },
        attributes: [
          [fn("DATE", col("created_at")), "date"],
          [fn("COUNT", col("id")), "message_count"],
        ],
        group: [fn("DATE", col("created_at"))],
        order: [[fn("DATE", col("created_at")), "ASC"]],
      });

      const totalMessages = await AITutorConversation.count({
        where: { user_id: userId },
      });
      const totalQuestions = await AITutorConversation.count({
        where: { user_id: userId },
        distinct: true,
        col: "question_id",
      });

      return {
        user_id: userId,
        period_days: days,
        total_messages: totalMessages,
        total_questions_asked: totalQuestions,
        daily_activity: dailyStats.map((d) => ({
          date: d.dataValues.date,
          message_count: parseInt(d.dataValues.message_count),
        })),
      };
    } catch (error) {
      console.error("[AITutorAnalytics] getStudentChatActivity error:", error);
      throw error;
    }
  }

  async generateFAQ(questionId, limit = 5) {
    try {
      const messages = await AITutorConversation.findAll({
        where: { question_id: questionId, role: "user" },
        attributes: ["message", "user_id"],
        order: [["created_at", "DESC"]],
        limit: 30,
      });

      const studentQuestions = messages
        .map((m) => m.message)
        .filter((m) => m.length < 300 && m.length > 10);
      if (studentQuestions.length < 3) {
        return {
          question_id: questionId,
          faq: [],
          message: "Chưa đủ câu hỏi để tạo FAQ",
        };
      }

      const prompt = `Tạo ${limit} câu FAQ từ các câu hỏi:\n${studentQuestions
        .slice(0, 20)
        .map((q, i) => `${i + 1}. ${q}`)
        .join("\n")}`;

      const completion = await this._createCompletion(
        [
          {
            role: "system",
            content:
              "Tạo FAQ phổ biến. KHÔNG cho code trong câu trả lời. Trả về JSON với field: faq (array of {question, answer, frequency}).",
          },
          { role: "user", content: prompt },
        ],
        { name: "faq_schema", schema: this.faqSchema }
      );

      const result = JSON.parse(
        completion.choices[0]?.message?.content || '{"faq":[]}'
      );
      return {
        question_id: questionId,
        generated_from: studentQuestions.length,
        ...result,
      };
    } catch (error) {
      console.error("[AITutorAnalytics] generateFAQ error:", error);
      return { question_id: questionId, faq: [], error: error.message };
    }
  }

  async assessQuestionDifficulty(questionId) {
    try {
      const stats = await this.getQuestionChatStats(questionId);
      const avgMessages = stats.avg_messages_per_student;
      const totalStudents = stats.unique_students;
      const studentsNeedingHelp = stats.students.filter(
        (s) => s.needs_attention
      ).length;

      let difficulty = "unknown";
      let difficultyScore = 0;

      if (totalStudents >= 3) {
        if (avgMessages <= 3) {
          difficulty = "easy";
          difficultyScore = 1;
        } else if (avgMessages <= 6) {
          difficulty = "medium";
          difficultyScore = 2;
        } else if (avgMessages <= 10) {
          difficulty = "hard";
          difficultyScore = 3;
        } else {
          difficulty = "very_hard";
          difficultyScore = 4;
        }
      }

      return {
        question_id: questionId,
        difficulty,
        difficulty_score: difficultyScore,
        metrics: {
          total_students: totalStudents,
          avg_messages_per_student: avgMessages,
          students_needing_help: studentsNeedingHelp,
          help_rate:
            totalStudents > 0
              ? Math.round((studentsNeedingHelp / totalStudents) * 100)
              : 0,
        },
        recommendation:
          difficulty === "very_hard"
            ? "Bài tập này quá khó, cần xem xét đơn giản hóa hoặc thêm hints"
            : difficulty === "easy"
            ? "Bài tập có độ khó phù hợp"
            : "Bài tập ở mức trung bình",
      };
    } catch (error) {
      console.error(
        "[AITutorAnalytics] assessQuestionDifficulty error:",
        error
      );
      throw error;
    }
  }
}

module.exports = AITutorAnalyticsService;
