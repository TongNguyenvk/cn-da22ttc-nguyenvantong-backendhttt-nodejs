const express = require('express');
const router = express.Router();
const statisticsController = require('../controllers/statisticsController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

// Admin dashboard - Admin only
router.get('/dashboard', 
    authenticateToken, 
    authorize(['admin']), 
    statisticsController.getAdminDashboard
);

// Comparative statistics - Admin and Teacher
router.get('/comparative', 
    authenticateToken, 
    authorize(['admin', 'teacher']), 
    statisticsController.getComparativeStatistics
);

// Trend analysis - Admin and Teacher
router.get('/trends', 
    authenticateToken, 
    authorize(['admin', 'teacher']), 
    statisticsController.getTrendAnalysis
);

// Detailed performance report - Admin and Teacher
router.get('/performance/detailed', 
    authenticateToken, 
    authorize(['admin', 'teacher']), 
    statisticsController.getDetailedPerformanceReport
);

module.exports = router;
