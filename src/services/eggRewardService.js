const { EggType, EggReward, UserEgg, EggDropRule, EggOpeningHistory, UserInventory, UserCurrency } = require('../models');
const CurrencyService = require('./currencyService');
const AvatarCustomizationService = require('./avatarCustomizationService');

class EggRewardService {

    static async getUserEggInventory(userId) {
        try {
            const inventory = await UserEgg.getUserEggInventoryGrouped(userId);

            return {
                success: true,
                message: 'Egg inventory retrieved successfully',
                data: {
                    inventory: inventory,
                    total_egg_types: inventory.length,
                    total_eggs: inventory.reduce((sum, group) => sum + group.quantity, 0)
                }
            };
        } catch (error) {
            console.error('Error getting user egg inventory:', error);
            return {
                success: false,
                message: 'Failed to get egg inventory',
                error: error.message
            };
        }
    }



    static async awardEggByTrigger(userId, triggerType, triggerData = {}) {
        try {
            // Get applicable drop rules
            const dropRules = await EggDropRule.findAll({
                where: {
                    trigger_type: triggerType,
                    is_active: true
                },
                include: [{
                    model: EggType,
                    as: 'EggType',
                    where: { is_active: true }
                }]
            });

            const awardedEggs = [];

            for (const rule of dropRules) {
                // Check if trigger condition is met
                if (this.checkTriggerCondition(rule.trigger_condition, triggerData)) {
                    // Check daily limit if applicable
                    if (rule.max_per_day && await this.checkDailyLimit(userId, rule.rule_id, rule.max_per_day)) {
                        continue; // Skip if daily limit reached
                    }

                    // Roll for drop
                    const randomValue = Math.random();
                    if (randomValue <= parseFloat(rule.drop_rate)) {
                        // Award egg
                        const userEgg = await UserEgg.addEggToInventory(
                            userId,
                            rule.egg_type_id,
                            this.getTriggerSource(triggerType)
                        );

                        awardedEggs.push({
                            egg_type: rule.EggType.getFormattedInfo(),
                            user_egg: userEgg.getFormattedInfo(),
                            rule_name: rule.rule_name
                        });
                    }
                }
            }

            return {
                success: true,
                message: awardedEggs.length > 0 ? 'Eggs awarded successfully' : 'No eggs awarded',
                data: {
                    awarded_eggs: awardedEggs,
                    total_awarded: awardedEggs.length
                }
            };
        } catch (error) {
            console.error('Error awarding eggs by trigger:', error);
            return {
                success: false,
                message: 'Failed to award eggs',
                error: error.message
            };
        }
    }

    static async openEggInstantly(userId, eggTypeCode) {
        try {
            // Get egg type by code
            const eggType = await EggType.findOne({
                where: { egg_code: eggTypeCode, is_active: true },
                include: [{
                    model: EggReward,
                    as: 'Rewards',
                    where: { is_active: true },
                    required: false
                }]
            });

            if (!eggType) {
                return {
                    success: false,
                    message: 'Egg type not found'
                };
            }

            // Generate rewards from egg
            const rewards = await this.generateEggRewards(eggType);

            // Process rewards
            const processedRewards = await this.processEggRewards(userId, rewards);

            // Record opening history (without creating UserEgg record)
            await EggOpeningHistory.create({
                user_id: userId,
                egg_type_id: eggType.egg_type_id,
                rewards_received: processedRewards.rewards_data,
                total_value_syncoin: processedRewards.total_syncoin_value,
                total_value_kristal: processedRewards.total_kristal_value,
                was_duplicate: processedRewards.had_duplicates,
                kristal_from_duplicates: processedRewards.kristal_from_duplicates,
                source: 'MINI_GAME_INSTANT'
            });

            return {
                success: true,
                message: 'Egg opened instantly',
                data: {
                    egg_type: eggType.getFormattedInfo(),
                    rewards: processedRewards.rewards_data,
                    summary: {
                        total_rewards: processedRewards.rewards_data.length,
                        syncoin_earned: processedRewards.total_syncoin_value,
                        kristal_earned: processedRewards.total_kristal_value,
                        items_received: processedRewards.items_received,
                        duplicates_converted: processedRewards.kristal_from_duplicates
                    }
                }
            };
        } catch (error) {
            console.error('Error opening egg instantly:', error);
            return {
                success: false,
                message: 'Failed to open egg instantly',
                error: error.message
            };
        }
    }

    static async openEgg(userId, userEggId) {
        try {
            // Get user egg
            const userEgg = await UserEgg.findOne({
                where: {
                    user_egg_id: userEggId,
                    user_id: userId,
                    is_opened: false
                },
                include: [{
                    model: EggType,
                    as: 'EggType',
                    include: [{
                        model: EggReward,
                        as: 'Rewards',
                        where: { is_active: true },
                        required: false
                    }]
                }]
            });

            if (!userEgg) {
                return {
                    success: false,
                    message: 'Egg not found or already opened'
                };
            }

            // Get rewards from egg
            const rewards = await this.generateEggRewards(userEgg.EggType);

            // Process rewards
            const processedRewards = await this.processEggRewards(userId, rewards);

            // Mark egg as opened
            await userEgg.openEgg();

            // Record opening history
            await EggOpeningHistory.create({
                user_id: userId,
                egg_type_id: userEgg.egg_type_id,
                rewards_received: processedRewards.rewards_data,
                total_value_syncoin: processedRewards.total_syncoin_value,
                total_value_kristal: processedRewards.total_kristal_value,
                was_duplicate: processedRewards.had_duplicates,
                kristal_from_duplicates: processedRewards.kristal_from_duplicates
            });

            return {
                success: true,
                message: 'Egg opened successfully',
                data: {
                    egg_type: userEgg.EggType.getFormattedInfo(),
                    rewards: processedRewards.rewards_data,
                    summary: {
                        total_rewards: processedRewards.rewards_data.length,
                        syncoin_earned: processedRewards.total_syncoin_value,
                        kristal_earned: processedRewards.total_kristal_value,
                        items_received: processedRewards.items_received,
                        duplicates_converted: processedRewards.kristal_from_duplicates
                    }
                }
            };
        } catch (error) {
            console.error('Error opening egg:', error);
            return {
                success: false,
                message: 'Failed to open egg',
                error: error.message
            };
        }
    }

    static async purchaseEgg(userId, eggTypeId, quantity = 1) {
        try {
            // Get egg type
            const eggType = await EggType.findByPk(eggTypeId);
            if (!eggType || !eggType.isPurchasable()) {
                return {
                    success: false,
                    message: 'Egg type not available for purchase'
                };
            }

            const purchaseInfo = eggType.getPurchaseInfo();
            const totalCost = purchaseInfo.main_price * quantity;

            // Check if user has enough currency
            const currencyType = purchaseInfo.currency_type;
            const hasEnoughCurrency = await CurrencyService.checkUserBalance(
                userId,
                currencyType,
                totalCost
            );

            if (!hasEnoughCurrency.success || hasEnoughCurrency.data.balance < totalCost) {
                return {
                    success: false,
                    message: `Insufficient ${currencyType}. Need ${totalCost}, have ${hasEnoughCurrency.data?.balance || 0}`
                };
            }

            // Deduct currency
            const spendResult = await CurrencyService.spendCurrency(
                userId,
                currencyType,
                totalCost,
                'EGG_PURCHASE',
                { egg_type_id: eggTypeId, quantity: quantity }
            );

            if (!spendResult.success) {
                return spendResult;
            }

            // Add eggs to inventory
            const userEgg = await UserEgg.addEggToInventory(
                userId,
                eggTypeId,
                'SHOP_PURCHASE',
                quantity
            );

            return {
                success: true,
                message: 'Egg purchased successfully',
                data: {
                    egg_type: eggType.getFormattedInfo(),
                    user_egg: userEgg.getFormattedInfo(),
                    cost: {
                        amount: totalCost,
                        currency: currencyType
                    },
                    remaining_balance: spendResult.data.new_balance
                }
            };
        } catch (error) {
            console.error('Error purchasing egg:', error);
            return {
                success: false,
                message: 'Failed to purchase egg',
                error: error.message
            };
        }
    }

    static async getEggShop() {
        try {
            const eggTypes = await EggType.getPurchasableEggTypes();

            const shopData = eggTypes.map(eggType => eggType.getShopDisplayInfo());

            return {
                success: true,
                message: 'Egg shop data retrieved successfully',
                data: {
                    available_eggs: shopData,
                    total_types: shopData.length
                }
            };
        } catch (error) {
            console.error('Error getting egg shop:', error);
            return {
                success: false,
                message: 'Failed to get egg shop data',
                error: error.message
            };
        }
    }

    // Helper methods
    static checkTriggerCondition(condition, triggerData) {
        try {
            const conditionObj = typeof condition === 'string' ? JSON.parse(condition) : condition;

            // Check each condition
            for (const [key, value] of Object.entries(conditionObj)) {
                if (triggerData[key] === undefined || triggerData[key] < value) {
                    return false;
                }
            }
            return true;
        } catch (error) {
            console.error('Error checking trigger condition:', error);
            return false;
        }
    }

    static async checkDailyLimit(userId, ruleId, maxPerDay) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const count = await UserEgg.count({
            where: {
                user_id: userId,
                obtained_at: {
                    [require('sequelize').Op.gte]: today
                }
            }
        });

        return count >= maxPerDay;
    }

    static getTriggerSource(triggerType) {
        const sourceMap = {
            'QUIZ_COMPLETION': 'QUIZ_COMPLETION',
            'STREAK_ACHIEVEMENT': 'STREAK_BONUS',
            'PERFECT_SCORE': 'PERFECT_SCORE',
            'LEVEL_UP': 'LEVEL_UP',
            'DAILY_LOGIN': 'DAILY_LOGIN'
        };
        return sourceMap[triggerType] || 'UNKNOWN';
    }

    static async generateEggRewards(eggType) {
        // Get guaranteed rewards first
        const guaranteedRewards = await EggReward.getGuaranteedRewards(eggType.egg_type_id);

        // Get random rewards (1-3 rewards per egg)
        const numRandomRewards = Math.floor(Math.random() * 3) + 1;
        const randomRewards = await EggReward.getRandomRewards(eggType.egg_type_id, numRandomRewards);

        return [...guaranteedRewards, ...randomRewards];
    }

    static async processEggRewards(userId, rewards) {
        const rewardsData = [];
        let totalSyncoinValue = 0;
        let hadDuplicates = false;
        let syncoinFromDuplicates = 0;
        let itemsReceived = 0;

        for (const reward of rewards) {
            const rewardData = {
                reward_type: reward.reward_type,
                reward_amount: reward.reward_amount,
                was_duplicate: false,
                syncoin_compensation: 0
            };

            if (reward.isCurrencyReward()) {
                // Award currency directly
                if (reward.reward_type === 'SYNCOIN') {
                    await CurrencyService.awardCurrency(userId, 'SYNC', reward.reward_amount, 'EGG_REWARD');
                    totalSyncoinValue += reward.reward_amount;
                } else if (reward.reward_type === 'XP') {
                    // Award XP to user (implement in user model)
                    // await User.addXP(userId, reward.reward_amount);
                }
            } else if (reward.isItemReward()) {
                // Check if user already owns this item
                const ownsItem = await UserInventory.checkUserOwnsItem(
                    userId,
                    reward.reward_type,
                    reward.reward_item_id
                );

                if (ownsItem) {
                    // Convert to SynCoin
                    const syncoinValue = this.getItemSyncoinValue(reward.reward_type);
                    await CurrencyService.awardCurrency(userId, 'SYNC', syncoinValue, 'DUPLICATE_CONVERSION');

                    rewardData.was_duplicate = true;
                    rewardData.syncoin_compensation = syncoinValue;
                    hadDuplicates = true;
                    syncoinFromDuplicates += syncoinValue;
                    totalSyncoinValue += syncoinValue;
                } else {
                    // Add item to inventory
                    await UserInventory.addItemToInventory(
                        userId,
                        reward.reward_type,
                        reward.reward_item_id,
                        'EGG'
                    );
                    itemsReceived++;
                }
            }

            rewardsData.push(rewardData);
        }

        return {
            rewards_data: rewardsData,
            total_syncoin_value: totalSyncoinValue,
            had_duplicates: hadDuplicates,
            syncoin_from_duplicates: syncoinFromDuplicates,
            items_received: itemsReceived
        };
    }

    static getItemSyncoinValue(itemType) {
        const values = {
            'AVATAR': 100,
            'EMOJI': 50
        };
        return values[itemType] || 50;
    }
}

module.exports = EggRewardService;
