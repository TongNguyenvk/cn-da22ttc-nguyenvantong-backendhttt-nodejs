// src/socket.js
const socketIO = require("socket.io");
const {
  authenticateSocketToken,
} = require("./middleware/socketAuthMiddleware");

/**
 * Lấy danh sách allowed origins từ biến môi trường
 * Fallback về default origins nếu không có trong env
 */
const getAllowedOrigins = () => {
  const envOrigins = process.env.SOCKET_ALLOWED_ORIGINS;

  if (envOrigins) {
    return envOrigins.split(",").map((origin) => origin.trim());
  }

  // Default origins cho development
  return [
    "https://stardust.id.vn",
    "https://www.stardust.id.vn",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://frontend:3000",
  ];
};

const init = (server) => {
  const io = socketIO(server, {
    path: "/socket.io", // Khớp với location trong Nginx
    cors: {
      origin: getAllowedOrigins(),
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
    },
    // Thêm cấu hình authentication timeout
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Áp dụng JWT authentication middleware cho tất cả connections
  io.use(authenticateSocketToken);

  io.on("connection", (socket) => {
    console.log(
      `✅ Authenticated client connected: ${socket.id} (User: ${socket.user.name})`
    );

    // Tự động join user vào room cá nhân
    socket.join(`user:${socket.user.user_id}`);

    // Join role-based room
    socket.join(`role:${socket.user.role}`);

    // Xử lý khi client tham gia vào phòng
    socket.on("joinRoom", (room) => {
      // Validate room format và quyền truy cập
      if (typeof room !== "string" || room.length === 0) {
        socket.emit("error", { message: "Invalid room name" });
        return;
      }

      socket.join(room);
      console.log(
        `Client ${socket.id} (${socket.user.name}) joined room: ${room}`
      );

      // Thông báo cho các thành viên khác trong room
      socket.to(room).emit("userJoined", {
        user_id: socket.user.user_id,
        name: socket.user.name,
        timestamp: Date.now(),
      });
    });

    // Xử lý khi client rời khỏi phòng
    socket.on("leaveRoom", (room) => {
      if (typeof room !== "string" || room.length === 0) {
        socket.emit("error", { message: "Invalid room name" });
        return;
      }

      socket.leave(room);
      console.log(
        `Client ${socket.id} (${socket.user.name}) left room: ${room}`
      );

      // Thông báo cho các thành viên khác trong room
      socket.to(room).emit("userLeft", {
        user_id: socket.user.user_id,
        name: socket.user.name,
        timestamp: Date.now(),
      });
    });

    // Xử lý khi client ngắt kết nối
    socket.on("disconnect", (reason) => {
      console.log(
        `Client disconnected: ${socket.id} (${socket.user.name}) - Reason: ${reason}`
      );
    });

    // Handle connection errors
    socket.on("error", (error) => {
      console.error(`Socket error for ${socket.id}:`, error);
    });
  });

  return io;
};

module.exports = { init };
