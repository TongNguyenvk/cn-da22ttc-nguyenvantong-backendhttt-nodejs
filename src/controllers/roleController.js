const { Role, User } = require('../models');

// Lấy danh sách tất cả vai trò
exports.getAllRoles = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const roles = await Role.findAndCountAll({
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [{ model: User, attributes: ['user_id', 'name'] }],
        });

        res.status(200).json({
            success: true,
            data: {
                totalItems: roles.count,
                totalPages: Math.ceil(roles.count / limit),
                currentPage: parseInt(page),
                roles: roles.rows,
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách vai trò',
            error: error.message
        });
    }
};

// Lấy thông tin chi tiết một vai trò
exports.getRoleById = async (req, res) => {
    try {
        const role = await Role.findByPk(req.params.id, {
            include: [{ model: User, attributes: ['user_id', 'name'] }],
        });

        if (!role) {
            return res.status(404).json({ message: 'Vai trò không tồn tại' });
        }

        res.status(200).json({
            success: true,
            data: role
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin vai trò',
            error: error.message
        });
    }
};

// Tạo một vai trò mới
exports.createRole = async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'Tên vai trò là bắt buộc' });
        }

        const newRole = await Role.create({ name });

        res.status(201).json(newRole);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi tạo vai trò', error: error.message });
    }
};

// Cập nhật thông tin một vai trò
exports.updateRole = async (req, res) => {
    try {
        const { name } = req.body;

        const role = await Role.findByPk(req.params.id);
        if (!role) {
            return res.status(404).json({ message: 'Vai trò không tồn tại' });
        }

        await role.update({ name: name || role.name });

        res.status(200).json(role);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi cập nhật vai trò', error: error.message });
    }
};

// Xóa một vai trò
exports.deleteRole = async (req, res) => {
    const { sequelize } = require('../models');
    const transaction = await sequelize.transaction();
    
    try {
        const roleId = req.params.id;
        const role = await Role.findByPk(roleId);
        
        if (!role) {
            await transaction.rollback();
            return res.status(404).json({ 
                success: false,
                message: 'Vai trò không tồn tại' 
            });
        }

        // Kiểm tra xem Role có đang được sử dụng bởi Users không
        const { User } = require('../models');
        const usersCount = await User.count({
            where: { role_id: roleId },
            transaction
        });

        if (usersCount > 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `Không thể xóa Role vì còn ${usersCount} user(s) đang sử dụng vai trò này. Vui lòng cập nhật role của các users trước.`
            });
        }

        await role.destroy({ transaction });
        await transaction.commit();
        
        res.status(200).json({ 
            success: true,
            message: 'Xóa vai trò thành công' 
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error deleting role:', error);
        res.status(500).json({ 
            success: false,
            message: 'Lỗi khi xóa vai trò', 
            error: error.message 
        });
    }
};