// redis/utils.js
const { redisClient, connectRedis } = require('./redis');

// Đảm bảo kết nối Redis
connectRedis().catch(err => {
    console.error('Failed to connect to Redis:', err);
});

// Hàm lưu cache
const setCache = async (key, value, ttl = 3600) => {
    try {
        await redisClient.set(key, JSON.stringify(value), 'EX', ttl);
    } catch (err) {
        console.error('Error setting cache:', err);
    }
};

// Hàm lấy cache
const getCache = async (key) => {
    try {
        const data = await redisClient.get(key);
        return data ? JSON.parse(data) : null;
    } catch (err) {
        console.error('Error getting cache:', err);
        return null;
    }
};

// Hàm xóa cache
const deleteCache = async (key) => {
    try {
        await redisClient.del(key);
    } catch (err) {
        console.error('Error deleting cache:', err);
    }
};

// Hàm xóa cache theo pattern
const deleteCacheByPattern = async (pattern) => {
    try {
        const keys = await redisClient.keys(pattern);
        if (keys.length > 0) {
            await redisClient.del(keys);
        }
    } catch (err) {
        console.error('Error deleting cache by pattern:', err);
    }
};

// Hàm set lock (NX) để tránh chạy trùng
const acquireLock = async (key, ttl = 60) => {
    try {
        const result = await redisClient.set(key, 'locked', 'NX', 'EX', ttl);
        return result === 'OK';
    } catch (err) {
        console.error('Error acquiring lock:', err);
        return false;
    }
};

// Hàm release lock
const releaseLock = async (key) => {
    try {
        await redisClient.del(key);
    } catch (err) {
        console.error('Error releasing lock:', err);
    }
};

// Hàm gia hạn lock (refresh TTL)
const extendLock = async (key, ttl = 60) => {
    try {
        await redisClient.expire(key, ttl);
    } catch (err) {
        console.error('Error extending lock TTL:', err);
    }
};

module.exports = {
    setCache,
    getCache,
    deleteCache,
    deleteCacheByPattern,
    acquireLock,
    releaseLock,
    extendLock
};