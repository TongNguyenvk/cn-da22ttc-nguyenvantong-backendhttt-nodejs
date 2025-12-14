const { Avatar, EmojiType, UserInventory } = require('../models');
const { Op } = require('sequelize');
const CurrencyService = require('../services/currencyService');

class ShopController {

    /**
     * Get avatars available for purchase in shop
     * Returns data matching shop.inventory.mock.json structure
     */
    static async getAvatars(req, res) {
        try {
            const userId = req.user.user_id;

            // Get avatars that are purchasable in shop (exclude DEFAULT, SPECIAL, ACHIEVEMENT)
            const shopAvatars = await Avatar.findAll({
                where: {
                    unlock_type: {
                        [Op.in]: ['SHOP', 'LEVEL', 'EGG']
                    },
                    is_active: true
                },
                order: [['sort_order', 'ASC']]
            });

            // Get user's existing avatars to filter out owned ones
            const userAvatars = await UserInventory.findAll({
                where: {
                    user_id: userId,
                    item_type: 'AVATAR'
                },
                attributes: ['item_id']
            });

            const ownedAvatarIds = userAvatars.map(item => item.item_id);

            // Filter out owned avatars and format response
            const availableAvatars = shopAvatars
                .filter(avatar => !ownedAvatarIds.includes(avatar.avatar_id))
                .map(avatar => avatar.formatAvatarForShop());

            return res.status(200).json({
                success: true,
                message: 'Shop avatars retrieved successfully',
                data: availableAvatars
            });

        } catch (error) {
            console.error('Error getting shop avatars:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy avatars shop',
                error: error.message
            });
        }
    }

    /**
     * Get emojis available for purchase in shop
     * Returns data matching shop.inventory.mock.json structure
     */
    static async getEmojis(req, res) {
        try {
            const userId = req.user.user_id;

            // Get emojis that are purchasable in shop (SynCoin only, Kristal removed)
            const shopEmojis = await EmojiType.findAll({
                where: {
                    unlock_method: {
                        [Op.in]: ['TIER_PROGRESSION', 'EGG_DROP', 'SYNCOIN_PURCHASE']
                    },
                    is_active: true,
                    is_purchasable: true
                },
                order: [['sort_order', 'ASC']]
            });

            // Get user's existing emojis to filter out owned ones
            const userEmojis = await UserInventory.findAll({
                where: {
                    user_id: userId,
                    item_type: 'EMOJI'
                },
                attributes: ['item_id']
            });

            const ownedEmojiIds = userEmojis.map(item => item.item_id);

            // Filter out owned emojis and format response
            const availableEmojis = shopEmojis
                .filter(emoji => !ownedEmojiIds.includes(emoji.emoji_type_id))
                .map(emoji => emoji.formatEmojiForShop());

            return res.status(200).json({
                success: true,
                message: 'Shop emojis retrieved successfully',
                data: availableEmojis
            });

        } catch (error) {
            console.error('Error getting shop emojis:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy emojis shop',
                error: error.message
            });
        }
    }

    /**
     * Test endpoint to get emojis without authentication
     * Returns data for testing frontend integration
     */
    static async getEmojisTest(req, res) {
        try {
            // Get emojis that are purchasable in shop (exclude DEFAULT, SPECIAL, ACHIEVEMENT)
            const shopEmojis = await EmojiType.findAll({
                where: {
                    unlock_method: {
                        [Op.in]: ['TIER_PROGRESSION', 'EGG_DROP']
                    },
                    is_active: true,
                    is_purchasable: true
                },
                order: [['sort_order', 'ASC']],
                limit: 10 // Limit for testing
            });

            // Format response without filtering by user ownership
            const availableEmojis = shopEmojis.map(emoji => emoji.formatEmojiForShop());

            return res.status(200).json({
                success: true,
                message: 'Shop emojis test retrieved successfully',
                data: availableEmojis
            });

        } catch (error) {
            console.error('Error getting shop emojis test:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy emojis shop test',
                error: error.message
            });
        }
    }

    /**
     * Purchase item from shop (generic endpoint)
     */
    static async purchase(req, res) {
        try {
            const userId = req.user.user_id;
            const { itemType, itemId } = req.body;

            console.log('🛒 Shop Purchase Debug:', {
                userId,
                itemType,
                itemId,
                itemIdType: typeof itemId
            });

            if (!itemType || !itemId) {
                return res.status(400).json({
                    success: false,
                    message: 'itemType and itemId are required'
                });
            }

            // Convert itemId to string to handle both string and number inputs
            const itemIdStr = String(itemId);

            // Validate itemType
            if (!['avatars', 'emojis'].includes(itemType)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid itemType. Must be "avatars" or "emojis"'
                });
            }

            let item, price, currencyCode, inventoryItemType, inventoryItemId;

            if (itemType === 'avatars') {
                // Handle avatar purchase
                item = await Avatar.findOne({
                    where: {
                        avatar_code: itemIdStr, // Use string version
                        unlock_type: {
                            [Op.in]: ['SHOP', 'LEVEL', 'EGG']
                        },
                        is_active: true
                    }
                });

                if (!item) {
                    return res.status(404).json({
                        success: false,
                        message: 'Avatar not found or not available for purchase'
                    });
                }

                price = ShopController.getAvatarPrice(item);
                currencyCode = 'SYNC'; // SynCoin for avatars
                inventoryItemType = 'AVATAR';
                inventoryItemId = item.avatar_id;

            } else if (itemType === 'emojis') {
                // Handle emoji purchase - itemId should be emoji_type_id (integer)
                const emojiTypeId = parseInt(itemId);
                
                if (isNaN(emojiTypeId)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid emoji ID. Must be a valid integer.'
                    });
                }

                item = await EmojiType.findOne({
                    where: {
                        emoji_type_id: emojiTypeId, // Use integer ID for emojis
                        unlock_method: {
                            [Op.in]: ['TIER_PROGRESSION', 'EGG_DROP', 'SYNCOIN_PURCHASE']
                        },
                        is_active: true,
                        is_purchasable: true
                    }
                });

                console.log('🎭 Emoji lookup result:', {
                    emojiTypeId,
                    found: !!item,
                    item: item ? {
                        emoji_type_id: item.emoji_type_id,
                        emoji_name: item.emoji_name,
                        emoji_code: item.emoji_code,
                        unlock_method: item.unlock_method,
                        is_active: item.is_active,
                        is_purchasable: item.is_purchasable
                    } : null
                });

                if (!item) {
                    return res.status(404).json({
                        success: false,
                        message: 'Emoji not found or not available for purchase'
                    });
                }

                price = ShopController.getEmojiPrice(item);
                currencyCode = 'SYNC'; // SynCoin only (Kristal removed)
                inventoryItemType = 'EMOJI';
                inventoryItemId = item.emoji_type_id;
            }

            // Check if user already owns this item
            const existingItem = await UserInventory.findOne({
                where: {
                    user_id: userId,
                    item_id: inventoryItemId,
                    item_type: inventoryItemType
                }
            });

            if (existingItem) {
                return res.status(400).json({
                    success: false,
                    message: 'Item already owned'
                });
            }

            // Check user balance
            const balances = await CurrencyService.getUserBalances(userId);
            const currencyBalance = balances.currencies[currencyCode];

            if (!currencyBalance || currencyBalance.balance < price) {
                return res.status(400).json({
                    success: false,
                    message: 'Insufficient balance'
                });
            }

            // Perform purchase transaction
            await CurrencyService.spendCurrency(
                userId,
                currencyCode,
                price,
                'SHOP_PURCHASE',
                inventoryItemId,
                `Purchase ${itemType} - ${itemId}`
            );

            // Add item to user inventory
            await UserInventory.create({
                user_id: userId,
                item_id: inventoryItemId,
                item_type: inventoryItemType,
                quantity: 1,
                obtained_from: 'SHOP',
                obtained_at: new Date(),
                metadata: {
                    source_type: 'SHOP_PURCHASE',
                    source_id: null,
                    purchase_price: price,
                    currency_code: currencyCode
                }
            });

            // Get updated balance
            const updatedBalances = await CurrencyService.getUserBalances(userId);
            const newBalance = updatedBalances.currencies[currencyCode]?.balance || 0;

            return res.status(200).json({
                success: true,
                message: 'Item purchased successfully',
                data: {
                    itemId: itemId,
                    itemType: itemType,
                    newBalance: newBalance,
                    owned: true,
                    purchase_date: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('Error purchasing item:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi mua item',
                error: error.message
            });
        }
    }

    /**
     * Format avatar for shop response (matching mock structure)
     */
    static formatAvatarForShop(avatar) {
        return {
            id: avatar.avatar_code,
            name: avatar.avatar_name,
            price: ShopController.getAvatarPrice(avatar),
            asset: avatar.image_path.replace(/^\//, ''), // Remove leading slash
            rarity: avatar.rarity.toLowerCase(),
            description: avatar.description || `${avatar.avatar_name} avatar`
        };
    }



    /**
     * Get avatar price based on rarity (matching mock data)
     */
    static getAvatarPrice(avatar) {
        const rarityPrices = {
            'COMMON': 250,
            'UNCOMMON': 300,
            'RARE': 350,
            'EPIC': 400,
            'LEGENDARY': 500
        };
        return rarityPrices[avatar.rarity] || 300;
    }

    /**
     * Get emoji price based on rarity (SynCoin only)
     */
    static getEmojiPrice(emoji) {
        // Use rarity-based SynCoin pricing
        const rarityPrices = {
            'COMMON': 50,
            'RARE': 100,
            'EPIC': 150,
            'LEGENDARY': 200
        };
        return rarityPrices[emoji.rarity] || 75;
    }
}

module.exports = ShopController;
