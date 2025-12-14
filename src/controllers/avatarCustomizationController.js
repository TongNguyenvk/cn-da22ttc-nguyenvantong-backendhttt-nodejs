'use strict';

const AvatarCustomizationService = require('../services/avatarCustomizationService');
const { 
    Avatar, 
    Emoji, 
    UserInventory, 
    UserCustomization 
} = require('../models');

class AvatarCustomizationController {
    /**
     * Initialize avatar system for user
     * POST /api/avatar/initialize
     */
    static async initializeAvatarSystem(req, res) {
        try {
            const userId = req.user.user_id;
            
            const result = await AvatarCustomizationService.initializeUserAvatarSystem(userId);
            
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
            console.error('Error in initializeAvatarSystem:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    /**
     * Get user's avatar data (customization + inventory)
     * GET /api/avatar/my-data
     */
    static async getUserAvatarData(req, res) {
        try {
            const userId = req.user.user_id;
            
            const result = await AvatarCustomizationService.getUserAvatarData(userId);
            
            if (result.success) {
                res.status(200).json({
                    success: true,
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
            console.error('Error in getUserAvatarData:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    /**
     * Get available items for user
     * GET /api/avatar/available-items
     */
    static async getAvailableItems(req, res) {
        try {
            const userId = req.user.user_id;
            
            const result = await AvatarCustomizationService.getAvailableItems(userId);
            
            if (result.success) {
                res.status(200).json({
                    success: true,
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
            console.error('Error in getAvailableItems:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    /**
     * Get user's inventory by item type
     * GET /api/avatar/inventory/:itemType
     */
    static async getUserInventoryByType(req, res) {
        try {
            const userId = req.user.user_id;
            let { itemType } = req.params;
            // Accept plural & lowercase forms
            const normalizationMap = {
                avatars: 'AVATAR',
                avatar: 'AVATAR',
                frames: 'FRAME',
                frame: 'FRAME',
                emojis: 'EMOJI',
                emoji: 'EMOJI',
                name_effects: 'NAME_EFFECT',
                name_effect: 'NAME_EFFECT'
            };
            const normalized = normalizationMap[itemType.toLowerCase()] || itemType.toUpperCase();

            const validItemTypes = ['AVATAR', 'FRAME', 'EMOJI', 'NAME_EFFECT'];
            if (!validItemTypes.includes(normalized)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid item type'
                });
            }

            const inventory = await UserInventory.getUserInventoryByType(userId, normalized);
            
            res.status(200).json({
                success: true,
                data: {
                    item_type: normalized,
                    items: inventory.map(item => item.getFormattedInfo())
                }
            });
        } catch (error) {
            console.error('Error in getUserInventoryByType:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    /**
     * Equip item for user
     * POST /api/avatar/equip
     */
    static async equipItem(req, res) {
        try {
            const userId = req.user.user_id;
            const { itemType, itemId } = req.body;
            
            if (!itemType || !itemId) {
                return res.status(400).json({
                    success: false,
                    message: 'Item type and item ID are required'
                });
            }

            const result = await AvatarCustomizationService.equipItem(userId, itemType, itemId);
            
            if (result.success) {
                res.status(200).json({
                    success: true,
                    message: result.message,
                    data: result.data
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: result.message
                });
            }
        } catch (error) {
            console.error('Error in equipItem:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    /**
     * Unequip item for user
     * POST /api/avatar/unequip
     */
    static async unequipItem(req, res) {
        try {
            const userId = req.user.user_id;
            const { itemType } = req.body;
            
            if (!itemType) {
                return res.status(400).json({
                    success: false,
                    message: 'Item type is required'
                });
            }

            const result = await AvatarCustomizationService.unequipItem(userId, itemType);
            
            if (result.success) {
                res.status(200).json({
                    success: true,
                    message: result.message,
                    data: result.data
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: result.message
                });
            }
        } catch (error) {
            console.error('Error in unequipItem:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    /**
     * Get user's customization settings
     * GET /api/avatar/customization
     */
    static async getUserCustomization(req, res) {
        try {
            const userId = req.user.user_id;
            
            const customization = await UserCustomization.getUserCustomization(userId);
            
            if (customization) {
                res.status(200).json({
                    success: true,
                    data: customization.getFormattedInfo()
                });
            } else {
                res.status(404).json({
                    success: false,
                    message: 'User customization not found'
                });
            }
        } catch (error) {
            console.error('Error in getUserCustomization:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    /**
     * Update user's customization settings
     * PUT /api/avatar/customization
     */
    static async updateCustomizationSettings(req, res) {
        try {
            const userId = req.user.user_id;
            const { settings } = req.body;
            
            if (!settings || typeof settings !== 'object') {
                return res.status(400).json({
                    success: false,
                    message: 'Settings object is required'
                });
            }

            const success = await UserCustomization.updateCustomizationSettings(userId, settings);
            
            if (success) {
                const updatedCustomization = await UserCustomization.getUserCustomization(userId);
                res.status(200).json({
                    success: true,
                    message: 'Customization settings updated successfully',
                    data: updatedCustomization ? updatedCustomization.getFormattedInfo() : null
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: 'Failed to update customization settings'
                });
            }
        } catch (error) {
            console.error('Error in updateCustomizationSettings:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    /**
     * Get user's display info for leaderboards
     * GET /api/avatar/display-info/:userId?
     */
    static async getUserDisplayInfo(req, res) {
        try {
            const targetUserId = req.params.userId ? parseInt(req.params.userId) : req.user.user_id;
            
            const result = await AvatarCustomizationService.getUserDisplayInfo(targetUserId);
            
            if (result.success) {
                res.status(200).json({
                    success: true,
                    data: result.data
                });
            } else {
                res.status(404).json({
                    success: false,
                    message: result.message
                });
            }
        } catch (error) {
            console.error('Error in getUserDisplayInfo:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    /**
     * Get collection progress
     * GET /api/avatar/collection-progress
     */
    static async getCollectionProgress(req, res) {
        try {
            const userId = req.user.user_id;
            
            const result = await AvatarCustomizationService.getCollectionProgress(userId);
            
            if (result.success) {
                res.status(200).json({
                    success: true,
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
            console.error('Error in getCollectionProgress:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    /**
     * Get all avatars (for admin or browsing)
     * GET /api/avatar/avatars
     */
    static async getAllAvatars(req, res) {
        try {
            const { rarity, unlockType, page = 1, limit = 20 } = req.query;
            
            const where = { is_active: true };
            if (rarity) where.rarity = rarity;
            if (unlockType) where.unlock_type = unlockType;

            const offset = (page - 1) * limit;
            
            const { count, rows: avatars } = await Avatar.findAndCountAll({
                where,
                order: [['sort_order', 'ASC'], ['avatar_id', 'ASC']],
                limit: parseInt(limit),
                offset: parseInt(offset)
            });

            res.status(200).json({
                success: true,
                data: {
                    avatars: avatars.map(avatar => avatar.getFormattedInfo()),
                    pagination: {
                        current_page: parseInt(page),
                        total_pages: Math.ceil(count / limit),
                        total_items: count,
                        items_per_page: parseInt(limit)
                    }
                }
            });
        } catch (error) {
            console.error('Error in getAllAvatars:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    /**
     * Get all emojis (for admin or browsing)
     * GET /api/avatar/emojis
     */
    static async getAllEmojis(req, res) {
        try {
            const { category, rarity, unlockType, page = 1, limit = 50 } = req.query;
            
            const where = { is_active: true };
            if (category) where.category = category;
            if (rarity) where.rarity = rarity;
            if (unlockType) where.unlock_type = unlockType;

            const offset = (page - 1) * limit;
            
            const { count, rows: emojis } = await Emoji.findAndCountAll({
                where,
                order: [['category', 'ASC'], ['sort_order', 'ASC']],
                limit: parseInt(limit),
                offset: parseInt(offset)
            });

            res.status(200).json({
                success: true,
                data: {
                    emojis: emojis.map(emoji => emoji.getFormattedInfo()),
                    pagination: {
                        current_page: parseInt(page),
                        total_pages: Math.ceil(count / limit),
                        total_items: count,
                        items_per_page: parseInt(limit)
                    }
                }
            });
        } catch (error) {
            console.error('Error in getAllEmojis:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }
}

module.exports = AvatarCustomizationController;
