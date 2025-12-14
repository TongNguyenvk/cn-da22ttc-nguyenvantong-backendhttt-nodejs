// backend/src/patches/quizController_answerChoiceStats_patch.js
// Patch to integrate Answer Choice Stats into QuizController

/**
 * INSTRUCTIONS FOR APPLYING THIS PATCH:
 * 
 * 1. Add import statement at the top of quizController.js:
 */

// Add this import after line 10 in quizController.js
const AnswerChoiceStatsService = require('../services/answerChoiceStatsService');

/**
 * 2. Initialize AnswerChoiceStatsService in setupSocketMiddleware function:
 */

// Add this variable declaration after line 14 in quizController.js  
let answerChoiceStatsService = null;

/**
 * 3. Update the setupSocketMiddleware function around line 285:
 */

// REPLACE the existing setupSocketMiddleware function with this updated version:
const setupSocketMiddleware = (io) => {
    // Initialize services with io
    quizRealtimeService = new QuizRealtimeService(io);
    answerChoiceStatsService = new AnswerChoiceStatsService(io); // ADD THIS LINE

    io.on('connection', (socket) => {
        // ... existing socket handlers ...

        // ADD NEW SOCKET EVENT for getting live choice stats
        socket.on('getLiveChoiceStats', async (data) => {
            try {
                const { quizId, questionId } = data;
                const stats = await answerChoiceStatsService.getChoiceStats(quizId, questionId);
                
                socket.emit('liveChoiceStatsUpdate', {
                    quiz_id: quizId,
                    question_id: questionId,
                    choice_stats: stats,
                    timestamp: Date.now()
                });
            } catch (error) {
                console.error('Error getting live choice stats:', error);
                socket.emit('error', { message: 'Error getting live choice stats' });
            }
        });

        // ... existing socket handlers ...
    });
};

/**
 * 4. Update the submitAnswer function around line 2309:
 */

// FIND this section in submitAnswer function (around line 2309):
// await quizRealtimeService.saveRealtimeAnswer(
//     quizId,
//     userId,
//     questionId,
//     answerId,
//     isCorrect,
//     responseTime,
//     scoreResult
// );

// ADD THIS CODE IMMEDIATELY AFTER the saveRealtimeAnswer call:

        // Track answer choice for real-time statistics
        try {
            await answerChoiceStatsService.trackAnswerChoice(
                quizId,
                questionId,
                userId,
                answerId,
                isCorrect
            );
        } catch (error) {
            console.error('Error tracking answer choice:', error);
            // Don't fail the request if choice tracking fails
        }

/**
 * 5. Add new API endpoint for getting choice stats:
 */

// ADD this new function at the end of quizController.js, before module.exports:

const getQuestionChoiceStats = async (req, res) => {
    try {
        const { quizId, questionId } = req.params;
        
        if (!answerChoiceStatsService) {
            return res.status(500).json({
                success: false,
                message: 'Answer Choice Stats Service not initialized'
            });
        }

        const stats = await answerChoiceStatsService.getChoiceStats(
            parseInt(quizId), 
            parseInt(questionId)
        );

        res.json({
            success: true,
            message: 'Lấy thống kê lựa chọn câu trả lời thành công',
            data: {
                quiz_id: parseInt(quizId),
                question_id: parseInt(questionId),
                choice_stats: stats,
                timestamp: Date.now()
            }
        });
    } catch (error) {
        console.error('Error getting question choice stats:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thống kê lựa chọn câu trả lời',
            error: error.message
        });
    }
};

/**
 * 6. Update module.exports to include the new function:
 */

// ADD getQuestionChoiceStats to the module.exports object:
module.exports = {
    // ... existing exports ...
    getQuestionChoiceStats,
    setupSocketMiddleware
};

/**
 * 7. Add route in quizRoutes.js:
 */

// ADD this route in backend/src/routes/quizRoutes.js:
// router.get('/:quizId/question/:questionId/choice-stats', authenticateToken, quizController.getQuestionChoiceStats);

/**
 * SUMMARY OF CHANGES:
 * 
 * 1. Import AnswerChoiceStatsService
 * 2. Initialize answerChoiceStatsService in setupSocketMiddleware  
 * 3. Add socket event handler for live choice stats
 * 4. Track answer choices in submitAnswer function
 * 5. Add API endpoint for getting choice statistics
 * 6. Export new function and ensure setupSocketMiddleware is exported
 * 7. Add route for the new endpoint
 * 
 * These changes enable real-time tracking and display of answer choice statistics
 * without breaking existing functionality.
 */
