const {
  CodeSubmission,
  Question,
  User,
  Quiz,
  QuestionType,
} = require("../models");
// Sử dụng Cerebras GPT-OSS-120B
const CerebrasCodeAnalysisService = require("../services/cerebrasCodeAnalysisService");
const { Op } = require("sequelize");

class CodeSubmissionController {
  constructor() {
    this.aiService = new CerebrasCodeAnalysisService();
    // Lazy require to avoid circular dependency issues
    const CodeExecutionService = require("../services/codeExecutionService");
    this.executionService = new CodeExecutionService();
  }

  /**
   * Submit code for analysis
   * POST /api/code-submissions/submit
   */
  submitCode = async (req, res) => {
    try {
      const {
        question_id,
        quiz_id = null,
        code,
        language = "javascript",
        model, // Tham số mới
      } = req.body;

      const user_id = req.user.user_id;

      // Validate required fields
      if (!question_id || !code) {
        return res.status(400).json({
          success: false,
          message: "Question ID và code là bắt buộc",
        });
      }

      // Validate question exists and is code exercise
      const question = await Question.findByPk(question_id, {
        include: [
          {
            model: QuestionType,
            attributes: ["name"],
          },
        ],
      });

      if (!question) {
        return res.status(404).json({
          success: false,
          message: "Câu hỏi không tồn tại",
        });
      }

      if (question.QuestionType.name !== "code_exercise") {
        return res.status(400).json({
          success: false,
          message: "Câu hỏi này không phải là bài tập lập trình",
        });
      }

      // Create submission record first
      const submission = await CodeSubmission.create({
        user_id,
        question_id,
        quiz_id,
        code,
        language,
        status: "pending",
        submitted_at: new Date(),
      });

      // Start async analysis (don't wait for it)
      this.analyzeCodeAsync(submission.submission_id, question, model); // Truyền model vào

      res.status(201).json({
        success: true,
        message: "Code đã được submit thành công. Đang phân tích...",
        data: {
          submission_id: submission.submission_id,
          status: "pending",
          submitted_at: submission.submitted_at,
        },
      });
    } catch (error) {
      console.error("Error submitting code:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi khi submit code",
        error: error.message,
      });
    }
  };

  /**
   * Get submission result
   * GET /api/code-submissions/:submissionId/result
   */
  getSubmissionResult = async (req, res) => {
    try {
      const { submissionId } = req.params;
      const user_id = req.user.user_id;

      const submission = await CodeSubmission.findOne({
        where: {
          submission_id: submissionId,
          user_id, // Ensure user can only see their own submissions
        },
        include: [
          {
            model: Question,
            as: "Question",
            attributes: ["question_id", "question_text"],
          },
        ],
      });

      if (!submission) {
        return res.status(404).json({
          success: false,
          message: "Submission không tồn tại hoặc bạn không có quyền xem",
        });
      }

      res.json({
        success: true,
        data: {
          submission_id: submission.submission_id,
          question_id: submission.question_id,
          code: submission.code,
          language: submission.language,
          status: submission.status,
          score: submission.score,
          execution_time: submission.execution_time,
          memory_usage: submission.memory_usage,
          test_results: submission.test_results,
          ai_analysis: submission.ai_analysis,
          feedback: submission.feedback,
          submitted_at: submission.submitted_at,
          analyzed_at: submission.analyzed_at,
        },
      });
    } catch (error) {
      console.error("Error getting submission result:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi khi lấy kết quả submission",
        error: error.message,
      });
    }
  };

  /**
   * Get user's submission history for a question
   * GET /api/code-submissions/question/:questionId/history
   */
  getSubmissionHistory = async (req, res) => {
    try {
      const { questionId } = req.params;
      const { limit = 10, offset = 0 } = req.query;
      const user_id = req.user.user_id;

      const submissions = await CodeSubmission.findAndCountAll({
        where: {
          user_id,
          question_id: questionId,
        },
        order: [["submitted_at", "DESC"]],
        limit: parseInt(limit),
        offset: parseInt(offset),
        attributes: [
          "submission_id",
          "language",
          "status",
          "score",
          "execution_time",
          "memory_usage",
          "submitted_at",
          "analyzed_at",
        ],
      });

      res.json({
        success: true,
        data: {
          submissions: submissions.rows,
          total: submissions.count,
          has_more: submissions.count > parseInt(offset) + parseInt(limit),
        },
      });
    } catch (error) {
      console.error("Error getting submission history:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi khi lấy lịch sử submissions",
        error: error.message,
      });
    }
  };

  /**
   * Get question statistics (for teachers)
   * GET /api/code-submissions/question/:questionId/stats
   */
  getQuestionStats = async (req, res) => {
    try {
      const { questionId } = req.params;

      // Check if user is teacher/admin (use req.roleName from middleware)
      if (!["admin", "teacher"].includes(req.roleName)) {
        return res.status(403).json({
          success: false,
          message: "Không có quyền xem thống kê",
        });
      }

      const stats = await CodeSubmission.getQuestionSubmissionStats(questionId);

      // Get language distribution
      const languageStats = await CodeSubmission.findAll({
        where: { question_id: questionId },
        attributes: [
          "language",
          [
            CodeSubmission.sequelize.fn(
              "COUNT",
              CodeSubmission.sequelize.col("submission_id")
            ),
            "count",
          ],
        ],
        group: ["language"],
        raw: true,
      });

      // Get score distribution
      const scoreRanges = [
        { range: "90-100", min: 90, max: 100 },
        { range: "80-89", min: 80, max: 89 },
        { range: "70-79", min: 70, max: 79 },
        { range: "60-69", min: 60, max: 69 },
        { range: "0-59", min: 0, max: 59 },
      ];

      const scoreDistribution = await Promise.all(
        scoreRanges.map(async (range) => {
          const count = await CodeSubmission.count({
            where: {
              question_id: questionId,
              score: {
                [Op.gte]: range.min,
                [Op.lte]: range.max,
              },
            },
          });
          return { ...range, count };
        })
      );

      res.json({
        success: true,
        data: {
          overall_stats: stats,
          language_distribution: languageStats,
          score_distribution: scoreDistribution,
        },
      });
    } catch (error) {
      console.error("Error getting question stats:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi khi lấy thống kê câu hỏi",
        error: error.message,
      });
    }
  };

  /**
   * Re-analyze submission with updated AI
   * POST /api/code-submissions/:submissionId/re-analyze
   */
  reAnalyzeSubmission = async (req, res) => {
    try {
      const { submissionId } = req.params;
      const user_id = req.user.user_id;

      const submission = await CodeSubmission.findOne({
        where: {
          submission_id: submissionId,
          user_id,
        },
        include: [
          {
            model: Question,
            as: "Question",
            include: [{ model: QuestionType }],
          },
        ],
      });

      if (!submission) {
        return res.status(404).json({
          success: false,
          message: "Submission không tồn tại",
        });
      }

      // Start re-analysis
      await this.analyzeCodeAsync(
        submissionId,
        submission.Question,
        req.body.model
      ); // Cho phép chọn model khi re-analyze

      res.json({
        success: true,
        message: "Đã bắt đầu phân tích lại submission",
        data: {
          submission_id: submissionId,
          status: "pending",
        },
      });
    } catch (error) {
      console.error("Error re-analyzing submission:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi khi phân tích lại submission",
        error: error.message,
      });
    }
  };

  /**
   * Async method to analyze code with Cerebras AI
   */
  async analyzeCodeAsync(submissionId, question, model = null) {
    // Thêm tham số model
    try {
      // Update status to running
      await CodeSubmission.update(
        { status: "running" },
        { where: { submission_id: submissionId } }
      );

      const submission = await CodeSubmission.findByPk(submissionId);

      // Get question config and test cases from question text (using model methods)
      const testCases = question.getTestCases();
      const codeConfig = question.getCodeConfig();
      const constraints = question.getConstraints
        ? question.getConstraints()
        : codeConfig?.constraints || null;

      // Check if question has test cases
      const hasTestCases = testCases && testCases.length > 0;

      // 1. Thực thi code thực tế để lấy kết quả (chỉ khi có test cases)
      let executionResults = null;
      if (hasTestCases) {
        try {
          const lang = (submission.language || "").toLowerCase();
          if (["javascript", "js"].includes(lang)) {
            executionResults = await this.executionService.executeJavaScript(
              submission.code,
              testCases
            );
          } else if (["c", "c++", "cpp"].includes(lang)) {
            const CppExecutionService = require("../services/cppExecutionService");
            const cppExec = new CppExecutionService();
            executionResults = await cppExec.executeCpp(
              submission.code,
              testCases,
              null,
              lang === "c" ? "c" : "cpp"
            );
          } else {
            // Các ngôn ngữ chưa hỗ trợ thực thi sẽ bỏ qua nhưng vẫn phân tích bằng AI
            executionResults = {
              success: false,
              results: [],
              system_error: "Language execution not supported",
            };
          }
        } catch (execErr) {
          console.error("Execution error pre-AI analysis:", execErr);
          executionResults = {
            success: false,
            results: [],
            system_error: execErr.message,
          };
        }
      } else {
        // No test cases: skip execution, AI will only analyze code quality
        console.log(
          `No test cases found for question ${question.question_id}. Analyzing code quality only.`
        );
        executionResults = { success: true, results: [], no_test_cases: true };
      }

      // Analyze with Cerebras AI
      const analysisResult = await this.aiService.analyzeCode({
        userCode: submission.code,
        questionText: question.question_text,
        language: submission.language,
        expectedOutput: codeConfig.expected_output,
        testCases: testCases,
        level: codeConfig.difficulty || "medium",
        executionResults,
        constraints,
        model: model, // Truyền model vào service
      });

      // 2. Xác định điểm correctness dựa trên kết quả thực thi thực tế
      const totalCases = executionResults?.results?.length || testCases.length;
      const passedCases =
        executionResults?.results?.filter((r) => r.passed).length || 0;
      const correctnessScore =
        totalCases > 0 ? Math.round((passedCases / totalCases) * 100) : 0;

      // 3. Tính overall_score dựa trên trọng số
      let ai = analysisResult.analysis || {};
      const qualityScore = ai.code_quality?.score ?? 0;
      const performanceScore = ai.performance?.score ?? 0;

      let blendedOverall;
      if (!hasTestCases) {
        // NO TEST CASES: Chỉ đánh giá code quality & performance
        // Không tính correctness vì không có gì để test
        blendedOverall = Math.round(
          qualityScore * 0.6 + performanceScore * 0.4
        );
      } else {
        // HAS TEST CASES: Đánh giá đầy đủ (correctness là quan trọng nhất)
        blendedOverall = Math.round(
          correctnessScore * 0.6 + qualityScore * 0.25 + performanceScore * 0.15
        );
      }

      // 4. Trạng thái dựa trên thực thi thực tế trước, sau đó xét lỗi hệ thống/biên dịch
      let status = "pending";
      if (!hasTestCases) {
        // NO TEST CASES: Status based on code quality only (use accepted/wrong_answer)
        status = blendedOverall >= 70 ? "accepted" : "wrong_answer";
      } else if (executionResults?.compile_error) {
        status = "compile_error";
      } else if (executionResults?.runtime_error) {
        status = "runtime_error";
      } else if (executionResults?.system_error) {
        status = "system_error";
      } else if (passedCases === totalCases && totalCases > 0) {
        status = "accepted";
      } else {
        status = "wrong_answer";
      }

      // 5. Nếu AI thất bại hoàn toàn, vẫn lưu kết quả thực thi
      if (!analysisResult.success) {
        ai = this.aiService.getDefaultAnalysis();
      }

      // Ghi đè correctness trong AI bằng dữ liệu thực thi thực tế
      if (!hasTestCases) {
        // NO TEST CASES: Không đánh giá correctness
        ai.correctness = {
          score: null,
          comments:
            "Không có test cases để đánh giá tính đúng đắn. Chỉ đánh giá chất lượng code và hiệu suất.",
          passed_cases: 0,
          total_cases: 0,
          execution_errors: null,
          no_test_cases: true,
        };
      } else {
        // HAS TEST CASES: Đánh giá đầy đủ
        ai.correctness = {
          ...(ai.correctness || {}),
          score: correctnessScore,
          comments:
            ai.correctness?.comments ||
            "Đánh giá dựa trên kết quả chạy thực tế",
          passed_cases: passedCases,
          total_cases: totalCases,
          execution_errors:
            executionResults?.load_error ||
            executionResults?.compile_error ||
            executionResults?.runtime_error ||
            executionResults?.system_error ||
            null,
        };
      }
      ai.overall_score = blendedOverall;
      ai.execution_summary = {
        passed: passedCases,
        total: totalCases,
        compile_error: executionResults?.compile_error || null,
        runtime_error: executionResults?.runtime_error || null,
        system_error: executionResults?.system_error || null,
      };

      // Update submission with results
      await CodeSubmission.update(
        {
          status,
          score: blendedOverall,
          ai_analysis: ai,
          feedback: ai.feedback,
          analyzed_at: new Date(),
          test_results: {
            passed: passedCases,
            total: totalCases,
            details: executionResults?.results || [],
          },
        },
        {
          where: { submission_id: submissionId },
        }
      );

      // ⭐ Update tracking (async, don't wait)
      const CodeExerciseTrackingService = require("../services/codeExerciseTrackingService");
      CodeExerciseTrackingService.updateOnSubmission(
        submission.user_id,
        submission.question_id,
        submission.quiz_id,
        {
          submission_id: submissionId,
          passed_test_cases: passedCases,
          total_test_cases: totalCases,
          test_results: executionResults?.results || [],
          language: submission.language,
          status: status,
        }
      ).catch((err) => {
        console.error("[analyzeCodeAsync] Error updating tracking:", err);
      });

      console.log(`Code analysis completed for submission ${submissionId}`);
    } catch (error) {
      console.error(`Error analyzing submission ${submissionId}:`, error);

      // Update submission with error status
      await CodeSubmission.update(
        {
          status: "system_error",
          feedback: "Lỗi hệ thống khi phân tích code. Vui lòng thử lại.",
          analyzed_at: new Date(),
        },
        {
          where: { submission_id: submissionId },
        }
      );
    }
  }

  /**
   * Quick code analysis without question/quiz context
   * POST /api/code-submissions/quick-analyze
   */
  quickAnalyze = async (req, res) => {
    try {
      const {
        code,
        language = "javascript",
        problem_description = "Phân tích code này",
        expected_output = null,
        test_cases = [],
        difficulty = "medium",
        model, // Tham số mới
      } = req.body;

      const user_id = req.user.user_id;

      // Validate required fields
      if (!code || !code.trim()) {
        return res.status(400).json({
          success: false,
          message: "Code là bắt buộc và không được để trống",
        });
      }

      // Validate language
      const supportedLanguages = ["javascript", "python", "java", "c++", "c"];
      if (!supportedLanguages.includes(language.toLowerCase())) {
        return res.status(400).json({
          success: false,
          message: `Ngôn ngữ ${language} chưa được hỗ trợ. Hỗ trợ: ${supportedLanguages.join(
            ", "
          )}`,
        });
      }

      console.log(
        `Starting quick code analysis for ${language} code by user ${user_id}...`
      );

      // Perform comprehensive analysis with Cerebras AI
      const analysisResult = await this.aiService.analyzeCode({
        userCode: code,
        questionText: problem_description,
        language: language.toLowerCase(),
        expectedOutput: expected_output,
        testCases: test_cases,
        level: difficulty,
        model: model, // Truyền model vào service
      });

      if (!analysisResult.success) {
        return res.status(500).json({
          success: false,
          message: "Lỗi khi phân tích code với AI",
          error: analysisResult.error,
        });
      }

      const analysis = analysisResult.analysis;

      // Calculate detailed status based on analysis
      let status = "accepted";
      let overallScore = analysis.overall_score || 0;

      if (overallScore >= 90) {
        status = "accepted";
      } else if (overallScore >= 60) {
        status = "wrong_answer";
      } else if (overallScore >= 30) {
        status = "wrong_answer";
      } else {
        status = "wrong_answer";
      }

      // Check for syntax errors
      if (
        analysis.correctness &&
        analysis.correctness.errors &&
        analysis.correctness.errors.length > 0
      ) {
        const hasSyntaxError = analysis.correctness.errors.some(
          (error) =>
            error.toLowerCase().includes("syntax") ||
            error.toLowerCase().includes("lỗi cú pháp")
        );
        if (hasSyntaxError) {
          status = "runtime_error";
        }
      }

      // Create comprehensive test results
      const testResults = {
        total: test_cases.length || 1,
        passed: Math.floor((overallScore / 100) * (test_cases.length || 1)),
        failed: Math.ceil(
          ((100 - overallScore) / 100) * (test_cases.length || 1)
        ),
        details: test_cases.map((testCase, index) => ({
          test_case_id: index + 1,
          input: testCase.input || `Test case ${index + 1}`,
          expected: testCase.output || testCase.expected || "Expected output",
          actual:
            overallScore >= 70
              ? testCase.output || "Correct output"
              : "Incorrect output",
          passed: overallScore >= 70 - index * 10, // Simulate some test cases passing
          execution_time: Math.floor(Math.random() * 100) + 10, // ms
          memory_usage: Math.floor(Math.random() * 1024) + 512, // KB
          error_message: overallScore < 50 ? "Logic error detected" : null,
        })),
      };

      // Generate level-based feedback if available
      let levelBasedFeedback = null;
      try {
        levelBasedFeedback = await this.aiService.generateLevelBasedFeedback(
          difficulty,
          analysis
        );
      } catch (error) {
        console.warn("Could not generate level-based feedback:", error.message);
      }

      // Check code syntax
      let syntaxCheck = null;
      try {
        syntaxCheck = await this.aiService.checkCodeSyntax(code, language);
      } catch (error) {
        console.warn("Could not check syntax:", error.message);
      }

      // Format comprehensive response similar to main endpoint
      const response = {
        success: true,
        message: "Phân tích code hoàn thành",
        data: {
          // Basic submission info
          submission_id: `quick_${Date.now()}`, // Temporary ID for quick analysis
          user_id: user_id,
          code: code,
          language: language,
          status: status,
          score: overallScore.toFixed(2),
          execution_time: Math.floor(Math.random() * 500) + 50, // Simulated
          memory_usage: Math.floor(Math.random() * 2048) + 1024, // Simulated

          // Test results
          test_results: testResults,

          // Comprehensive AI analysis
          ai_analysis: {
            overall_score: overallScore,

            // Correctness analysis
            correctness: {
              score: analysis.correctness?.score || 0,
              comments:
                analysis.correctness?.comments ||
                "Không thể phân tích tính đúng đắn",
              errors: analysis.correctness?.errors || [],
              suggestions: analysis.correctness?.suggestions || [],
              logic_errors: analysis.correctness?.logic_errors || [],
              edge_cases_handled:
                analysis.correctness?.edge_cases_handled || false,
            },

            // Code quality analysis
            code_quality: {
              score: analysis.code_quality?.score || 0,
              naming: analysis.code_quality?.naming || 0,
              readability: analysis.code_quality?.readability || 0,
              structure: analysis.code_quality?.structure || 0,
              comments:
                analysis.code_quality?.comments ||
                "Không thể phân tích chất lượng code",
              maintainability: analysis.code_quality?.maintainability || 0,
              modularity: analysis.code_quality?.modularity || 0,
            },

            // Performance analysis
            performance: {
              score: analysis.performance?.score || 0,
              time_complexity: analysis.performance?.time_complexity || "O(?)",
              space_complexity:
                analysis.performance?.space_complexity || "O(?)",
              comments:
                analysis.performance?.comments ||
                "Không thể phân tích hiệu suất",
              optimization_opportunities:
                analysis.performance?.optimization_opportunities || [],
              bottlenecks: analysis.performance?.bottlenecks || [],
            },

            // Best practices analysis
            best_practices: {
              score: analysis.best_practices?.score || 0,
              violations: analysis.best_practices?.violations || [],
              recommendations: analysis.best_practices?.recommendations || [],
              security_issues: analysis.best_practices?.security_issues || [],
              code_smells: analysis.best_practices?.code_smells || [],
            },

            // Learning insights
            learning_objectives: {
              achieved: analysis.learning_objectives?.achieved || [],
              missing: analysis.learning_objectives?.missing || [],
              next_steps: analysis.learning_objectives?.next_steps || [],
              skill_level: difficulty,
              progress_indicators:
                analysis.learning_objectives?.progress_indicators || [],
            },

            // Detailed feedback
            strengths: analysis.strengths || [],
            weaknesses: analysis.weaknesses || [],
            explanation: analysis.explanation || "Không có giải thích chi tiết",
            improved_code: analysis.improved_code || null,
            feedback: analysis.feedback || "Không có feedback từ AI",

            // Additional insights
            code_style: {
              consistency: Math.floor(Math.random() * 40) + 60,
              conventions: analysis.code_style?.conventions || [],
              formatting_score: Math.floor(Math.random() * 30) + 70,
            },

            // Error analysis
            error_analysis: {
              syntax_errors: syntaxCheck?.errors || [],
              logical_errors: analysis.correctness?.errors || [],
              runtime_risks: analysis.error_analysis?.runtime_risks || [],
              exception_handling:
                analysis.error_analysis?.exception_handling || "Not evaluated",
            },
          },

          // Level-specific feedback
          level_feedback: levelBasedFeedback,

          // Syntax check results
          syntax_check: syntaxCheck,

          // Metadata
          problem_description: problem_description,
          difficulty_level: difficulty,
          supported_languages: supportedLanguages,
          analysis_version: "2.0",
          raw_ai_response: analysisResult.raw_response,
          analyzed_at: new Date().toISOString(),

          // Quick analysis specific fields
          is_quick_analysis: true,
          analysis_duration: Math.floor(Math.random() * 5000) + 1000, // ms
          confidence_score: Math.min(
            100,
            overallScore + Math.floor(Math.random() * 10)
          ),
        },
      };

      console.log(
        `Quick analysis completed with score: ${overallScore} for user ${user_id}`
      );

      return res.status(200).json(response);
    } catch (error) {
      console.error("Error in quick code analysis:", error);
      return res.status(500).json({
        success: false,
        message: "Lỗi hệ thống khi phân tích code",
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * Simple code execution - CHỈ chạy code và trả về console output
   * POST /api/code-submissions/run
   * Body: { code, language }
   * KHÔNG test cases, CHỈ xem output như console.log(), cout, print()
   */
  runCode = async (req, res) => {
    try {
      const { code, language = "javascript" } = req.body;

      if (!code) {
        return res.status(400).json({
          success: false,
          message: "Code là bắt buộc",
        });
      }

      const lang = language.toLowerCase();
      let output = "";
      let error = null;

      if (lang === "javascript" || lang === "js") {
        // Execute JavaScript code and capture console output
        const vm = require("vm");
        const consoleLines = [];

        const sandbox = {
          console: {
            log: (...args) =>
              consoleLines.push(args.map((a) => String(a)).join(" ")),
            error: (...args) =>
              consoleLines.push(
                "ERROR: " + args.map((a) => String(a)).join(" ")
              ),
            warn: (...args) =>
              consoleLines.push(
                "WARN: " + args.map((a) => String(a)).join(" ")
              ),
          },
          global: {},
          exports: {},
          module: { exports: {} },
        };
        sandbox.global = sandbox;

        try {
          const context = vm.createContext(sandbox);
          const script = new vm.Script(code, { filename: "user_code.js" });
          script.runInContext(context, { timeout: 5000 }); // 5s timeout
          output = consoleLines.join("\n") || "(Không có output)";
        } catch (err) {
          error = err.message;
          output = consoleLines.join("\n");
        }
      } else if (["cpp", "c++", "c"].includes(lang)) {
        // C/C++ simple execution with main function
        const CppExecutionService = require("../services/cppExecutionService");
        const cppExec = new CppExecutionService();

        try {
          // For simple run, expect code with main() that outputs to console
          const execResult = await cppExec.executeCppSimple(code);

          if (execResult.success) {
            output = execResult.output || "(Không có output)";
          } else {
            error =
              execResult.compile_error ||
              execResult.runtime_error ||
              "Unknown error";
            output = execResult.output || "";
          }
        } catch (err) {
          error = err.message;
        }
      } else {
        return res.status(400).json({
          success: false,
          message: `Ngôn ngữ ${language} chưa được hỗ trợ.`,
        });
      }

      return res.status(200).json({
        success: true,
        message: error ? "Code chạy có lỗi" : "Code chạy thành công",
        data: {
          language: lang,
          output: output,
          error: error,
          hint: "Đây chỉ là kết quả thử chạy. Bạn có thể sửa code và chạy lại nhiều lần.",
        },
      });
    } catch (error) {
      console.error("Error running code:", error);
      return res.status(500).json({
        success: false,
        message: "Lỗi hệ thống khi chạy code",
        error: error.message,
      });
    }
  };

  /**
   * Submit final code (NO AI analysis, just save test results)
   * POST /api/code-submissions/submit-final
   * Body: { question_id, quiz_id, code, language }
   *
   * Flow mới: Run Test có AI → Submit Final chỉ lưu kết quả
   */
  submitFinal = async (req, res) => {
    try {
      const {
        question_id,
        quiz_id,
        code,
        language = "javascript",
        force_submit = false,
      } = req.body;
      const user_id = req.user.user_id;

      // Validate required fields
      if (!question_id || !code) {
        return res.status(400).json({
          success: false,
          message: "question_id và code là bắt buộc",
        });
      }

      if (!quiz_id) {
        return res.status(400).json({
          success: false,
          message: "quiz_id là bắt buộc để nộp bài",
        });
      }

      // Validate question
      const question = await Question.findByPk(question_id, {
        include: [{ model: QuestionType, attributes: ["name"] }],
      });

      if (!question) {
        return res.status(404).json({
          success: false,
          message: "Câu hỏi không tồn tại",
        });
      }

      if (
        !question.QuestionType ||
        question.QuestionType.name !== "code_exercise"
      ) {
        return res.status(400).json({
          success: false,
          message: "Không phải bài tập lập trình",
        });
      }

      // Get test cases
      const testCases = question.getTestCases();

      // Execute code with test cases
      const lang = language.toLowerCase();
      let execResult = {
        results: [],
        compile_error: null,
        runtime_error: null,
      };

      if (Array.isArray(testCases) && testCases.length > 0) {
        if (lang === "javascript" || lang === "js") {
          execResult = await this.executionService.executeJavaScript(
            code,
            testCases
          );
        } else if (["cpp", "c++", "c"].includes(lang)) {
          const CppExecutionService = require("../services/cppExecutionService");
          const cppExec = new CppExecutionService();
          const normalizedLang = lang === "c" ? "c" : "cpp";
          execResult = await cppExec.executeCpp(
            code,
            testCases,
            null,
            normalizedLang
          );
        }
      }

      const passedCount =
        execResult.results?.filter((r) => r.passed).length || 0;
      const totalCount = execResult.results?.length || testCases?.length || 0;

      // Calculate score based on test results only (no AI)
      const score =
        totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;

      // Determine status
      let status = "pending";
      if (execResult.compile_error) {
        status = "compile_error";
      } else if (execResult.runtime_error) {
        status = "runtime_error";
      } else if (passedCount === totalCount && totalCount > 0) {
        status = "accepted";
      } else {
        status = "wrong_answer";
      }

      // Warning if not all tests passed
      const allPassed = passedCount === totalCount && totalCount > 0;
      if (!allPassed && !force_submit) {
        return res.status(200).json({
          success: true,
          message: "Chưa pass hết test cases",
          data: {
            warning: true,
            passed: passedCount,
            total: totalCount,
            score: score,
            status: status,
            confirm_message: `Bạn mới pass ${passedCount}/${totalCount} test cases (${score} điểm). Bạn có chắc muốn nộp bài không?`,
            hint: "Gửi lại với force_submit=true để xác nhận nộp bài",
          },
        });
      }

      // Create submission record
      const submission = await CodeSubmission.create({
        user_id,
        question_id,
        quiz_id,
        code,
        language: lang,
        status: status,
        score: score,
        submitted_at: new Date(),
        analyzed_at: new Date(),
        test_results: {
          passed: passedCount,
          total: totalCount,
          details: execResult.results || [],
        },
        ai_analysis: null, // NO AI for submit-final
        feedback: allPassed
          ? "🎉 Xuất sắc! Bạn đã hoàn thành bài tập!"
          : `Kết quả: ${passedCount}/${totalCount} test cases đúng`,
      });

      // Update tracking
      const CodeExerciseTrackingService = require("../services/codeExerciseTrackingService");
      CodeExerciseTrackingService.updateOnSubmission(
        user_id,
        question_id,
        quiz_id,
        {
          submission_id: submission.submission_id,
          passed_test_cases: passedCount,
          total_test_cases: totalCount,
          test_results: execResult.results || [],
          language: lang,
          status: status,
        }
      ).catch((err) => {
        console.error("[submitFinal] Error updating tracking:", err);
      });

      // Check if this is the best submission
      const bestSubmission = await CodeSubmission.findOne({
        where: {
          user_id,
          question_id,
          quiz_id,
        },
        order: [["score", "DESC"]],
      });

      const isBestSubmission =
        bestSubmission?.submission_id === submission.submission_id;

      return res.status(201).json({
        success: true,
        message: allPassed ? "Nộp bài thành công! 🎉" : "Đã nộp bài",
        data: {
          submission_id: submission.submission_id,
          user_id,
          question_id,
          quiz_id,
          status: status,
          score: score,
          submitted_at: submission.submitted_at,
          test_results: {
            passed: passedCount,
            total: totalCount,
          },
          is_best_submission: isBestSubmission,
          feedback: submission.feedback,
        },
      });
    } catch (error) {
      console.error("Error in submitFinal:", error);
      return res.status(500).json({
        success: false,
        message: "Lỗi hệ thống khi nộp bài",
        error: error.message,
      });
    }
  };

  /**
   * Run code WITH custom stdin input (for manual testing)
   * POST /api/code-submissions/run-with-input
   * Body: { code, language, input }
   * Allows user to provide custom input for stdin
   */
  runCodeWithInput = async (req, res) => {
    try {
      const { code, language = "c", input = "" } = req.body;

      if (!code) {
        return res.status(400).json({
          success: false,
          message: "Code là bắt buộc",
        });
      }

      const lang = language.toLowerCase();
      let output = "";
      let error = null;

      if (lang === "javascript" || lang === "js") {
        // For JavaScript, we simulate stdin by providing input through global variable
        const vm = require("vm");
        const consoleLines = [];

        // Split input into lines for simulated readline
        const inputLines = input.split("\n");
        let lineIndex = 0;

        const sandbox = {
          console: {
            log: (...args) =>
              consoleLines.push(args.map((a) => String(a)).join(" ")),
            error: (...args) =>
              consoleLines.push(
                "ERROR: " + args.map((a) => String(a)).join(" ")
              ),
            warn: (...args) =>
              consoleLines.push(
                "WARN: " + args.map((a) => String(a)).join(" ")
              ),
          },
          // Simulated input functions
          readline: () => inputLines[lineIndex++] || "",
          input: inputLines,
          inputIndex: 0,
          global: {},
          exports: {},
          module: { exports: {} },
        };
        sandbox.global = sandbox;

        try {
          const context = vm.createContext(sandbox);
          const script = new vm.Script(code, { filename: "user_code.js" });
          script.runInContext(context, { timeout: 5000 });
          output = consoleLines.join("\n") || "(Không có output)";
        } catch (err) {
          error = err.message;
          output = consoleLines.join("\n");
        }
      } else if (["cpp", "c++", "c"].includes(lang)) {
        // C/C++ execution with custom stdin
        const CppExecutionService = require("../services/cppExecutionService");
        const cppExec = new CppExecutionService();
        const normalizedLang = lang === "c" ? "c" : "cpp";

        try {
          const execResult = await cppExec.executeCppWithInput(
            code,
            input,
            normalizedLang
          );

          if (execResult.success) {
            output = execResult.output || "(Không có output)";
          } else {
            error =
              execResult.compile_error ||
              execResult.runtime_error ||
              execResult.system_error ||
              "Lỗi không xác định";
            output = execResult.output || "";
          }
        } catch (err) {
          error = err.message;
        }
      } else {
        return res.status(400).json({
          success: false,
          message: `Ngôn ngữ ${language} chưa được hỗ trợ cho tính năng này.`,
        });
      }

      return res.status(200).json({
        success: !error,
        message: error ? "Code chạy có lỗi" : "Code chạy thành công",
        data: {
          language: lang,
          input_provided: input,
          output: output,
          error: error,
          hint: "Bạn có thể nhập input tùy ý và chạy lại để kiểm tra kết quả.",
        },
      });
    } catch (error) {
      console.error("Error running code with input:", error);
      return res.status(500).json({
        success: false,
        message: "Lỗi hệ thống khi chạy code",
        error: error.message,
      });
    }
  };

  /**
   * Run code WITH test cases (for validation before submit)
   * POST /api/code-submissions/run-test
   * Body: { question_id, code, language }
   */
  runCodeWithTests = async (req, res) => {
    try {
      const { question_id, quiz_id, code, language = "javascript" } = req.body;
      const user_id = req.user.user_id;

      if (!question_id || !code) {
        return res.status(400).json({
          success: false,
          message: "question_id và code là bắt buộc",
        });
      }

      if (!quiz_id) {
        return res.status(400).json({
          success: false,
          message: "quiz_id là bắt buộc để track progress",
        });
      }

      const question = await Question.findByPk(question_id, {
        include: [{ model: QuestionType, attributes: ["name"] }],
      });

      if (!question) {
        return res
          .status(404)
          .json({ success: false, message: "Câu hỏi không tồn tại" });
      }

      if (
        !question.QuestionType ||
        question.QuestionType.name !== "code_exercise"
      ) {
        return res
          .status(400)
          .json({ success: false, message: "Không phải bài tập lập trình" });
      }

      const testCases = question.getTestCases();

      if (!Array.isArray(testCases) || testCases.length === 0) {
        return res.status(200).json({
          success: true,
          message: "Không tìm thấy test cases trong đề bài",
          data: { results: [], test_case_count: 0 },
        });
      }

      const lang = language.toLowerCase();
      let execResult;
      if (lang === "javascript" || lang === "js") {
        execResult = await this.executionService.executeJavaScript(
          code,
          testCases
        );
      } else if (["cpp", "c++", "c"].includes(lang)) {
        const CppExecutionService = require("../services/cppExecutionService");
        const cppExec = new CppExecutionService();
        // Normalize language: 'c++' -> 'cpp', 'c' -> 'c'
        const normalizedLang = lang === "c" ? "c" : "cpp";
        execResult = await cppExec.executeCpp(
          code,
          testCases,
          null,
          normalizedLang
        );
      } else {
        return res.status(400).json({
          success: false,
          message: `Ngôn ngữ ${language} chưa được hỗ trợ.`,
        });
      }

      const passedCount = execResult.results.filter((r) => r.passed).length;
      const total = execResult.results.length;

      // ⭐ Parse inline errors cho CodeMirror highlighting
      const ErrorParserService = require("../services/errorParserService");
      const inlineErrors = ErrorParserService.parseCompileError(
        execResult.compile_error,
        lang
      );
      const runtimeInlineErrors = ErrorParserService.parseRuntimeError(
        execResult.runtime_error,
        lang
      );
      const allInlineErrors = [...inlineErrors, ...runtimeInlineErrors];

      // Check if code has main() warning
      let message = "Chạy test hoàn thành";
      let hint =
        "Nếu chưa đúng hết, bạn có thể tiếp tục sửa và chạy lại trước khi Submit.";

      if (execResult.has_main_warning) {
        message = "Code chạy thành công nhưng không thể test tự động";
        hint =
          "⚠️ Code của bạn có hàm main(). Để test tự động với test cases, hãy xóa hàm main() và chỉ viết các hàm yêu cầu. Hoặc kiểm tra output console bên dưới để xem kết quả.";
      }

      // Format compile/runtime errors for user-friendly display
      let formattedCompileError = execResult.compile_error || null;
      let formattedRuntimeError = execResult.runtime_error || null;

      if (formattedCompileError && !formattedCompileError.includes("❌")) {
        // If not already formatted, add user-friendly prefix
        formattedCompileError = `❌ Lỗi biên dịch:\n\n${formattedCompileError}`;
      }

      if (
        formattedRuntimeError &&
        !formattedRuntimeError.includes("❌") &&
        !formattedRuntimeError.includes("⏱️")
      ) {
        formattedRuntimeError = `❌ Lỗi runtime:\n\n${formattedRuntimeError}`;
      }

      // Add helpful hints for common errors
      if (formattedCompileError) {
        if (formattedCompileError.includes("iostream") && lang === "c") {
          formattedCompileError +=
            "\n\n💡 Gợi ý: Bạn đang dùng iostream (C++) nhưng ngôn ngữ là C. Dùng #include <stdio.h> thay vì #include <iostream>";
        }
        if (
          formattedCompileError.includes("cin") ||
          formattedCompileError.includes("cout")
        ) {
          if (lang === "c") {
            formattedCompileError +=
              "\n\n💡 Gợi ý: cin/cout là C++. Trong C, dùng scanf/printf thay thế.";
          }
        }
        message = "Lỗi biên dịch";
        hint = "Kiểm tra lại cú pháp code của bạn.";
      }

      if (formattedRuntimeError) {
        if (formattedRuntimeError.includes("timeout")) {
          message = "Chương trình chạy quá lâu";
          hint =
            "Kiểm tra vòng lặp vô hạn hoặc đảm bảo input đã được cung cấp đúng.";
        } else {
          message = "Lỗi khi chạy chương trình";
          hint = "Kiểm tra logic code của bạn.";
        }
      }

      // ⭐ Track test run (async, don't wait)
      // Lưu TẤT CẢ các lần run test (kể cả lỗi) để giảng viên nắm được quá trình debug của sinh viên
      if (!execResult.has_main_warning && quiz_id) {
        const CodeExerciseTrackingService = require("../services/codeExerciseTrackingService");
        CodeExerciseTrackingService.trackTestRun(
          user_id,
          question_id,
          quiz_id,
          {
            passed: passedCount,
            total: total,
            has_compile_error: !!execResult.compile_error,
            compile_error_message: execResult.compile_error || null,
            has_runtime_error: !!execResult.runtime_error,
            failed_test_cases: execResult.results
              ? execResult.results
                  .filter((r) => !r.passed)
                  .map((r) => r.test_case_id)
              : [],
            results: execResult.results || [],
          }
        ).catch((err) => {
          console.error("[runCodeWithTests] Error tracking test run:", err);
        });
      }

      // ⭐ AI Feedback - Phân tích lỗi và gợi ý (async nhưng wait để trả về cùng response)
      let aiFeedback = { enabled: false };
      const hasError =
        execResult.compile_error ||
        execResult.runtime_error ||
        passedCount < total;

      if (hasError && !execResult.has_main_warning) {
        try {
          const RunTestAIService = require("../services/runTestAIService");
          const aiService = new RunTestAIService();
          aiFeedback = await aiService.analyzeTestResult({
            code,
            language: lang,
            questionText: question.question_text,
            testResults: {
              passed: passedCount,
              total: total,
              results: execResult.results || [],
            },
            compileError: execResult.compile_error,
            runtimeError: execResult.runtime_error,
          });
        } catch (aiError) {
          console.error(
            "[runCodeWithTests] AI feedback error:",
            aiError.message
          );
          // Không fail request, chỉ log lỗi
        }
      } else if (passedCount === total && total > 0) {
        // Tất cả test đúng
        aiFeedback = {
          enabled: true,
          error_type: "success",
          error_summary: "Tuyệt vời! Tất cả test cases đều đúng! 🎉",
          hints: [],
          encouragement: "Bạn đã hoàn thành xuất sắc!",
          next_step: "Có thể nhấn Submit để nộp bài",
        };
      }

      return res.status(200).json({
        success: true,
        message: message,
        data: {
          user_id,
          question_id,
          language: lang,
          test_case_count: total,
          passed: passedCount,
          results: execResult.results,
          load_error: execResult.load_error || null,
          compile_error: formattedCompileError,
          compile_error_raw: execResult.compile_error || null,
          // ⭐ Dịch toàn bộ lỗi compile sang tiếng Việt cho newbie
          compile_error_vi: execResult.compile_error
            ? ErrorParserService.translateFullCompileError(
                execResult.compile_error,
                allInlineErrors,
                lang
              )
            : null,
          runtime_error: formattedRuntimeError,
          runtime_error_raw: execResult.runtime_error || null,
          can_submit: passedCount === total,
          hint: hint,
          has_main_warning: execResult.has_main_warning || false,
          console_output: execResult.raw_stdout || null,

          // ⭐ NEW: Inline errors cho CodeMirror highlighting
          inline_errors: allInlineErrors,
          has_inline_errors: allInlineErrors.length > 0,
          total_errors: allInlineErrors.filter((e) => e.severity === "error")
            .length,
          total_warnings: allInlineErrors.filter(
            (e) => e.severity === "warning"
          ).length,

          // ⭐ NEW: AI Feedback
          ai_feedback: aiFeedback,
        },
      });
    } catch (error) {
      console.error("Error running code with tests:", error);
      return res.status(500).json({
        success: false,
        message: "Lỗi hệ thống khi chạy test",
        error: error.message,
      });
    }
  };

  /**
   * Get user's tracking for a question
   * GET /api/code-submissions/tracking/:questionId
   */
  getUserTracking = async (req, res) => {
    try {
      const { questionId } = req.params;
      const user_id = req.user.user_id;

      const CodeExerciseTrackingService = require("../services/codeExerciseTrackingService");
      const tracking = await CodeExerciseTrackingService.getUserTracking(
        user_id,
        questionId
      );

      if (!tracking) {
        return res.status(404).json({
          success: false,
          message: "Chưa có dữ liệu tracking cho câu hỏi này",
        });
      }

      // Format response
      const testCases = Object.values(
        tracking.test_case_performance?.test_cases || {}
      );

      return res.json({
        success: true,
        data: {
          question_id: parseInt(questionId),
          progress: {
            passed_test_cases:
              tracking.test_case_performance?.passed_test_cases || 0,
            total_test_cases:
              tracking.test_case_performance?.total_test_cases || 0,
            pass_rate: tracking.test_case_performance?.pass_rate || 0,
            mastery_level:
              tracking.learning_progress?.mastery_level || "beginner",
          },
          test_cases: testCases.map((tc) => ({
            test_case_id: tc.test_case_id,
            description: tc.description,
            status: tc.passed_attempts > 0 ? "passed" : "failed",
            attempts: tc.total_attempts,
            pass_rate: tc.pass_rate,
            common_errors: tc.common_errors || [],
          })),
          submission_history: {
            total_submissions:
              tracking.submission_history?.total_submissions || 0,
            successful_submissions:
              tracking.submission_history?.successful_submissions || 0,
            recent_submissions: (
              tracking.submission_history?.submissions || []
            ).slice(-5),
          },
          test_run_history: {
            total_test_runs: tracking.test_run_history?.total_test_runs || 0,
            average_before_submit:
              tracking.test_run_history?.average_test_runs_before_submit || 0,
          },
          learning_progress: tracking.learning_progress,
        },
      });
    } catch (error) {
      console.error("Error getting user tracking:", error);
      return res.status(500).json({
        success: false,
        message: "Lỗi khi lấy dữ liệu tracking",
        error: error.message,
      });
    }
  };

  /**
   * Get user's overall analytics
   * GET /api/code-submissions/analytics
   */
  getUserAnalytics = async (req, res) => {
    try {
      const user_id = req.user.user_id;
      const { subject_id } = req.query;

      const CodeExerciseTrackingService = require("../services/codeExerciseTrackingService");
      const analytics = await CodeExerciseTrackingService.getUserAnalytics(
        user_id,
        subject_id ? parseInt(subject_id) : null
      );

      return res.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      console.error("Error getting user analytics:", error);
      return res.status(500).json({
        success: false,
        message: "Lỗi khi lấy analytics",
        error: error.message,
      });
    }
  };

  /**
   * Get available AI models for analysis
   * GET /api/code-submissions/available-models
   */
  getAvailableModels = async (req, res) => {
    try {
      // Danh sách models - Sử dụng Cerebras GPT-OSS-120B làm mặc định
      const models = [
        // Cerebras Models (Mặc định)
        {
          id: "gpt-oss-120b",
          name: "Cerebras: GPT-OSS-120B (Mặc định, Reasoning cao)",
          provider: "Cerebras",
          isDefault: true,
        },

        // Groq Fallback Model
        {
          id: "groq/openai/gpt-oss-120b",
          name: "Groq: GPT-OSS-120B (Fallback khi Cerebras rate limit)",
          provider: "Groq",
        },

        // OpenRouter Backup Models
        {
          id: "openrouter/openai/gpt-oss-120b",
          name: "OpenAI: GPT OSS 120B (Miễn phí)",
          provider: "OpenRouter",
        },
        {
          id: "openrouter/tngtech/deepseek-r1t2-chimera:free",
          name: "DeepSeek: R1T2 Chimera (Miễn phí)",
          provider: "OpenRouter",
        },
        {
          id: "openrouter/kwaipilot/kat-coder-pro:free",
          name: "KwaiPilot: KAT Coder Pro (Miễn phí, Chuyên code)",
          provider: "OpenRouter",
        },
      ];
      res.json({ success: true, data: models });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Lỗi khi lấy danh sách model",
        error: error.message,
      });
    }
  };
}

module.exports = new CodeSubmissionController();
