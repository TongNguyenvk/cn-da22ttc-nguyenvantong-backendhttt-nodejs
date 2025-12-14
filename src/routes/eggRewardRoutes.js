const express = require('express');
const router = express.Router();
const EggRewardController = require('../controllers/eggRewardController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Apply authentication to all routes
router.use(authenticateToken);

// User egg inventory routes
router.get('/inventory', EggRewardController.getUserEggInventory);

// Egg opening routes
router.post('/open', EggRewardController.openEgg);

// Egg shop routes
router.get('/shop', EggRewardController.getEggShop);
router.post('/purchase', EggRewardController.purchaseEgg);

// Egg type browsing routes (specific routes first to avoid conflicts)
router.get('/types', EggRewardController.getAllEggTypes);
router.get('/types/rarity/:rarity', EggRewardController.getEggTypesByRarity);
router.get('/types/:eggTypeId', EggRewardController.getEggTypeDetails);

// Internal egg awarding route (for system use)
router.post('/award', EggRewardController.awardEggByTrigger);

// API Documentation endpoint



module.exports = router;
