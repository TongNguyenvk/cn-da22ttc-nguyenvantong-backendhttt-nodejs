const { db } = require("../config/firebase");
const { setCache, getCache } = require("../redis/utils");
const {
  Quiz,
  Question,
  Answer,
  LO,
  UserLOTracking,
  UserQuizTracking,
  UserQuestionHistory,
  ChapterLO,
  Chapter,
  QuizResult,
  User,
  Course,
} = require("../models");
const GamificationService = require("./gamificationService");
const ProgressService = require("./progressService");

// Import new enhanced tracking services
const StrugglingDetectionService = require("./strugglingDetectionService");
const QuestionAnalyticsService = require("./questionAnalyticsService");
const PredictionService = require("./predictionService");

class QuizRealtimeService {
  constructor(io) {
    this.io = io;
  }

  async saveRealtimeAnswer(
    quizId,
    userId,
    questionId,
    answerId,
    isCorrect,
    responseTime,
    dynamicScoreResult = null
  ) {
    try {
      // Khai báo biến để lưu total score sau transaction
      let finalTotalScore = 0;

      // Validate input parameters
      if (!quizId || !userId || !questionId || !answerId) {
        console.error("Missing required parameters:", {
          quizId,
          userId,
          questionId,
          answerId,
        });
        return;
      }

      // Validate response time
      if (responseTime < 0 || responseTime > 30000) {
        console.error("Invalid response time:", responseTime);
        return;
      }

      const quizRef = db.ref(`quiz_sessions/${quizId}`);
      const participantRef = quizRef.child("participants").child(userId);
      const answerRef = participantRef.child("answers").child(questionId);

      // Kiểm tra user tồn tại trước khi tiếp tục
      const user = await User.findByPk(userId, {
        attributes: ["user_id", "name", "email"],
      });
      if (!user) {
        console.error(`User ${userId} not found`);
        return;
      }

      // Lấy thông tin quiz để biết tổng số câu hỏi
      const quiz = await Quiz.findByPk(quizId, {
        include: [
          {
            model: Question,
            as: "Questions",
            through: { attributes: [] },
            attributes: ["question_id"],
          },
        ],
      });

      if (!quiz) {
        console.error(`Quiz ${quizId} not found`);
        return;
      }

      // Kiểm tra trạng thái quiz
      if (quiz.status !== "active") {
        console.error(`Quiz ${quizId} is not active`);
        return;
      }

      const totalQuestions = quiz.Questions.length;

      // Lấy dữ liệu hiện tại của người dùng
      const participantSnapshot = await participantRef.once("value");
      const currentData = participantSnapshot.val() || {
        total_answers: 0,
        correct_answers: 0,
        current_score: 0,
        answers: {},
      };

      // Kiểm tra nếu người dùng đã hoàn thành quiz
      // NOTE: Cho phép retry các câu sai ngay cả khi status = "completed"
      // User flow: Làm hết 10 câu → completed → retry các câu sai
      if (currentData.status === "completed") {
        // Check if this is a valid retry attempt
        const existingAnswer = currentData.answers?.[questionId];
        const existingHistory = existingAnswer?.attempt_history || [];
        const isWrongAnswer = existingAnswer && !existingAnswer.is_correct;
        const hasAttemptsLeft = existingHistory.length < 2;
        
        if (!isWrongAnswer || !hasAttemptsLeft) {
          console.warn(`⚠️ [COMPLETION-CHECK] User ${userId} quiz completed - cannot retry question ${questionId}`);
          console.warn(`   Reason: ${!isWrongAnswer ? 'Already correct' : 'No attempts left (2/2)'}`);
          return {
            success: false,
            reason: isWrongAnswer ? 'max_attempts' : 'already_correct',
            message: isWrongAnswer ? 'Bạn đã hết lượt thử' : 'Bạn đã trả lời đúng câu này'
          };
        }
        
        console.log(`✅ [RETRY-ALLOWED] User ${userId} can retry wrong question ${questionId} (attempt ${existingHistory.length + 1}/2)`);
      } else {
        console.log(`✅ [COMPLETION-CHECK] User ${userId} quiz ${quizId} status: ${currentData.status || 'undefined'} - allowing answer for question ${questionId}`);
      }

      // ============================================================
      // LOGIC ATTEMPT TRACKING - Source of Truth từ Firebase attempt_history
      // ============================================================
      let existingAnswer = currentData.answers && currentData.answers[questionId];
      const existingHistory = existingAnswer?.attempt_history || [];
      let currentAttempts = existingHistory.length;
      
      console.log(`📝 [Attempt Check] User ${userId}, Question ${questionId}: Current attempts = ${currentAttempts} (from attempt_history length)`);

      // RULE 1: Nếu đã đúng rồi thì không cho làm lại
      if (existingAnswer && existingAnswer.is_correct) {
        console.log(`⛔ Question ${questionId} already answered correctly. User: ${userId}`);
        return {
          success: false,
          reason: 'already_correct',
          message: 'Bạn đã trả lời đúng câu này rồi'
        };
      }

      // RULE 2: Tối đa 2 lần thử
      if (currentAttempts >= 2) {
        console.log(`⛔ Question ${questionId} max attempts (2) reached. User: ${userId}`);
        return {
          success: false,
          reason: 'max_attempts_reached',
          message: 'Bạn đã sử dụng hết 2 lần thử cho câu này'
        };
      }

      const newAttemptIndex = currentAttempts + 1;
      console.log(`✅ [Attempt Allowed] User ${userId}, Question ${questionId}: Attempt ${newAttemptIndex}/2`);

      // Tính điểm cho câu hỏi này - sử dụng dynamic scoring nếu có
      let questionScore = 0;
      let scoringDetails = {};

      if (isCorrect) {
        if (dynamicScoreResult && dynamicScoreResult.total_points) {
          // Sử dụng dynamic scoring với safe access
          questionScore = dynamicScoreResult.total_points;
          
          // PENALTY cho retry (lần 2)
          if (newAttemptIndex === 2) {
            questionScore = Math.floor(questionScore * 0.5); // 50% điểm cho lần thử thứ 2
            console.log(`⚠️ Retry penalty applied: ${dynamicScoreResult.total_points} -> ${questionScore} points`);
          }
          
          scoringDetails = {
            base_points: dynamicScoreResult.base_points ?? 0,
            speed_bonus: dynamicScoreResult.speed_bonus ?? 0,
            streak_bonus: dynamicScoreResult.streak_bonus ?? 0,
            difficulty_multiplier: dynamicScoreResult.difficulty_multiplier ?? 1.0,
            time_bonus: dynamicScoreResult.time_bonus ?? 0,
            streak_multiplier: dynamicScoreResult.streak_multiplier ?? 1.0,
            bonuses: dynamicScoreResult.bonuses ?? [],
            streak_info: dynamicScoreResult.streak_info ?? {
              current_streak: 0,
              is_combo: false,
              combo_name: null,
            },
            // THÊM THÔNG TIN ATTEMPT
            attempt_index: newAttemptIndex,
            is_retry: newAttemptIndex > 1,
            retry_penalty_applied: newAttemptIndex > 1,
            original_points: newAttemptIndex > 1 ? dynamicScoreResult.total_points : questionScore
          };

          console.log(
            `[saveRealtimeAnswer] Scoring for attempt ${newAttemptIndex}:`,
            JSON.stringify(scoringDetails, null, 2)
          );
        } else {
          // Fallback to old scoring system
          questionScore = newAttemptIndex === 1 ? 10 : 5;  // FIX: Dùng newAttemptIndex thay vì attempts
          scoringDetails = {
            base_points: questionScore,
            speed_bonus: 0,
            streak_bonus: 0,
            difficulty_multiplier: 1.0, // Đảm bảo có giá trị mặc định
            time_bonus: 0,
            streak_multiplier: 1.0,
            bonuses: [],
            streak_info: {
              current_streak: 0,
              is_combo: false,
              combo_name: null,
            },
            legacy_scoring: true,
          };

          console.log(
            `[saveRealtimeAnswer] Fallback scoring details for question ${questionId}:`,
            JSON.stringify(scoringDetails, null, 2)
          );
        }
      } else {
        // Câu trả lời sai - vẫn cần cung cấp scoring_details để tránh undefined
        questionScore = 0;
        scoringDetails = {
          base_points: 0,
          speed_bonus: 0,
          streak_bonus: 0,
          difficulty_multiplier: 1.0,
          time_bonus: 0,
          streak_multiplier: 1.0,
          bonuses: [],
          streak_info: {
            current_streak: 0,
            is_combo: false,
            combo_name: null,
          },
          wrong_answer: true,
          // THÊM THÔNG TIN ATTEMPT cho câu sai
          attempt_index: newAttemptIndex,
          is_retry: newAttemptIndex > 1,
          attempts_remaining: 2 - newAttemptIndex
        };

        console.log(
          `[saveRealtimeAnswer] Wrong answer (attempt ${newAttemptIndex}/2) for question ${questionId}`
        );
      }

      // ============================================================
      // LƯU VÀO FIREBASE với attempt_history tracking
      // ============================================================
      const attemptData = {
        attempt_index: newAttemptIndex,  // Match với DB column name
        answer_id: answerId,
        is_correct: isCorrect,
        response_time: responseTime,
        points_earned: questionScore,
        timestamp: Date.now(),
        scoring_details: scoringDetails
      };

      const answerData = {
        answer_id: answerId,               // Latest answer
        is_correct: isCorrect,             // Latest result
        response_time: responseTime,       // Latest response time
        timestamp: Date.now(),
        attempts: newAttemptIndex,         // Số lần đã thử (1 hoặc 2)
        score: questionScore,
        points_earned: questionScore,
        scoring_details: scoringDetails,
        // THÊM attempt_history để track tất cả lần thử
        attempt_history: [...existingHistory, attemptData]
      };

      console.log(`💾 [FIREBASE-SAVE] User ${userId}, Question ${questionId}, Attempt ${newAttemptIndex}:`, {
        is_correct: isCorrect,
        points: questionScore,
        total_attempts: newAttemptIndex,
        existing_history_length: existingHistory.length,
        new_history_length: answerData.attempt_history.length
      });
      
      // Log chi tiết attempt_history để debug
      console.log(`📜 [ATTEMPT-HISTORY] Question ${questionId}:`);
      answerData.attempt_history.forEach((attempt, idx) => {
        console.log(`  [${idx + 1}] attempt_index=${attempt.attempt_index}, answer=${attempt.answer_id}, correct=${attempt.is_correct}, points=${attempt.points_earned}`);
      });

      // CRITICAL: Dùng UPDATE thay vì SET để không ghi đè attempt_history!
      // SET sẽ replace toàn bộ object → mất attempt_history cũ
      // UPDATE chỉ merge fields mới vào object hiện tại
      try {
        await answerRef.update(answerData);
        console.log(`✅ [FIREBASE-SUCCESS] Question ${questionId} updated with ${answerData.attempt_history.length} attempts in history`);
        
        // VERIFY: Đọc lại để confirm đã lưu đúng
        const verifySnapshot = await answerRef.once('value');
        const savedData = verifySnapshot.val();
        console.log(`🔍 [FIREBASE-VERIFY] Saved attempt_history length: ${savedData?.attempt_history?.length || 0}`);
        
        if (!savedData?.attempt_history || savedData.attempt_history.length !== answerData.attempt_history.length) {
          console.error(`❌ [FIREBASE-ERROR] attempt_history NOT saved correctly!`);
          console.error(`   Expected ${answerData.attempt_history.length} attempts, got ${savedData?.attempt_history?.length || 0}`);
        }
      } catch (error) {
        console.error("❌ Error updating answer data:", error);
        return {
          success: false,
          reason: 'firebase_error',
          error: error.message
        };
      }

      // Cập nhật thống kê tổng của participant sử dụng transaction
      try {
        await participantRef.transaction((currentParticipantData) => {
          if (!currentParticipantData) {
            currentParticipantData = {
              total_answers: 0,
              correct_answers: 0,
              current_score: 0,
              answers: {},
            };
          }

          // Tính lại tổng điểm từ tất cả câu trả lời
          // QUAN TRỌNG: Chỉ tính điểm của latest attempt (không cộng dồn)
          const allAnswers = {
            ...currentParticipantData.answers,
            [questionId]: answerData,
          };
          
          let totalScore = 0;
          let totalCorrect = 0;
          let uniqueQuestionsAnswered = 0;

          Object.entries(allAnswers).forEach(([qid, ans]) => {
            // Chỉ tính điểm cuối cùng của mỗi câu hỏi
            totalScore += ans.points_earned || 0;
            
            // Đếm số câu trả lời đúng (final result)
            if (ans.is_correct) {
              totalCorrect += 1;
            }
            
            // Đếm số câu đã trả lời (unique questions)
            uniqueQuestionsAnswered += 1;
          });

          // Gán giá trị cho biến bên ngoài để sử dụng sau
          finalTotalScore = totalScore;

          console.log(`📊 Stats Update: User ${userId} - Score: ${totalScore}, Correct: ${totalCorrect}/${uniqueQuestionsAnswered}`);

          return {
            ...currentParticipantData,
            answers: allAnswers,
            current_score: totalScore,
            correct_answers: totalCorrect,
            total_answers: uniqueQuestionsAnswered,  // Số câu unique đã trả lời
            current_question_id: questionId,
            last_answer_time: Date.now(),
            status: "in_progress",
            user_name: user.name,
            user_email: user.email,
          };
        });
      } catch (error) {
        console.error(
          "❌ Error updating participant data with transaction:",
          error
        );
        return {
          success: false,
          reason: 'transaction_error',
          error: error.message
        };
      }

      // ============================================================
      // KHÔNG LƯU VÀO POSTGRESQL NGAY - Chỉ lưu vào Firebase
      // PostgreSQL sẽ được sync khi user hoàn thành quiz (hiệu quả hơn)
      // ============================================================
      // Lý do: 
      // - Tránh quá tải DB khi nhiều user làm quiz cùng lúc
      // - Firebase đủ nhanh cho realtime updates
      // - Batch insert vào PostgreSQL hiệu quả hơn nhiều lần insert riêng lẻ
      // - Giảm response time cho user (không phải đợi DB write)
      
      console.log(`✅ Answer saved to Firebase - will sync to PostgreSQL when quiz completes`);
      // PostgreSQL sync sẽ được xử lý bởi:
      // - completeQuizForUser() khi user làm xong câu cuối
      // - syncSingleParticipantToDatabase() được gọi từ setTimeout
      // - syncQuizDataToDatabase() chạy định kỳ hoặc khi quiz kết thúc

      // ============================================================
      // KIỂM TRA XEM USER ĐÃ HOÀN THÀNH QUIZ CHƯA
      // Logic: User complete khi đã answer ĐỦ SỐ LƯỢNG câu hỏi
      // (không phụ thuộc vào thứ tự trả lời)
      // ============================================================
      
      // Đếm số câu đã trả lời (kể cả đúng/sai)
      // Lấy lại currentData sau khi đã update để có answer mới nhất
      const updatedParticipantSnapshot = await participantRef.once("value");
      const updatedData = updatedParticipantSnapshot.val() || {};
      const answersData = updatedData.answers || {};
      const totalAnswered = Object.keys(answersData).length;
      
      console.log(`� [COMPLETION-CHECK] User ${userId} in Quiz ${quizId}:`);
      console.log(`   - Total questions in quiz: ${totalQuestions}`);
      console.log(`   - Total answered by user: ${totalAnswered}`);
      console.log(`   - Questions answered: [${Object.keys(answersData).join(', ')}]`);

      // Check nếu user đã trả lời đủ số câu
      if (totalAnswered >= totalQuestions) {
        console.log(`🏁 [COMPLETION-CHECK] User ${userId} has answered ALL ${totalQuestions} questions! Will set status=completed`);

        try {
          await participantRef.update({
            status: "completed",
            completed_at: Date.now(),
          });

          // GIẢI PHÁP 2: Gọi sync ngay lập tức cho user vừa hoàn thành
          console.log(
            `[saveRealtimeAnswer] User ${userId} hoàn thành câu cuối cùng quiz ${quizId}, sẽ sync ngay lập tức`
          );
          // Sử dụng setTimeout để không block phản hồi cho client
          setTimeout(async () => {
            try {
              // Lấy dữ liệu cuối cùng để sync (tương tự như trong handleRealtimeAnswer)
              const participantRef = db.ref(
                `quiz_sessions/${quizId}/participants/${userId}`
              );
              const finalSnapshot = await participantRef.once("value");
              const finalUserData = finalSnapshot.val();

              if (finalUserData) {
                // Đảm bảo trạng thái completed
                finalUserData.status = "completed";
                finalUserData.completed_at = Date.now();
                await participantRef.update({
                  status: "completed",
                  completed_at: finalUserData.completed_at,
                });

                // ============================================================
                // PERFORMANCE OPTIMIZATION (99.5% improvement):
                // REMOVED immediate sync AND unanswered question records creation
                // Lý do:
                //   - Batch sync on quiz auto-end handles EVERYTHING (answered + unanswered)
                //   - No need for partial DB writes during quiz
                //   - Prevents incomplete data (e.g., records without answer_choices)
                //   - Firebase has all real-time data
                //   - PostgreSQL gets complete, consistent data in one batch operation
                // 
                // Old flow (BAD):
                //   1. User answers Q10 → status="completed"
                //   2. Immediate write to DB → incomplete data (no answer_choices yet)
                //   3. Quiz auto-end → batch sync → duplicate/missing data
                // 
                // New flow (GOOD):
                //   1. User answers Q10 → status="completed" (Firebase only)
                //   2. User retries wrong answers (Firebase only)
                //   3. Quiz auto-end → ONE batch sync with ALL data (complete & consistent)
                // ============================================================
                console.log(
                  `🚀 [saveRealtimeAnswer] User ${userId} completed first pass - DB sync will happen on quiz auto-end only (performance optimized)`
                );
              } else {
                console.error(
                  `[saveRealtimeAnswer] Không thể lấy dữ liệu cuối cùng của user ${userId}`
                );
              }
            } catch (syncError) {
              console.error(
                `[saveRealtimeAnswer] Lỗi sync user ${userId} quiz ${quizId}:`,
                syncError.message
              );
            }
          }, 100); // Delay nhỏ để đảm bảo Firebase đã lưu xong
        } catch (error) {
          console.error("Error updating quiz completion status:", error);
        }
      } else {
        console.log(`⏳ [COMPLETION-CHECK] User ${userId} has answered ${totalAnswered}/${totalQuestions} questions - quiz NOT yet completed`);
      }

      // Cập nhật gamification points
      let gamificationResult = null;
      try {
        gamificationResult =
          await GamificationService.updateUserPointsAfterAnswer(
            userId,
            questionId,
            isCorrect,
            responseTime,
            quizId
          );
      } catch (error) {
        console.error("Error updating gamification points:", error);
      }

      // Cập nhật bảng xếp hạng
      try {
        await this.updateRealtimeLeaderboard(quizId);
      } catch (error) {
        console.error("Error updating leaderboard:", error);
      }

      // Emit progress tracking update cho giáo viên
      try {
        const participantsRef = db.ref(`quiz_sessions/${quizId}/participants`);
        const snapshot = await participantsRef.once("value");
        const participants = snapshot.val();
        if (participants) {
          this.emitProgressTrackingUpdate(quizId, participants);
        }
      } catch (error) {
        console.error("Error emitting progress tracking update:", error);
      }

      // Gửi kết quả trả lời với thông tin gamification
      if (this.io) {
        const resultData = {
          quiz_id: quizId,
          question_id: questionId,
          is_correct: isCorrect,
          attempts: newAttemptIndex,  // FIX: Dùng newAttemptIndex thay vì attempts
          score: questionScore,
          total_score: finalTotalScore,
        };

        // Thêm thông tin gamification nếu có
        if (gamificationResult) {
          resultData.gamification = {
            points_earned: gamificationResult.points_earned,
            total_points: gamificationResult.total_points,
            level_info: gamificationResult.level_info,
            streak_info: gamificationResult.streak_info,
            speed_bonus: gamificationResult.speed_bonus,
          };
        }

        this.io
          .to(`quiz:${quizId}:${userId}`)
          .emit("showAnswerResult", resultData);

        // Gửi cập nhật điểm realtime cho tất cả người trong quiz
        if (gamificationResult) {
          this.io.to(`quiz:${quizId}`).emit("pointsUpdate", {
            user_id: userId,
            points_earned: gamificationResult.points_earned,
            total_points: gamificationResult.total_points,
            level_up: gamificationResult.level_info.level_up,
            current_level: gamificationResult.level_info.current_level,
          });
        }
      }
    } catch (error) {
      console.error("Error in saveRealtimeAnswer:", error);
      // Không throw error để không ảnh hưởng đến trải nghiệm người dùng
    }
  }

  async updateRealtimeLeaderboard(quizId) {
    const quizRef = db.ref(`quiz_sessions/${quizId}`);
    const participantsRef = quizRef.child("participants");

    // Lấy tất cả người tham gia
    const snapshot = await participantsRef.once("value");
    const participants = snapshot.val();

    if (!participants) return;

    // Lấy thông tin về câu hỏi của quiz
    const quiz = await Quiz.findByPk(quizId, {
      include: [
        {
          model: Question,
          as: "Questions",
          through: { attributes: [] },
          attributes: ["question_id"],
        },
      ],
    });

    if (!quiz) return;

    const questions = quiz.Questions.map((q) => q.question_id);
    const totalQuestions = questions.length;

    // Chuyển đổi dữ liệu thành mảng và sắp xếp
    const leaderboard = Object.entries(participants)
      .map(([userId, data]) => {
        const currentQuestionIndex = questions.indexOf(
          data.current_question_id
        );
        const progress =
          currentQuestionIndex >= 0
            ? (currentQuestionIndex + 1) / totalQuestions
            : 0;
        const score = data.current_score || 0;
        const correctAnswers = data.correct_answers || 0;
        const totalAnswers = data.total_answers || 0;
        const accuracy =
          totalAnswers > 0 ? (correctAnswers / totalAnswers) * 100 : 0;
        const averageResponseTime =
          totalAnswers > 0 ? (data.total_response_time || 0) / totalAnswers : 0;

        return {
          user_id: userId,
          score,
          correct_answers: correctAnswers,
          total_answers: totalAnswers,
          accuracy,
          progress,
          current_question_id: data.current_question_id,
          question_index: currentQuestionIndex,
          average_response_time: averageResponseTime,
          last_answer_time: data.last_answer_time || 0,
          status: data.status || "in_progress",
        };
      })
      .sort((a, b) => {
        // FIX BUG RANKING: Ưu tiên ĐIỂM SỐ thay vì tiến độ
        // Lý do: User trả lời đúng nhiều nên được xếp cao hơn user trả lời sai nhiều
        
        // 1. Sắp xếp theo ĐIỂM SỐ (cao nhất lên đầu) - QUAN TRỌNG NHẤT
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        // 2. Nếu điểm số bằng nhau, sắp xếp theo số câu đúng
        if (b.correct_answers !== a.correct_answers) {
          return b.correct_answers - a.correct_answers;
        }

        // 3. Nếu số câu đúng bằng nhau, sắp xếp theo độ chính xác
        if (b.accuracy !== a.accuracy) {
          return b.accuracy - a.accuracy;
        }

        // 4. Nếu độ chính xác bằng nhau, ưu tiên người đã hoàn thành
        if (a.status === "completed" && b.status !== "completed") return -1;
        if (a.status !== "completed" && b.status === "completed") return 1;

        // 5. Nếu cùng trạng thái, sắp xếp theo thời gian trả lời trung bình (nhanh hơn = tốt hơn)
        if (a.average_response_time !== b.average_response_time) {
          return a.average_response_time - b.average_response_time;
        }

        // 6. Cuối cùng, sắp xếp theo thời gian trả lời cuối cùng (ai trả lời trước = tốt hơn)
        return a.last_answer_time - b.last_answer_time;
      });

    // Lưu bảng xếp hạng vào Firebase
    const leaderboardData = {};
    for (let i = 0; i < leaderboard.length; i++) {
      const item = leaderboard[i];
      const previousPosition = await this.getPreviousPosition(
        quizId,
        item.user_id
      );
      leaderboardData[item.user_id] = {
        ...item,
        position: i + 1,
        previous_position: previousPosition || i + 1,
      };
    }
    await quizRef.child("leaderboard").set(leaderboardData);

    // Gửi cập nhật qua Socket.IO
    this.io.to(`quiz:${quizId}`).emit("leaderboardUpdate", {
      leaderboard: leaderboard.map((item, index) => ({
        ...item,
        position: index + 1,
        previous_position: leaderboardData[item.user_id].previous_position,
      })),
      timestamp: Date.now(),
    });
  }

  async getPreviousPosition(quizId, userId) {
    try {
      const leaderboard = await this.getRealtimeLeaderboard(quizId);
      const userPosition = leaderboard.findIndex(
        (item) => item.user_id === userId
      );

      if (userPosition === -1) {
        return {
          position: 0,
          score: 0,
          totalParticipants: leaderboard.length,
        };
      }

      return {
        position: userPosition + 1,
        score: leaderboard[userPosition].score,
        totalParticipants: leaderboard.length,
      };
    } catch (error) {
      console.error("Error getting user position:", error);
      return {
        position: 0,
        score: 0,
        totalParticipants: 0,
      };
    }
  }

  // Lấy bảng xếp hạng realtime từ Firebase
  async getRealtimeLeaderboard(quizId) {
    try {
      // Sanitize quizId to avoid invalid Firebase paths
      if (quizId && typeof quizId === "object") {
        // Attempt to extract quiz_id property if present
        if (quizId.quiz_id) {
          quizId = quizId.quiz_id; // eslint-disable-line no-param-reassign
        } else {
          console.warn(
            "getRealtimeLeaderboard received object quizId, coercing to string"
          );
          quizId = String(quizId.id || quizId.toString()); // eslint-disable-line no-param-reassign
        }
      }
      if (quizId === undefined || quizId === null) return [];
      quizId = String(quizId); // eslint-disable-line no-param-reassign
      // Reject dangerous characters per Firebase path rules
      if (!quizId || /[.#$\[\]]/.test(quizId)) {
        console.warn("Invalid quizId for realtime leaderboard:", quizId);
        return [];
      }

      // Lấy dữ liệu từ Firebase
      const participantsRef = db.ref(`quiz_sessions/${quizId}/participants`);
      const snapshot = await participantsRef.once("value");
      const participants = snapshot.val();

      if (!participants) return [];

      // Lấy thông tin quiz để biết tổng số câu hỏi
      const quiz = await Quiz.findByPk(quizId, {
        include: [
          {
            model: Question,
            as: "Questions",
            through: { attributes: [] },
            attributes: ["question_id"],
          },
        ],
      });

      if (!quiz) return [];

      const totalQuestions = quiz.Questions.length;
      const pointsPerQuestion = 10 / totalQuestions;

      // Chuyển đổi thành mảng và tính toán điểm số
      const leaderboardData = await Promise.all(
        Object.entries(participants).map(async ([userId, data]) => {
          // Lấy thông tin người dùng từ database thay vì Firebase
          let userName = "Unknown";
          try {
            const user = await User.findByPk(userId, {
              attributes: ["user_id", "name", "email"],
            });
            if (user) {
              userName = user.name;
            }
          } catch (error) {
            console.error(`Error fetching user ${userId}:`, error);
          }

          // Tính toán điểm số dựa trên tỷ lệ câu đúng
          const correctAnswers = data.correct_answers || 0;
          const totalAnswers = data.total_answers || 0;
          const accuracy =
            totalAnswers > 0 ? (correctAnswers / totalAnswers) * 100 : 0;

          // Sử dụng điểm số đã lưu trong Firebase thay vì tính lại
          const score = data.current_score || 0;

          return {
            user_id: userId,
            name: userName,
            score: score,
            correct_answers: correctAnswers,
            total_answers: totalAnswers,
            accuracy: accuracy,
            last_answer_time: data.last_answer_time || 0,
            status: data.status || "in_progress",
          };
        })
      );

      // Sắp xếp bảng xếp hạng theo:
      // 1. Điểm số (cao nhất lên đầu)
      // 2. Số câu đúng (nhiều nhất lên đầu)
      // 3. Thời gian trả lời cuối (nhanh nhất lên đầu)
      const sortedLeaderboard = leaderboardData.sort((a, b) => {
        // So sánh điểm số
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        // Nếu điểm bằng nhau, so sánh số câu đúng
        if (b.correct_answers !== a.correct_answers) {
          return b.correct_answers - a.correct_answers;
        }
        // Nếu số câu đúng bằng nhau, so sánh thời gian trả lời cuối
        return a.last_answer_time - b.last_answer_time;
      });

      // Thêm vị trí và thông tin thay đổi
      return sortedLeaderboard.map((entry, index) => ({
        ...entry,
        position: index + 1,
        previous_position: entry.previous_position || index + 1,
        is_ahead: entry.previous_position > index + 1,
        is_behind: entry.previous_position < index + 1,
      }));
    } catch (error) {
      console.error("Lỗi trong getRealtimeLeaderboard:", error);
      return [];
    }
  }

  // Đồng bộ dữ liệu quiz từ Firebase về DB
  async syncQuizDataToDatabase(quizId, options = {}) {
    const { delayMs = 2000 } = options; // Delay mặc định 2 giây để tránh race condition

    // Thêm delay nhỏ để đảm bảo dữ liệu Firebase được cập nhật hoàn tất
    if (delayMs > 0) {
      console.log(
        `[SYNC-TIMING] Waiting ${delayMs}ms before reading Firebase data to avoid race condition...`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    const { acquireLock, releaseLock, extendLock } = require("../redis/utils");
    const lockKey = `lock:quizSync:${quizId}`;
    // Dynamic base TTL (will be refreshed while processing)
    const baseTtl = 120; // start higher
    const locked = await acquireLock(lockKey, baseTtl);
    if (!locked) {
      console.warn(`[quizSync] Skip sync quiz ${quizId} vì lock đang tồn tại`);
      return { success: false, reason: "LOCKED" };
    }
    // Periodic lock refresh every 45s
    let lockExtender = setInterval(() => extendLock(lockKey, baseTtl), 45000);
    const startedAt = Date.now();
    let participantsProcessed = 0;
    let questionHistoryInserts = 0;
    let errors = 0;
    let statusCorrected = 0; // Đếm số user được sửa trạng thái

    try {
      const quizRef = db.ref(`quiz_sessions/${quizId}`);
      const snapshot = await quizRef.once("value");
      const quizData = snapshot.val();

      // Log thời điểm đọc dữ liệu từ Firebase để debug race condition
      const readTimestamp = new Date().toISOString();
      console.log(
        `[SYNC-TIMING] Reading Firebase data at ${readTimestamp} for quiz ${quizId}`
      );

      if (!quizData || !quizData.participants) {
        console.log(`[quizSync] Quiz ${quizId} không có participants`);
        return {
          success: true,
          participantsProcessed: 0,
          historiesInserted: 0,
          errors: 0,
          durationMs: 0,
          note: "NO_PARTICIPANTS",
        };
      }

      // Log trạng thái quiz từ Firebase
      console.log(
        `[SYNC-DEBUG] Quiz ${quizId} Firebase status: "${
          quizData.status || "N/A"
        }", participants: ${Object.keys(quizData.participants).length}`
      );

      // Log chi tiết từng participant để debug
      Object.entries(quizData.participants).forEach(([userId, userData]) => {
        const answerCount = Object.keys(userData.answers || {}).length;
        console.log(
          `[SYNC-DEBUG] Participant ${userId}: status="${
            userData.status || "N/A"
          }", answers=${answerCount}, completed_at=${
            userData.completed_at || "N/A"
          }`
        );
      });

      // GIẢI PHÁP 1: Lấy tổng số câu hỏi của quiz từ PostgreSQL để suy luận trạng thái
      const quiz = await Quiz.findByPk(quizId, {
        include: [
          { model: Question, as: "Questions", attributes: ["question_id"] },
          {
            model: Course,
            as: "Course",
            attributes: ["subject_id"], // Lấy subject_id để tránh lỗi validation
          },
        ],
      });

      // Lấy subject_id từ course để dùng cho UserLOTracking và UserQuizTracking
      const subjectIdForTracking = quiz?.Course?.subject_id;
      if (!subjectIdForTracking) {
        console.warn(
          `[syncQuizDataToDatabase] Không thể xác định subject_id cho Quiz ${quizId}. Sẽ bỏ qua tracking.`
        );
      }

      const totalQuestions = quiz ? quiz.Questions.length : 0;
      if (totalQuestions === 0) {
        console.warn(
          `[quizSync] Quiz ${quizId} has no questions. Sync might be inaccurate.`
        );
      }
      console.log(`[quizSync] Quiz ${quizId} có ${totalQuestions} câu hỏi`);

      // Preload question meta
      const allAnswerEntries = [];
      Object.entries(quizData.participants).forEach(([userId, userData]) => {
        Object.keys(userData.answers || {}).forEach((qid) => {
          allAnswerEntries.push(qid);
        });
      });
      const uniqueQuestionIds = [
        ...new Set(
          allAnswerEntries
            .map((id) => parseInt(id, 10))
            .filter(Number.isInteger)
        ),
      ];
      const questionsMeta = uniqueQuestionIds.length
        ? await Question.findAll({ where: { question_id: uniqueQuestionIds } })
        : [];
      const questionMap = new Map();
      questionsMeta.forEach((q) =>
        questionMap.set(q.question_id.toString(), q)
      );
      for (const [userId, userData] of Object.entries(quizData.participants)) {
        try {
          const user = await User.findByPk(userId);
          if (!user) {
            continue;
          }

          // ============================================================
          // PERFORMANCE OPTIMIZATION: Removed immediate sync check
          // Batch sync giờ chạy 1 lần duy nhất khi quiz auto-end
          // Không cần skip vì không còn duplicate sync
          // ============================================================

          // ============================================================
          // PRIORITY: CHECK PostgreSQL synced_at để tránh re-sync
          // Tránh sync lại nhiều lần gây duplicate
          // ============================================================
          const existingQuizResult = await QuizResult.findOne({
            where: { user_id: userId, quiz_id: quizId }
          });

          if (existingQuizResult && existingQuizResult.synced_at) {
            const syncAge = Date.now() - new Date(existingQuizResult.synced_at).getTime();
            const syncAgeMinutes = Math.floor(syncAge / 60000);
            
            // Nếu đã sync trong vòng 5 phút gần đây, skip
            if (syncAge < 5 * 60 * 1000) {
              console.log(
                `⏭️  [quizSync] Skip user ${userId} quiz ${quizId} - PostgreSQL synced ${syncAgeMinutes}min ago`
              );
              participantsProcessed++; // Count as processed
              continue;
            }
          }
          
          console.log(`🔄 [quizSync] Processing user ${userId} (no recent sync found)`);

          const answers = userData.answers || {};
          const answeredQuestionsCount = Object.keys(answers).length;

          // === LOGIC VÀNG: TỰ SUY LUẬN TRẠNG THÁI CUỐI CÙNG ===
          // Server quyết định trạng thái, không tin vào client.
          let finalStatus = "in_progress";
          let statusChangeReason = "";

          // Đọc trạng thái từ Firebase để so sánh
          const firebaseStatus = userData.status || "in_progress";

          // Kiểm tra điều kiện hoàn thành
          // PRIORITY ORDER: Check most reliable conditions first
          
          // 1. Check Firebase status (most reliable for Assessment mode)
          if (firebaseStatus === "completed") {
            finalStatus = "completed";
            statusChangeReason = `Firebase status is 'completed' (answered ${answeredQuestionsCount}/${totalQuestions})`;
          }
          // 2. Check if answered all questions (first pass completion)
          else if (totalQuestions > 0 && answeredQuestionsCount >= totalQuestions) {
            finalStatus = "completed";
            statusChangeReason = `answered all questions (${answeredQuestionsCount}/${totalQuestions})`;
          }
          // 3. Check quiz status in Firebase or PostgreSQL
          else if (
            quizData.status === "finished" ||
            quiz.status === "finished"
          ) {
            // Quiz đã kết thúc (timer hoặc giáo viên), coi như completed
            finalStatus = "completed";
            statusChangeReason = `quiz finished - force complete (answered ${answeredQuestionsCount}/${totalQuestions})`;
          }
          // 4. Check if quiz expired
          else if (new Date() > new Date(quiz.end_time)) {
            // Quiz đã hết hạn
            finalStatus = "completed";
            statusChangeReason = `quiz expired - force complete (answered ${answeredQuestionsCount}/${totalQuestions})`;
          }

          // Log chi tiết để debug race condition
          if (firebaseStatus !== finalStatus) {
            statusCorrected++;
            console.log(
              `[SYNC-DEBUG] User ${userId}: Firebase status "${firebaseStatus}" -> Server inferred "${finalStatus}" | Reason: ${statusChangeReason} | Quiz status: ${
                quizData.status || "N/A"
              }`
            );
          } else {
            console.log(
              `[SYNC-DEBUG] User ${userId}: Status consistent "${finalStatus}" | ${
                statusChangeReason || "no change needed"
              } | Answered: ${answeredQuestionsCount}/${totalQuestions}`
            );
          }

          const answersEntries = Object.entries(answers);
          const historyBatch = [];
          
          // ============================================================
          // XỬ LÝ ATTEMPT_HISTORY từ Firebase
          // ============================================================
          for (const [questionId, answerData] of answersEntries) {
            const qMeta = questionMap.get(questionId);
            if (!qMeta) {
              console.warn(`[SYNC] Question ${questionId} not found in question map`);
              continue;
            }

            // QUAN TRỌNG: Sử dụng attempt_history nếu có
            const attemptHistory = answerData.attempt_history || [];
            
            if (attemptHistory.length > 0) {
              // Có attempt_history - xử lý từng attempt
              console.log(`📝 [SYNC] Processing ${attemptHistory.length} attempts for question ${questionId}`);
              
              for (const attempt of attemptHistory) {
                // VALIDATION: Đảm bảo attempt_index hợp lệ
                const attemptIndex = parseInt(attempt.attempt_index, 10);
                if (!Number.isInteger(attemptIndex) || attemptIndex < 1 || attemptIndex > 2) {
                  console.error(`❌ [SYNC] Invalid attempt_index for question ${questionId}:`, attempt.attempt_index);
                  continue; // Skip invalid attempt
                }
                
                historyBatch.push({
                  user_id: userId,
                  question_id: questionId,
                  quiz_id: quizId,
                  selected_answer: attempt.answer_id,
                  is_correct: !!attempt.is_correct,
                  time_spent: attempt.response_time || 0,
                  attempt_date: attempt.timestamp ? new Date(attempt.timestamp) : new Date(),
                  points_earned: attempt.points_earned || 0,
                  scoring_breakdown: attempt.scoring_details || {},
                  bonuses_earned: attempt.scoring_details?.bonuses || [],
                  streak_at_time: attempt.scoring_details?.streak_info?.current_streak || 0,
                  attempt_index: attemptIndex,  // Sử dụng validated attempt_index
                });
              }
            } else {
              // Fallback: Không có attempt_history - dùng data cũ
              const attemptIndexRaw = parseInt(answerData.attempts, 10);
              const attemptIndex = Number.isInteger(attemptIndexRaw) && attemptIndexRaw > 0
                ? attemptIndexRaw
                : 1;
              
              console.log(`⚠️ [SYNC] No attempt_history for question ${questionId}, using legacy data with attempt=${attemptIndex}`);
              
              historyBatch.push({
                user_id: userId,
                question_id: questionId,
                quiz_id: quizId,
                selected_answer: answerData.answer_id,
                is_correct: !!answerData.is_correct,
                time_spent: answerData.response_time,
                attempt_date: answerData.timestamp ? new Date(answerData.timestamp) : new Date(),
                points_earned: answerData.points_earned || answerData.score || 0,
                scoring_breakdown: answerData.scoring_details || {},
                bonuses_earned: answerData.scoring_details?.bonuses || [],
                streak_at_time: answerData.scoring_details?.streak_info?.current_streak || 0,
                attempt_index: attemptIndex,
              });
            }
          }
          
          if (!historyBatch.length) {
            // Không có câu trả lời mới -> bỏ qua cập nhật tracking/result để tránh inflate attempts
            console.log(`[SYNC-DEBUG] User ${userId}: No answers to sync, skipping`);
            continue;
          }
          
          // ============================================================
          // FIX: Dùng updateOnDuplicate thay vì ignoreDuplicates
          // Để cập nhật record nếu có thay đổi (ví dụ: điểm số, thời gian)
          // ============================================================
          console.log(`📝 [SYNC] Attempting to sync ${historyBatch.length} attempts for user ${userId}`);
          
          // Log chi tiết từng attempt để debug
          historyBatch.forEach((attempt, index) => {
            console.log(`  [${index + 1}] Q${attempt.question_id} - Attempt ${attempt.attempt_index}: ${attempt.is_correct ? 'CORRECT' : 'WRONG'} (${attempt.points_earned} pts)`);
          });
          
          await UserQuestionHistory.bulkCreate(historyBatch, {
            updateOnDuplicate: [
              'selected_answer',
              'is_correct', 
              'time_spent',
              'points_earned',
              'scoring_breakdown',
              'bonuses_earned',
              'streak_at_time',
              'attempt_date'
            ],
          });
          questionHistoryInserts += historyBatch.length;
          console.log(`✅ Synced ${historyBatch.length} answer records for user ${userId} (including all attempts)`);


          // ============================================================
          // QUAN TRỌNG: Đảm bảo tất cả câu hỏi trong quiz có record
          // Bao gồm cả câu không trả lời
          // ============================================================
          if (finalStatus === 'completed' && quiz && quiz.Questions) {
            const allQuestionIds = quiz.Questions.map(q => q.question_id);
            const answeredQuestionIds = historyBatch.map(h => parseInt(h.question_id));
            const unansweredQuestionIds = allQuestionIds.filter(qid => !answeredQuestionIds.includes(qid));

            if (unansweredQuestionIds.length > 0) {
              console.log(`📝 Creating ${unansweredQuestionIds.length} unanswered question records for user ${userId}: [${unansweredQuestionIds.join(', ')}]`);

              // Kiểm tra xem có record nào đã tồn tại chưa
              const existingUnanswered = await UserQuestionHistory.findAll({
                where: {
                  user_id: userId,
                  quiz_id: quizId,
                  question_id: unansweredQuestionIds
                },
                attributes: ['question_id']
              });
              const existingUnansweredIds = existingUnanswered.map(h => h.question_id);
              const trulyMissingIds = unansweredQuestionIds.filter(qid => !existingUnansweredIds.includes(qid));

              if (trulyMissingIds.length > 0) {
                const unansweredRecords = trulyMissingIds.map(qid => ({
                  user_id: userId,
                  question_id: qid,
                  quiz_id: quizId,
                  selected_answer: null,
                  is_correct: false,
                  time_spent: 0,
                  attempt_date: new Date(),
                  difficulty_level: null,
                  points_earned: 0,
                  scoring_breakdown: { unanswered: true, reason: 'not_answered_during_quiz' },
                  bonuses_earned: [],
                  streak_at_time: 0,
                  attempt_index: 1
                }));

                await UserQuestionHistory.bulkCreate(unansweredRecords, {
                  ignoreDuplicates: true
                });
                console.log(`✅ Created ${unansweredRecords.length} unanswered question records for user ${userId}`);
              } else {
                console.log(`✅ All unanswered questions already have records for user ${userId}`);
              }
            } else {
              console.log(`✅ User ${userId} answered all ${allQuestionIds.length} questions`);
            }
          }

          // LO aggregation (giữ nguyên logic hiện có - TODO optimize preload)
          const loAgg = {};
          for (const hb of historyBatch) {
            const qMeta = questionMap.get(hb.question_id.toString());
            if (!qMeta?.lo_id) continue;
            if (!loAgg[qMeta.lo_id])
              loAgg[qMeta.lo_id] = { total: 0, correct: 0 };
            loAgg[qMeta.lo_id].total++;
            if (hb.is_correct) loAgg[qMeta.lo_id].correct++;
          }
          for (const [loId, stat] of Object.entries(loAgg)) {
            const chapterLOs = await ChapterLO.findAll({
              where: { lo_id: loId },
            });
            const chapterIds = chapterLOs.map((clo) => clo.chapter_id);
            if (!chapterIds.length) continue;
            const chapters = await Chapter.findAll({
              where: { chapter_id: chapterIds },
            });
            const subjectIds = [
              ...new Set(chapters.map((ch) => ch.subject_id)),
            ];
            for (const subjectId of subjectIds) {
              const [tracking, created] = await UserLOTracking.findOrCreate({
                where: { user_id: userId, lo_id: loId, subject_id: subjectId },
                defaults: {
                  performance_metrics: {
                    total_attempts: stat.total,
                    correct_answers: stat.correct,
                    average_score: stat.total ? stat.correct / stat.total : 0,
                    last_attempt_date: new Date(),
                  },
                  update_time: new Date(),
                },
              });
              if (!created) {
                const perf = tracking.performance_metrics || {};
                const total_attempts = (perf.total_attempts || 0) + stat.total;
                const correct_answers =
                  (perf.correct_answers || 0) + stat.correct;
                tracking.performance_metrics = {
                  total_attempts,
                  correct_answers,
                  average_score: total_attempts
                    ? correct_answers / total_attempts
                    : 0,
                  last_attempt_date: new Date(),
                };
                tracking.update_time = new Date();
                await tracking.save();
              }
            }
          }

          // ============================================================
          // FIX CRITICAL BUG: Chỉ tính điểm từ ATTEMPT CUỐI CÙNG của mỗi câu hỏi
          // Trước đây: Cộng điểm của TẤT CẢ attempts → Điểm SAI
          // Bây giờ: Chỉ lấy attempt có attempt_index cao nhất cho mỗi câu
          // ============================================================
          
          // Step 1: Group by question_id and get latest attempt for each
          const latestAttemptsByQuestion = {};
          
          historyBatch.forEach((attempt) => {
            const qid = attempt.question_id;
            
            if (!latestAttemptsByQuestion[qid]) {
              latestAttemptsByQuestion[qid] = attempt;
            } else {
              // So sánh attempt_index, giữ attempt mới nhất
              if (attempt.attempt_index > latestAttemptsByQuestion[qid].attempt_index) {
                latestAttemptsByQuestion[qid] = attempt;
              }
            }
          });
          
          // Step 2: Convert to array of latest attempts only
          const latestAttempts = Object.values(latestAttemptsByQuestion);
          
          console.log(`📊 [SCORE-CALC] Quiz ${quizId} User ${userId}:`);
          console.log(`   Total attempts in batch: ${historyBatch.length}`);
          console.log(`   Unique questions: ${latestAttempts.length}`);
          
          // Step 3: Calculate score from latest attempts ONLY
          const totalQuestionsAnswered = latestAttempts.length;  // ✅ Unique questions
          const correctAnswers = latestAttempts.filter((h) => h.is_correct).length;  // ✅ Latest correct only
          
          let rawTotal = 0;
          let bonuses = 0;
          let maxPoints = 0;
          
          // 🔍 DEBUG: Log từng attempt để check points_earned
          console.log(`\n🔍 [SCORE-DEBUG] Quiz ${quizId} User ${userId} - Checking ${latestAttempts.length} latest attempts:`);
          
          latestAttempts.forEach((h, idx) => {
            const pts = h.points_earned || 0;
            const base = h.scoring_breakdown?.base_points || 10;
            const bonusList = (h.scoring_breakdown && h.scoring_breakdown.bonuses) || [];
            const bonusTotal = bonusList.reduce((s, b) => s + (b.points || 0), 0);
            const potential = base + bonusTotal;
            
            // 🔍 LOG CHI TIẾT từng attempt
            console.log(`  [${idx + 1}/${latestAttempts.length}] Q${h.question_id} attempt=${h.attempt_index}:`);
            console.log(`      is_correct: ${h.is_correct}`);
            console.log(`      points_earned: ${h.points_earned} (using: ${pts})`);
            console.log(`      base_points: ${base}`);
            console.log(`      bonuses: ${bonusTotal} (${bonusList.length} items)`);
            console.log(`      potential: ${potential}`);
            
            // ⚠️ WARN nếu points_earned = 0 nhưng is_correct = true
            if (h.is_correct && pts === 0) {
              console.warn(`      ⚠️  WARNING: Correct answer but 0 points! Check scoring_breakdown:`, h.scoring_breakdown);
            }
            
            // ⚠️ WARN nếu attempt_index > 1 nhưng không có điểm
            if (h.attempt_index > 1 && pts === 0 && h.is_correct) {
              console.error(`      ❌ BUG FOUND: Retry attempt (${h.attempt_index}) has 0 points but is_correct=true!`);
              console.error(`         This is the ACTUAL BUG - retry scoring not saved to DB!`);
            }
            
            rawTotal += pts;  // ✅ Only count latest attempt points
            
            bonusList.forEach((b) => {
              bonuses += b.points || 0;  // ✅ Only count latest bonuses
            });
            
            maxPoints += potential;  // ✅ Correct max points
          });
          
          if (maxPoints === 0) {
            maxPoints = totalQuestionsAnswered * 10;
            rawTotal = correctAnswers * 10;
          }
          
          const normalizedScore = maxPoints ? (rawTotal / maxPoints) * 10 : 0;
          
          console.log(`📊 [SCORE-CALC] Results:`);
          console.log(`   Questions answered: ${totalQuestionsAnswered}`);
          console.log(`   Correct answers: ${correctAnswers}`);
          console.log(`   Raw total: ${rawTotal}`);
          console.log(`   Max points: ${maxPoints}`);
          console.log(`   Normalized score: ${normalizedScore.toFixed(2)}/10`);

          // Tracking attempts (đếm như 1 lần attempt mới nếu có batch mới)
          const existingTrack = await UserQuizTracking.findOne({
            where: { user_id: userId, quiz_id: quizId },
          });
          // ============================================================
          // SYNC USER QUIZ TRACKING (with separate error handling)
          // ============================================================
          try {
            if (existingTrack) {
              const perf = existingTrack.performance_metrics || {};
              const attempts = (perf.total_attempts || 0) + 1;
              existingTrack.performance_metrics = {
                ...perf,
                total_attempts: attempts,
                average_score: normalizedScore / 10,
                best_score: Math.max(perf.best_score || 0, normalizedScore / 10),
                last_attempt_date: new Date(),
              };
              existingTrack.update_time = new Date();
              await existingTrack.save();
            } else if (subjectIdForTracking) {
              // CHỈ TẠO MỚI NẾU CÓ SUBJECT_ID HỢP LỆ
              await UserQuizTracking.create({
                user_id: userId,
                quiz_id: quizId,
                subject_id: subjectIdForTracking, // THÊM SUBJECT_ID ĐỂ TRÁNH VALIDATION ERROR
                performance_metrics: {
                  total_attempts: 1,
                  average_score: normalizedScore / 10,
                  best_score: normalizedScore / 10,
                  completion_time: null,
                  last_attempt_date: new Date(),
                },
                difficulty_breakdown: {},
                lo_performance: {},
                update_time: new Date(),
              });
            } else {
              console.warn(
                `[syncQuizDataToDatabase] Không thể tạo UserQuizTracking cho user ${userId} quiz ${quizId} vì thiếu subject_id hợp lệ`
              );
            }
          } catch (trackingErr) {
            // Log error but don't block QuizResults sync
            console.warn(`⚠️  [SYNC] UserQuizTracking error for user ${userId} (continuing): ${trackingErr.message}`);
          }

          // ============================================================
          // SYNC QUIZ RESULTS - Use findOrCreate pattern (more reliable)
          // ============================================================
          const [result, created] = await QuizResult.findOrCreate({
            where: { quiz_id: quizId, user_id: userId },
            defaults: {
              quiz_id: quizId,
              user_id: userId,
              score: normalizedScore,
              status: finalStatus,
              completion_time: null,
              update_time: new Date(),
              raw_total_points: rawTotal,
              max_points: maxPoints,
              bonuses_total: bonuses,
              synced_at: new Date(),
            }
          });
          
          if (!created) {
            // Update existing record
            result.score = normalizedScore;
            result.status = finalStatus;
            result.raw_total_points = rawTotal;
            result.max_points = maxPoints;
            result.bonuses_total = bonuses;
            result.update_time = new Date();
            result.synced_at = new Date();
            await result.save();
            console.log(`📝 [SYNC] Updated existing QuizResult for user ${userId} quiz ${quizId}`);
          } else {
            console.log(`✅ [SYNC] Created new QuizResult for user ${userId} quiz ${quizId}`);
          }

          participantsProcessed++;
        } catch (innerErr) {
          errors++;
          console.error(
            `[quizSync] Lỗi xử lý user ${userId} quiz ${quizId}:`,
            innerErr.message
          );
          console.error(`[quizSync] Full error details:`, innerErr);
          console.error(`[quizSync] Stack trace:`, innerErr.stack);
        }
      }
      if (errors === 0) {
        await db.ref(`quiz_sessions/${quizId}`).remove();
      } else {
        console.warn(
          `[quizSync] Quiz ${quizId} còn lỗi (${errors}) – giữ Firebase để retry`
        );
      }
      const duration = Date.now() - startedAt;
      console.log(
        `[quizSync] Hoàn tất quiz ${quizId}: users=${participantsProcessed}, histories=${questionHistoryInserts}, statusCorrected=${statusCorrected}, errors=${errors}, duration=${duration}ms`
      );
      return {
        success: errors === 0,
        participantsProcessed,
        historiesInserted: questionHistoryInserts,
        statusCorrected,
        errors,
        durationMs: duration,
      };
    } catch (e) {
      errors++;
      console.error(`[quizSync] Lỗi tổng quát quiz ${quizId}:`, e.message);
      return {
        success: false,
        participantsProcessed,
        historiesInserted: questionHistoryInserts,
        statusCorrected,
        errors,
        durationMs: Date.now() - startedAt,
        reason: e.message,
      };
    } finally {
      clearInterval(lockExtender);
      await releaseLock(lockKey);
    }
  }

  // Emit progress tracking update cho giáo viên (ENHANCED VERSION)
  async emitProgressTrackingUpdate(quizId, participants, currentQuestionId = null) {
    try {
      if (!this.io) return;

      const startTime = Date.now();

      // STEP 1: Calculate basic progress tracking data (existing functionality)
      const basicProgressData = this.calculateProgressTrackingData(participants);

      // STEP 2: Calculate class metrics for enhanced services
      const classMetrics = this.calculateClassMetrics(participants);

      // STEP 3: Get quiz metadata
      const quiz = await Quiz.findByPk(quizId, {
        include: [
          {
            model: Question,
            as: "Questions",
            through: { attributes: [] },
            attributes: ["question_id"],
          },
        ],
      });

      const totalQuestions = quiz ? quiz.Questions.length : 0;
      const currentQuestionIndex = currentQuestionId 
        ? quiz.Questions.findIndex(q => q.question_id === currentQuestionId)
        : 0;

      // STEP 4: Detect struggling students using AI service
      const strugglingStudents = StrugglingDetectionService.detectStrugglingStudents(
        Object.values(participants),
        classMetrics
      );

      // STEP 5: Analyze current question (if available)
      let currentQuestionAnalytics = null;
      if (currentQuestionId) {
        currentQuestionAnalytics = await QuestionAnalyticsService.analyzeLiveQuestionDifficulty(
          quizId,
          currentQuestionId,
          participants
        );
      }

      // STEP 6: Generate predictions
      const predictions = PredictionService.predictQuizOutcome(
        participants,
        totalQuestions,
        currentQuestionIndex,
        classMetrics
      );

      // STEP 7: Generate alerts based on analysis
      const alerts = this.generateTeacherAlerts(
        strugglingStudents,
        currentQuestionAnalytics,
        predictions,
        classMetrics
      );

      // STEP 8: Combine all data into enhanced progress tracking update
      const enhancedProgressData = {
        quiz_id: quizId,
        timestamp: Date.now(),
        
        // Basic data (backward compatible)
        progress_data: basicProgressData,
        
        // ENHANCED DATA - NEW FEATURES
        class_metrics: {
          total_participants: classMetrics.total_participants,
          avg_score: Math.round(classMetrics.avg_score * 10) / 10,
          avg_accuracy: Math.round(classMetrics.avg_accuracy * 10) / 10,
          avg_response_time: Math.round(classMetrics.avg_response_time * 10) / 10,
          median_score: Math.round(classMetrics.median_score * 10) / 10,
          completion_rate: Math.round(classMetrics.completion_rate * 10) / 10
        },

        // Struggling student detection
        struggling_students: {
          count: strugglingStudents.length,
          students: strugglingStudents.slice(0, 5), // Top 5 most at-risk
          total_at_risk: strugglingStudents.filter(s => s.risk_level === 'critical' || s.risk_level === 'high').length
        },

        // Current question analytics
        current_question_analytics: currentQuestionAnalytics,

        // Predictions
        predictions: predictions,

        // Real-time alerts
        alerts: alerts,

        // Performance metadata
        performance: {
          calculation_time_ms: Date.now() - startTime,
          data_freshness: "realtime"
        }
      };

      // STEP 9: Emit to teacher room
      this.io.to(`quiz:${quizId}:teachers`).emit("progressTrackingUpdate", enhancedProgressData);

      console.log(`✅ Enhanced progress tracking update emitted for quiz ${quizId} in ${Date.now() - startTime}ms`);

    } catch (error) {
      console.error("Error emitting enhanced progress tracking update:", error);
      
      // Fallback to basic version if enhanced version fails
      try {
        const basicProgressData = this.calculateProgressTrackingData(participants);
        this.io.to(`quiz:${quizId}:teachers`).emit("progressTrackingUpdate", {
          quiz_id: quizId,
          timestamp: Date.now(),
          progress_data: basicProgressData,
          error: "Enhanced features unavailable"
        });
      } catch (fallbackError) {
        console.error("Fallback progress tracking also failed:", fallbackError);
      }
    }
  }

  // Calculate class-level metrics for analytics
  calculateClassMetrics(participants) {
    const participantsList = Object.values(participants || {});
    
    if (participantsList.length === 0) {
      return {
        total_participants: 0,
        avg_score: 0,
        avg_accuracy: 0,
        avg_response_time: 0,
        median_score: 0,
        completion_rate: 0
      };
    }

    const scores = [];
    const accuracies = [];
    const responseTimes = [];
    let completedCount = 0;

    participantsList.forEach(p => {
      if (p.score !== undefined) scores.push(p.score);
      if (p.accuracy !== undefined) accuracies.push(p.accuracy);
      if (p.avg_response_time !== undefined) responseTimes.push(p.avg_response_time);
      if (p.status === 'completed') completedCount++;
    });

    const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const median = (arr) => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    return {
      total_participants: participantsList.length,
      avg_score: avg(scores),
      avg_accuracy: avg(accuracies),
      avg_response_time: avg(responseTimes),
      median_score: median(scores),
      completion_rate: (completedCount / participantsList.length) * 100
    };
  }

  // Generate real-time alerts for teachers
  generateTeacherAlerts(strugglingStudents, questionAnalytics, predictions, classMetrics) {
    const alerts = [];

    // ALERT 1: Critical struggling students
    const criticalStudents = strugglingStudents.filter(s => s.risk_level === 'critical');
    if (criticalStudents.length > 0) {
      alerts.push({
        type: 'critical',
        category: 'struggling_students',
        title: `${criticalStudents.length} student(s) need immediate help`,
        message: `Students are severely struggling: ${criticalStudents.map(s => s.user_name).join(', ')}`,
        action: 'Check in with these students immediately',
        priority: 1
      });
    }

    // ALERT 2: High difficulty question
    if (questionAnalytics && questionAnalytics.insights) {
      const correctRate = questionAnalytics.live_stats.current_correct_rate;
      if (correctRate < 30) {
        alerts.push({
          type: 'warning',
          category: 'question_difficulty',
          title: `Current question is very difficult`,
          message: `Only ${correctRate}% answered correctly. ${questionAnalytics.insights.teaching_suggestion}`,
          action: 'Consider pausing to review this concept',
          priority: 2
        });
      }

      // ALERT 3: Misconception detected
      if (questionAnalytics.insights.common_misconception?.detected) {
        alerts.push({
          type: 'warning',
          category: 'misconception',
          title: 'Common misconception detected',
          message: questionAnalytics.insights.common_misconception.evidence,
          action: questionAnalytics.insights.common_misconception.suggestion,
          priority: 2
        });
      }
    }

    // ALERT 4: Low predicted pass rate
    if (predictions && predictions.pass_rate_prediction) {
      if (predictions.pass_rate_prediction.predicted_pass_rate < 50 && 
          predictions.pass_rate_prediction.confidence > 70) {
        alerts.push({
          type: 'warning',
          category: 'predicted_outcome',
          title: 'Low predicted pass rate',
          message: `Only ${predictions.pass_rate_prediction.predicted_pass_rate}% predicted to pass`,
          action: 'Consider adjusting difficulty or providing additional support',
          priority: 3
        });
      }
    }

    // ALERT 5: Low class average
    if (classMetrics.avg_score < 50) {
      alerts.push({
        type: 'info',
        category: 'class_performance',
        title: 'Class average is low',
        message: `Current class average: ${Math.round(classMetrics.avg_score)}%`,
        action: 'Monitor closely and prepare review materials',
        priority: 3
      });
    }

    // Sort by priority
    return alerts.sort((a, b) => a.priority - b.priority);
  }

  // Tính toán dữ liệu progress tracking từ participants
  calculateProgressTrackingData(participants) {
    const progressData = {
      participants_summary: [],
      overall_metrics: {
        total_participants: 0,
        active_participants: 0,
        average_progress: 0,
        average_score: 0,
      },
    };

    if (!participants) return progressData;

    const participantsList = Object.entries(participants);
    progressData.overall_metrics.total_participants = participantsList.length;

    let totalProgress = 0;
    let totalScore = 0;
    let activeCount = 0;

    participantsList.forEach(([userId, data]) => {
      const progress =
        ((data.total_answers || 0) / (data.total_questions || 1)) * 100;
      const isActive =
        data.status !== "completed" &&
        Date.now() - (data.last_answer_time || 0) < 300000; // Active if answered in last 5 minutes

      if (isActive) activeCount++;

      progressData.participants_summary.push({
        user_id: userId,
        user_name: data.user_name || `User ${userId}`,
        current_score: data.current_score || 0,
        progress_percentage: Math.round(progress),
        total_answers: data.total_answers || 0,
        correct_answers: data.correct_answers || 0,
        status: data.status || "in_progress",
        is_active: isActive,
        last_activity: data.last_answer_time || null,
      });

      totalProgress += progress;
      totalScore += data.current_score || 0;
    });

    progressData.overall_metrics.active_participants = activeCount;
    progressData.overall_metrics.average_progress =
      participantsList.length > 0
        ? Math.round(totalProgress / participantsList.length)
        : 0;
    progressData.overall_metrics.average_score =
      participantsList.length > 0
        ? Math.round(totalScore / participantsList.length)
        : 0;

    return progressData;
  }

  // GIẢI PHÁP 2: Đồng bộ dữ liệu của một participant ngay lập tức (cho câu hỏi cuối cùng)
  async syncSingleParticipantToDatabase(
    quizId,
    userId,
    userDataFromFirebase = null
  ) {
    const startedAt = Date.now();
    try {
      console.log(
        `[singleSync] Bắt đầu sync user ${userId} trong quiz ${quizId}`
      );

      let userData;

      if (userDataFromFirebase) {
        // GIẢI PHÁP 2: Sử dụng dữ liệu được truyền vào để tránh race condition
        userData = userDataFromFirebase;
        console.log(
          `[singleSync] Sử dụng dữ liệu được truyền vào (tránh race condition)`
        );
      } else {
        // Fallback: Đọc từ Firebase nếu không có dữ liệu được truyền vào
        console.log(`[singleSync] Đọc dữ liệu từ Firebase (fallback mode)`);
        const participantRef = db.ref(
          `quiz_sessions/${quizId}/participants/${userId}`
        );
        const snapshot = await participantRef.once("value");
        userData = snapshot.val();
      }

      if (!userData) {
        const reason = userDataFromFirebase
          ? "NO_DATA_PROVIDED"
          : "USER_DATA_NOT_FOUND";
        console.warn(
          `[singleSync] Không tìm thấy dữ liệu user ${userId} trong quiz ${quizId} (${reason})`
        );
        return { success: false, reason };
      }

      // Kiểm tra user tồn tại
      const user = await User.findByPk(userId);
      if (!user) {
        console.warn(`[singleSync] User ${userId} không tồn tại trong DB`);
        return { success: false, reason: "USER_NOT_FOUND" };
      }

      // Lấy thông tin quiz để biết tổng số câu hỏi và subject_id
      const quiz = await Quiz.findByPk(quizId, {
        include: [
          { model: Question, as: "Questions", attributes: ["question_id"] },
          {
            model: Course,
            as: "Course",
            attributes: ["subject_id"], // Lấy subject_id để tránh lỗi validation
          },
        ],
      });

      if (!quiz) {
        console.warn(`[singleSync] Quiz ${quizId} không tồn tại`);
        return { success: false, reason: "QUIZ_NOT_FOUND" };
      }

      // Lấy subject_id từ course để dùng cho UserLOTracking
      const subjectIdForTracking = quiz.Course?.subject_id;
      if (!subjectIdForTracking) {
        console.warn(
          `[singleSync] Không thể xác định subject_id cho Quiz ${quizId}. Sẽ bỏ qua LO tracking.`
        );
      }

      const totalQuestions = quiz.Questions.length;
      const answers = userData.answers || {};
      const answeredQuestionsCount = Object.keys(answers).length;

      // Tự suy luận trạng thái cuối cùng
      let finalStatus = userData.status || "in_progress";
      if (totalQuestions > 0 && answeredQuestionsCount >= totalQuestions) {
        finalStatus = "completed";
        console.log(
          `[singleSync] User ${userId} hoàn thành (${answeredQuestionsCount}/${totalQuestions} câu)`
        );
      }

      // Preload question metadata - LOAD ALL QUIZ QUESTIONS to avoid skipping
      // Fix: Previously only loaded answered questions, causing unanswered to be skipped
      const questionMap = new Map();
      if (quiz && quiz.Questions) {
        // Use all questions from quiz (already loaded in quiz object)
        quiz.Questions.forEach((q) => {
          questionMap.set(q.question_id.toString(), q);
        });
        console.log(`[singleSync] Loaded ${quiz.Questions.length} questions into questionMap`);
      } else {
        // Fallback: load only answered questions if quiz.Questions not available
        const questionIds = Object.keys(answers)
          .map((id) => parseInt(id, 10))
          .filter(Number.isInteger);
        const questionsMeta = questionIds.length
          ? await Question.findAll({ where: { question_id: questionIds } })
          : [];
        questionsMeta.forEach((q) =>
          questionMap.set(q.question_id.toString(), q)
        );
        console.log(`[singleSync] Fallback: Loaded ${questionsMeta.length} answered questions`);
      }

      // ============================================================
      // XỬ LÝ ATTEMPT_HISTORY từ Firebase (CRITICAL!)
      // ============================================================
      const historyBatch = [];
      for (const [questionId, answerData] of Object.entries(answers)) {
        let qMeta = questionMap.get(questionId);
        
        // FALLBACK: If question not in map, fetch it from database
        if (!qMeta) {
          console.warn(
            `[singleSync] Question ${questionId} not in questionMap, fetching from database...`
          );
          try {
            const question = await Question.findByPk(parseInt(questionId, 10));
            if (question) {
              qMeta = question;
              questionMap.set(questionId, question);
              console.log(`[singleSync] ✅ Fetched question ${questionId} successfully`);
            } else {
              console.error(
                `[singleSync] ❌ Question ${questionId} not found in database! Skipping...`
              );
              continue;
            }
          } catch (fetchError) {
            console.error(
              `[singleSync] ❌ Error fetching question ${questionId}: ${fetchError.message}`
            );
            continue;
          }
        }

        // QUAN TRỌNG: Sử dụng attempt_history nếu có (giống logic syncQuizDataToDatabase)
        const attemptHistory = answerData.attempt_history || [];
        
        if (attemptHistory.length > 0) {
          // Có attempt_history - xử lý từng attempt
          console.log(`📝 [singleSync] Processing ${attemptHistory.length} attempts for question ${questionId}`);
          
          for (const attempt of attemptHistory) {
            historyBatch.push({
              user_id: userId,
              question_id: questionId,
              quiz_id: quizId,
              selected_answer: attempt.answer_id,
              is_correct: !!attempt.is_correct,
              time_spent: attempt.response_time || 0,
              attempt_date: attempt.timestamp ? new Date(attempt.timestamp) : new Date(),
              points_earned: attempt.points_earned || 0,
              scoring_breakdown: attempt.scoring_details || {},
              bonuses_earned: attempt.scoring_details?.bonuses || [],
              streak_at_time: attempt.scoring_details?.streak_info?.current_streak || 0,
              attempt_index: attempt.attempt_index,  // Match với DB column name
            });
          }
        } else {
          // Fallback: Không có attempt_history - dùng data cũ
          const attemptIndexRaw = parseInt(answerData.attempts, 10);
          const attemptIndex = Number.isInteger(attemptIndexRaw) && attemptIndexRaw > 0
            ? attemptIndexRaw
            : 1;
          
          console.log(`⚠️ [singleSync] No attempt_history for question ${questionId}, using legacy data with attempt=${attemptIndex}`);
          
          historyBatch.push({
            user_id: userId,
            question_id: questionId,
            quiz_id: quizId,
            selected_answer: answerData.answer_id,
            is_correct: !!answerData.is_correct,
            time_spent: answerData.response_time || 0,
            attempt_date: answerData.timestamp ? new Date(answerData.timestamp) : new Date(),
            points_earned: answerData.points_earned || answerData.score || 0,
            scoring_breakdown: answerData.scoring_details || {},
            bonuses_earned: answerData.scoring_details?.bonuses || [],
            streak_at_time: answerData.scoring_details?.streak_info?.current_streak || 0,
            attempt_index: attemptIndex,
          });
        }
      }

      // Bulk insert histories (UPDATE if exists để handle re-sync)
      if (historyBatch.length > 0) {
        console.log(`📝 [singleSync] Syncing ${historyBatch.length} attempts for user ${userId}`);
        
        // Log chi tiết từng attempt để debug
        historyBatch.forEach((attempt, index) => {
          console.log(`  [${index + 1}] Q${attempt.question_id} - Attempt ${attempt.attempt_index}: ${attempt.is_correct ? 'CORRECT' : 'WRONG'} (${attempt.points_earned} pts)`);
        });
        
        await UserQuestionHistory.bulkCreate(historyBatch, {
          updateOnDuplicate: [  // ✅ FIX: Dùng updateOnDuplicate thay vì ignoreDuplicates
            'selected_answer',
            'is_correct', 
            'time_spent',
            'points_earned',
            'scoring_breakdown',
            'bonuses_earned',
            'streak_at_time',
            'attempt_date'
          ],
        });
        console.log(
          `✅ [singleSync] Inserted/Updated ${historyBatch.length} question histories for user ${userId}`
        );
      }

      // VALIDATION: Detect mismatch between Firebase answers and saved records
      const firebaseAnswerCount = Object.keys(answers).length;
      if (firebaseAnswerCount !== historyBatch.length) {
        console.error(
          `⚠️ [singleSync] MISMATCH DETECTED! User ${userId}, Quiz ${quizId}:` +
          ` Firebase has ${firebaseAnswerCount} answers,` +
          ` but only ${historyBatch.length} were saved to historyBatch.` +
          ` Missing: ${firebaseAnswerCount - historyBatch.length} questions`
        );
        console.error(`Firebase answer keys: ${Object.keys(answers).join(', ')}`);
        console.error(`Saved question IDs: ${historyBatch.map(h => h.question_id).join(', ')}`);
      } else {
        console.log(
          `✅ [singleSync] Validation OK: All ${firebaseAnswerCount} Firebase answers saved to database`
        );
      }

      // ============================================================
      // QUAN TRỌNG: Đảm bảo tất cả câu hỏi trong quiz có record
      // Bao gồm cả câu không trả lời (chỉ khi quiz đã hoàn thành)
      // ============================================================
      if (finalStatus === 'completed' && quiz && quiz.Questions) {
        const allQuestionIds = quiz.Questions.map(q => q.question_id);
        const answeredQuestionIds = historyBatch.map(h => parseInt(h.question_id));
        const unansweredQuestionIds = allQuestionIds.filter(qid => !answeredQuestionIds.includes(qid));

        if (unansweredQuestionIds.length > 0) {
          console.log(`📝 [singleSync] Creating ${unansweredQuestionIds.length} unanswered question records for user ${userId}: [${unansweredQuestionIds.join(', ')}]`);

          // Kiểm tra xem có record nào đã tồn tại chưa
          const existingUnanswered = await UserQuestionHistory.findAll({
            where: {
              user_id: userId,
              quiz_id: quizId,
              question_id: unansweredQuestionIds
            },
            attributes: ['question_id']
          });
          const existingUnansweredIds = existingUnanswered.map(h => h.question_id);
          const trulyMissingIds = unansweredQuestionIds.filter(qid => !existingUnansweredIds.includes(qid));

          if (trulyMissingIds.length > 0) {
            const unansweredRecords = trulyMissingIds.map(qid => ({
              user_id: userId,
              question_id: qid,
              quiz_id: quizId,
              selected_answer: null,
              is_correct: false,
              time_spent: 0,
              attempt_date: new Date(),
              difficulty_level: null,
              points_earned: 0,
              scoring_breakdown: { unanswered: true, reason: 'not_answered_during_quiz_single_sync' },
              bonuses_earned: [],
              streak_at_time: 0,
              attempt_index: 1
            }));

            await UserQuestionHistory.bulkCreate(unansweredRecords, {
              ignoreDuplicates: true
            });
            console.log(`✅ [singleSync] Created ${unansweredRecords.length} unanswered question records for user ${userId}`);
          } else {
            console.log(`✅ [singleSync] All unanswered questions already have records for user ${userId}`);
          }
        } else {
          console.log(`✅ [singleSync] User ${userId} answered all ${allQuestionIds.length} questions`);
        }
      }

      // LO aggregation (simplified version)
      const loAgg = {};
      for (const hb of historyBatch) {
        const qMeta = questionMap.get(hb.question_id.toString());
        if (!qMeta?.lo_id) continue;
        if (!loAgg[qMeta.lo_id]) loAgg[qMeta.lo_id] = { total: 0, correct: 0 };
        loAgg[qMeta.lo_id].total++;
        if (hb.is_correct) loAgg[qMeta.lo_id].correct++;
      }

      // Update LO tracking với subject_id an toàn
      for (const [loId, stat] of Object.entries(loAgg)) {
        // Chỉ tracking nếu có subject_id hợp lệ
        if (subjectIdForTracking) {
          try {
            const [tracking, created] = await UserLOTracking.findOrCreate({
              where: {
                user_id: userId,
                lo_id: loId,
                subject_id: subjectIdForTracking,
              },
              defaults: {
                performance_metrics: {
                  total_attempts: stat.total,
                  correct_answers: stat.correct,
                  average_score: stat.total ? stat.correct / stat.total : 0,
                  last_attempt_date: new Date(),
                },
                update_time: new Date(),
              },
            });

            if (!created) {
              const perf = tracking.performance_metrics || {};
              const total_attempts = (perf.total_attempts || 0) + stat.total;
              const correct_answers =
                (perf.correct_answers || 0) + stat.correct;
              tracking.performance_metrics = {
                total_attempts,
                correct_answers,
                average_score: total_attempts
                  ? correct_answers / total_attempts
                  : 0,
                last_attempt_date: new Date(),
              };
              tracking.update_time = new Date();
              await tracking.save();
            }
          } catch (loError) {
            if (loError.name === "SequelizeValidationError") {
              console.error(
                `[SYNC-LO-VALIDATION-ERROR] UserLOTracking for LO ${loId}, user ${userId}:`,
                loError.errors.map((e) => ({
                  field: e.path,
                  message: e.message,
                  value: e.value,
                  type: typeof e.value,
                }))
              );
            } else {
              console.error(
                `[singleSync] Lỗi khi cập nhật LO tracking cho LO ${loId}:`,
                loError.message
              );
            }
            // Tiếp tục với LO khác thay vì dừng toàn bộ sync
          }
        } else {
          console.warn(
            `[singleSync] Bỏ qua LO tracking cho LO ${loId} vì không có subject_id hợp lệ`
          );
        }
      }

      // ============================================================
      // FIX CRITICAL BUG: Chỉ tính điểm từ ATTEMPT CUỐI CÙNG của mỗi câu hỏi
      // Same fix as in syncQuizDataToDatabase()
      // ============================================================
      
      // Step 1: Group by question_id and get latest attempt for each
      const latestAttemptsByQuestion = {};
      
      historyBatch.forEach((attempt) => {
        const qid = attempt.question_id;
        
        if (!latestAttemptsByQuestion[qid]) {
          latestAttemptsByQuestion[qid] = attempt;
        } else {
          // So sánh attempt_index, giữ attempt mới nhất
          if (attempt.attempt_index > latestAttemptsByQuestion[qid].attempt_index) {
            latestAttemptsByQuestion[qid] = attempt;
          }
        }
      });
      
      // Step 2: Convert to array of latest attempts only
      const latestAttempts = Object.values(latestAttemptsByQuestion);
      
      console.log(`📊 [SINGLE-SYNC-SCORE] Quiz ${quizId} User ${userId}:`);
      console.log(`   Total attempts in batch: ${historyBatch.length}`);
      console.log(`   Unique questions: ${latestAttempts.length}`);
      
      // Step 3: Calculate quiz-level metrics from LATEST attempts only
      const totalQuestionsAnswered = latestAttempts.length;
      const correctAnswers = latestAttempts.filter((h) => h.is_correct).length;
      let rawTotal = 0;
      let bonuses = 0;
      let maxPoints = 0;

      latestAttempts.forEach((h) => {
        const pts = h.points_earned || 0;
        rawTotal += pts;
        const bonusList =
          (h.scoring_breakdown && h.scoring_breakdown.bonuses) || [];
        bonusList.forEach((b) => {
          bonuses += b.points || 0;
        });
        const base = h.scoring_breakdown?.base_points || 10;
        const potential =
          base + bonusList.reduce((s, b) => s + (b.points || 0), 0);
        maxPoints += potential;
      });

      if (maxPoints === 0) {
        maxPoints = totalQuestionsAnswered * 10;
        rawTotal = correctAnswers * 10;
      }

      // === SAFE CALCULATION VÀ VALIDATION CHỐNG NaN ===
      const safeRawTotal =
        isNaN(rawTotal) || !isFinite(rawTotal) ? 0 : rawTotal;
      const safeMaxPoints =
        isNaN(maxPoints) || !isFinite(maxPoints) || maxPoints <= 0
          ? totalQuestionsAnswered * 10
          : maxPoints;
      const safeBonuses = isNaN(bonuses) || !isFinite(bonuses) ? 0 : bonuses;

      const normalizedScore =
        safeMaxPoints > 0 ? (safeRawTotal / safeMaxPoints) * 10 : 0;
      const finalNormalizedScore =
        isNaN(normalizedScore) || !isFinite(normalizedScore)
          ? 0
          : normalizedScore;

      // === LOG DEBUGGING TRƯỚC KHI LƯU DATABASE ===
      console.log(`[SYNC-DEBUG] User ${userId} score calculation:`, {
        rawTotal: safeRawTotal,
        maxPoints: safeMaxPoints,
        bonuses: safeBonuses,
        normalizedScore: finalNormalizedScore,
        totalQuestionsAnswered,
        correctAnswers,
        finalStatus,
      });

      // === CẬP NHẬT USERQUIZTRACKING VỚI ERROR HANDLING RIÊNG ===
      try {
        const existingTrack = await UserQuizTracking.findOne({
          where: { user_id: userId, quiz_id: quizId },
        });

        if (existingTrack) {
          const perf = existingTrack.performance_metrics || {};
          const attempts = (perf.total_attempts || 0) + 1;
          // SỬA: finalNormalizedScore đã là điểm trên thang 10, không cần chia cho 10 nữa
          const safeCurrentScore = finalNormalizedScore;
          // Tính lại average_score dựa trên tất cả các lần làm bài
          const newAverageScore =
            ((perf.average_score || 0) * (attempts - 1) + safeCurrentScore) /
            attempts;
          const safeBestScore = Math.max(
            perf.best_score || 0,
            safeCurrentScore
          );

          const updateData = {
            performance_metrics: {
              ...perf,
              total_attempts: attempts,
              average_score: isNaN(newAverageScore)
                ? 0
                : parseFloat(newAverageScore.toFixed(2)),
              best_score: isNaN(safeBestScore)
                ? 0
                : parseFloat(safeBestScore.toFixed(2)),
              last_attempt_date: new Date(),
            },
            update_time: new Date(),
          };

          console.log(
            `[SYNC-DEBUG] Updating UserQuizTracking for user ${userId}:`,
            updateData
          );
          await existingTrack.update(updateData);
          console.log(
            `[SYNC-DEBUG] UserQuizTracking updated successfully for user ${userId}`
          );
        } else if (subjectIdForTracking) {
          // CHỈ TẠO MỚI NẾU CÓ SUBJECT_ID HỢP LỆ
          // SỬA: finalNormalizedScore đã là điểm trên thang 10, không cần chia cho 10 nữa
          const safeAvgScore = finalNormalizedScore;
          const createData = {
            user_id: userId,
            quiz_id: quizId,
            subject_id: subjectIdForTracking, // THÊM SUBJECT_ID ĐỂ TRÁNH VALIDATION ERROR
            performance_metrics: {
              total_attempts: 1,
              average_score: isNaN(safeAvgScore)
                ? 0
                : parseFloat(safeAvgScore.toFixed(2)),
              best_score: isNaN(safeAvgScore)
                ? 0
                : parseFloat(safeAvgScore.toFixed(2)),
              completion_time: null,
              last_attempt_date: new Date(),
            },
            difficulty_breakdown: {},
            lo_performance: {},
            update_time: new Date(),
          };

          console.log(
            `[SYNC-DEBUG] Creating UserQuizTracking for user ${userId}:`,
            createData
          );
          await UserQuizTracking.create(createData);
          console.log(
            `[SYNC-DEBUG] UserQuizTracking created successfully for user ${userId} với subject_id: ${subjectIdForTracking}`
          );
        } else {
          console.warn(
            `[SYNC-WARNING] Không thể tạo UserQuizTracking cho user ${userId} quiz ${quizId} vì thiếu subject_id hợp lệ`
          );
        }
      } catch (trackingError) {
        if (trackingError.name === "SequelizeValidationError") {
          console.error(
            `[SYNC-TRACKING-VALIDATION-ERROR] UserQuizTracking for user ${userId}:`,
            trackingError.errors.map((e) => ({
              field: e.path,
              message: e.message,
              value: e.value,
              type: typeof e.value,
            }))
          );
        } else {
          console.error(
            `[SYNC-TRACKING-ERROR] UserQuizTracking for user ${userId}:`,
            trackingError.message
          );
        }
        // Không throw error ở đây để các phần khác vẫn có thể chạy
      }

      // TÍNH completion_time nếu đã hoàn thành
      let computedCompletionTime = null;
      if (finalStatus === "completed") {
        const endTime = userData.completed_at
          ? new Date(userData.completed_at)
          : new Date();
        try {
          const existingForTime = await QuizResult.findOne({
            where: { quiz_id: quizId, user_id: userId },
          });
          const startTimeForCalc = existingForTime?.start_time || existingForTime?.createdAt || endTime;
          const diff = endTime.getTime() - new Date(startTimeForCalc).getTime();
          computedCompletionTime = Math.max(0, isFinite(diff) ? diff : 0);
          console.log(
            `[SYNC-DEBUG] Calculated completion_time for user ${userId}: ${computedCompletionTime}ms`
          );
        } catch (e) {
          console.warn(
            `[SYNC-WARN] Không tính được completion_time cho user ${userId}: ${e.message}`
          );
          computedCompletionTime = null;
        }
      }

      // === CHUẨN BỊ DỮ LIỆU AN TOÀN CHO QUIZRESULT ===
      const quizResultData = {
        quiz_id: quizId,
        user_id: userId,
        score: parseFloat(finalNormalizedScore.toFixed(2)), // Đảm bảo là số float hợp lệ
        status: finalStatus || "in_progress", // Fallback cho status
        completion_time: computedCompletionTime,
        update_time: new Date(),
        raw_total_points: parseFloat(safeRawTotal.toFixed(2)),
        max_points: parseFloat(safeMaxPoints.toFixed(2)),
        bonuses_total: parseFloat(safeBonuses.toFixed(2)),
        synced_at: new Date(),
      };

      // === LOG DỮ LIỆU TRƯỚC KHI GHI ===
      console.log(
        `[SYNC-DEBUG] QuizResult data for user ${userId}:`,
        quizResultData
      );

      // Update or create QuizResult với finalStatus
      try {
        const existingResult = await QuizResult.findOne({
          where: { quiz_id: quizId, user_id: userId },
        });

        if (!existingResult) {
          await QuizResult.create(quizResultData);
          console.log(
            `[singleSync] Created QuizResult for user ${userId} with status ${finalStatus}`
          );
        } else {
          // Chỉ cập nhật nếu điểm cao hơn hoặc là lần đồng bộ đầu tiên
          const updateData = {
            status: finalStatus, // Luôn cập nhật trạng thái
            update_time: new Date(),
            synced_at: new Date(),
          };

          if (
            existingResult.score < finalNormalizedScore ||
            existingResult.raw_total_points == null
          ) {
            updateData.score = parseFloat(finalNormalizedScore.toFixed(2));
            updateData.raw_total_points = parseFloat(safeRawTotal.toFixed(2));
            updateData.max_points = parseFloat(safeMaxPoints.toFixed(2));
            updateData.bonuses_total = parseFloat(safeBonuses.toFixed(2));
          }

          // Cập nhật completion_time nếu đã hoàn thành và chưa được set
          if (
            finalStatus === "completed" &&
            (existingResult.completion_time == null || existingResult.completion_time === 0)
          ) {
            // sử dụng computedCompletionTime nếu có, nếu không thì cố gắng tính lại đơn giản
            if (computedCompletionTime == null) {
              try {
                const endTime = userData.completed_at
                  ? new Date(userData.completed_at)
                  : new Date();
                const startTimeForCalc = existingResult.start_time || existingResult.createdAt || endTime;
                const diff = endTime.getTime() - new Date(startTimeForCalc).getTime();
                updateData.completion_time = Math.max(0, isFinite(diff) ? diff : 0);
              } catch (e) {
                console.warn(
                  `[SYNC-WARN] Không set được completion_time khi update cho user ${userId}: ${e.message}`
                );
              }
            } else {
              updateData.completion_time = computedCompletionTime;
            }
          }

          console.log(
            `[SYNC-DEBUG] Updating QuizResult with data:`,
            updateData
          );

          await existingResult.update(updateData);
          console.log(
            `[singleSync] Updated QuizResult for user ${userId} with status ${finalStatus}`
          );
        }
      } catch (dbError) {
        // === CHI TIẾT LỖI DATABASE ===
        if (dbError.name === "SequelizeValidationError") {
          console.error(
            `[SYNC-VALIDATION-ERROR] User ${userId}:`,
            dbError.errors.map((e) => ({
              field: e.path,
              message: e.message,
              value: e.value,
              type: typeof e.value,
            }))
          );
        } else if (dbError.name === "SequelizeDatabaseError") {
          console.error(`[SYNC-DB-ERROR] User ${userId}:`, dbError.message);
        } else {
          console.error(`[SYNC-UNKNOWN-ERROR] User ${userId}:`, dbError);
        }
        throw dbError; // Re-throw để caller xử lý
      }

      const duration = Date.now() - startedAt;
      console.log(
        `[singleSync] Hoàn tất user ${userId} trong quiz ${quizId}: histories=${
          historyBatch.length
        }, score=${finalNormalizedScore.toFixed(
          2
        )}, status=${finalStatus}, duration=${duration}ms`
      );

      return {
        success: true,
        recordCount: historyBatch.length,  // ✅ THÊM recordCount
        historiesInserted: historyBatch.length,
        finalScore: finalNormalizedScore,
        finalStatus: finalStatus,
        durationMs: duration,
      };
    } catch (error) {
      const duration = Date.now() - startedAt;
      console.error(
        `[singleSync] Lỗi sync user ${userId} trong quiz ${quizId}:`,
        error.message
      );
      return {
        success: false,
        recordCount: 0,  // ✅ THÊM recordCount = 0 khi error
        reason: error.message,
        durationMs: duration,
      };
    }
  }
}

module.exports = QuizRealtimeService;
