const { QuizQuestion, Quiz, Question } = require('../models');

exports.getAllQuizQuestions = async (req, res) => {
    try {
        const quizQuestions = await QuizQuestion.findAll({
            include: [
                { model: Quiz, attributes: ['quiz_id', 'name'] },
                { model: Question, attributes: ['question_id', 'question_text'] },
            ],
        });

        res.status(200).json({success: true, data: quizQuestions});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi lấy danh sách QuizQuestion', error: error.message });
    }
};

exports.getQuizQuestionById = async (req, res) => {
    try {
        const { quiz_id, question_id } = req.params;

        const quizQuestion = await QuizQuestion.findOne({
            where: { quiz_id, question_id },
            include: [
                { model: Quiz, attributes: ['quiz_id', 'name'] },
                { model: Question, attributes: ['question_id', 'question_text'] },
            ],
        });

        if (!quizQuestion) return res.status(404).json({success: false, message: 'QuizQuestion không tồn tại' });
        res.status(200).json({success: true, data: quizQuestion});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi lấy thông tin QuizQuestion', error: error.message });
    }
};

exports.createQuizQuestion = async (req, res) => {
    try {
        const { quiz_id, question_id } = req.body;

        if (!quiz_id || !question_id) {
            return res.status(400).json({success: false, message: 'Thiếu các trường bắt buộc' });
        }

        const quiz = await Quiz.findByPk(quiz_id);
        const question = await Question.findByPk(question_id);

        if (!quiz) return res.status(400).json({success: false, message: 'Quiz không tồn tại' });
        if (!question) return res.status(400).json({success: false, message: 'Question không tồn tại' });

        const newQuizQuestion = await QuizQuestion.create({ quiz_id, question_id });
        res.status(201).json({success: true, data: newQuizQuestion});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi tạo QuizQuestion', error: error.message });
    }
};

exports.deleteQuizQuestion = async (req, res) => {
    try {
        const { quiz_id, question_id } = req.params;

        const quizQuestion = await QuizQuestion.findOne({ where: { quiz_id, question_id } });
        if (!quizQuestion) return res.status(404).json({success: false, message: 'QuizQuestion không tồn tại' });

        await quizQuestion.destroy();
        res.status(200).json({success: true, data: {message: 'Xóa QuizQuestion thành công' }});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi xóa QuizQuestion', error: error.message });
    }
};