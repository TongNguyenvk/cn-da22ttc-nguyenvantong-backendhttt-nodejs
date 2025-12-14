// services/strugglingDetectionService.js
/**
 * Service for detecting struggling students in real-time during quiz
 * Analyzes student performance patterns and generates intervention suggestions
 */

class StrugglingDetectionService {
  /**
   * Detect struggling students based on multiple risk factors
   * @param {Object} participants - Firebase participants data
   * @param {Object} classMetrics - Overall class performance metrics
   * @returns {Array} Array of struggling students with risk assessment
   */
  detectStrugglingStudents(participants, classMetrics) {
    if (!participants || Object.keys(participants).length === 0) {
      return [];
    }

    const strugglingStudents = [];

    Object.entries(participants).forEach(([userId, data]) => {
      // Skip if student hasn't answered enough questions (need at least 2 for meaningful analysis)
      if (!data.total_answers || data.total_answers < 2) {
        return;
      }

      const riskFactors = [];
      let riskScore = 0;

      // Calculate accuracy
      const accuracy = data.total_answers > 0
        ? (data.correct_answers / data.total_answers) * 100
        : 0;

      // FACTOR 1: Low Accuracy (<30%)
      if (accuracy < 30 && data.total_answers >= 3) {
        riskFactors.push({
          type: "low_accuracy",
          severity: "high",
          description: `Accuracy below 30% (${accuracy.toFixed(1)}%)`,
          value: accuracy,
          threshold: 30
        });
        riskScore += 30;
      } else if (accuracy < 50 && data.total_answers >= 3) {
        riskFactors.push({
          type: "low_accuracy",
          severity: "medium",
          description: `Accuracy below 50% (${accuracy.toFixed(1)}%)`,
          value: accuracy,
          threshold: 50
        });
        riskScore += 15;
      }

      // FACTOR 2: Slow Response (>2x class average)
      const avgTime = data.total_response_time && data.total_answers > 0
        ? data.total_response_time / data.total_answers
        : 0;
      const classAvgTime = classMetrics?.average_response_time || 10;

      if (avgTime > classAvgTime * 2.5 && avgTime > 15) {
        riskFactors.push({
          type: "slow_response",
          severity: "high",
          description: `Response time 2.5x slower than class average`,
          value: avgTime,
          class_avg: classAvgTime
        });
        riskScore += 20;
      } else if (avgTime > classAvgTime * 1.8 && avgTime > 12) {
        riskFactors.push({
          type: "slow_response",
          severity: "medium",
          description: `Response time 1.8x slower than class average`,
          value: avgTime,
          class_avg: classAvgTime
        });
        riskScore += 10;
      }

      // FACTOR 3: Negative Streak (3+ wrong answers in a row)
      const negativeStreak = this.detectNegativeStreak(data.answers);
      if (negativeStreak >= 3) {
        riskFactors.push({
          type: "negative_streak",
          severity: "high",
          description: `No correct answers in last ${negativeStreak} questions`,
          length: negativeStreak
        });
        riskScore += 25;
      } else if (negativeStreak === 2) {
        riskFactors.push({
          type: "negative_streak",
          severity: "medium",
          description: `2 consecutive wrong answers`,
          length: negativeStreak
        });
        riskScore += 12;
      }

      // FACTOR 4: Low Score (significantly below average)
      const avgScore = classMetrics?.average_score || 5;
      if (data.current_score < avgScore * 0.4 && data.total_answers >= 3) {
        riskFactors.push({
          type: "low_score",
          severity: "high",
          description: `Score significantly below class average (${data.current_score.toFixed(1)} vs ${avgScore.toFixed(1)})`,
          value: data.current_score,
          class_avg: avgScore
        });
        riskScore += 20;
      } else if (data.current_score < avgScore * 0.6 && data.total_answers >= 3) {
        riskFactors.push({
          type: "low_score",
          severity: "medium",
          description: `Score below class average`,
          value: data.current_score,
          class_avg: avgScore
        });
        riskScore += 10;
      }

      // FACTOR 5: Declining Performance Pattern
      const decliningPattern = this.detectDecliningPattern(data.answers);
      if (decliningPattern) {
        riskFactors.push({
          type: "declining_performance",
          severity: "medium",
          description: "Performance declining over time",
          pattern: decliningPattern
        });
        riskScore += 15;
      }

      // FACTOR 6: Time Pressure Indicators (very fast or very slow answers)
      const timeoutCount = this.countTimeouts(data.answers);
      if (timeoutCount >= 2) {
        riskFactors.push({
          type: "time_pressure",
          severity: "medium",
          description: `${timeoutCount} timeout or rushed answers detected`,
          timeout_count: timeoutCount
        });
        riskScore += 15;
      }

      // Determine risk level
      let riskLevel = "low";
      if (riskScore >= 70) riskLevel = "critical";
      else if (riskScore >= 45) riskLevel = "high";
      else if (riskScore >= 25) riskLevel = "medium";

      // Only include students with medium or higher risk
      if (riskScore >= 25) {
        strugglingStudents.push({
          user_id: userId,
          user_name: data.user_name || `User ${userId}`,
          risk_level: riskLevel,
          risk_score: riskScore,
          
          current_stats: {
            score: data.current_score || 0,
            accuracy: Math.round(accuracy * 10) / 10,
            questions_answered: data.total_answers,
            correct_answers: data.correct_answers || 0,
            avg_response_time: Math.round(avgTime * 10) / 10
          },
          
          red_flags: riskFactors,
          
          suggested_actions: this.generateInterventionSuggestions(
            riskLevel,
            riskFactors
          ),
          
          // Additional context
          percentile: this.calculatePercentile(
            data.current_score,
            participants
          )
        });
      }
    });

    // Sort by risk score (highest first)
    return strugglingStudents.sort((a, b) => b.risk_score - a.risk_score);
  }

  /**
   * Detect consecutive wrong answers (negative streak)
   */
  detectNegativeStreak(answers) {
    if (!answers) return 0;

    const answersArray = Object.values(answers);
    if (answersArray.length === 0) return 0;

    // Sort by timestamp to get chronological order
    const sortedAnswers = answersArray.sort((a, b) => 
      (a.timestamp || 0) - (b.timestamp || 0)
    );

    let currentStreak = 0;
    let maxStreak = 0;

    // Count from the most recent answers backwards
    for (let i = sortedAnswers.length - 1; i >= 0; i--) {
      if (!sortedAnswers[i].is_correct) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        break; // Stop at first correct answer from the end
      }
    }

    return currentStreak;
  }

  /**
   * Detect declining performance pattern
   */
  detectDecliningPattern(answers) {
    if (!answers) return false;

    const answersArray = Object.values(answers);
    if (answersArray.length < 4) return false; // Need at least 4 answers

    // Sort by timestamp
    const sortedAnswers = answersArray.sort((a, b) => 
      (a.timestamp || 0) - (b.timestamp || 0)
    );

    // Split into first half and second half
    const midPoint = Math.floor(sortedAnswers.length / 2);
    const firstHalf = sortedAnswers.slice(0, midPoint);
    const secondHalf = sortedAnswers.slice(midPoint);

    // Calculate accuracy for each half
    const firstHalfAccuracy = firstHalf.filter(a => a.is_correct).length / firstHalf.length;
    const secondHalfAccuracy = secondHalf.filter(a => a.is_correct).length / secondHalf.length;

    // Declining if second half is significantly worse (>30% drop)
    const decline = firstHalfAccuracy - secondHalfAccuracy;
    
    if (decline > 0.3) {
      return {
        first_half_accuracy: Math.round(firstHalfAccuracy * 100),
        second_half_accuracy: Math.round(secondHalfAccuracy * 100),
        decline_percentage: Math.round(decline * 100)
      };
    }

    return false;
  }

  /**
   * Count timeout or rushed answers
   */
  countTimeouts(answers) {
    if (!answers) return 0;

    const answersArray = Object.values(answers);
    let timeoutCount = 0;

    answersArray.forEach(answer => {
      const responseTime = answer.response_time || 0;
      
      // Too fast (< 2 seconds) or too slow (> 25 seconds) might indicate issues
      if (responseTime < 2000 || responseTime > 25000) {
        timeoutCount++;
      }
    });

    return timeoutCount;
  }

  /**
   * Calculate student's percentile rank
   */
  calculatePercentile(studentScore, allParticipants) {
    const scores = Object.values(allParticipants)
      .map(p => p.current_score || 0)
      .sort((a, b) => a - b);

    const position = scores.filter(s => s < studentScore).length;
    const percentile = Math.round((position / scores.length) * 100);

    return percentile;
  }

  /**
   * Generate intervention suggestions based on risk factors
   */
  generateInterventionSuggestions(riskLevel, riskFactors) {
    const suggestions = [];

    if (riskLevel === "critical") {
      suggestions.push({
        priority: 1,
        action: "immediate_check_in",
        description: "Check in with student immediately during quiz",
        reason: "Student showing critical struggle indicators"
      });
    }

    // Specific suggestions based on risk factors
    const hasTimeIssues = riskFactors.some(f => 
      f.type === "slow_response" || f.type === "time_pressure"
    );
    if (hasTimeIssues) {
      suggestions.push({
        priority: 2,
        action: "extend_time",
        description: "Consider giving extra time for remaining questions",
        reason: "Student showing time management difficulties"
      });
    }

    const hasAccuracyIssues = riskFactors.some(f => 
      f.type === "low_accuracy" || f.type === "negative_streak"
    );
    if (hasAccuracyIssues) {
      suggestions.push({
        priority: 2,
        action: "send_encouragement",
        description: "Send encouragement message to boost confidence",
        reason: "Student may be losing confidence"
      });
      
      suggestions.push({
        priority: 3,
        action: "post_quiz_support",
        description: "Schedule 1-on-1 review session after quiz",
        reason: "Student needs additional support on concepts"
      });
    }

    const hasDecliningPattern = riskFactors.some(f => 
      f.type === "declining_performance"
    );
    if (hasDecliningPattern) {
      suggestions.push({
        priority: 2,
        action: "check_fatigue",
        description: "Check if student needs a short break",
        reason: "Performance declining over time (possible fatigue)"
      });
    }

    // Default suggestion if no specific ones
    if (suggestions.length === 0 && riskLevel !== "low") {
      suggestions.push({
        priority: 3,
        action: "monitor_closely",
        description: "Continue monitoring student progress",
        reason: "Student showing some struggle indicators"
      });
    }

    return suggestions;
  }
}

module.exports = new StrugglingDetectionService();
