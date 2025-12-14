// redis/redis.js
const { createClient } = require('redis');
require('dotenv').config();

// Tạo client Redis với cấu hình bảo mật
const redisClient = createClient({
    url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
    password: process.env.REDIS_PASSWORD,
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > 20) {
                console.error('Max reconnection attempts reached');
                return new Error('Max reconnection attempts reached');
            }
            return Math.min(retries * 200, 5000);
        },
        connectTimeout: 10000, // 10 seconds
        tls: false, // Disable TLS for now to troubleshoot connection issues
        rejectUnauthorized: false
    },
    // Thêm các tùy chọn bảo mật
    disableOfflineQueue: false, // Enable offline queue to handle temporary disconnections
    retryStrategy: (times) => {
        if (times > 5) {
            return new Error('Max retries reached');
        }
        return Math.min(times * 2000, 5000);
    }
});

// Xử lý lỗi kết nối
redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
    // Thử kết nối lại sau 5 giây
    setTimeout(() => {
        if (!redisClient.isOpen) {
            console.log('Attempting to reconnect to Redis...');
            redisClient.connect().catch(console.error);
        }
    }, 5000);
});

// Xử lý kết nối thành công
redisClient.on('connect', () => {
    console.log('Redis Client Connected');
    // Thiết lập timeout cho client
    redisClient.configSet('timeout', '300').catch(console.error);
});

// Xử lý kết nối lại
redisClient.on('reconnecting', () => {
    console.log('Redis Client Reconnecting...');
});

// Hàm kết nối Redis
const connectRedis = async () => {
    try {
        if (!redisClient.isOpen) {
            console.log('Establishing Redis connection...');
            await redisClient.connect();
            console.log('Redis connection established');
        }
        return redisClient;
    } catch (err) {
        console.error('Failed to connect to Redis:', err);
        throw err;
    }
};

// Export redisClient
module.exports = {
    redisClient,
    connectRedis
};