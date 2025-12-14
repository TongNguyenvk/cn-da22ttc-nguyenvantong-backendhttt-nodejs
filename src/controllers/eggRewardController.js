const EggRewardService = require('../services/eggRewardService');
const { EggType } = require('../models');

class EggRewardController {
    /**
     * Get user's egg inventory
     * GET /api/eggs/inventory
     */
    static async getUserEggInventory(req, res) {
        try {
            const userId = req.user.user_id;
            
            const result = await EggRewardService.getUserEggInventory(userId);
            
            if (result.success) {
                res.status(200).json({
                    success: true,
                    message: result.message,
                    data: result.data
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: result.message,
                    error: result.error
                });
            }
        } catch (error) {
            console.error('Error in getUserEggInventory:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    /**
     * Open an egg
     * POST /api/eggs/open
     */
    static async openEgg(req, res) {
        try {
            const userId = req.user.user_id;
            const { user_egg_id } = req.body;

            if (!user_egg_id) {
                return res.status(400).json({
                    success: false,
                    message: 'User egg ID is required'
                });
            }

            const result = await EggRewardService.openEgg(userId, user_egg_id);
            
            if (result.success) {
                res.status(200).json({
                    success: true,
                    message: result.message,
                    data: result.data
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: result.message,
                    error: result.error
                });
            }
        } catch (error) {
            console.error('Error in openEgg:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    /**
     * Purchase egg from shop
     * POST /api/eggs/purchase
     */
    static async purchaseEgg(req, res) {
        try {
            const userId = req.user.user_id;
            const { egg_type_id, quantity = 1 } = req.body;

            if (!egg_type_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Egg type ID is required'
                });
            }

            if (quantity < 1 || quantity > 10) {
                return res.status(400).json({
                    success: false,
                    message: 'Quantity must be between 1 and 10'
                });
            }

            const result = await EggRewardService.purchaseEgg(userId, egg_type_id, quantity);
            
            if (result.success) {
                res.status(200).json({
                    success: true,
                    message: result.message,
                    data: result.data
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: result.message,
                    error: result.error
                });
            }
        } catch (error) {
            console.error('Error in purchaseEgg:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    /**
     * Get egg shop data
     * GET /api/eggs/shop
     */
    static async getEggShop(req, res) {
        try {
            const result = await EggRewardService.getEggShop();
            
            if (result.success) {
                res.status(200).json({
                    success: true,
                    message: result.message,
                    data: result.data
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: result.message,
                    error: result.error
                });
            }
        } catch (error) {
            console.error('Error in getEggShop:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    /**
     * Get all egg types (for browsing)
     * GET /api/eggs/types
     */
    static async getAllEggTypes(req, res) {
        try {
            const eggTypes = await EggType.getAvailableEggTypes();
            
            const formattedEggTypes = eggTypes.map(eggType => eggType.getFormattedInfo());

            res.status(200).json({
                success: true,
                message: 'Egg types retrieved successfully',
                data: {
                    egg_types: formattedEggTypes,
                    total_types: formattedEggTypes.length
                }
            });
        } catch (error) {
            console.error('Error in getAllEggTypes:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    /**
     * Get egg types by rarity
     * GET /api/eggs/types/rarity/:rarity
     */
    static async getEggTypesByRarity(req, res) {
        try {
            const { rarity } = req.params;
            
            const validRarities = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHICAL'];
            if (!validRarities.includes(rarity.toUpperCase())) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid rarity. Valid rarities: ' + validRarities.join(', ')
                });
            }

            const eggTypes = await EggType.getEggTypesByRarity(rarity.toUpperCase());
            
            const formattedEggTypes = eggTypes.map(eggType => eggType.getFormattedInfo());

            res.status(200).json({
                success: true,
                message: `${rarity} egg types retrieved successfully`,
                data: {
                    rarity: rarity.toUpperCase(),
                    egg_types: formattedEggTypes,
                    total_types: formattedEggTypes.length
                }
            });
        } catch (error) {
            console.error('Error in getEggTypesByRarity:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    /**
     * Get egg type details with rewards
     * GET /api/eggs/types/:eggTypeId
     */
    static async getEggTypeDetails(req, res) {
        try {
            const { eggTypeId } = req.params;

            const eggType = await EggType.getEggTypeWithRewards(parseInt(eggTypeId));
            
            if (!eggType) {
                return res.status(404).json({
                    success: false,
                    message: 'Egg type not found'
                });
            }

            const formattedRewards = eggType.Rewards ? 
                eggType.Rewards.map(reward => reward.getFormattedInfo()) : [];

            res.status(200).json({
                success: true,
                message: 'Egg type details retrieved successfully',
                data: {
                    egg_type: eggType.getFormattedInfo(),
                    rewards: formattedRewards,
                    total_rewards: formattedRewards.length
                }
            });
        } catch (error) {
            console.error('Error in getEggTypeDetails:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    /**
     * Award egg by trigger (for internal use)
     * POST /api/eggs/award
     */
    static async awardEggByTrigger(req, res) {
        try {
            const userId = req.user.user_id;
            const { trigger_type, trigger_data = {} } = req.body;

            if (!trigger_type) {
                return res.status(400).json({
                    success: false,
                    message: 'Trigger type is required'
                });
            }

            const validTriggers = ['QUIZ_COMPLETION', 'STREAK_ACHIEVEMENT', 'PERFECT_SCORE', 'LEVEL_UP', 'DAILY_LOGIN'];
            if (!validTriggers.includes(trigger_type)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid trigger type. Valid triggers: ' + validTriggers.join(', ')
                });
            }

            const result = await EggRewardService.awardEggByTrigger(userId, trigger_type, trigger_data);
            
            if (result.success) {
                res.status(200).json({
                    success: true,
                    message: result.message,
                    data: result.data
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: result.message,
                    error: result.error
                });
            }
        } catch (error) {
            console.error('Error in awardEggByTrigger:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }
}

module.exports = EggRewardController;
