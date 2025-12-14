const { Group, TypeOfKnowledge } = require('../models');

exports.getAllGroups = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const groups = await Group.findAndCountAll({
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [{ model: TypeOfKnowledge, attributes: ['noidung_id', 'description'] }],
        });

        res.status(200).json({
            success: true,
            data: {
                totalItems: groups.count,
                totalPages: Math.ceil(groups.count / limit),
                currentPage: parseInt(page),
                groups: groups.rows,
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách Group',
            error: error.message
        });
    }
};

exports.getGroupById = async (req, res) => {
    try {
        const group = await Group.findByPk(req.params.id, {
            include: [{ model: TypeOfKnowledge, attributes: ['noidung_id', 'description'] }],
        });

        if (!group) {
            return res.status(404).json({
                success: false,
                message: 'Group không tồn tại'
            });
        }

        res.status(200).json({
            success: true,
            data: group
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin Group',
            error: error.message
        });
    }
};

exports.createGroup = async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({success: false, message: 'Tên Group là bắt buộc' });
        }

        const newGroup = await Group.create({ name });
        res.status(201).json({success: true, data: newGroup});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi tạo Group', error: error.message });
    }
};

exports.updateGroup = async (req, res) => {
    try {
        const { name } = req.body;

        const group = await Group.findByPk(req.params.id);
        if (!group) return res.status(404).json({success: false, message: 'Group không tồn tại' });

        await group.update({ name: name || group.name });
        res.status(200).json({success: true, data: group});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi cập nhật Group', error: error.message });
    }
};

exports.deleteGroup = async (req, res) => {
    try {
        const group = await Group.findByPk(req.params.id);
        if (!group) return res.status(404).json({success: false, message: 'Group không tồn tại' });

        await group.destroy();
        res.status(200).json({success: true, data: {message: 'Xóa Group thành công' }});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi xóa Group', error: error.message });
    }
};