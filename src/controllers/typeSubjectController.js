const { TypeSubject, Subject } = require('../models');

exports.getAllTypeSubjects = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const typeSubjects = await TypeSubject.findAndCountAll({
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [{ model: Subject, attributes: ['subject_id', 'name'] }],
        });

        res.status(200).json({success: true, data: {totalItems: typeSubjects.count,
            totalPages: Math.ceil(typeSubjects.count / limit),
            currentPage: parseInt(page),
            typeSubjects: typeSubjects.rows,
        }});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi lấy danh sách TypeSubject', error: error.message });
    }
};

exports.getTypeSubjectById = async (req, res) => {
    try {
        const typeSubject = await TypeSubject.findByPk(req.params.id, {
            include: [{ model: Subject, attributes: ['subject_id', 'name'] }],
        });

        if (!typeSubject) return res.status(404).json({success: false, message: 'TypeSubject không tồn tại' });
        res.status(200).json({success: true, data: typeSubject});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi lấy thông tin TypeSubject', error: error.message });
    }
};

exports.createTypeSubject = async (req, res) => {
    try {
        const { description } = req.body;

        const newTypeSubject = await TypeSubject.create({ description });
        res.status(201).json({success: true, data: newTypeSubject});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi tạo TypeSubject', error: error.message });
    }
};

exports.updateTypeSubject = async (req, res) => {
    try {
        const { description } = req.body;

        const typeSubject = await TypeSubject.findByPk(req.params.id);
        if (!typeSubject) return res.status(404).json({success: false, message: 'TypeSubject không tồn tại' });

        await typeSubject.update({ description: description || typeSubject.description });
        res.status(200).json({success: true, data: typeSubject});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi cập nhật TypeSubject', error: error.message });
    }
};

exports.deleteTypeSubject = async (req, res) => {
    try {
        const typeSubject = await TypeSubject.findByPk(req.params.id);
        if (!typeSubject) return res.status(404).json({success: false, message: 'TypeSubject không tồn tại' });

        await typeSubject.destroy();
        res.status(200).json({success: true, data: {message: 'Xóa TypeSubject thành công' }});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi xóa TypeSubject', error: error.message });
    }
};