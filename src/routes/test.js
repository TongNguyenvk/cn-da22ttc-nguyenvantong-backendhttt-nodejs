const express = require('express');
const router = express.Router();
const { connectRedis } = require('../redis/redis');

// Test Redis connection and basic operations
router.post('/test-redis', async (req, res) => {
    try {
        const { key, value } = req.body;
        const redisClient = await connectRedis();

        // Set value
        await redisClient.set(key, value);

        // Get value
        const storedValue = await redisClient.get(key);

        res.json({
            success: true,
            message: 'Redis test successful',
            data: {
                key,
                storedValue
            }
        });
    } catch (error) {
        console.error('Redis test error:', error);
        res.status(500).json({
            success: false,
            message: 'Redis test failed',
            error: error.message
        });
    }
});

module.exports = router; 