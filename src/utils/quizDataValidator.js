/**
 * DATA VALIDATION HELPER
 * Script để validate tính toàn vẹn dữ liệu quiz
 * Chạy sau khi sync để đảm bảo dữ liệu chính xác
 */

const { db } = require("../config/firebase");
const {
  Quiz,
  Question,
  UserQuestionHistory,
  QuizResult,
} = require("../models");

class QuizDataValidator {
  /**
   * Validate attempt_history structure trong Firebase
   */
  static validateAttemptHistory(answerData) {
    const { attempts, attempt_history, answer_id, is_correct, points_earned } = answerData;
    const errors = [];

    // RULE 1: attempt_history phải tồn tại
    if (!attempt_history || !Array.isArray(attempt_history)) {
      errors.push("Missing or invalid attempt_history array");
      return { valid: false, errors };
    }

    // RULE 2: Số phần tử trong attempt_history = attempts
    if (attempt_history.length !== attempts) {
      errors.push(
        `Mismatch: attempts=${attempts} but history has ${attempt_history.length} items`
      );
    }

    // RULE 3: Attempt numbers phải tăng dần từ 1
    for (let i = 0; i < attempt_history.length; i++) {
      if (attempt_history[i].attempt !== i + 1) {
        errors.push(
          `Invalid attempt number at index ${i}: expected ${i + 1}, got ${attempt_history[i].attempt}`
        );
      }
    }

    // RULE 4: Latest values phải khớp với attempt cuối cùng
    if (attempt_history.length > 0) {
      const lastAttempt = attempt_history[attempt_history.length - 1];
      if (
        answer_id !== lastAttempt.answer_id ||
        is_correct !== lastAttempt.is_correct ||
        points_earned !== lastAttempt.points_earned
      ) {
        errors.push("Latest values don't match last attempt in history");
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate retry logic (không retry sau khi đúng, max 2 attempts)
   */
  static validateRetryLogic(attempt_history) {
    const errors = [];

    // RULE 1: Nếu attempt 1 đúng, không được có attempt 2
    if (attempt_history.length >= 1 && attempt_history[0].is_correct) {
      if (attempt_history.length > 1) {
        errors.push(
          `First attempt was correct but found ${attempt_history.length} attempts`
        );
      }
    }

    // RULE 2: Tối đa 2 attempts
    if (attempt_history.length > 2) {
      errors.push(`Too many attempts: ${attempt_history.length} (max is 2)`);
    }

    // RULE 3: Attempt 2 phải có penalty nếu đúng
    if (attempt_history.length === 2 && attempt_history[1].is_correct) {
      const penalty = attempt_history[1].scoring_details?.retry_penalty;
      if (penalty !== 0.5) {
        errors.push(
          `Attempt 2 should have 50% penalty, got ${penalty || "undefined"}`
        );
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate scoring calculation
   */
  static validateScoring(attempt_history) {
    const errors = [];

    for (const [index, attempt] of attempt_history.entries()) {
      const { is_correct, points_earned, scoring_details } = attempt;

      if (!is_correct) {
        // Câu sai phải có 0 điểm
        if (points_earned !== 0) {
          errors.push(
            `Attempt ${index + 1}: Wrong answer should have 0 points, got ${points_earned}`
          );
        }
      } else {
        // Câu đúng phải có điểm
        const base = scoring_details?.base_points || 100;
        const penalty = scoring_details?.retry_penalty || 1.0;
        const expected = Math.round(base * penalty);

        // Allow 1 point rounding error
        if (Math.abs(points_earned - expected) > 1) {
          errors.push(
            `Attempt ${index + 1}: Expected ${expected} points (${base} × ${penalty}), got ${points_earned}`
          );
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate toàn bộ dữ liệu Firebase cho 1 user trong 1 quiz
   */
  static async validateFirebaseData(quizId, userId) {
    console.log(`\n🔍 Validating Firebase data for user ${userId} in quiz ${quizId}...`);

    const participantRef = db.ref(`quiz_sessions/${quizId}/participants/${userId}`);
    const snapshot = await participantRef.once("value");
    const userData = snapshot.val();

    if (!userData) {
      return {
        valid: false,
        errors: ["User data not found in Firebase"],
      };
    }

    const allErrors = [];
    const answers = userData.answers || {};

    for (const [questionId, answerData] of Object.entries(answers)) {
      // Validate attempt_history structure
      const check1 = this.validateAttemptHistory(answerData);
      if (!check1.valid) {
        check1.errors.forEach((err) =>
          allErrors.push(`Question ${questionId}: ${err}`)
        );
      }

      // Validate retry logic
      if (answerData.attempt_history) {
        const check2 = this.validateRetryLogic(answerData.attempt_history);
        if (!check2.valid) {
          check2.errors.forEach((err) =>
            allErrors.push(`Question ${questionId}: ${err}`)
          );
        }

        // Validate scoring
        const check3 = this.validateScoring(answerData.attempt_history);
        if (!check3.valid) {
          check3.errors.forEach((err) =>
            allErrors.push(`Question ${questionId}: ${err}`)
          );
        }
      }
    }

    const valid = allErrors.length === 0;
    if (valid) {
      console.log(`✅ Firebase data validation PASSED`);
    } else {
      console.log(`❌ Firebase data validation FAILED:`);
      allErrors.forEach((err) => console.log(`   - ${err}`));
    }

    return {
      valid,
      errors: allErrors,
      summary: {
        total_questions_answered: Object.keys(answers).length,
        total_attempts: Object.values(answers).reduce(
          (sum, a) => sum + (a.attempts || 0),
          0
        ),
      },
    };
  }

  /**
   * Validate dữ liệu PostgreSQL
   */
  static async validatePostgreSQLData(quizId, userId) {
    console.log(`\n🔍 Validating PostgreSQL data for user ${userId} in quiz ${quizId}...`);

    const errors = [];

    // Lấy thông tin quiz
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
      return {
        valid: false,
        errors: ["Quiz not found"],
      };
    }

    const allQuestionIds = quiz.Questions.map((q) => q.question_id);
    const totalQuestions = allQuestionIds.length;

    // Lấy tất cả records
    const dbRecords = await UserQuestionHistory.findAll({
      where: { user_id: userId, quiz_id: quizId },
      order: [
        ["question_id", "ASC"],
        ["attempt_index", "ASC"],
      ],
    });

    // CHECK 1: Tất cả câu hỏi phải có ít nhất 1 record
    const answeredQuestionIds = [...new Set(dbRecords.map((r) => r.question_id))];
    const missingQuestions = allQuestionIds.filter(
      (qid) => !answeredQuestionIds.includes(qid)
    );

    if (missingQuestions.length > 0) {
      errors.push(
        `Missing records for ${missingQuestions.length} questions: [${missingQuestions.join(", ")}]`
      );
    }

    // CHECK 2: Không có duplicate attempts
    const duplicates = dbRecords.filter(
      (r, i, arr) =>
        arr.findIndex(
          (r2) =>
            r2.question_id === r.question_id &&
            r2.attempt_index === r.attempt_index
        ) !== i
    );

    if (duplicates.length > 0) {
      errors.push(`Found ${duplicates.length} duplicate records`);
    }

    // CHECK 3: Attempt index hợp lệ (1 hoặc 2)
    const invalidAttempts = dbRecords.filter(
      (r) => r.attempt_index < 1 || r.attempt_index > 2
    );

    if (invalidAttempts.length > 0) {
      errors.push(
        `Found ${invalidAttempts.length} records with invalid attempt_index`
      );
    }

    // CHECK 4: Nếu có attempt 2, phải có attempt 1
    const attempt2Records = dbRecords.filter((r) => r.attempt_index === 2);
    for (const r2 of attempt2Records) {
      const hasAttempt1 = dbRecords.some(
        (r1) =>
          r1.question_id === r2.question_id && r1.attempt_index === 1
      );
      if (!hasAttempt1) {
        errors.push(
          `Question ${r2.question_id} has attempt 2 but missing attempt 1`
        );
      }
    }

    // CHECK 5: Unanswered questions có đúng format
    const unansweredRecords = dbRecords.filter(
      (r) => r.selected_answer === null
    );
    for (const r of unansweredRecords) {
      if (r.is_correct !== false) {
        errors.push(
          `Question ${r.question_id}: Unanswered should have is_correct=false`
        );
      }
      if (r.points_earned !== 0) {
        errors.push(
          `Question ${r.question_id}: Unanswered should have 0 points`
        );
      }
      if (!r.scoring_breakdown?.unanswered) {
        errors.push(
          `Question ${r.question_id}: Unanswered should have unanswered flag in scoring_breakdown`
        );
      }
    }

    const valid = errors.length === 0;
    if (valid) {
      console.log(`✅ PostgreSQL data validation PASSED`);
    } else {
      console.log(`❌ PostgreSQL data validation FAILED:`);
      errors.forEach((err) => console.log(`   - ${err}`));
    }

    return {
      valid,
      errors,
      summary: {
        total_records: dbRecords.length,
        total_questions: totalQuestions,
        answered_questions: answeredQuestionIds.length,
        unanswered_questions: totalQuestions - answeredQuestionIds.length,
        total_attempts: dbRecords.filter((r) => r.selected_answer !== null).length,
      },
    };
  }

  /**
   * Validate consistency giữa Firebase và PostgreSQL
   */
  static async validateDataConsistency(quizId, userId) {
    console.log(`\n🔍 Validating data consistency between Firebase and PostgreSQL...`);

    const errors = [];

    // Lấy dữ liệu từ Firebase
    const participantRef = db.ref(`quiz_sessions/${quizId}/participants/${userId}`);
    const snapshot = await participantRef.once("value");
    const firebaseData = snapshot.val();

    if (!firebaseData) {
      return {
        valid: false,
        errors: ["User data not found in Firebase"],
      };
    }

    // Lấy dữ liệu từ PostgreSQL
    const dbRecords = await UserQuestionHistory.findAll({
      where: { user_id: userId, quiz_id: quizId },
      order: [
        ["question_id", "ASC"],
        ["attempt_index", "ASC"],
      ],
    });

    const answers = firebaseData.answers || {};

    // CHECK 1: Mỗi attempt trong Firebase phải có record tương ứng trong PostgreSQL
    for (const [questionId, answerData] of Object.entries(answers)) {
      const attemptHistory = answerData.attempt_history || [];

      for (const attempt of attemptHistory) {
        const dbRecord = dbRecords.find(
          (r) =>
            r.question_id === parseInt(questionId) &&
            r.attempt_index === attempt.attempt
        );

        if (!dbRecord) {
          errors.push(
            `Firebase has attempt ${attempt.attempt} for question ${questionId}, but not found in PostgreSQL`
          );
          continue;
        }

        // Validate chi tiết
        if (dbRecord.is_correct !== attempt.is_correct) {
          errors.push(
            `Question ${questionId} attempt ${attempt.attempt}: is_correct mismatch (Firebase: ${attempt.is_correct}, DB: ${dbRecord.is_correct})`
          );
        }

        if (Math.abs(dbRecord.points_earned - attempt.points_earned) > 1) {
          errors.push(
            `Question ${questionId} attempt ${attempt.attempt}: points mismatch (Firebase: ${attempt.points_earned}, DB: ${dbRecord.points_earned})`
          );
        }
      }
    }

    // CHECK 2: Score tổng phải khớp
    const firebaseScore = firebaseData.current_score || 0;
    const quizResult = await QuizResult.findOne({
      where: { quiz_id: quizId, user_id: userId },
    });

    if (quizResult && Math.abs(quizResult.score - firebaseScore) > 1) {
      errors.push(
        `Total score mismatch: Firebase=${firebaseScore}, QuizResult=${quizResult.score}`
      );
    }

    const valid = errors.length === 0;
    if (valid) {
      console.log(`✅ Data consistency validation PASSED`);
    } else {
      console.log(`❌ Data consistency validation FAILED:`);
      errors.forEach((err) => console.log(`   - ${err}`));
    }

    return {
      valid,
      errors,
      summary: {
        firebase_score: firebaseScore,
        db_score: quizResult?.score,
        firebase_answers: Object.keys(answers).length,
        db_records: dbRecords.length,
      },
    };
  }

  /**
   * Validate toàn bộ dữ liệu
   */
  static async validateComplete(quizId, userId) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🔍 COMPLETE DATA VALIDATION`);
    console.log(`   Quiz ID: ${quizId}`);
    console.log(`   User ID: ${userId}`);
    console.log(`${"=".repeat(60)}`);

    const results = {
      firebase: await this.validateFirebaseData(quizId, userId),
      postgresql: await this.validatePostgreSQLData(quizId, userId),
      consistency: await this.validateDataConsistency(quizId, userId),
    };

    const allValid =
      results.firebase.valid &&
      results.postgresql.valid &&
      results.consistency.valid;

    console.log(`\n${"=".repeat(60)}`);
    if (allValid) {
      console.log(`✅ ALL VALIDATIONS PASSED!`);
      console.log(`\n📊 Summary:`);
      console.log(`   Firebase:`, results.firebase.summary);
      console.log(`   PostgreSQL:`, results.postgresql.summary);
      console.log(`   Consistency:`, results.consistency.summary);
    } else {
      console.log(`❌ VALIDATION FAILED!`);
      console.log(`\nErrors:`);
      if (!results.firebase.valid) {
        console.log(`\n  Firebase Errors:`);
        results.firebase.errors.forEach((err) => console.log(`    - ${err}`));
      }
      if (!results.postgresql.valid) {
        console.log(`\n  PostgreSQL Errors:`);
        results.postgresql.errors.forEach((err) => console.log(`    - ${err}`));
      }
      if (!results.consistency.valid) {
        console.log(`\n  Consistency Errors:`);
        results.consistency.errors.forEach((err) => console.log(`    - ${err}`));
      }
    }
    console.log(`${"=".repeat(60)}\n`);

    return {
      valid: allValid,
      results,
    };
  }

  /**
   * Validate tất cả users trong 1 quiz
   */
  static async validateQuiz(quizId) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🔍 VALIDATING ALL USERS IN QUIZ ${quizId}`);
    console.log(`${"=".repeat(60)}`);

    // Lấy danh sách users từ Firebase
    const participantsRef = db.ref(`quiz_sessions/${quizId}/participants`);
    const snapshot = await participantsRef.once("value");
    const participants = snapshot.val();

    if (!participants) {
      console.log(`⚠️  No participants found in quiz ${quizId}`);
      return { valid: true, results: [] };
    }

    const userIds = Object.keys(participants);
    console.log(`\nFound ${userIds.length} participants to validate\n`);

    const results = [];
    let passCount = 0;
    let failCount = 0;

    for (const userId of userIds) {
      const result = await this.validateComplete(quizId, userId);
      results.push({ userId, ...result });

      if (result.valid) {
        passCount++;
      } else {
        failCount++;
      }
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`📊 QUIZ VALIDATION SUMMARY`);
    console.log(`   Total users: ${userIds.length}`);
    console.log(`   ✅ Passed: ${passCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log(`${"=".repeat(60)}\n`);

    return {
      valid: failCount === 0,
      results,
      summary: {
        total: userIds.length,
        passed: passCount,
        failed: failCount,
      },
    };
  }
}

module.exports = QuizDataValidator;

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const quizId = args[0];
  const userId = args[1];

  if (!quizId) {
    console.log(`
Usage:
  node quizDataValidator.js <quizId> [userId]

Examples:
  # Validate specific user
  node quizDataValidator.js 10 1

  # Validate all users in quiz
  node quizDataValidator.js 10
    `);
    process.exit(1);
  }

  (async () => {
    try {
      if (userId) {
        // Validate specific user
        await QuizDataValidator.validateComplete(
          parseInt(quizId),
          parseInt(userId)
        );
      } else {
        // Validate entire quiz
        await QuizDataValidator.validateQuiz(parseInt(quizId));
      }
      process.exit(0);
    } catch (error) {
      console.error("❌ Validation error:", error);
      process.exit(1);
    }
  })();
}
