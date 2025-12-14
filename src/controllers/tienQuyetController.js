const { TienQuyet, Subject } = require('../models');

exports.getAllTienQuyets = async (req, res) => {
    try {
        const tienQuyets = await TienQuyet.findAll({
            include: [
                { model: Subject, as: 'Subject', attributes: ['subject_id', 'name'] },
                { model: Subject, as: 'PrerequisiteSubjects', attributes: ['subject_id', 'name'] },
            ],
        });

        res.status(200).json({success: true, data: tienQuyets});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi lấy danh sách TienQuyet', error: error.message });
    }
};

exports.getTienQuyetById = async (req, res) => {
    try {
        const { subject_id, prerequisite_subject_id } = req.params;

        const tienQuyet = await TienQuyet.findOne({
            where: { subject_id, prerequisite_subject_id },
            include: [
                { model: Subject, as: 'Subject', attributes: ['subject_id', 'name'] },
                { model: Subject, as: 'PrerequisiteSubjects', attributes: ['subject_id', 'name'] },
            ],
        });

        if (!tienQuyet) return res.status(404).json({success: false, message: 'TienQuyet không tồn tại' });
        res.status(200).json({success: true, data: tienQuyet});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi lấy thông tin TienQuyet', error: error.message });
    }
};

exports.createTienQuyet = async (req, res) => {
    try {
        const { subject_id, prerequisite_subject_id } = req.body;

        if (!subject_id || !prerequisite_subject_id) {
            return res.status(400).json({success: false, message: 'Thiếu các trường bắt buộc' });
        }

        const subject = await Subject.findByPk(subject_id);
        const prerequisiteSubject = await Subject.findByPk(prerequisite_subject_id);

        if (!subject) return res.status(400).json({success: false, message: 'Subject không tồn tại' });
        if (!prerequisiteSubject) return res.status(400).json({success: false, message: 'Prerequisite Subject không tồn tại' });

        const newTienQuyet = await TienQuyet.create({ subject_id, prerequisite_subject_id });
        res.status(201).json({success: true, data: newTienQuyet});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi tạo TienQuyet', error: error.message });
    }
};

exports.deleteTienQuyet = async (req, res) => {
    try {
        const { subject_id, prerequisite_subject_id } = req.params;

        const tienQuyet = await TienQuyet.findOne({ where: { subject_id, prerequisite_subject_id } });
        if (!tienQuyet) return res.status(404).json({success: false, message: 'TienQuyet không tồn tại' });

        await tienQuyet.destroy();
        res.status(200).json({success: true, data: {message: 'Xóa TienQuyet thành công' }});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi xóa TienQuyet', error: error.message });
    }
};