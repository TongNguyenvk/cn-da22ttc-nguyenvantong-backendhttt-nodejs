/**
 * AI Tutor Service
 * Sử dụng Cerebras GPT-OSS-120B với Streaming
 * Fallback sang Groq khi Cerebras bị rate limit
 *
 * NGUYÊN TẮC VÀNG: KHÔNG BAO GIỜ VIẾT CODE CHO SINH VIÊN
 */

const Cerebras = require("@cerebras/cerebras_cloud_sdk").default;
const Groq = require("groq-sdk");
const { AITutorConversation } = require("../models");

class AITutorService {
  constructor() {
    this.cerebras = new Cerebras({ apiKey: process.env.CEREBRAS_API_KEY });
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    this.modelName = "gpt-oss-120b";
    this.groqModelName = "openai/gpt-oss-120b";
    this.conversationHistory = new Map();
    this.MAX_HISTORY_LENGTH = 20;
  }

  _isRateLimitError(error) {
    return (
      error.status === 429 ||
      error.message?.includes("429") ||
      error.message?.includes("rate") ||
      error.message?.includes("quota") ||
      error.message?.includes("Rate limit")
    );
  }

  // Groq completion với cấu hình chuẩn
  async _createGroqCompletion(messages, useStream = false, useJson = false) {
    const options = {
      messages,
      model: this.groqModelName,
      temperature: 1,
      max_completion_tokens: 65536,
      top_p: 1,
      stream: useStream,
      reasoning_effort: "high",
      stop: null,
    };
    if (useJson) {
      options.response_format = { type: "json_object" };
    }
    return await this.groq.chat.completions.create(options);
  }

  // Luôn thử Cerebras trước, nếu rate limit thì fallback Groq
  async _createCompletion(options, useStream = false) {
    const messages = options.messages;
    const useJson = !!options.response_format;

    try {
      return await this.cerebras.chat.completions.create({
        messages,
        model: this.modelName,
        max_completion_tokens: options.max_completion_tokens || 8192,
        temperature: options.temperature || 1,
        top_p: options.top_p || 1,
        reasoning_effort: options.reasoning_effort || "high",
        stream: useStream,
        ...(options.response_format && {
          response_format: options.response_format,
        }),
      });
    } catch (error) {
      if (this._isRateLimitError(error)) {
        console.log("[AITutorService] Cerebras rate limited, fallback to Groq");
        return await this._createGroqCompletion(messages, useStream, useJson);
      }
      throw error;
    }
  }

  _getSystemPrompt(context = {}) {
    const { questionText, language, currentCode, testResults } = context;

    let systemPrompt = `Bạn là AI Tutor - trợ lý học lập trình thân thiện cho sinh viên Việt Nam.

🎯 NHIỆM VỤ: Giúp sinh viên HIỂU và TỰ GIẢI được bài tập

⚠️ NGUYÊN TẮC VÀNG:
1. KHÔNG BAO GIỜ viết code hoàn chỉnh
2. KHÔNG đưa ra lời giải trực tiếp
3. KHÔNG viết hàm/function có thể copy-paste
4. Chỉ dùng ví dụ KHÁC hoàn toàn với bài tập

✅ THAY VÀO ĐÓ:
- Đặt câu hỏi gợi mở
- Giải thích bằng ví dụ đời thường
- Hướng dẫn từng bước logic
- Khuyến khích và động viên

💬 PHONG CÁCH: Thân thiện, dùng emoji 😊, giải thích đơn giản`;

    if (questionText) systemPrompt += `\n\n📝 Đề bài: ${questionText}`;
    if (language) systemPrompt += `\nNgôn ngữ: ${language.toUpperCase()}`;
    if (currentCode)
      systemPrompt += `\n\nCode hiện tại:\n\`\`\`${
        language || "c"
      }\n${currentCode}\n\`\`\``;
    if (testResults) {
      systemPrompt += `\n\nKết quả test: ${testResults.passed}/${testResults.total} passed`;
      if (testResults.error) systemPrompt += `\nLỗi: ${testResults.error}`;
    }

    return systemPrompt;
  }

  async _getHistory(sessionId) {
    if (this.conversationHistory.has(sessionId)) {
      return this.conversationHistory.get(sessionId);
    }

    try {
      const dbHistory = await AITutorConversation.findAll({
        where: { session_id: sessionId },
        order: [["created_at", "ASC"]],
        limit: this.MAX_HISTORY_LENGTH,
      });

      if (dbHistory.length > 0) {
        const history = dbHistory.map((msg) => ({
          role: msg.role === "model" ? "assistant" : msg.role,
          content: msg.message,
        }));
        this.conversationHistory.set(sessionId, history);
        return history;
      }
    } catch (err) {
      console.error("[AITutorService] Error loading history:", err.message);
    }

    this.conversationHistory.set(sessionId, []);
    return [];
  }

  async _addToHistory(
    sessionId,
    role,
    content,
    userId = null,
    questionId = null,
    context = null
  ) {
    const history = await this._getHistory(sessionId);
    const cerebrasRole = role === "model" ? "assistant" : role;
    history.push({ role: cerebrasRole, content });

    if (history.length > this.MAX_HISTORY_LENGTH) {
      const trimmed = [
        ...history.slice(0, 2),
        ...history.slice(-(this.MAX_HISTORY_LENGTH - 2)),
      ];
      this.conversationHistory.set(sessionId, trimmed);
    }

    // Chỉ lưu vào DB nếu có userId VÀ không phải system prompt
    const isSystemPrompt =
      role === "system" ||
      content.startsWith("Bạn là AI Tutor") ||
      content.includes("NHIỆM VỤ CHÍNH:") ||
      content.includes("NGUYÊN TẮC VÀNG");

    if (userId && !isSystemPrompt) {
      this._saveToDatabase(
        sessionId,
        role,
        content,
        userId,
        questionId,
        context
      ).catch((err) =>
        console.error("[AITutorService] Error saving to DB:", err.message)
      );
    }
  }

  async _saveToDatabase(sessionId, role, message, userId, questionId, context) {
    try {
      await AITutorConversation.create({
        user_id: userId,
        question_id: questionId || null,
        session_id: sessionId,
        role: role,
        message: message,
        context_snapshot: context
          ? {
              language: context.language,
              has_code: !!context.currentCode,
              code_length: context.currentCode?.length || 0,
            }
          : null,
      });
    } catch (err) {
      console.error("[AITutorService] DB save error:", err.message);
    }
  }

  async clearHistory(sessionId, userId = null) {
    this.conversationHistory.delete(sessionId);
    if (userId) {
      try {
        await AITutorConversation.destroy({ where: { session_id: sessionId } });
      } catch (err) {
        console.error(
          "[AITutorService] Error clearing DB history:",
          err.message
        );
      }
    }
  }

  /**
   * Main chat function với Streaming
   */
  async chat(
    sessionId,
    userMessage,
    context = {},
    userId = null,
    questionId = null
  ) {
    try {
      const history = await this._getHistory(sessionId);
      const systemPrompt = this._getSystemPrompt(context);

      // Initialize conversation if new
      if (history.length === 0) {
        const greeting =
          "Xin chào! 👋 Mình là AI Tutor, trợ lý học lập trình của bạn. Bạn cần hỗ trợ gì nào? 😊";
        history.push({ role: "user", content: systemPrompt });
        history.push({ role: "assistant", content: greeting });
        if (userId) {
          await this._saveToDatabase(
            sessionId,
            "user",
            systemPrompt,
            userId,
            questionId,
            context
          );
          await this._saveToDatabase(
            sessionId,
            "model",
            greeting,
            userId,
            questionId,
            null
          );
        }
      }

      await this._addToHistory(
        sessionId,
        "user",
        userMessage,
        userId,
        questionId,
        context
      );

      const messages = [
        { role: "system", content: systemPrompt },
        ...(await this._getHistory(sessionId)),
      ];

      // Sử dụng Streaming với Cerebras, fallback sang Groq nếu rate limit
      let aiMessage = "";
      const stream = await this._createCompletion(
        {
          messages,
          max_completion_tokens: 8192,
          temperature: 1,
          top_p: 1,
          reasoning_effort: "high",
        },
        true
      );

      for await (const chunk of stream) {
        aiMessage += chunk.choices[0]?.delta?.content || "";
      }

      if (!aiMessage) aiMessage = "Xin lỗi, mình không thể trả lời lúc này.";

      await this._addToHistory(
        sessionId,
        "model",
        aiMessage,
        userId,
        questionId,
        null
      );

      return {
        success: true,
        message: aiMessage,
        sessionId,
        historyLength: (await this._getHistory(sessionId)).length,
      };
    } catch (error) {
      console.error("[AITutorService] Chat error:", error);

      if (error.message?.includes("SAFETY")) {
        return {
          success: false,
          message: "Xin lỗi, mình không thể trả lời câu hỏi này. 🙏",
          error: "safety_filter",
        };
      }
      if (error.message?.includes("quota") || error.message?.includes("429")) {
        return {
          success: false,
          message: "Hệ thống đang bận, bạn thử lại sau vài giây nhé! ⏳",
          error: "rate_limit",
        };
      }
      return {
        success: false,
        message: "Có lỗi xảy ra, bạn thử lại nhé! 😅",
        error: error.message,
      };
    }
  }

  /**
   * Chat với Streaming Response (trả về stream cho frontend)
   */
  async chatStream(
    sessionId,
    userMessage,
    context = {},
    userId = null,
    questionId = null
  ) {
    const history = await this._getHistory(sessionId);
    const systemPrompt = this._getSystemPrompt(context);

    if (history.length === 0) {
      const greeting =
        "Xin chào! 👋 Mình là AI Tutor. Bạn cần hỗ trợ gì nào? 😊";
      history.push({ role: "user", content: systemPrompt });
      history.push({ role: "assistant", content: greeting });
      if (userId) {
        await this._saveToDatabase(
          sessionId,
          "user",
          systemPrompt,
          userId,
          questionId,
          context
        );
        await this._saveToDatabase(
          sessionId,
          "model",
          greeting,
          userId,
          questionId,
          null
        );
      }
    }

    await this._addToHistory(
      sessionId,
      "user",
      userMessage,
      userId,
      questionId,
      context
    );

    const messages = [
      { role: "system", content: systemPrompt },
      ...(await this._getHistory(sessionId)),
    ];

    // Return stream directly for SSE, with Groq fallback
    const stream = await this._createCompletion(
      {
        messages,
        max_completion_tokens: 8192,
        temperature: 1,
        top_p: 1,
        reasoning_effort: "high",
      },
      true
    );

    return {
      stream,
      saveResponse: async (fullMessage) => {
        await this._addToHistory(
          sessionId,
          "model",
          fullMessage,
          userId,
          questionId,
          null
        );
      },
    };
  }

  /**
   * Quick help với Streaming
   */
  async quickHelp(question, context = {}) {
    try {
      const systemPrompt = this._getSystemPrompt(context);
      const prompt = `${systemPrompt}\n\nCâu hỏi: ${question}\n\nTrả lời ngắn gọn (dưới 200 từ):`;

      const messages = [
        { role: "system", content: "" },
        { role: "user", content: prompt },
      ];

      let message = "";
      const stream = await this._createCompletion(
        {
          messages,
          max_completion_tokens: 2048,
          temperature: 1,
          top_p: 1,
          reasoning_effort: "high",
        },
        true
      );

      for await (const chunk of stream) {
        message += chunk.choices[0]?.delta?.content || "";
      }

      return { success: true, message: message || "Không thể trả lời." };
    } catch (error) {
      console.error("[AITutorService] Quick help error:", error);
      return {
        success: false,
        message: "Có lỗi xảy ra, bạn thử lại nhé!",
        error: error.message,
      };
    }
  }

  /**
   * Explain concept với Streaming
   */
  async explainConcept(concept, language = "c") {
    try {
      const prompt = `Giải thích khái niệm "${concept}" trong ${language.toUpperCase()} cho sinh viên mới học.
Yêu cầu: Đơn giản, dùng ví dụ thực tế (KHÔNG code), tối đa 300 từ, dùng emoji.`;

      const stream = await this._createCompletion(
        {
          messages: [
            {
              role: "system",
              content: "Bạn là giáo viên lập trình thân thiện.",
            },
            { role: "user", content: prompt },
          ],
          max_completion_tokens: 2048,
          temperature: 1,
          top_p: 1,
          reasoning_effort: "high",
        },
        true
      );

      let explanation = "";
      for await (const chunk of stream) {
        explanation += chunk.choices[0]?.delta?.content || "";
      }

      return {
        success: true,
        concept,
        explanation: explanation || "Không thể giải thích.",
      };
    } catch (error) {
      console.error("[AITutorService] Explain concept error:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get hint với Streaming
   */
  async getHint(questionText, currentCode, language, hintLevel = 1) {
    try {
      const hintLevelDesc = {
        1: "Gợi ý rất nhẹ - chỉ hướng suy nghĩ chung",
        2: "Gợi ý trung bình - chỉ ra vấn đề cụ thể hơn",
        3: "Gợi ý chi tiết - hướng dẫn từng bước logic (vẫn KHÔNG cho code)",
      };

      const prompt = `📝 Đề bài: ${questionText}

💻 Code hiện tại:
\`\`\`${language}
${currentCode}
\`\`\`

🎯 Mức gợi ý: ${hintLevel}/3 - ${hintLevelDesc[hintLevel] || hintLevelDesc[1]}

⚠️ TUYỆT ĐỐI KHÔNG viết code, KHÔNG cho lời giải trực tiếp!`;

      const stream = await this._createCompletion(
        {
          messages: [
            {
              role: "system",
              content: "Bạn là AI Tutor. Chỉ gợi ý hướng suy nghĩ.",
            },
            { role: "user", content: prompt },
          ],
          max_completion_tokens: 2048,
          temperature: 1,
          top_p: 1,
          reasoning_effort: "high",
        },
        true
      );

      let hint = "";
      for await (const chunk of stream) {
        hint += chunk.choices[0]?.delta?.content || "";
      }

      return {
        success: true,
        hintLevel,
        hint: hint || "Không thể tạo gợi ý.",
        nextHintAvailable: hintLevel < 3,
      };
    } catch (error) {
      console.error("[AITutorService] Get hint error:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Review code với Streaming
   */
  async reviewCode(code, language, questionText = null) {
    try {
      let prompt = `💻 Code:\n\`\`\`${language}\n${code}\n\`\`\``;
      if (questionText) prompt += `\n\n📝 Đề bài: ${questionText}`;
      prompt += `\n\nReview và nhận xét:
1. ✅ Điểm tốt
2. ⚠️ Vấn đề cần cải thiện
3. 💡 Gợi ý hướng cải thiện (KHÔNG cho code)
4. 📚 Khái niệm nên ôn lại

⚠️ TUYỆT ĐỐI KHÔNG viết code sửa! (tối đa 250 từ)`;

      const stream = await this._createCompletion(
        {
          messages: [
            { role: "system", content: "Bạn là AI Tutor đang review code." },
            { role: "user", content: prompt },
          ],
          max_completion_tokens: 2048,
          temperature: 1,
          top_p: 1,
          reasoning_effort: "high",
        },
        true
      );

      let review = "";
      for await (const chunk of stream) {
        review += chunk.choices[0]?.delta?.content || "";
      }

      return { success: true, review: review || "Không thể review." };
    } catch (error) {
      console.error("[AITutorService] Review code error:", error);
      return { success: false, error: error.message };
    }
  }

  async getSessionStats(sessionId, userId = null) {
    const history = await this._getHistory(sessionId);
    let dbCount = 0;
    if (userId) {
      try {
        dbCount = await AITutorConversation.count({
          where: { session_id: sessionId },
        });
      } catch (err) {
        /* ignore */
      }
    }
    return {
      sessionId,
      messageCount: history.length,
      dbMessageCount: dbCount,
      isActive: history.length > 0,
    };
  }

  async getConversationHistory(userId, questionId = null, limit = 50) {
    try {
      const where = { user_id: userId };
      if (questionId) where.question_id = questionId;
      const messages = await AITutorConversation.findAll({
        where,
        order: [["created_at", "DESC"]],
        limit: limit * 2, // Lấy nhiều hơn để filter
        attributes: ["id", "session_id", "role", "message", "created_at"],
      });

      // Filter bỏ system messages và các tin nhắn chứa system prompt
      const filtered = messages.filter((msg) => {
        // Bỏ qua role system
        if (msg.role === "system") return false;

        // Bỏ qua các tin nhắn chứa system prompt (thường bắt đầu bằng "Bạn là AI Tutor")
        const content = msg.message || "";
        if (
          content.startsWith("Bạn là AI Tutor") ||
          content.includes("NHIỆM VỤ CHÍNH:") ||
          content.includes("NGUYÊN TẮC VÀNG") ||
          content.includes("TUYỆT ĐỐI TUÂN THỦ")
        ) {
          return false;
        }

        return true;
      });

      // Giới hạn lại số lượng và đảo ngược để có thứ tự đúng
      return filtered.slice(-limit).reverse();
    } catch (err) {
      console.error("[AITutorService] Error getting history:", err.message);
      return [];
    }
  }

  cleanupOldSessions() {
    if (this.conversationHistory.size > 1000) {
      const entries = Array.from(this.conversationHistory.entries());
      this.conversationHistory = new Map(entries.slice(-500));
    }
  }
}

module.exports = AITutorService;
