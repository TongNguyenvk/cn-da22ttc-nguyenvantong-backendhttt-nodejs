const server = require('./app');
const { checkAndEndExpiredQuizzes } = require('./controllers/quizController');
const cron = require('node-cron');
const cleanupTempMedia = require('./scripts/cleanupTempMedia');
// const analyticsBackgroundJobs = require('./services/analyticsBackgroundJobs');

const PORT = process.env.PORT || 8888;

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`WebSocket server is running on ws://localhost:${PORT}`);

    // Bắt đầu kiểm tra quiz hết thời gian
    setInterval(() => {
        checkAndEndExpiredQuizzes(server.io);
    }, 60000);

    // =====================================================
    // CLEANUP TEMP MEDIA FILES
    // =====================================================
    
    // Schedule cleanup job (daily at 2 AM)
    cron.schedule('0 2 * * *', () => {
        console.log('🧹 Running scheduled temp media cleanup...');
        cleanupTempMedia();
    });
    
    console.log('✅ Temp media cleanup job scheduled (daily at 2 AM)');

    // =====================================================
    // START ANALYTICS BACKGROUND JOBS
    // =====================================================

    console.log('🚀 Initializing Analytics Background Jobs...');

    // Start the analytics scheduler
    // analyticsBackgroundJobs.startScheduler();

    // Graceful shutdown handling
    process.on('SIGTERM', () => {
        console.log('📡 Received SIGTERM, shutting down gracefully...');
        // analyticsBackgroundJobs.stopScheduler();
        server.close(() => {
            console.log('✅ Server closed');
            process.exit(0);
        });
    });

    process.on('SIGINT', () => {
        console.log('📡 Received SIGINT, shutting down gracefully...');
        // analyticsBackgroundJobs.stopScheduler();
        server.close(() => {
            console.log('✅ Server closed');
            process.exit(0);
        });
    });
});