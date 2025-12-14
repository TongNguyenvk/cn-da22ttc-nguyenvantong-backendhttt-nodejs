const EmojiSocialService = require('../services/emojiSocialService');
const { EmojiType, UserEmoji, EmojiUsageHistory } = require('../models');

class EmojiController {

    // =====================================================
    // EMOJI COLLECTION ENDPOINTS
    // =====================================================

    static async initializeUserEmojis(req, res) {
        try {
            const userId = req.user.user_id;

            const result = await EmojiSocialService.initializeUserEmojiSystem(userId);

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
            console.error('Error in initializeUserEmojis:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    static async getUserEmojiCollection(req, res) {
        try {
            const userId = req.user.user_id;
            const { category, rarity, is_favorite } = req.query;

            const options = {};
            if (category) options.category = category;
            if (rarity) options.rarity = rarity;
            if (is_favorite !== undefined) options.is_favorite = is_favorite === 'true';

            const result = await EmojiSocialService.getUserEmojiCollection(userId, options);

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
            console.error('Error in getUserEmojiCollection:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    static async getAvailableEmojis(req, res) {
        try {
            const userId = req.user.user_id;
            const { tier } = req.query;

            // Get user's current tier if not specified
            const User = require('../models/user');
            const user = await User.findByPk(userId);
            const userTier = tier || user?.current_tier || 'WOOD';

            const availableEmojis = await EmojiType.getAvailableEmojis(userTier);

            res.status(200).json({
                success: true,
                message: 'Available emojis retrieved successfully',
                data: {
                    emojis: availableEmojis,
                    user_tier: userTier
                }
            });
        } catch (error) {
            console.error('Error in getAvailableEmojis:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    static async getEmojisByCategory(req, res) {
        try {
            const { category } = req.params;

            const emojis = await EmojiType.getEmojisByCategory(category.toUpperCase());

            res.status(200).json({
                success: true,
                message: `Emojis in ${category} category retrieved successfully`,
                data: emojis
            });
        } catch (error) {
            console.error('Error in getEmojisByCategory:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // =====================================================
    // EMOJI SHOP ENDPOINTS
    // =====================================================

    static async getEmojiShop(req, res) {
        try {
            const userId = req.user.user_id;

            const result = await EmojiSocialService.getEmojiShop(userId);

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
            console.error('Error in getEmojiShop:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // DEPRECATED: Kristal currency removed
    // Use shopController.purchase() with itemType='emojis' instead
    static async purchaseEmoji(req, res) {
        return res.status(410).json({
            success: false,
            message: 'This endpoint is deprecated. Use /api/shop/purchase with itemType=emojis instead',
            deprecated: true
        });
    }

    // =====================================================
    // EMOJI USAGE ENDPOINTS
    // =====================================================

    static async useEmoji(req, res) {
        try {
            const userId = req.user.user_id;
            const { emoji_type_id, context, target_user_id, quiz_session_id, metadata } = req.body;

            if (!emoji_type_id || !context) {
                return res.status(400).json({
                    success: false,
                    message: 'Emoji type ID and context are required'
                });
            }

            const options = {};
            if (target_user_id) options.targetUserId = target_user_id;
            if (quiz_session_id) options.quizSessionId = quiz_session_id;
            if (metadata) options.metadata = metadata;

            const result = await EmojiSocialService.useEmoji(userId, emoji_type_id, context, options);

            if (result.success) {
                // Emit realtime emoji event if in quiz context
                if (context === 'quiz_interaction' && quiz_session_id) {
                    const io = req.app.get('io');
                    if (io) {
                        io.to(`quiz:${quiz_session_id}`).emit('emoji:sent', {
                            user_id: userId,
                            emoji_type_id,
                            emoji_code: result.data.emoji_code,
                            emoji_name: result.data.emoji_name,
                            emoji_image: result.data.emoji_image,
                            target_user_id,
                            timestamp: new Date().toISOString()
                        });
                        console.log(`✅ Emoji ${emoji_type_id} sent realtime in quiz ${quiz_session_id}`);
                    }
                }

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
            console.error('Error in useEmoji:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // New endpoint for sending emoji in realtime (quiz)
    static async sendEmojiRealtime(req, res) {
        try {
            const userId = req.user.user_id;
            const { emoji_type_id, quiz_id, target_user_id } = req.body;

            if (!emoji_type_id || !quiz_id) {
                return res.status(400).json({
                    success: false,
                    message: 'emoji_type_id and quiz_id are required'
                });
            }

            // Check if user owns this emoji
            const { UserInventory } = require('../models');
            const ownedEmoji = await UserInventory.findOne({
                where: {
                    user_id: userId,
                    item_id: emoji_type_id,
                    item_type: 'EMOJI'
                }
            });

            if (!ownedEmoji) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not own this emoji'
                });
            }

            // Get emoji details
            const emoji = await EmojiType.findByPk(emoji_type_id);
            if (!emoji) {
                return res.status(404).json({
                    success: false,
                    message: 'Emoji not found'
                });
            }

            // Send realtime event
            const io = req.app.get('io');
            if (io) {
                const emojiData = {
                    user_id: userId,
                    emoji_type_id,
                    emoji_code: emoji.emoji_code,
                    emoji_name: emoji.emoji_name,
                    emoji_image: emoji.image_url,
                    target_user_id,
                    timestamp: new Date().toISOString()
                };

                io.to(`quiz:${quiz_id}`).emit('emoji:sent', emojiData);
                
                // Log usage
                const result = await EmojiSocialService.useEmoji(
                    userId, 
                    emoji_type_id, 
                    'quiz_interaction', 
                    { 
                        targetUserId: target_user_id, 
                        quizSessionId: quiz_id 
                    }
                );

                return res.status(200).json({
                    success: true,
                    message: 'Emoji sent successfully',
                    data: emojiData
                });
            } else {
                return res.status(500).json({
                    success: false,
                    message: 'Realtime service not available'
                });
            }
        } catch (error) {
            console.error('Error in sendEmojiRealtime:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    static async getEmojiUsageHistory(req, res) {
        try {
            const userId = req.user.user_id;
            const { context, timeframe, limit } = req.query;

            const options = {};
            if (context) options.context = context;
            if (timeframe) options.timeframe = timeframe;
            if (limit) options.limit = parseInt(limit);

            const usageHistory = await EmojiUsageHistory.getUserUsageHistory(userId, options);

            res.status(200).json({
                success: true,
                message: 'Emoji usage history retrieved successfully',
                data: usageHistory
            });
        } catch (error) {
            console.error('Error in getEmojiUsageHistory:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    static async getEmojiUsageStats(req, res) {
        try {
            const userId = req.user.user_id;
            const { timeframe } = req.query;

            const stats = await EmojiUsageHistory.getUsageStatsByContext(userId, timeframe || '7d');

            res.status(200).json({
                success: true,
                message: 'Emoji usage stats retrieved successfully',
                data: stats
            });
        } catch (error) {
            console.error('Error in getEmojiUsageStats:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // =====================================================
    // EMOJI MANAGEMENT ENDPOINTS
    // =====================================================

    static async setFavoriteEmoji(req, res) {
        try {
            const userId = req.user.user_id;
            const { emoji_type_id } = req.body;

            if (!emoji_type_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Emoji type ID is required'
                });
            }

            const result = await UserEmoji.setFavoriteEmoji(userId, emoji_type_id);

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
            console.error('Error in setFavoriteEmoji:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    static async getEmojiDetails(req, res) {
        try {
            const { emoji_id } = req.params;

            const emoji = await EmojiType.findByPk(emoji_id);

            if (!emoji) {
                return res.status(404).json({
                    success: false,
                    message: 'Emoji not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Emoji details retrieved successfully',
                data: emoji
            });
        } catch (error) {
            console.error('Error in getEmojiDetails:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }
}

module.exports = EmojiController;
