/**
 * PRACTICE ACTIVITY LOGGER MIDDLEWARE
 * Middleware để log các hoạt động practice recommendation
 */

const fs = require('fs').promises;
const path = require('path');

class PracticeActivityLogger {
    constructor() {
        this.logDir = path.join(__dirname, '../../logs');
        this.practiceLogFile = path.join(this.logDir, 'practice-activities.log');
        this.analyticsLogFile = path.join(this.logDir, 'practice-analytics.log');
        
        this.initializeLogDirectory();
    }

    async initializeLogDirectory() {
        try {
            await fs.mkdir(this.logDir, { recursive: true });
        } catch (error) {
            console.error('Error creating log directory:', error);
        }
    }

    /**
     * Log practice recommendation request
     */
    async logRecommendationRequest(req, res, responseData) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            type: 'RECOMMENDATION_REQUEST',
            userId: req.query.userId,
            courseId: req.query.courseId,
            requestId: req.id || `req_${Date.now()}`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            response: {
                success: responseData.success,
                totalRecommendations: responseData.data?.total_los || 0,
                urgentCount: responseData.data?.summary?.urgent_count || 0,
                avgAccuracy: responseData.data?.summary?.avg_accuracy || 0
            },
            processingTime: res.getHeaders()['x-response-time'] || 'unknown'
        };

        await this.writeToLog(this.practiceLogFile, logEntry);
    }

    /**
     * Log practice quiz generation
     */
    async logPracticeGeneration(req, res, responseData) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            type: 'PRACTICE_GENERATION',
            userId: req.body.userId,
            courseId: req.body.courseId,
            loId: req.body.loId,
            difficulty: req.body.difficulty,
            totalQuestions: req.body.totalQuestions,
            requestId: req.id || `req_${Date.now()}`,
            ip: req.ip,
            response: {
                success: responseData.success,
                questionsGenerated: responseData.data?.total_questions || 0,
                newQuestionsCount: responseData.data?.new_questions_count || 0,
                reviewQuestionsCount: responseData.data?.review_questions_count || 0,
                quizId: responseData.data?.quiz_id
            },
            processingTime: res.getHeaders()['x-response-time'] || 'unknown'
        };

        await this.writeToLog(this.practiceLogFile, logEntry);
    }

    /**
     * Log user practice analytics
     */
    async logUserAnalytics(userId, courseId, analyticsData) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            type: 'USER_ANALYTICS',
            userId,
            courseId,
            analytics: analyticsData
        };

        await this.writeToLog(this.analyticsLogFile, logEntry);
    }

    /**
     * Write log entry to file
     */
    async writeToLog(filePath, logEntry) {
        try {
            const logLine = JSON.stringify(logEntry) + '\n';
            await fs.appendFile(filePath, logLine);
        } catch (error) {
            console.error('Error writing to log file:', error);
        }
    }

    /**
     * Get practice statistics for analytics
     */
    async getPracticeStatistics(days = 7) {
        try {
            const logContent = await fs.readFile(this.practiceLogFile, 'utf8');
            const lines = logContent.trim().split('\n').filter(line => line);
            
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            
            const recentLogs = lines
                .map(line => {
                    try {
                        return JSON.parse(line);
                    } catch {
                        return null;
                    }
                })
                .filter(log => log && new Date(log.timestamp) >= cutoffDate);

            const stats = {
                total_requests: recentLogs.length,
                recommendation_requests: recentLogs.filter(log => log.type === 'RECOMMENDATION_REQUEST').length,
                generation_requests: recentLogs.filter(log => log.type === 'PRACTICE_GENERATION').length,
                unique_users: [...new Set(recentLogs.map(log => log.userId))].length,
                unique_courses: [...new Set(recentLogs.map(log => log.courseId))].length,
                avg_questions_per_practice: this.calculateAverage(
                    recentLogs
                        .filter(log => log.type === 'PRACTICE_GENERATION')
                        .map(log => log.response?.questionsGenerated || 0)
                ),
                success_rate: this.calculateSuccessRate(recentLogs),
                popular_difficulties: this.getPopularDifficulties(recentLogs),
                daily_breakdown: this.getDailyBreakdown(recentLogs, days)
            };

            return stats;
        } catch (error) {
            console.error('Error reading practice statistics:', error);
            return null;
        }
    }

    calculateAverage(numbers) {
        if (numbers.length === 0) return 0;
        return Math.round(numbers.reduce((sum, num) => sum + num, 0) / numbers.length * 100) / 100;
    }

    calculateSuccessRate(logs) {
        if (logs.length === 0) return 0;
        const successCount = logs.filter(log => log.response?.success).length;
        return Math.round((successCount / logs.length) * 100 * 100) / 100;
    }

    getPopularDifficulties(logs) {
        const difficulties = logs
            .filter(log => log.type === 'PRACTICE_GENERATION' && log.difficulty)
            .map(log => log.difficulty);
        
        const counts = {};
        difficulties.forEach(diff => {
            counts[diff] = (counts[diff] || 0) + 1;
        });

        return Object.entries(counts)
            .sort(([,a], [,b]) => b - a)
            .reduce((obj, [key, value]) => {
                obj[key] = value;
                return obj;
            }, {});
    }

    getDailyBreakdown(logs, days) {
        const dailyData = {};
        
        for (let i = 0; i < days; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            
            dailyData[dateStr] = {
                total_requests: 0,
                recommendation_requests: 0,
                generation_requests: 0,
                unique_users: new Set()
            };
        }

        logs.forEach(log => {
            const logDate = log.timestamp.split('T')[0];
            if (dailyData[logDate]) {
                dailyData[logDate].total_requests++;
                if (log.type === 'RECOMMENDATION_REQUEST') {
                    dailyData[logDate].recommendation_requests++;
                } else if (log.type === 'PRACTICE_GENERATION') {
                    dailyData[logDate].generation_requests++;
                }
                dailyData[logDate].unique_users.add(log.userId);
            }
        });

        // Convert Sets to counts
        Object.keys(dailyData).forEach(date => {
            dailyData[date].unique_users = dailyData[date].unique_users.size;
        });

        return dailyData;
    }
}

// Singleton instance
const practiceLogger = new PracticeActivityLogger();

/**
 * Middleware function to log practice activities
 */
const logPracticeActivity = (activityType) => {
    return async (req, res, next) => {
        // Store original res.json to intercept response
        const originalJson = res.json;
        
        res.json = function(data) {
            // Log the activity
            setImmediate(async () => {
                try {
                    if (activityType === 'recommendation') {
                        await practiceLogger.logRecommendationRequest(req, res, data);
                    } else if (activityType === 'generation') {
                        await practiceLogger.logPracticeGeneration(req, res, data);
                    }
                } catch (error) {
                    console.error('Error logging practice activity:', error);
                }
            });
            
            // Call original res.json
            return originalJson.call(this, data);
        };
        
        next();
    };
};

/**
 * Express middleware to add response time header
 */
const addResponseTime = (req, res, next) => {
    const startTime = Date.now();
    
    // Set header before response instead of after finish
    const originalEnd = res.end;
    res.end = function(...args) {
        try {
            const duration = Date.now() - startTime;
            if (!res.headersSent) {
                res.set('X-Response-Time', `${duration}ms`);
            }
        } catch (error) {
            console.warn('Failed to set response time header:', error.message);
        }
        originalEnd.apply(this, args);
    };
    
    next();
};

module.exports = {
    PracticeActivityLogger,
    practiceLogger,
    logPracticeActivity,
    addResponseTime
};
