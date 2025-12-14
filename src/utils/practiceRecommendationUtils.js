/**
 * PRACTICE RECOMMENDATION UTILS
 * Các hàm tiện ích hỗ trợ practice recommendation system
 */

/**
 * Tính toán difficulty score dựa trên user performance
 */
function calculateDifficultyScore(accuracy, attempts, avgTimeSpent) {
    let score = 50; // Base score
    
    // Điều chỉnh theo accuracy
    if (accuracy >= 90) score = 90;
    else if (accuracy >= 80) score = 80;
    else if (accuracy >= 70) score = 70;
    else if (accuracy >= 60) score = 60;
    else if (accuracy >= 50) score = 50;
    else if (accuracy >= 40) score = 40;
    else if (accuracy >= 30) score = 30;
    else score = 20;
    
    // Điều chỉnh theo số lần thử
    if (attempts === 0) score = 50; // Chưa có data
    else if (attempts < 3) score += 5; // Cần thêm data
    else if (attempts > 10) score += 10; // Có nhiều data, tin cậy hơn
    
    // Điều chỉnh theo thời gian làm bài
    if (avgTimeSpent > 300) score -= 5; // Làm chậm = khó khăn
    else if (avgTimeSpent < 60) score += 5; // Làm nhanh = thành thạo
    
    return Math.max(10, Math.min(100, score));
}

/**
 * Xác định recommendation type dựa trên performance
 */
function getRecommendationType(accuracy, attempts, timeSinceLastAttempt = 0) {
    if (attempts === 0) return 'new_topic';
    
    if (accuracy < 40 && attempts >= 3) return 'urgent_review';
    if (accuracy < 40) return 'need_review';
    if (accuracy < 60) return 'practice_more';
    if (accuracy < 80) return 'improve_speed';
    if (timeSinceLastAttempt > 7) return 'maintain_knowledge'; // 7 days
    
    return 'maintain';
}

/**
 * Tạo improvement actions chi tiết
 */
function generateDetailedImprovementActions(loData, context = {}) {
    const { accuracy, attempts, avgTimeSpent, lastAttemptDate } = loData;
    const { difficulty = 'medium', loName = 'LO này' } = context;
    
    const actions = [];
    
    // Actions dựa trên accuracy
    if (accuracy < 0.3) {
        actions.push(`📚 Ôn lại toàn bộ lý thuyết về ${loName}`);
        actions.push(`📝 Làm bài tập cơ bản từ đầu`);
        actions.push(`👨‍🏫 Tìm hiểu thêm từ giáo viên hoặc bạn bè`);
        actions.push(`⏰ Dành ít nhất 2 giờ mỗi ngày cho ${loName}`);
    } else if (accuracy < 0.5) {
        actions.push(`🔍 Xem lại các lỗi sai thường gặp`);
        actions.push(`📖 Đọc thêm tài liệu tham khảo`);
        actions.push(`✍️ Ghi chú lại các điểm quan trọng`);
        actions.push(`🎯 Tập trung vào dạng bài hay sai`);
    } else if (accuracy < 0.7) {
        actions.push(`🚀 Luyện tập thêm với câu hỏi nâng cao`);
        actions.push(`⚡ Cải thiện tốc độ làm bài`);
        actions.push(`🔄 Ôn tập theo phương pháp spaced repetition`);
        actions.push(`💡 Tìm hiểu các tip và tricks`);
    } else if (accuracy < 0.9) {
        actions.push(`🎖️ Thử thách với câu hỏi khó nhất`);
        actions.push(`⏱️ Rút ngắn thời gian làm bài`);
        actions.push(`🧠 Áp dụng kiến thức vào bài toán thực tế`);
        actions.push(`📊 Phân tích sâu các lỗi còn lại`);
    } else {
        actions.push(`⭐ Duy trì phong độ với bài tập đa dạng`);
        actions.push(`🤝 Hỗ trợ bạn bè học tập`);
        actions.push(`🔬 Nghiên cứu các vấn đề nâng cao`);
        actions.push(`🏆 Tham gia các cuộc thi học thuật`);
    }
    
    // Actions dựa trên attempts
    if (attempts < 3) {
        actions.push(`📈 Làm thêm bài tập để đánh giá chính xác năng lực`);
    } else if (attempts > 20) {
        actions.push(`🎯 Tập trung vào quality thay vì quantity`);
    }
    
    // Actions dựa trên time
    if (avgTimeSpent > 300) { // > 5 phút
        actions.push(`⚡ Luyện tập để cải thiện tốc độ`);
        actions.push(`🧩 Học các phương pháp giải nhanh`);
    } else if (avgTimeSpent < 30) { // < 30 giây
        actions.push(`🤔 Đọc kỹ đề bài trước khi trả lời`);
        actions.push(`✅ Kiểm tra lại đáp án trước khi submit`);
    }
    
    // Actions dựa trên thời gian cách last attempt
    if (lastAttemptDate) {
        const daysSinceLastAttempt = Math.floor((Date.now() - new Date(lastAttemptDate)) / (1000 * 60 * 60 * 24));
        if (daysSinceLastAttempt > 7) {
            actions.push(`🔄 Ôn lại kiến thức đã quên do lâu không luyện tập`);
        } else if (daysSinceLastAttempt > 3) {
            actions.push(`📅 Duy trì lịch luyện tập đều đặn`);
        }
    }
    
    return actions.slice(0, 4); // Giới hạn 4 actions
}

/**
 * Tính thời gian ước tính cần thiết (phút)
 */
function estimateStudyTime(accuracy, attempts, difficulty = 'medium') {
    let baseTime = 15; // phút
    
    // Điều chỉnh theo accuracy
    if (accuracy < 0.3) baseTime = 35;
    else if (accuracy < 0.5) baseTime = 30;
    else if (accuracy < 0.7) baseTime = 25;
    else if (accuracy < 0.9) baseTime = 20;
    else baseTime = 15;
    
    // Điều chỉnh theo difficulty
    const difficultyMultiplier = {
        easy: 0.8,
        medium: 1.0,
        hard: 1.3
    };
    baseTime *= difficultyMultiplier[difficulty] || 1.0;
    
    // Điều chỉnh theo attempts (ít attempts = cần thêm thời gian)
    if (attempts === 0) baseTime += 10;
    else if (attempts < 3) baseTime += 5;
    
    return Math.round(baseTime);
}

/**
 * Tạo summary cho course recommendations
 */
function generateCourseSummary(recommendations) {
    const total = recommendations.length;
    const urgentCount = recommendations.filter(r => r.priority === 'urgent').length;
    const highCount = recommendations.filter(r => r.priority === 'high').length;
    const mediumCount = recommendations.filter(r => r.priority === 'medium').length;
    const lowCount = recommendations.filter(r => r.priority === 'low').length;
    
    const avgAccuracy = total > 0 
        ? Math.round(recommendations.reduce((sum, r) => sum + r.statistics.accuracy_percentage, 0) / total)
        : 0;
    
    const totalTime = recommendations.reduce((sum, r) => sum + r.estimated_time_minutes, 0);
    
    const weakestLOs = recommendations
        .filter(r => r.statistics.accuracy_percentage < 50)
        .slice(0, 3)
        .map(r => r.lo_name);
    
    const strongestLOs = recommendations
        .filter(r => r.statistics.accuracy_percentage >= 80)
        .slice(0, 3)
        .map(r => r.lo_name);
    
    return {
        total_los: total,
        urgent_count: urgentCount,
        high_priority_count: highCount,
        medium_priority_count: mediumCount,
        low_priority_count: lowCount,
        avg_accuracy: avgAccuracy,
        total_estimated_time: totalTime,
        weakest_los: weakestLOs,
        strongest_los: strongestLOs,
        study_plan: {
            immediate_focus: urgentCount + highCount,
            weekly_target: Math.min(5, urgentCount + highCount),
            estimated_completion_days: Math.ceil(totalTime / 120) // 2 giờ/ngày
        }
    };
}

/**
 * Validate request parameters
 */
function validatePracticeRequest(req, requiredFields) {
    const errors = [];
    
    for (const field of requiredFields) {
        if (!req.query[field] && !req.body[field]) {
            errors.push(`${field} là bắt buộc`);
        }
    }
    
    return errors;
}

/**
 * Format error response
 */
function formatErrorResponse(message, details = null, statusCode = 500) {
    return {
        success: false,
        error: message,
        details,
        timestamp: new Date().toISOString(),
        status_code: statusCode
    };
}

/**
 * Format success response
 */
function formatSuccessResponse(data, message = null) {
    return {
        success: true,
        data,
        message,
        timestamp: new Date().toISOString()
    };
}

module.exports = {
    calculateDifficultyScore,
    getRecommendationType,
    generateDetailedImprovementActions,
    estimateStudyTime,
    generateCourseSummary,
    validatePracticeRequest,
    formatErrorResponse,
    formatSuccessResponse
};
