const Cerebras = require("@cerebras/cerebras_cloud_sdk").default;
const Groq = require("groq-sdk");
const axios = require("axios");

/**
 * Code Analysis Service
 * Sử dụng Cerebras GPT-OSS-120B với Structured Outputs (JSON Schema)
 * Fallback sang Groq khi Cerebras bị rate limit
 */
class CerebrasCodeAnalysisService {
  constructor() {
    if (!process.env.CEREBRAS_API_KEY) {
      throw new Error(
        "CEREBRAS_API_KEY chưa được thiết lập trong biến môi trường"
      );
    }
    this.cerebras = new Cerebras({
      apiKey: process.env.CEREBRAS_API_KEY,
    });
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    this.modelName = "gpt-oss-120b";
    this.groqModelName = "openai/gpt-oss-120b";

    if (!process.env.OPENROUTER_API_KEY) {
      console.warn(
        "OPENROUTER_API_KEY chưa được thiết lập. Chức năng chọn model sẽ bị hạn chế."
      );
    }
    this.MAX_CODE_LENGTH = 12000;

    // JSON Schema cho Code Analysis (theo Cerebras Structured Outputs)
    this.codeAnalysisSchema = {
      type: "object",
      properties: {
        overall_score: { type: "integer" },
        correctness: {
          type: "object",
          properties: {
            score: { anyOf: [{ type: "integer" }, { type: "null" }] },
            comments: { type: "string" },
            errors: { type: "array", items: { type: "string" } },
            suggestions: { type: "array", items: { type: "string" } },
            failed_cases_root_cause: {
              type: "array",
              items: { type: "string" },
            },
            edge_cases_missing: { type: "array", items: { type: "string" } },
            logic_errors: { type: "array", items: { type: "string" } },
            edge_cases_handled: {
              anyOf: [{ type: "boolean" }, { type: "null" }],
            },
          },
          required: [
            "score",
            "comments",
            "errors",
            "suggestions",
            "failed_cases_root_cause",
            "edge_cases_missing",
            "logic_errors",
            "edge_cases_handled",
          ],
          additionalProperties: false,
        },
        code_quality: {
          type: "object",
          properties: {
            score: { type: "integer" },
            naming: { type: "integer" },
            readability: { type: "integer" },
            structure: { type: "integer" },
            comments: { type: "string" },
          },
          required: ["score", "naming", "readability", "structure", "comments"],
          additionalProperties: false,
        },
        performance: {
          type: "object",
          properties: {
            score: { type: "integer" },
            time_complexity: { type: "string" },
            space_complexity: { type: "string" },
            comments: { type: "string" },
          },
          required: [
            "score",
            "time_complexity",
            "space_complexity",
            "comments",
          ],
          additionalProperties: false,
        },
        best_practices: {
          type: "object",
          properties: {
            score: { type: "integer" },
            violations: { type: "array", items: { type: "string" } },
            recommendations: { type: "array", items: { type: "string" } },
            security_issues: { type: "array", items: { type: "string" } },
          },
          required: [
            "score",
            "violations",
            "recommendations",
            "security_issues",
          ],
          additionalProperties: false,
        },
        strengths: { type: "array", items: { type: "string" } },
        weaknesses: { type: "array", items: { type: "string" } },
        explanation: { type: "string" },
        improved_code: { type: "string" },
        feedback: { type: "string" },
        next_improvements: { type: "array", items: { type: "string" } },
        confidence: { type: "integer" },
      },
      required: [
        "overall_score",
        "correctness",
        "code_quality",
        "performance",
        "best_practices",
        "strengths",
        "weaknesses",
        "explanation",
        "improved_code",
        "feedback",
        "next_improvements",
        "confidence",
      ],
      additionalProperties: false,
    };
  }

  async analyzeCode({
    userCode,
    questionText,
    language = "javascript",
    testCases = [],
    executionResults = null,
    constraints = null,
    model = null,
  }) {
    try {
      const sanitizedCode = this.sanitizeUserCode(userCode);
      const prompt = this.buildAnalysisPrompt({
        userCode: sanitizedCode.code,
        questionText,
        language,
        testCases,
        executionResults,
        constraints,
      });

      let analysis;

      if (model && model.startsWith("groq/")) {
        // User chọn Groq trực tiếp
        const messages = [
          {
            role: "system",
            content:
              "Bạn là giảng viên lập trình có kinh nghiệm. Phân tích code và trả về JSON theo schema.",
          },
          { role: "user", content: prompt },
        ];
        const completion = await this._createGroqCompletion(messages, true);
        const content = completion.choices[0]?.message?.content || "{}";
        analysis = JSON.parse(content);
      } else if (model && model.startsWith("openrouter/")) {
        const openRouterModel = model.replace("openrouter/", "");
        const text = await this._analyzeWithOpenRouter(prompt, openRouterModel);
        analysis = this.parseAIResponse(text);
      } else {
        // Mặc định: Cerebras với Structured Outputs (fallback Groq nếu rate limit)
        analysis = await this._analyzeWithCerebrasStructured(prompt);
      }

      return { success: true, analysis, truncated: sanitizedCode.truncated };
    } catch (error) {
      console.error("Error analyzing code with Cerebras:", error);
      return {
        success: false,
        error: error.message,
        analysis: this.getDefaultAnalysis(),
      };
    }
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
  async _createGroqCompletion(messages, useJson = true) {
    const options = {
      messages,
      model: this.groqModelName,
      temperature: 1,
      max_completion_tokens: 65536,
      top_p: 1,
      stream: false,
      reasoning_effort: "high",
      stop: null,
    };
    if (useJson) {
      options.response_format = { type: "json_object" };
    }
    return await this.groq.chat.completions.create(options);
  }

  // Cerebras API với Structured Outputs (JSON Schema) + Groq fallback
  async _analyzeWithCerebrasStructured(prompt) {
    const messages = [
      {
        role: "system",
        content:
          "Bạn là giảng viên lập trình có kinh nghiệm. Phân tích code và trả về JSON theo schema.",
      },
      { role: "user", content: prompt },
    ];

    try {
      const completion = await this.cerebras.chat.completions.create({
        messages,
        model: this.modelName,
        max_completion_tokens: 16384,
        temperature: 1,
        top_p: 1,
        reasoning_effort: "high",
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "code_analysis_schema",
            strict: true,
            schema: this.codeAnalysisSchema,
          },
        },
      });
      const content = completion.choices[0]?.message?.content || "{}";
      return JSON.parse(content);
    } catch (error) {
      if (this._isRateLimitError(error)) {
        console.log(
          "[CerebrasCodeAnalysis] Cerebras rate limited, fallback to Groq"
        );
        const completion = await this._createGroqCompletion(messages, true);
        const content = completion.choices[0]?.message?.content || "{}";
        return JSON.parse(content);
      }
      console.error("Failed to analyze:", error);
      return this.getDefaultAnalysis();
    }
  }

  // Fallback: Cerebras không có structured output + Groq fallback
  async _analyzeWithCerebras(prompt) {
    const messages = [
      { role: "system", content: "" },
      { role: "user", content: prompt },
    ];

    try {
      const completion = await this.cerebras.chat.completions.create({
        messages,
        model: this.modelName,
        max_completion_tokens: 16384,
        temperature: 1,
        top_p: 1,
        reasoning_effort: "high",
      });
      return completion.choices[0]?.message?.content || "";
    } catch (error) {
      if (this._isRateLimitError(error)) {
        console.log(
          "[CerebrasCodeAnalysis] Cerebras rate limited, fallback to Groq"
        );
        const completion = await this._createGroqCompletion(messages, false);
        return completion.choices[0]?.message?.content || "";
      }
      throw error;
    }
  }

  // OpenRouter API (backup)
  async _analyzeWithOpenRouter(prompt, model) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OpenRouter API Key is not configured.");
    }
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.YOUR_SITE_URL || "http://localhost",
          "X-Title": process.env.YOUR_SITE_NAME || "Synlearn",
        },
      }
    );
    return response.data.choices[0].message.content;
  }

  sanitizeUserCode(code = "") {
    if (code.length <= this.MAX_CODE_LENGTH) return { code, truncated: false };
    return {
      code: code.slice(0, this.MAX_CODE_LENGTH) + "\n// [ĐÃ CẮT BỚT]",
      truncated: true,
    };
  }

  buildAnalysisPrompt({
    userCode,
    questionText,
    language,
    testCases,
    executionResults,
    constraints,
  }) {
    const hasTestCases = testCases && testCases.length > 0;
    let prompt = `# Code Review\n\n## Đề bài:\n${questionText}\n\n## Code (${language}):\n\`\`\`${language}\n${userCode}\n\`\`\`\n`;

    if (hasTestCases) {
      prompt += `\n## Test cases:\n`;
      testCases.forEach((tc, i) => {
        prompt += `${i + 1}. ${tc.input} → ${tc.output}\n`;
      });
    }

    if (executionResults?.results) {
      const passed =
        executionResults.passed ??
        executionResults.results.filter((r) => r.passed).length;
      const total = executionResults.total ?? executionResults.results.length;
      prompt += `\n## Kết quả: ${passed}/${total} passed\n`;
      const failed = executionResults.results
        .filter((r) => !r.passed)
        .slice(0, 3);
      failed.forEach((f) => {
        prompt += `- input=${f.input} expected=${f.expected} actual=${f.actual_serialized}\n`;
      });
    }

    if (constraints) prompt += `\n## Constraints:\n${constraints}\n`;

    prompt += `\n## Yêu cầu:\n- Phân tích chân thật, ngắn gọn\n- Chỉ ra lỗi cụ thể\n- Gợi ý cải thiện\n`;
    if (!hasTestCases)
      prompt += `- KHÔNG đánh giá correctness (không có test cases)\n`;

    return prompt;
  }

  parseAIResponse(text) {
    try {
      let cleanText = text
        .trim()
        .replace(/^```(?:json)?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "");
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      return JSON.parse(cleanText);
    } catch (e) {
      console.error("Error parsing response:", e);
      return this.getDefaultAnalysis();
    }
  }

  getDefaultAnalysis() {
    return {
      overall_score: 0,
      correctness: {
        score: null,
        comments: "Không thể phân tích",
        errors: [],
        suggestions: [],
        failed_cases_root_cause: [],
        edge_cases_missing: [],
        logic_errors: [],
        edge_cases_handled: null,
      },
      code_quality: {
        score: 0,
        naming: 0,
        readability: 0,
        structure: 0,
        comments: "Không thể phân tích",
      },
      performance: {
        score: 0,
        time_complexity: "N/A",
        space_complexity: "N/A",
        comments: "Không thể phân tích",
      },
      best_practices: {
        score: 0,
        violations: [],
        recommendations: [],
        security_issues: [],
      },
      strengths: [],
      weaknesses: [],
      explanation: "Lỗi hệ thống",
      improved_code: "",
      feedback: "Vui lòng thử lại",
      next_improvements: [],
      confidence: 0,
    };
  }

  async generateLevelBasedFeedback(level, analysis) {
    const messages = [
      {
        role: "system",
        content:
          "Tạo feedback phù hợp với level sinh viên. Trả về JSON với các field: level_specific_feedback, next_level_goals (array), recommended_resources (array).",
      },
      {
        role: "user",
        content: `Level: ${level}\nPhân tích: ${JSON.stringify(analysis)}`,
      },
    ];

    const schema = {
      type: "object",
      properties: {
        level_specific_feedback: { type: "string" },
        next_level_goals: { type: "array", items: { type: "string" } },
        recommended_resources: { type: "array", items: { type: "string" } },
      },
      required: [
        "level_specific_feedback",
        "next_level_goals",
        "recommended_resources",
      ],
      additionalProperties: false,
    };

    try {
      const completion = await this.cerebras.chat.completions.create({
        messages,
        model: this.modelName,
        max_completion_tokens: 4096,
        temperature: 1,
        top_p: 1,
        reasoning_effort: "high",
        response_format: {
          type: "json_schema",
          json_schema: { name: "feedback_schema", strict: true, schema },
        },
      });
      return JSON.parse(completion.choices[0]?.message?.content || "{}");
    } catch (error) {
      if (this._isRateLimitError(error)) {
        console.log("[CerebrasCodeAnalysis] Rate limited, fallback to Groq");
        const completion = await this._createGroqCompletion(messages, true);
        return JSON.parse(completion.choices[0]?.message?.content || "{}");
      }
      console.error("Error generating feedback:", error);
      return {
        level_specific_feedback: "Không thể tạo feedback",
        next_level_goals: [],
        recommended_resources: [],
      };
    }
  }

  async checkCodeSyntax(code, language) {
    const messages = [
      {
        role: "system",
        content:
          "Kiểm tra syntax code. Trả về JSON với các field: syntax_valid (boolean), errors (array), warnings (array).",
      },
      {
        role: "user",
        content: `Kiểm tra syntax ${language}:\n\`\`\`${language}\n${code}\n\`\`\``,
      },
    ];

    const schema = {
      type: "object",
      properties: {
        syntax_valid: { type: "boolean" },
        errors: { type: "array", items: { type: "string" } },
        warnings: { type: "array", items: { type: "string" } },
      },
      required: ["syntax_valid", "errors", "warnings"],
      additionalProperties: false,
    };

    try {
      const completion = await this.cerebras.chat.completions.create({
        messages,
        model: this.modelName,
        max_completion_tokens: 2048,
        temperature: 1,
        top_p: 1,
        reasoning_effort: "high",
        response_format: {
          type: "json_schema",
          json_schema: { name: "syntax_schema", strict: true, schema },
        },
      });
      return JSON.parse(
        completion.choices[0]?.message?.content ||
          '{"syntax_valid":true,"errors":[],"warnings":[]}'
      );
    } catch (error) {
      if (this._isRateLimitError(error)) {
        console.log("[CerebrasCodeAnalysis] Rate limited, fallback to Groq");
        const completion = await this._createGroqCompletion(messages, true);
        return JSON.parse(
          completion.choices[0]?.message?.content ||
            '{"syntax_valid":true,"errors":[],"warnings":[]}'
        );
      }
      console.error("Error checking syntax:", error);
      return {
        syntax_valid: false,
        errors: ["Không thể kiểm tra"],
        warnings: [],
      };
    }
  }
}

module.exports = CerebrasCodeAnalysisService;
