const { User, LevelRequirement, UserInventory, Avatar } = require('../models');

class LevelProgressController {

    /**
     * Get level progress tracker with tier-based structure
     * According to API specification
     */
    static async getTracker(req, res) {
        try {
            const userId = req.user.user_id;

            // Get user info
            const user = await User.findByPk(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Get user's gamification info
            const gamificationInfo = await user.getGamificationInfo();
            
            // Get user's avatar inventory (avatar codes only) - manual query to avoid association issues
            const userAvatars = await UserInventory.findAll({
                where: {
                    user_id: userId,
                    item_type: 'AVATAR'
                }
            });

            // Get avatar codes manually
            const avatarIds = userAvatars.map(item => item.item_id);
            const avatars = avatarIds.length > 0 ? await Avatar.findAll({
                where: { avatar_id: avatarIds },
                attributes: ['avatar_id', 'avatar_code']
            }) : [];

            const avatarMap = {};
            avatars.forEach(avatar => {
                avatarMap[avatar.avatar_id] = avatar.avatar_code;
            });

            const userAvatarCodes = userAvatars
                .map(item => avatarMap[item.item_id])
                .filter(code => code);

            // Get all level requirements to build tier structure
            const allLevels = await LevelRequirement.findAll({
                order: [['level', 'ASC']]
            });

            // Build tier structure
            const tierMap = {};
            
            // Initialize tier map
            allLevels.forEach(level => {
                if (!tierMap[level.tier_name]) {
                    tierMap[level.tier_name] = {
                        tier_name: level.tier_name,
                        tier_display_name: LevelProgressController.getTierDisplayName(level.tier_name),
                        tier_color: level.tier_color,
                        min_level: level.level,
                        max_level: level.level,
                        levels: []
                    };
                } else {
                    tierMap[level.tier_name].max_level = level.level;
                }
            });

            // Add levels to tiers and determine rewards
            for (const level of allLevels) {
                const levelData = {
                    level: level.level,
                    tier_name: level.tier_name,
                    tier_color: level.tier_color,
                    xp_required: level.cumulative_xp,
                    is_unlocked: user.total_points >= level.cumulative_xp,
                    is_current: level.level === gamificationInfo.current_level
                };

                // Check if this level has an avatar reward
                const avatarReward = await LevelProgressController.getAvatarRewardForLevel(level.level);
                if (avatarReward) {
                    levelData.avatar_reward = avatarReward;
                    levelData.reward_claimed = userAvatarCodes.includes(avatarReward.avatar);
                }

                tierMap[level.tier_name].levels.push(levelData);
            }

            // Convert to array and sort by tier order
            const tiers = Object.values(tierMap).sort((a, b) => a.min_level - b.min_level);

            const response = {
                current_level: gamificationInfo.current_level,
                current_tier: gamificationInfo.tier_info?.tier_name || 'Wood',
                user_avatars: userAvatarCodes,
                tiers: tiers
            };

            return res.status(200).json({
                success: true,
                message: 'Level progress retrieved successfully',
                data: response
            });

        } catch (error) {
            console.error('Error getting level progress tracker:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy tiến độ level',
                error: error.message
            });
        }
    }

    /**
     * Claim avatar reward for completed level
     */
    static async claimAvatar(req, res) {
        try {
            const userId = req.user.user_id;
            const { level } = req.body;

            if (!level || typeof level !== 'number') {
                return res.status(400).json({
                    success: false,
                    message: 'Level is required and must be a number'
                });
            }

            // Get user info
            const user = await User.findByPk(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Check if user has reached this level
            const levelRequirement = await LevelRequirement.findOne({
                where: { level: level }
            });

            if (!levelRequirement) {
                return res.status(404).json({
                    success: false,
                    message: 'Level not found'
                });
            }

            if (user.total_points < levelRequirement.cumulative_xp) {
                return res.status(400).json({
                    success: false,
                    message: 'Level not yet reached'
                });
            }

            // Check if this level has an avatar reward
            const avatarReward = await LevelProgressController.getAvatarRewardForLevel(level);
            if (!avatarReward) {
                return res.status(404).json({
                    success: false,
                    message: 'No avatar reward for this level'
                });
            }

            // Get avatar by code
            const avatar = await Avatar.findOne({
                where: { avatar_code: avatarReward.avatar }
            });

            if (!avatar) {
                return res.status(404).json({
                    success: false,
                    message: 'Avatar not found'
                });
            }

            // Check if already claimed
            const existingInventory = await UserInventory.findOne({
                where: {
                    user_id: userId,
                    item_id: avatar.avatar_id,
                    item_type: 'AVATAR'
                }
            });

            if (existingInventory) {
                return res.status(400).json({
                    success: false,
                    message: 'Avatar already claimed'
                });
            }

            // Add to user inventory
            await UserInventory.create({
                user_id: userId,
                item_id: avatar.avatar_id,
                item_type: 'AVATAR',
                obtained_at: new Date(),
                obtained_from: 'LEVEL_UP',
                metadata: { level: level }
            });

            return res.status(200).json({
                success: true,
                message: 'Avatar claimed successfully',
                data: {
                    level: level,
                    avatar_code: avatar.avatar_code,
                    avatar_name: avatar.avatar_name,
                    claimed_at: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('Error claiming avatar:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi khi claim avatar',
                error: error.message
            });
        }
    }

    /**
     * Get tier display name in Vietnamese
     */
    static getTierDisplayName(tierName) {
        const tierNames = {
            'Wood': 'Gỗ',
            'Bronze': 'Đồng',
            'Silver': 'Bạc',
            'Gold': 'Vàng',
            'Platinum': 'Bạch Kim',
            'Onyx': 'Hắc Ngà',
            'Sapphire': 'Sapphire',
            'Ruby': 'Ruby',
            'Amethyst': 'Amethyst',
            'Master': 'Bậc Thầy'
        };
        return tierNames[tierName] || tierName;
    }

    /**
     * Get avatar reward for specific level
     * Query from database for avatars with unlock_type='LEVEL'
     */
    static async getAvatarRewardForLevel(level) {
        try {
            // Try to find avatar with level-based unlock condition
            const avatar = await Avatar.findOne({
                where: {
                    unlock_type: 'LEVEL',
                    is_active: true,
                    // For now, use a simple mapping since we don't have unlock_condition structure
                    avatar_code: LevelProgressController.getLevelAvatarCode(level)
                }
            });

            if (avatar) {
                return {
                    level: level,
                    avatar: avatar.avatar_code,
                    avatar_name: avatar.avatar_name,
                    avatar_path: avatar.image_path,
                    description: `Level ${level} reward`
                };
            }

            return null;
        } catch (error) {
            console.error('Error getting avatar reward for level:', error);
            return null;
        }
    }

    /**
     * Get avatar code mapping for levels (temporary until DB structure is updated)
     */
    static getLevelAvatarCode(level) {
        const levelAvatarMap = {
            1: 'CHICK',
            5: 'DOG', 
            10: 'RABBIT',
            15: 'COW',
            25: 'BEAR',
            30: 'ELEPHANT'
        };
        return levelAvatarMap[level] || null;
    }
}

module.exports = LevelProgressController;
