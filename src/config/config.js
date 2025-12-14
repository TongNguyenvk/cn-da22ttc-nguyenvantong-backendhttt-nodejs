require('dotenv').config();

module.exports = {
    development: {
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5433,
        dialect: 'postgres',
        timezone: '+07:00', // Sử dụng timezone offset cho Việt Nam
        define: {
            timestamps: false, // Tắt timestamps cho tất cả model
        },
    },
};