// services/predictionService.js
/**
 * Service for predicting quiz outcomes and providing time estimates
 * Uses machine learning-like algorithms to forecast results
 */

class PredictionService {
  /**
   * Predict quiz outcome based on current progress
   * @param {Object} participants - Firebase participants data
   * @param {number} totalQuestions - Total number of questions in quiz
   * @param {number} currentQuestionIndex - Current question index (0-based)
   * @param {Object} classMetrics - Overall class metrics
   * @returns {Object} Prediction data
   */
  predictQuizOutcome(participants, totalQuestions, currentQuestionIndex, classMetrics) {
    try {
      const participantList = Object.values(participants || {});
      
      if (participantList.length === 0) {
        return this.getEmptyPrediction();
      }

      // Calculate progress percentage
      const progressPercentage = ((currentQuestionIndex + 1) / totalQuestions) * 100;

      // Predict final pass rate
      const passRatePrediction = this.calculatePassRatePrediction(
        participantList,
        progressPercentage,
        classMetrics
      );

      // Estimate completion time
      const completionEstimate = this.estimateCompletionTime(
        participantList,
        totalQuestions,
        currentQuestionIndex,
        classMetrics
      );

      // Predict final score distribution
      const scoreDistribution = this.predictScoreDistribution(
        participantList,
        progressPercentage
      );

      // Calculate confidence in predictions
      const confidence = this.calculatePredictionConfidence(progressPercentage);

      return {
        pass_rate_prediction: {
          predicted_pass_rate: Math.round(passRatePrediction.predicted_rate * 10) / 10,
          current_pass_rate: Math.round(passRatePrediction.current_rate * 10) / 10,
          trend: passRatePrediction.trend,
          confidence: confidence
        },

        completion_estimate: {
          estimated_completion_minutes: Math.round(completionEstimate.minutes * 10) / 10,
          fastest_student_minutes: Math.round(completionEstimate.fastest * 10) / 10,
          slowest_student_minutes: Math.round(completionEstimate.slowest * 10) / 10,
          confidence: confidence
        },

        score_distribution_prediction: scoreDistribution,

        insights: {
          progress_percentage: Math.round(progressPercentage * 10) / 10,
          data_points: participantList.length,
          confidence_level: this.getConfidenceLabel(confidence),
          reliability_note: this.getReliabilityNote(progressPercentage)
        }
      };
    } catch (error) {
      console.error("Error in predictQuizOutcome:", error);
      return this.getEmptyPrediction();
    }
  }

  /**
   * Calculate pass rate prediction based on current trends
   */
  calculatePassRatePrediction(participants, progressPercentage, classMetrics) {
    const passingThreshold = 60; // Configurable

    // Calculate current pass rate
    let currentlyPassing = 0;
    let totalWithAnswers = 0;

    const participantScores = [];

    participants.forEach(p => {
      if (p.score !== undefined && p.score !== null) {
        totalWithAnswers++;
        participantScores.push({
          userId: p.userId,
          currentScore: p.score,
          progress: p.progress_percentage || 0,
          accuracy: p.accuracy || 0
        });

        // Assume max score is 100
        const currentPercentage = p.score;
        if (currentPercentage >= passingThreshold) {
          currentlyPassing++;
        }
      }
    });

    const currentPassRate = totalWithAnswers > 0
      ? (currentlyPassing / totalWithAnswers) * 100
      : 0;

    // Predict final pass rate using weighted formula
    let predictedPassRate = currentPassRate;

    if (progressPercentage >= 20) {
      // Use trend analysis
      const avgAccuracy = classMetrics?.avg_accuracy || 0;
      
      // If accuracy is high, predict improvement
      if (avgAccuracy >= 70) {
        predictedPassRate = currentPassRate + (100 - progressPercentage) * 0.1;
      } 
      // If accuracy is low, predict decline
      else if (avgAccuracy < 50) {
        predictedPassRate = currentPassRate - (100 - progressPercentage) * 0.05;
      }

      // Ensure within bounds
      predictedPassRate = Math.max(0, Math.min(100, predictedPassRate));
    }

    // Determine trend
    let trend = "stable";
    const difference = predictedPassRate - currentPassRate;
    if (difference > 5) trend = "improving";
    else if (difference < -5) trend = "declining";

    return {
      current_rate: currentPassRate,
      predicted_rate: predictedPassRate,
      trend: trend
    };
  }

  /**
   * Estimate time until quiz completion
   */
  estimateCompletionTime(participants, totalQuestions, currentQuestionIndex, classMetrics) {
    const remainingQuestions = totalQuestions - currentQuestionIndex - 1;
    
    if (remainingQuestions <= 0) {
      return {
        minutes: 0,
        fastest: 0,
        slowest: 0
      };
    }

    // Calculate average time per question from current data
    const avgTimePerQuestion = classMetrics?.avg_response_time || 10000; // Default 10 seconds
    const avgTimePerQuestionSeconds = avgTimePerQuestion / 1000;

    // Estimate remaining time
    const estimatedSeconds = remainingQuestions * avgTimePerQuestionSeconds;
    const estimatedMinutes = estimatedSeconds / 60;

    // Calculate fastest and slowest estimates
    const fastestTimePerQuestion = avgTimePerQuestionSeconds * 0.6; // 60% of avg
    const slowestTimePerQuestion = avgTimePerQuestionSeconds * 1.8; // 180% of avg

    const fastestMinutes = (remainingQuestions * fastestTimePerQuestion) / 60;
    const slowestMinutes = (remainingQuestions * slowestTimePerQuestion) / 60;

    return {
      minutes: estimatedMinutes,
      fastest: fastestMinutes,
      slowest: slowestMinutes
    };
  }

  /**
   * Predict final score distribution
   */
  predictScoreDistribution(participants, progressPercentage) {
    const ranges = {
      excellent: 0,  // 90-100
      good: 0,       // 70-89
      average: 0,    // 50-69
      poor: 0        // 0-49
    };

    participants.forEach(p => {
      const currentScore = p.score || 0;
      
      // Simple prediction: current score is representative
      // More sophisticated: adjust based on progress and trend
      let predictedFinalScore = currentScore;

      // If early in quiz, apply regression to mean
      if (progressPercentage < 30) {
        // Assume students will trend toward 65% (mean)
        predictedFinalScore = currentScore * 0.7 + 65 * 0.3;
      }

      // Categorize
      if (predictedFinalScore >= 90) ranges.excellent++;
      else if (predictedFinalScore >= 70) ranges.good++;
      else if (predictedFinalScore >= 50) ranges.average++;
      else ranges.poor++;
    });

    const total = participants.length;

    return {
      excellent: {
        count: ranges.excellent,
        percentage: total > 0 ? Math.round((ranges.excellent / total) * 100 * 10) / 10 : 0,
        label: "90-100%"
      },
      good: {
        count: ranges.good,
        percentage: total > 0 ? Math.round((ranges.good / total) * 100 * 10) / 10 : 0,
        label: "70-89%"
      },
      average: {
        count: ranges.average,
        percentage: total > 0 ? Math.round((ranges.average / total) * 100 * 10) / 10 : 0,
        label: "50-69%"
      },
      poor: {
        count: ranges.poor,
        percentage: total > 0 ? Math.round((ranges.poor / total) * 100 * 10) / 10 : 0,
        label: "0-49%"
      }
    };
  }

  /**
   * Calculate confidence in predictions based on progress
   */
  calculatePredictionConfidence(progressPercentage) {
    // Confidence increases with progress
    if (progressPercentage >= 75) return 95;
    if (progressPercentage >= 50) return 85;
    if (progressPercentage >= 30) return 70;
    if (progressPercentage >= 20) return 55;
    return 40;
  }

  /**
   * Get confidence label
   */
  getConfidenceLabel(confidence) {
    if (confidence >= 85) return "High";
    if (confidence >= 65) return "Medium";
    return "Low";
  }

  /**
   * Get reliability note based on progress
   */
  getReliabilityNote(progressPercentage) {
    if (progressPercentage < 20) {
      return "Predictions are preliminary - based on limited data";
    }
    if (progressPercentage < 50) {
      return "Predictions are moderately reliable - trends are emerging";
    }
    if (progressPercentage < 75) {
      return "Predictions are reliable - strong trend data available";
    }
    return "Predictions are highly reliable - quiz nearly complete";
  }

  /**
   * Get empty prediction structure
   */
  getEmptyPrediction() {
    return {
      pass_rate_prediction: {
        predicted_pass_rate: 0,
        current_pass_rate: 0,
        trend: "unknown",
        confidence: 0
      },
      completion_estimate: {
        estimated_completion_minutes: 0,
        fastest_student_minutes: 0,
        slowest_student_minutes: 0,
        confidence: 0
      },
      score_distribution_prediction: {
        excellent: { count: 0, percentage: 0, label: "90-100%" },
        good: { count: 0, percentage: 0, label: "70-89%" },
        average: { count: 0, percentage: 0, label: "50-69%" },
        poor: { count: 0, percentage: 0, label: "0-49%" }
      },
      insights: {
        progress_percentage: 0,
        data_points: 0,
        confidence_level: "None",
        reliability_note: "No data available for predictions"
      }
    };
  }
}

module.exports = new PredictionService();
