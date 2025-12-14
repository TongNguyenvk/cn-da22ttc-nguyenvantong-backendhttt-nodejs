const jwt = require('jsonwebtoken');
const { User, Role } = require('../models');

// Middleware xác thực token
const authenticateToken = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ 
                success: false,
                error: 'Không có token, vui lòng đăng nhập' 
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findByPk(decoded.user_id, {
            include: [{ model: Role, as: 'Role' }],
        });
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'Người dùng không tồn tại' 
            });
        }

    req.user = user;
    req.roleName = user.Role.name;
    next();
    } catch (error) {
        res.status(401).json({ 
            success: false,
            error: 'Token không hợp lệ', 
            details: error.message 
        });
    }
};

// Middleware kiểm tra quyền
const authorize = (allowedRoles = []) => {
    return async (req, res, next) => {
        try {
            const token = req.headers.authorization?.split(' ')[1];
            if (!token) {
                return res.status(401).json({ 
                    success: false,
                    error: 'Không có token, vui lòng đăng nhập' 
                });
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findByPk(decoded.user_id, {
                include: [{ model: Role, as: 'Role' }],
            });
            if (!user) {
                return res.status(404).json({ 
                    success: false,
                    error: 'Người dùng không tồn tại' 
                });
            }

            // Kiểm tra vai trò
            const roleName = user.Role.name;
            if (allowedRoles.length && !allowedRoles.includes(roleName)) {
                return res.status(403).json({ 
                    success: false,
                    error: 'Không có quyền truy cập' 
                });
            }

            req.user = user;
            req.roleName = roleName;
            next();
        } catch (error) {
            res.status(401).json({ 
                success: false,
                error: 'Token không hợp lệ', 
                details: error.message 
            });
        }
    };
};

module.exports = { authenticateToken, authorize };