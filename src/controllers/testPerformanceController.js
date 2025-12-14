/**
 * Simple test endpoint để debug performance issues
 * GET /api/teacher-analytics/test/:quizId
 */
const testPerformance = async (req, res) => {
    try {
        const quizId = req.params.quizId;
        console.log(`Testing performance for quiz ${quizId}`);
        
        const startTime = Date.now();
        
        // Test simple quiz query
        const quiz = await Quiz.findByPk(quizId, {
            attributes: ['quiz_id', 'name', 'course_id']
        });
        
        if (!quiz) {
            return res.status(404).json({ error: 'Quiz not found' });
        }
        
        const simpleTime = Date.now() - startTime;
        console.log(`Simple quiz query took: ${simpleTime}ms`);
        
        // Test with includes
        const complexStartTime = Date.now();
        const complexQuiz = await Quiz.findByPk(quizId, {
            include: [
                {
                    model: Course,
                    as: 'Course',
                    attributes: ['course_id', 'name']
                }
            ]
        });
        
        const complexTime = Date.now() - complexStartTime;
        console.log(`Complex quiz query took: ${complexTime}ms`);
        
        const totalTime = Date.now() - startTime;
        
        return res.json({
            success: true,
            performance: {
                total_time: totalTime,
                simple_query_time: simpleTime,
                complex_query_time: complexTime
            },
            quiz: {
                quiz_id: quiz.quiz_id,
                name: quiz.name,
                course_id: quiz.course_id,
                course_name: complexQuiz?.Course?.name
            }
        });
        
    } catch (error) {
        console.error('Performance test error:', error);
        return res.status(500).json({
            success: false,
            error: 'Performance test failed',
            details: error.message
        });
    }
};

module.exports = {
    // ... existing exports
    testPerformance
};
