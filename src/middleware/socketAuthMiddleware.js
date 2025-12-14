// backend/src/middleware/socketAuthMiddleware.js
// Socket.IO JWT Authentication Middleware

const jwt = require('jsonwebtoken');
const { User, Role } = require('../models');

/**
 * Socket.IO middleware để xác thực JWT token
 * Kiểm tra token từ auth object hoặc handshake headers
 */
const authenticateSocketToken = async (socket, next) => {
    try {
        // Lấy token từ auth object hoặc headers
        const token = socket.handshake.auth?.token || 
                     socket.handshake.headers?.authorization?.split(' ')[1];

        if (!token) {
            console.log(`Socket ${socket.id}: No token provided`);
            return next(new Error('Authentication token required'));
        }

        // Xác thực token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Lấy thông tin user từ database
        const user = await User.findByPk(decoded.user_id, {
            include: [{ model: Role, as: 'Role' }],
            attributes: ['user_id', 'name', 'email', 'role_id']
        });

        if (!user) {
            console.log(`Socket ${socket.id}: User not found for token`);
            return next(new Error('User not found'));
        }

        // Gắn thông tin user vào socket
        socket.user = {
            user_id: user.user_id,
            name: user.name,
            email: user.email,
            role: user.Role.name,
            role_id: user.role_id
        };

        // Log successful authentication
        console.log(`Socket ${socket.id}: Authenticated as ${user.name} (${user.Role.name})`);
        
        next();
    } catch (error) {
        console.log(`Socket ${socket.id}: Authentication failed:`, error.message);
        next(new Error('Invalid or expired token'));
    }
};

/**
 * Middleware kiểm tra quyền cho socket events
 * @param {string[]} allowedRoles - Danh sách roles được phép
 */
const authorizeSocketRoles = (allowedRoles = []) => {
    return (socket, next) => {
        try {
            if (!socket.user) {
                return next(new Error('User not authenticated'));
            }

            if (allowedRoles.length && !allowedRoles.includes(socket.user.role)) {
                console.log(`Socket ${socket.id}: Access denied for role ${socket.user.role}`);
                return next(new Error('Insufficient permissions'));
            }

            next();
        } catch (error) {
            next(new Error('Authorization failed'));
        }
    };
};

/**
 * Wrapper function để xác thực socket event handlers
 * @param {Function} handler - Event handler function
 * @param {string[]} allowedRoles - Roles được phép (optional)
 */
const withAuth = (handler, allowedRoles = []) => {
    return async (socket, data) => {
        try {
            // Kiểm tra authentication
            if (!socket.user) {
                socket.emit('error', { 
                    message: 'Authentication required',
                    code: 'AUTH_REQUIRED'
                });
                return;
            }

            // Kiểm tra authorization nếu có
            if (allowedRoles.length && !allowedRoles.includes(socket.user.role)) {
                socket.emit('error', { 
                    message: 'Insufficient permissions',
                    code: 'INSUFFICIENT_PERMISSIONS'
                });
                return;
            }

            // Thực thi handler
            await handler(socket, data);
        } catch (error) {
            console.error('Socket event error:', error);
            socket.emit('error', { 
                message: 'Internal server error',
                code: 'INTERNAL_ERROR'
            });
        }
    };
};

module.exports = {
    authenticateSocketToken,
    authorizeSocketRoles,
    withAuth
};
