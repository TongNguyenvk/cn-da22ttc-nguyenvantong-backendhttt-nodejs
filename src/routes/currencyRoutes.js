const express = require('express');
const router = express.Router();
const CurrencyController = require('../controllers/currencyController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');



// =====================================================
// PUBLIC ROUTES (Authenticated users)
// =====================================================



router.get('/balance',
    authenticateToken,
    CurrencyController.getUserBalances
);

router.get('/transactions',
    authenticateToken,
    CurrencyController.getUserTransactionHistory
);




router.get('/list',
    authenticateToken,
    CurrencyController.getCurrencyList
);



router.get('/stats',
    authenticateToken,
    CurrencyController.getCurrencyStatistics
);



router.get('/earning-sources',
    authenticateToken,
    CurrencyController.getTopEarningSources
);



router.get('/leaderboard',
    authenticateToken,
    CurrencyController.getWealthLeaderboard
);



router.post('/initialize',
    authenticateToken,
    CurrencyController.initializeUserCurrencies
);



router.post('/sync',
    authenticateToken,
    CurrencyController.syncUserCurrencies
);



router.post('/daily-login',
    authenticateToken,
    CurrencyController.awardDailyLoginBonus
);


router.post('/spend',
    authenticateToken,
    CurrencyController.spendCurrency
);

router.post('/earn',
    authenticateToken,
    CurrencyController.earnCurrency
);

// =====================================================
// ADMIN ROUTES
// =====================================================


router.post('/award',
    authenticateToken,
    authorize(['admin']),
    CurrencyController.awardCurrency
);

// =====================================================
// API DOCUMENTATION ENDPOINT
// =====================================================


module.exports = router;
