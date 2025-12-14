const { TypeOfKnowledge, Group, Subject } = require('../models');

exports.getAllTypeOfKnowledges = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const typeOfKnowledges = await TypeOfKnowledge.findAndCountAll({
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                { model: Group, attributes: ['khoi_id', 'name'] },
                { model: Subject, attributes: ['subject_id', 'name'] },
            ],
        });

        res.status(200).json({success: true, data: {totalItems: typeOfKnowledges.count,
            totalPages: Math.ceil(typeOfKnowledges.count / limit),
            currentPage: parseInt(page),
            typeOfKnowledges: typeOfKnowledges.rows,
        }});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi lấy danh sách TypeOfKnowledge', error: error.message });
    }
};

exports.getTypeOfKnowledgeById = async (req, res) => {
    try {
        const typeOfKnowledge = await TypeOfKnowledge.findByPk(req.params.id, {
            include: [
                { model: Group, attributes: ['khoi_id', 'name'] },
                { model: Subject, attributes: ['subject_id', 'name'] },
            ],
        });

        if (!typeOfKnowledge) return res.status(404).json({success: false, message: 'TypeOfKnowledge không tồn tại' });
        res.status(200).json({success: true, data: typeOfKnowledge});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi lấy thông tin TypeOfKnowledge', error: error.message });
    }
};

exports.createTypeOfKnowledge = async (req, res) => {
    try {
        const { khoi_id, description } = req.body;

        if (!khoi_id) {
            return res.status(400).json({success: false, message: 'Thiếu trường bắt buộc: khoi_id' });
        }

        const group = await Group.findByPk(khoi_id);
        if (!group) return res.status(400).json({success: false, message: 'Group không tồn tại' });

        const newTypeOfKnowledge = await TypeOfKnowledge.create({ khoi_id, description });
        res.status(201).json({success: true, data: newTypeOfKnowledge});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi tạo TypeOfKnowledge', error: error.message });
    }
};

exports.updateTypeOfKnowledge = async (req, res) => {
    try {
        const { khoi_id, description } = req.body;

        const typeOfKnowledge = await TypeOfKnowledge.findByPk(req.params.id);
        if (!typeOfKnowledge) return res.status(404).json({success: false, message: 'TypeOfKnowledge không tồn tại' });

        if (khoi_id) {
            const group = await Group.findByPk(khoi_id);
            if (!group) return res.status(400).json({success: false, message: 'Group không tồn tại' });
        }

        await typeOfKnowledge.update({
            khoi_id: khoi_id || typeOfKnowledge.khoi_id,
            description: description || typeOfKnowledge.description,
        });

        res.status(200).json({success: true, data: typeOfKnowledge});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi cập nhật TypeOfKnowledge', error: error.message });
    }
};

exports.deleteTypeOfKnowledge = async (req, res) => {
    try {
        const typeOfKnowledge = await TypeOfKnowledge.findByPk(req.params.id);
        if (!typeOfKnowledge) return res.status(404).json({success: false, message: 'TypeOfKnowledge không tồn tại' });

        await typeOfKnowledge.destroy();
        res.status(200).json({success: true, data: {message: 'Xóa TypeOfKnowledge thành công' }});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi xóa TypeOfKnowledge', error: error.message });
    }
};