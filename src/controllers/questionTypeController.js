const { QuestionType, Question } = require('../models');

exports.getAllQuestionTypes = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const questionTypes = await QuestionType.findAndCountAll({
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [{ model: Question, attributes: ['question_id', 'question_text'] }],
        });

        res.status(200).json({success: true, data: {totalItems: questionTypes.count,
            totalPages: Math.ceil(questionTypes.count / limit),
            currentPage: parseInt(page),
            questionTypes: questionTypes.rows,
        }});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi lấy danh sách QuestionType', error: error.message });
    }
};

exports.getQuestionTypeById = async (req, res) => {
    try {
        const questionType = await QuestionType.findByPk(req.params.id, {
            include: [{ model: Question, attributes: ['question_id', 'question_text'] }],
        });

        if (!questionType) return res.status(404).json({success: false, message: 'QuestionType không tồn tại' });
        res.status(200).json({success: true, data: questionType});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi lấy thông tin QuestionType', error: error.message });
    }
};

exports.createQuestionType = async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({success: false, message: 'Tên QuestionType là bắt buộc' });
        }

        const newQuestionType = await QuestionType.create({ name });
        res.status(201).json({success: true, data: newQuestionType});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi tạo QuestionType', error: error.message });
    }
};

exports.updateQuestionType = async (req, res) => {
    try {
        const { name } = req.body;

        const questionType = await QuestionType.findByPk(req.params.id);
        if (!questionType) return res.status(404).json({success: false, message: 'QuestionType không tồn tại' });

        await questionType.update({ name: name || questionType.name });
        res.status(200).json({success: true, data: questionType});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi cập nhật QuestionType', error: error.message });
    }
};

exports.deleteQuestionType = async (req, res) => {
    const { sequelize } = require('../models');
    const transaction = await sequelize.transaction();
    
    try {
        const questionTypeId = req.params.id;
        const questionType = await QuestionType.findByPk(questionTypeId);
        
        if (!questionType) {
            await transaction.rollback();
            return res.status(404).json({
                success: false, 
                message: 'QuestionType không tồn tại' 
            });
        }

        // Kiểm tra xem QuestionType có đang được sử dụng trong Questions không
        const { Question } = require('../models');
        const questionsCount = await Question.count({
            where: { question_type_id: questionTypeId },
            transaction
        });

        if (questionsCount > 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `Không thể xóa QuestionType vì còn ${questionsCount} câu hỏi đang sử dụng loại này. Vui lòng cập nhật loại câu hỏi trước.`
            });
        }

        await questionType.destroy({ transaction });
        await transaction.commit();
        
        res.status(200).json({
            success: true, 
            data: { message: 'Xóa QuestionType thành công' }
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error deleting question type:', error);
        res.status(500).json({
            success: false, 
            message: 'Lỗi khi xóa QuestionType', 
            error: error.message 
        });
    }
};