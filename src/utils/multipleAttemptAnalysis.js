/**
 * ============================================================
 * MULTIPLE ATTEMPT ANALYSIS HELPER
 * ============================================================
 * Phân tích học tập dựa trên multiple attempts của user
 * Hỗ trợ: 1-2 attempts per question
 */

/**
 * Phân loại learning pattern dựa trên attempts
 * @param {Array} attempts - Danh sách attempts cho 1 câu hỏi (sorted by attempt_index)
 * @returns {string} - Learning pattern classification
 */
function classifyLearningPattern(attempts) {
  if (!attempts || attempts.length === 0) {
    return 'not_attempted';
  }

  // Sort by attempt_index để đảm bảo thứ tự
  const sortedAttempts = [...attempts].sort((a, b) => a.attempt_index - b.attempt_index);

  if (sortedAttempts.length === 1) {
    const firstAttempt = sortedAttempts[0];
    
    // Kiểm tra nếu không trả lời (selected_answer null)
    if (!firstAttempt.selected_answer) {
      return 'not_attempted';
    }
    
    return firstAttempt.is_correct ? 'first_try_success' : 'single_failure';
  }

  if (sortedAttempts.length === 2) {
    const [first, second] = sortedAttempts;
    
    if (first.is_correct && second.is_correct) {
      // Hiếm xảy ra - không nên cho làm lại khi đã đúng
      return 'consistent_mastery';
    }
    
    if (first.is_correct && !second.is_correct) {
      // Không nên xảy ra - rule không cho làm lại khi đúng
      return 'regression';
    }
    
    if (!first.is_correct && second.is_correct) {
      // ⭐ QUAN TRỌNG: Học được từ sai lầm
      return 'learned_from_mistake';
    }
    
    if (!first.is_correct && !second.is_correct) {
      // ⚠️ Cần hỗ trợ thêm
      return 'persistent_difficulty';
    }
  }

  // Trường hợp bất thường (>2 attempts)
  return 'anomaly';
}

/**
 * Tính toán improvement metrics giữa các attempts
 * @param {Array} attempts - Danh sách attempts cho 1 câu hỏi
 * @returns {Object} - Improvement metrics
 */
function calculateTimeImprovement(attempts) {
  if (!attempts || attempts.length < 2) {
    return {
      improved: false,
      time_reduction: 0,
      percentage_improvement: 0
    };
  }

  const sortedAttempts = [...attempts].sort((a, b) => a.attempt_index - b.attempt_index);
  const firstTime = sortedAttempts[0].time_spent || 0;
  const lastTime = sortedAttempts[sortedAttempts.length - 1].time_spent || 0;
  
  const timeReduction = firstTime - lastTime;
  const percentageImprovement = firstTime > 0 
    ? Math.round((timeReduction / firstTime) * 100) 
    : 0;

  return {
    improved: timeReduction > 0,
    time_reduction: timeReduction,
    percentage_improvement: percentageImprovement,
    first_attempt_time: firstTime,
    last_attempt_time: lastTime
  };
}

/**
 * Group question history by question_id
 * @param {Array} questionHistory - Full question history
 * @returns {Map} - Map of question_id -> attempts array
 */
function groupByQuestion(questionHistory) {
  const questionMap = new Map();
  
  questionHistory.forEach(history => {
    const qid = history.question_id;
    if (!questionMap.has(qid)) {
      questionMap.set(qid, []);
    }
    questionMap.get(qid).push(history);
  });
  
  // Sort attempts within each question
  questionMap.forEach((attempts, qid) => {
    attempts.sort((a, b) => a.attempt_index - b.attempt_index);
  });
  
  return questionMap;
}

/**
 * Phân tích learning progress toàn diện
 * @param {Array} questionHistory - Full question history
 * @returns {Object} - Comprehensive learning analysis
 */
function analyzeLearningProgress(questionHistory) {
  const stats = {
    first_try_success: 0,
    learned_from_mistake: 0,
    persistent_difficulty: 0,
    single_failure: 0,
    not_attempted: 0,
    anomaly: 0,
    
    total_questions_with_data: 0,
    total_attempts: questionHistory.length,
    
    improvement_rate: 0,
    mastery_level: '',
    
    // Detailed breakdown
    questions_by_pattern: {
      first_try_success: [],
      learned_from_mistake: [],
      persistent_difficulty: [],
      single_failure: [],
      not_attempted: [],
      anomaly: []
    },
    
    // Time analysis
    average_time_first_attempt: 0,
    average_time_second_attempt: 0,
    time_improvement_rate: 0
  };
  
  // Group by question
  const questionMap = groupByQuestion(questionHistory);
  
  let totalFirstAttemptTime = 0;
  let totalSecondAttemptTime = 0;
  let questionsWithSecondAttempt = 0;
  let questionsWithFirstAttempt = 0;
  
  // Analyze each question
  questionMap.forEach((attempts, qid) => {
    const pattern = classifyLearningPattern(attempts);
    stats[pattern]++;
    stats.questions_by_pattern[pattern].push({
      question_id: qid,
      attempts: attempts.length,
      final_result: attempts[attempts.length - 1].is_correct,
      pattern: pattern
    });
    
    // Time analysis
    if (attempts.length >= 1) {
      questionsWithFirstAttempt++;
      totalFirstAttemptTime += attempts[0].time_spent || 0;
    }
    
    if (attempts.length >= 2) {
      questionsWithSecondAttempt++;
      totalSecondAttemptTime += attempts[1].time_spent || 0;
    }
  });
  
  stats.total_questions_with_data = questionMap.size;
  
  // Calculate improvement rate
  const totalAnswered = stats.first_try_success + 
                       stats.learned_from_mistake + 
                       stats.persistent_difficulty +
                       stats.single_failure;
  
  if (totalAnswered > 0) {
    stats.improvement_rate = 
      Math.round((stats.learned_from_mistake / totalAnswered) * 100 * 100) / 100;
  }
  
  // Calculate final success rate
  const finalSuccessCount = stats.first_try_success + stats.learned_from_mistake;
  const successRate = totalAnswered > 0 
    ? Math.round((finalSuccessCount / totalAnswered) * 100) 
    : 0;
  
  // Determine mastery level
  if (successRate >= 90) stats.mastery_level = 'excellent';
  else if (successRate >= 75) stats.mastery_level = 'good';
  else if (successRate >= 60) stats.mastery_level = 'average';
  else stats.mastery_level = 'needs_improvement';
  
  stats.final_success_rate = successRate;
  
  // Time metrics
  if (questionsWithFirstAttempt > 0) {
    stats.average_time_first_attempt = Math.round(totalFirstAttemptTime / questionsWithFirstAttempt);
  }
  
  if (questionsWithSecondAttempt > 0) {
    stats.average_time_second_attempt = Math.round(totalSecondAttemptTime / questionsWithSecondAttempt);
  }
  
  if (stats.average_time_first_attempt > 0) {
    const timeReduction = stats.average_time_first_attempt - stats.average_time_second_attempt;
    stats.time_improvement_rate = Math.round((timeReduction / stats.average_time_first_attempt) * 100);
  }
  
  return stats;
}

/**
 * Tính accuracy cho radar chart (chỉ tính lần cuối)
 * @param {Array} questionHistory - Question history
 * @returns {Object} - Accuracy metrics
 */
function calculateFinalAccuracy(questionHistory) {
  const questionMap = groupByQuestion(questionHistory);
  
  let correctCount = 0;
  let totalCount = 0;
  
  questionMap.forEach((attempts, qid) => {
    if (attempts.length > 0) {
      const lastAttempt = attempts[attempts.length - 1];
      
      // Bỏ qua câu không trả lời
      if (lastAttempt.selected_answer !== null) {
        totalCount++;
        if (lastAttempt.is_correct) {
          correctCount++;
        }
      }
    }
  });
  
  const accuracy = totalCount > 0 
    ? Math.round((correctCount / totalCount) * 100) 
    : 0;
  
  return {
    accuracy,
    total_questions: totalCount,
    correct_final: correctCount,
    incorrect_final: totalCount - correctCount
  };
}

/**
 * Phân tích first attempt performance (để so sánh)
 * @param {Array} questionHistory - Question history
 * @returns {Object} - First attempt metrics
 */
function calculateFirstAttemptAccuracy(questionHistory) {
  const questionMap = groupByQuestion(questionHistory);
  
  let correctCount = 0;
  let totalCount = 0;
  
  questionMap.forEach((attempts, qid) => {
    if (attempts.length > 0) {
      const firstAttempt = attempts[0];
      
      // Bỏ qua câu không trả lời
      if (firstAttempt.selected_answer !== null) {
        totalCount++;
        if (firstAttempt.is_correct) {
          correctCount++;
        }
      }
    }
  });
  
  const accuracy = totalCount > 0 
    ? Math.round((correctCount / totalCount) * 100) 
    : 0;
  
  return {
    accuracy,
    total_questions: totalCount,
    correct_first: correctCount,
    incorrect_first: totalCount - correctCount
  };
}

/**
 * Generate learning recommendations based on patterns
 * @param {Object} learningProgress - From analyzeLearningProgress
 * @returns {Array} - Array of recommendations
 */
function generateLearningRecommendations(learningProgress) {
  const recommendations = [];
  
  // Priority 1: Persistent difficulties
  if (learningProgress.persistent_difficulty > 0) {
    recommendations.push({
      priority: 'HIGH',
      category: 'persistent_difficulty',
      count: learningProgress.persistent_difficulty,
      title: 'Các câu hỏi cần hỗ trợ khẩn cấp',
      message: `Bạn đã thử 2 lần nhưng vẫn sai ${learningProgress.persistent_difficulty} câu hỏi. Cần học lại kiến thức cơ bản.`,
      actions: [
        'Xem lại video bài giảng',
        'Đọc kỹ tài liệu lý thuyết',
        'Làm bài tập cơ bản trước',
        'Hỏi giáo viên để được giải thích rõ hơn'
      ],
      questions: learningProgress.questions_by_pattern.persistent_difficulty
    });
  }
  
  // Priority 2: Single failures
  if (learningProgress.single_failure > 0) {
    recommendations.push({
      priority: 'MEDIUM',
      category: 'single_failure',
      count: learningProgress.single_failure,
      title: 'Các câu hỏi cần ôn lại',
      message: `Bạn đã làm sai ${learningProgress.single_failure} câu hỏi. Hãy xem lại để hiểu rõ hơn.`,
      actions: [
        'Xem lại lý thuyết liên quan',
        'Thử làm lại câu hỏi',
        'Tìm hiểu tại sao đã chọn sai'
      ],
      questions: learningProgress.questions_by_pattern.single_failure
    });
  }
  
  // Positive: Learned from mistakes
  if (learningProgress.learned_from_mistake > 0) {
    recommendations.push({
      priority: 'INFO',
      category: 'learned_from_mistake',
      count: learningProgress.learned_from_mistake,
      title: 'Điểm tích cực: Học từ sai lầm',
      message: `Tuyệt vời! Bạn đã cải thiện và trả lời đúng ${learningProgress.learned_from_mistake} câu sau khi thử lại.`,
      actions: [
        'Ôn lại các khái niệm này để nhớ lâu hơn',
        'Áp dụng vào các bài tập khác'
      ],
      questions: learningProgress.questions_by_pattern.learned_from_mistake
    });
  }
  
  // Positive: First try success
  if (learningProgress.first_try_success > 0) {
    recommendations.push({
      priority: 'SUCCESS',
      category: 'first_try_success',
      count: learningProgress.first_try_success,
      title: 'Điểm mạnh của bạn',
      message: `Xuất sắc! Bạn đã trả lời đúng ${learningProgress.first_try_success} câu ngay từ lần đầu.`,
      actions: [
        'Tiếp tục duy trì',
        'Thử các câu hỏi nâng cao hơn'
      ],
      questions: learningProgress.questions_by_pattern.first_try_success
    });
  }
  
  // Not attempted
  if (learningProgress.not_attempted > 0) {
    recommendations.push({
      priority: 'LOW',
      category: 'not_attempted',
      count: learningProgress.not_attempted,
      title: 'Câu hỏi chưa thử',
      message: `Còn ${learningProgress.not_attempted} câu hỏi bạn chưa thử làm.`,
      actions: [
        'Hãy thử làm để đánh giá kiến thức'
      ],
      questions: learningProgress.questions_by_pattern.not_attempted
    });
  }
  
  return recommendations;
}

module.exports = {
  classifyLearningPattern,
  calculateTimeImprovement,
  groupByQuestion,
  analyzeLearningProgress,
  calculateFinalAccuracy,
  calculateFirstAttemptAccuracy,
  generateLearningRecommendations
};
