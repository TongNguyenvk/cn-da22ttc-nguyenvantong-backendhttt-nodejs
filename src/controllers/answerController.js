const { Answer, Question, MediaFile } = require('../models');

exports.getAllAnswers = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const answers = await Answer.findAndCountAll({
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                { model: Question, attributes: ['question_id', 'question_text'] },
                { model: MediaFile, as: 'MediaFiles', attributes: ['media_id','file_type','file_name','mime_type','alt_text','description','file_size','owner_type'] }
            ],
        });

        const mapped = answers.rows.map(a => ({
            ...a.toJSON(),
            media_files: (a.MediaFiles||[]).map(m => ({ ...m, file_url: m.getFileUrl ? m.getFileUrl(): null }))
        }));

        res.status(200).json({
            success: true,
            data: {
                totalItems: answers.count,
                totalPages: Math.ceil(answers.count / limit),
                currentPage: parseInt(page),
                answers: mapped,
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi khi lấy danh sách Answer', error: error.message });
    }
};

exports.getAnswerById = async (req, res) => {
    try {
        const answer = await Answer.findByPk(req.params.id, {
            include: [
                { model: Question, attributes: ['question_id', 'question_text'] },
                { model: MediaFile, as: 'MediaFiles', attributes: ['media_id','file_type','file_name','mime_type','alt_text','description','file_size','owner_type'] }
            ],
        });

        if (!answer) {
            return res.status(404).json({ success: false, message: 'Answer không tồn tại' });
        }

        const json = answer.toJSON();
        json.media_files = (json.MediaFiles||[]).map(m => ({ ...m, file_url: `/api/answers/${answer.answer_id}/media/${m.file_name}` }));
        delete json.MediaFiles;

        res.status(200).json({ success: true, data: json });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi khi lấy thông tin Answer', error: error.message });
    }
};

exports.createAnswer = async (req, res) => {
    try {
        const { question_id, answer_text, iscorrect } = req.body;

        if (!question_id || !answer_text || iscorrect === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu các trường bắt buộc'
            });
        }

        const question = await Question.findByPk(question_id);
        if (!question) {
            return res.status(400).json({
                success: false,
                message: 'Question không tồn tại'
            });
        }

        const newAnswer = await Answer.create({ question_id, answer_text, iscorrect });
        res.status(201).json({
            success: true,
            data: newAnswer
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo Answer',
            error: error.message
        });
    }
};

exports.updateAnswer = async (req, res) => {
    try {
        const { question_id, answer_text, iscorrect } = req.body;

        const answer = await Answer.findByPk(req.params.id);
        if (!answer) {
            return res.status(404).json({
                success: false,
                message: 'Answer không tồn tại'
            });
        }

        if (question_id) {
            const question = await Question.findByPk(question_id);
            if (!question) {
                return res.status(400).json({
                    success: false,
                    message: 'Question không tồn tại'
                });
            }
        }

        await answer.update({
            question_id: question_id || answer.question_id,
            answer_text: answer_text || answer.answer_text,
            iscorrect: iscorrect !== undefined ? iscorrect : answer.iscorrect,
        });

        res.status(200).json({
            success: true,
            data: answer
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật Answer',
            error: error.message
        });
    }
};

exports.deleteAnswer = async (req, res) => {
    try {
        const answer = await Answer.findByPk(req.params.id);
        if (!answer) {
            return res.status(404).json({
                success: false,
                message: 'Answer không tồn tại'
            });
        }

        await answer.destroy();
        res.status(200).json({
            success: true,
            message: 'Xóa Answer thành công'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa Answer',
            error: error.message
        });
    }
};