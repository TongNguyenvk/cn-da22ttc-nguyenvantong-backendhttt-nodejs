-- Create test quiz with images
INSERT INTO "Quizzes" (course_id, name, duration, start_time, end_time, status, pin) 
VALUES (1, 'Test Quiz With Images', 30, NOW(), NOW() + INTERVAL '1 hour', 'active', 'TEST01') 
RETURNING quiz_id;

-- Add questions to quiz (assuming quiz_id = 208)
INSERT INTO "QuizQuestions" (quiz_id, question_id) 
VALUES 
    (208, 400),
    (208, 401);

-- Verify
SELECT q.quiz_id, q.name, COUNT(qq.question_id) as question_count
FROM "Quizzes" q
LEFT JOIN "QuizQuestions" qq ON q.quiz_id = qq.quiz_id
WHERE q.quiz_id = 208
GROUP BY q.quiz_id, q.name;
