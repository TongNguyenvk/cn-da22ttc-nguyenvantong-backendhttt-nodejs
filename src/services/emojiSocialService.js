const {
    EmojiType,
    UserEmoji,
    EmojiUsageHistory,
    SocialInteraction,
    UserSocialStats,
    UserCurrency,
    User
} = require('../models');

class EmojiSocialService {

    // =====================================================
    // EMOJI MANAGEMENT METHODS
    // =====================================================

    static async initializeUserEmojiSystem(userId) {
        try {
            // Initialize user social stats
            await UserSocialStats.initializeUserStats(userId);

            // Get user's current tier from gamification system
            const user = await User.findByPk(userId);

            if (!user) {
                return {
                    success: false,
                    message: 'User not found'
                };
            }

            // Get user's current tier (assuming it's stored in user model or calculated)
            const userTier = user.current_tier || 'WOOD';

            // Unlock basic emojis for user's tier
            const availableEmojis = await EmojiType.getAvailableEmojis(userTier);

            const unlockedEmojis = [];
            for (const emoji of availableEmojis) {
                const result = await UserEmoji.unlockEmojiForUser(
                    userId,
                    emoji.emoji_type_id,
                    'TIER_PROGRESSION',
                    { tier: userTier, auto_unlock: true }
                );

                if (result.success) {
                    unlockedEmojis.push(result.data);
                }
            }

            return {
                success: true,
                message: `Emoji system initialized with ${unlockedEmojis.length} emojis`,
                data: {
                    unlocked_emojis: unlockedEmojis,
                    user_tier: userTier
                }
            };
        } catch (error) {
            console.error('Error initializing emoji system:', error);
            return {
                success: false,
                message: 'Failed to initialize emoji system',
                error: error.message
            };
        }
    }

    static async getUserEmojiCollection(userId, options = {}) {
        try {
            const collection = await UserEmoji.getUserEmojiCollection(userId, options);
            const stats = await UserEmoji.getUserEmojiStats(userId);

            return {
                success: true,
                message: 'User emoji collection retrieved successfully',
                data: {
                    emojis: collection,
                    stats: stats
                }
            };
        } catch (error) {
            console.error('Error getting user emoji collection:', error);
            return {
                success: false,
                message: 'Failed to get emoji collection',
                error: error.message
            };
        }
    }

    static async unlockEmojiFromTierProgression(userId, newTier) {
        try {
            // Get emojis available for the new tier
            const availableEmojis = await EmojiType.getAvailableEmojis(newTier);

            // Get emojis user already has
            const userEmojis = await UserEmoji.findAll({
                where: { user_id: userId },
                attributes: ['emoji_type_id']
            });

            const userEmojiIds = userEmojis.map(ue => ue.emoji_type_id);

            // Find new emojis to unlock
            const newEmojis = availableEmojis.filter(emoji =>
                !userEmojiIds.includes(emoji.emoji_type_id)
            );

            const unlockedEmojis = [];
            for (const emoji of newEmojis) {
                const result = await UserEmoji.unlockEmojiForUser(
                    userId,
                    emoji.emoji_type_id,
                    'TIER_PROGRESSION',
                    { tier: newTier, tier_promotion: true }
                );

                if (result.success) {
                    unlockedEmojis.push(result.data);
                }
            }

            return {
                success: true,
                message: `Unlocked ${unlockedEmojis.length} new emojis for ${newTier} tier`,
                data: unlockedEmojis
            };
        } catch (error) {
            console.error('Error unlocking emojis from tier progression:', error);
            return {
                success: false,
                message: 'Failed to unlock emojis from tier progression',
                error: error.message
            };
        }
    }

    static async unlockEmojiFromEggDrop(userId, eggRarity, eggTypeCode) {
        try {
            // Get available emojis for this egg rarity
            const availableEmojis = await EmojiType.getEggDropEmojis(eggRarity);

            if (availableEmojis.length === 0) {
                return {
                    success: false,
                    message: 'No emojis available for this egg rarity'
                };
            }

            // Select random emoji(s) based on egg type
            const selectedEmojis = this.selectRandomEmojisFromEgg(availableEmojis, eggTypeCode);

            const unlockedEmojis = [];
            for (const emoji of selectedEmojis) {
                const result = await UserEmoji.unlockEmojiForUser(
                    userId,
                    emoji.emoji_type_id,
                    'EGG_DROP',
                    {
                        egg_rarity: eggRarity,
                        egg_type: eggTypeCode,
                        drop_time: new Date()
                    }
                );

                if (result.success) {
                    unlockedEmojis.push(result.data);
                }
            }

            return {
                success: true,
                message: `Unlocked ${unlockedEmojis.length} emojis from ${eggTypeCode}`,
                data: unlockedEmojis
            };
        } catch (error) {
            console.error('Error unlocking emojis from egg drop:', error);
            return {
                success: false,
                message: 'Failed to unlock emojis from egg drop',
                error: error.message
            };
        }
    }

    static selectRandomEmojisFromEgg(availableEmojis, eggTypeCode) {
        // Different egg types have different emoji selection logic
        const eggEmojiCounts = {
            'BASIC_EGG': 1,
            'CRACKED_EGG': 1,
            'ROYAL_EGG': 2,
            'LEGENDARY_EGG': 2,
            'DRAGON_EGG': 3,
            'MYTHICAL_EGG': 3,
            'RAINBOW_EGG': 4,
            'DOMINUS_EGG': 5
        };

        const count = eggEmojiCounts[eggTypeCode] || 1;

        // Shuffle and select
        const shuffled = availableEmojis.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, Math.min(count, availableEmojis.length));
    }

    // =====================================================
    // EMOJI USAGE METHODS
    // =====================================================

    static async useEmoji(userId, emojiTypeId, context, options = {}) {
        try {
            // Check if user has this emoji
            const userEmoji = await UserEmoji.findOne({
                where: {
                    user_id: userId,
                    emoji_type_id: emojiTypeId
                }
            });

            if (!userEmoji) {
                return {
                    success: false,
                    message: 'User does not have this emoji'
                };
            }

            // Record emoji usage
            const usageResult = await EmojiUsageHistory.recordEmojiUsage(
                userId,
                emojiTypeId,
                context,
                options
            );

            if (usageResult.success) {
                // Update user emoji usage count
                await userEmoji.incrementUsage();

                // Update user social stats
                await UserSocialStats.updateEmojiUsage(userId, 1);

                // If this is a social interaction, record it
                if (options.targetUserId) {
                    await this.recordSocialInteraction(
                        userId,
                        options.targetUserId,
                        'EMOJI_REACTION',
                        {
                            emojiTypeId: emojiTypeId,
                            context: options.context,
                            contextId: options.contextId
                        }
                    );
                }
            }

            return usageResult;
        } catch (error) {
            console.error('Error using emoji:', error);
            return {
                success: false,
                message: 'Failed to use emoji',
                error: error.message
            };
        }
    }

    // =====================================================
    // SOCIAL INTERACTION METHODS
    // =====================================================

    static async recordSocialInteraction(fromUserId, toUserId, interactionType, options = {}) {
        try {
            const result = await SocialInteraction.recordInteraction(
                fromUserId,
                toUserId,
                interactionType,
                options
            );

            if (result.success) {
                // Update social stats for both users
                await UserSocialStats.updateSocialInteractions(fromUserId, 'sent', 1);
                await UserSocialStats.updateSocialInteractions(toUserId, 'received', 1);
            }

            return result;
        } catch (error) {
            console.error('Error recording social interaction:', error);
            return {
                success: false,
                message: 'Failed to record social interaction',
                error: error.message
            };
        }
    }

    static async getUserSocialStats(userId, timeframe = '7d') {
        try {
            const stats = await UserSocialStats.getUserStats(userId);
            const interactionStats = await SocialInteraction.getUserSocialStats(userId, timeframe);
            const usageStats = await EmojiUsageHistory.getUsageStatsByContext(userId, timeframe);

            return {
                success: true,
                message: 'User social stats retrieved successfully',
                data: {
                    overall_stats: stats,
                    interaction_stats: interactionStats,
                    usage_stats: usageStats,
                    timeframe: timeframe
                }
            };
        } catch (error) {
            console.error('Error getting user social stats:', error);
            return {
                success: false,
                message: 'Failed to get social stats',
                error: error.message
            };
        }
    }

    static async getEmojiShop(userId) {
        try {
            // Get user's current tier
            const user = await User.findByPk(userId);
            const userTier = user?.current_tier || 'WOOD';

            // Get purchasable emojis for user's tier
            const purchasableEmojis = await EmojiType.getPurchasableEmojis(userTier);

            // Get user's current emojis to filter out owned ones
            const userEmojis = await UserEmoji.findAll({
                where: { user_id: userId },
                attributes: ['emoji_type_id']
            });

            const ownedEmojiIds = userEmojis.map(ue => ue.emoji_type_id);

            // Filter out owned emojis
            const availableForPurchase = purchasableEmojis.filter(emoji =>
                !ownedEmojiIds.includes(emoji.emoji_type_id)
            );

            // Get user's Kristal balance
            const userCurrency = await UserCurrency.findOne({
                where: { user_id: userId }
            });

            return {
                success: true,
                message: 'Emoji shop retrieved successfully',
                data: {
                    available_emojis: availableForPurchase,
                    user_kristal_balance: userCurrency?.kristal_balance || 0,
                    user_tier: userTier
                }
            };
        } catch (error) {
            console.error('Error getting emoji shop:', error);
            return {
                success: false,
                message: 'Failed to get emoji shop',
                error: error.message
            };
        }
    }
}

module.exports = EmojiSocialService;
