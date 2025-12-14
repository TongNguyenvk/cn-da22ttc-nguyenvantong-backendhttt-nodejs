"use strict";

const Cerebras = require("@cerebras/cerebras_cloud_sdk").default;
const Groq = require("groq-sdk");

/**
 * Run Test AI Service
 * AI phân tích lỗi cho run-test với Cerebras Structured Outputs
 * Fallback sang Groq khi Cerebras bị rate limit
 */

class RunTestAIService {
  constructor() {
    if (!process.env.CEREBRAS_API_KEY) {
      console.warn(
        "CEREBRAS_API_KEY chưa được thiết lập. AI feedback sẽ bị tắt."
      );
      this.enabled = false;
      return;
    }

    this.cerebras = new Cerebras({ apiKey: process.env.CEREBRAS_API_KEY });
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    this.modelName = "gpt-oss-120b";
    this.groqModelName = "openai/gpt-oss-120b";
    this.enabled = true;

    // JSON Schema cho test result analysis (Cerebras Structured Outputs)
    this.testResultSchema = {
      type: "object",
      properties: {
        error_type: {
          type: "string",
          enum: [
            "compile_error",
            "runtime_error",
            "logic_error",
            "timeout",
            "success",
          ],
        },
        error_summary: { type: "string" },
        hints: { type: "array", items: { type: "string" } },
        common_mistake: { anyOf: [{ type: "string" }, { type: "null" }] },
        encouragement: { type: "string" },
        next_step: { type: "string" },
      },
      required: [
        "error_type",
        "error_summary",
        "hints",
        "common_mistake",
        "encouragement",
        "next_step",
      ],
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

  async analyzeTestResult({
    code,
    language,
    questionText,
    testResults,
    compileError,
    runtimeError,
  }) {
    if (!this.enabled) return this._getDisabledResponse();

    try {
      const prompt = this._buildPrompt({
        code,
        language,
        questionText,
        testResults,
        compileError,
        runtimeError,
      });

      const messages = [
        {
          role: "system",
          content:
            "Bạn là trợ giảng AI. KHÔNG BAO GIỜ cho code, chỉ gợi ý hướng suy nghĩ. Trả về JSON với các field: error_type, error_summary, hints (array), common_mistake, encouragement, next_step.",
        },
        { role: "user", content: prompt },
      ];

      let completion;
      try {
        completion = await this.cerebras.chat.completions.create({
          messages,
          model: this.modelName,
          max_completion_tokens: 4096,
          temperature: 1,
          top_p: 1,
          reasoning_effort: "high",
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "test_result_schema",
              strict: true,
              schema: this.testResultSchema,
            },
          },
        });
      } catch (cerebrasError) {
        if (this._isRateLimitError(cerebrasError)) {
          console.log(
            "[RunTestAIService] Cerebras rate limited, fallback to Groq"
          );
          completion = await this._createGroqCompletion(messages);
        } else {
          throw cerebrasError;
        }
      }

      const content = completion.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);
      return { enabled: true, ...parsed };
    } catch (error) {
      console.error("[RunTestAIService] Error:", error.message);
      return this._getFallbackResponse({
        compileError,
        runtimeError,
        testResults,
      });
    }
  }

  _buildPrompt({
    code,
    language,
    questionText,
    testResults,
    compileError,
    runtimeError,
  }) {
    const langName = this._getLanguageName(language);
    let errorContext = "";

    if (compileError) {
      errorContext = `\n## LỖI BIÊN DỊCH:\n${compileError}`;
    } else if (runtimeError) {
      errorContext = `\n## LỖI RUNTIME:\n${runtimeError}`;
    } else if (testResults?.results) {
      const failedTests = testResults.results.filter((r) => !r.passed);
      if (failedTests.length > 0) {
        errorContext = `\n## KẾT QUẢ: ${testResults.passed}/${testResults.total} passed\n`;
        failedTests.slice(0, 3).forEach((t, i) => {
          errorContext += `Test ${i + 1}: input=${t.input} expected=${
            t.expected
          } got=${t.actual || "null"}\n`;
        });
      }
    }

    return `Phân tích code ${langName} của sinh viên mới học.

## ĐỀ BÀI:
${questionText || "Không có"}

## CODE:
\`\`\`${language}
${code ? code.substring(0, 2000) : "Không có"}
\`\`\`
${errorContext}

## NGUYÊN TẮC:
- KHÔNG cho code mẫu
- KHÔNG chỉ "sửa dòng X thành Y"
- CHỈ gợi ý HƯỚNG suy nghĩ
- Tiếng Việt đơn giản, thân thiện`;
  }

  _getFallbackResponse({ compileError, runtimeError, testResults }) {
    if (compileError) {
      return {
        enabled: true,
        error_type: "compile_error",
        error_summary: "Code có lỗi cú pháp, không thể biên dịch",
        hints: [
          "Đọc kỹ thông báo lỗi, chú ý số dòng",
          "Kiểm tra dấu ; cuối câu lệnh",
          "Kiểm tra các cặp ngoặc () {} []",
        ],
        common_mistake: "Thiếu dấu ; hoặc ngoặc",
        encouragement: "Lỗi compile thường dễ sửa!",
        next_step: "Sửa lỗi ở dòng được chỉ ra trước",
      };
    }

    if (runtimeError) {
      let hints = ["Kiểm tra các phép chia, đảm bảo không chia cho 0"];
      let summary = "Chương trình gặp lỗi khi chạy";

      if (
        runtimeError.includes("Segmentation") ||
        runtimeError.includes("SIGSEGV")
      ) {
        summary = "Lỗi truy cập bộ nhớ không hợp lệ";
        hints = [
          "Kiểm tra chỉ số mảng",
          "Mảng bắt đầu từ 0",
          "Kiểm tra con trỏ NULL",
        ];
      } else if (runtimeError.includes("timeout")) {
        summary = "Chương trình chạy quá lâu";
        hints = [
          "Kiểm tra vòng lặp vô hạn",
          "Kiểm tra điều kiện dừng",
          "Biến đếm có tăng/giảm đúng?",
        ];
      }

      return {
        enabled: true,
        error_type: "runtime_error",
        error_summary: summary,
        hints,
        common_mistake: "Quên kiểm tra biên mảng hoặc điều kiện dừng",
        encouragement: "Runtime error khó hơn một chút, nhưng bạn sẽ tìm ra!",
        next_step: "Thử in ra giá trị biến để debug",
      };
    }

    if (testResults && testResults.passed < testResults.total) {
      return {
        enabled: true,
        error_type: "logic_error",
        error_summary: `${testResults.passed}/${testResults.total} test đúng - có lỗi logic`,
        hints: [
          "So sánh expected và actual",
          "Thử với input đơn giản",
          "Kiểm tra edge cases",
        ],
        common_mistake: "Quên xử lý edge cases",
        encouragement: "Code chạy được rồi, chỉ cần tinh chỉnh logic!",
        next_step: "Tập trung vào test case sai đầu tiên",
      };
    }

    return {
      enabled: true,
      error_type: "success",
      error_summary: "Tất cả test đều đúng!",
      hints: [],
      common_mistake: null,
      encouragement: "Xuất sắc! 🎉",
      next_step: "Có thể Submit bài",
    };
  }

  _getDisabledResponse() {
    return {
      enabled: false,
      error_type: null,
      error_summary: null,
      hints: [],
      common_mistake: null,
      encouragement: null,
      next_step: null,
    };
  }

  _getLanguageName(lang) {
    const names = {
      c: "C",
      cpp: "C++",
      "c++": "C++",
      javascript: "JavaScript",
      js: "JavaScript",
      python: "Python",
      java: "Java",
    };
    return names[lang?.toLowerCase()] || lang || "lập trình";
  }
}

module.exports = RunTestAIService;
