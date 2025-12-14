"use strict";

const {
  Avatar,
  EmojiType,
  UserInventory,
  UserCustomization,
  User,
  LevelRequirement,
} = require("../models");
const { Op } = require("sequelize");

class AvatarCustomizationService {
  /**
   * Initialize avatar system for new user
   * @param {number} userId - User ID
   * @returns {Object} Initialization result
   */
  static async initializeUserAvatarSystem(userId) {
    try {
      // Get default items
      const defaultAvatars = await Avatar.getDefaultAvatars();
      const defaultEmojis = await EmojiType.getAvailableEmojisForUser("WOOD");

      // Add default items to inventory
      const inventoryPromises = [];

      // Add default avatars
      for (const avatar of defaultAvatars) {
        inventoryPromises.push(
          UserInventory.addItemToInventory(
            userId,
            "AVATAR",
            avatar.avatar_id,
            "DEFAULT"
          )
        );
      }

      // Add default emojis
      for (const emoji of defaultEmojis) {
        inventoryPromises.push(
          UserInventory.addItemToInventory(
            userId,
            "EMOJI",
            emoji.emoji_type_id,
            "DEFAULT"
          )
        );
      }

      await Promise.all(inventoryPromises);

      // Initialize customization with first default avatar
      const firstAvatar = defaultAvatars[0];
      await UserCustomization.initializeUserCustomization(userId);

      return {
        success: true,
        message: "Avatar system initialized successfully",
        data: {
          default_avatars_count: defaultAvatars.length,
          default_emojis_count: defaultEmojis.length,
          equipped_avatar: firstAvatar ? firstAvatar.avatar_name : null,
        },
      };
    } catch (error) {
      console.error("Error initializing avatar system:", error);
      return {
        success: false,
        message: "Failed to initialize avatar system",
        error: error.message,
      };
    }
  }

  /**
   * Get user's complete avatar collection and customization
   * @param {number} userId - User ID
   * @returns {Object} User's avatar data
   */
  static async getUserAvatarData(userId) {
    try {
      // Get user's customization
      const customization = await UserCustomization.getUserCustomization(
        userId
      );

      // Get user's inventory
      const avatarInventoryRaw = await UserInventory.findAll({
        where: {
          user_id: userId,
          item_type: "AVATAR",
        },
        order: [["obtained_at", "DESC"]],
      });

      const emojiInventoryRaw = await UserInventory.findAll({
        where: {
          user_id: userId,
          item_type: "EMOJI",
        },
        order: [["obtained_at", "DESC"]],
      });

      // Manually fetch related items
      const avatarIds = avatarInventoryRaw.map((item) => item.item_id);
      const emojiIds = emojiInventoryRaw.map((item) => item.item_id);

      const avatars =
        avatarIds.length > 0
          ? await Avatar.findAll({
              where: { avatar_id: avatarIds },
            })
          : [];

      const emojis =
        emojiIds.length > 0
          ? await EmojiType.findAll({
              where: { emoji_type_id: emojiIds },
            })
          : [];

      // Create lookup maps
      const avatarMap = {};
      avatars.forEach((avatar) => {
        avatarMap[avatar.avatar_id] = avatar;
      });

      const emojiMap = {};
      emojis.forEach((emoji) => {
        emojiMap[emoji.emoji_type_id] = emoji;
      });

      // Format inventory with related data
      const inventory = {
        avatars: avatarInventoryRaw.map((item) => ({
          ...item.toJSON(),
          Avatar: avatarMap[item.item_id]
            ? avatarMap[item.item_id].getFormattedInfo()
            : null,
        })),
        emojis: emojiInventoryRaw.map((item) => ({
          ...item.toJSON(),
          Emoji: emojiMap[item.item_id]
            ? emojiMap[item.item_id].getFormattedInfo()
            : null,
        })),
      };

      // Get equipped avatar from customization
      let equippedAvatar = null;

      if (customization && customization.equipped_avatar_id) {
        equippedAvatar = await Avatar.findByPk(
          customization.equipped_avatar_id
        );
      }

      return {
        success: true,
        data: {
          customization: customization
            ? customization.getFormattedInfo()
            : null,
          equipped_avatar: equippedAvatar
            ? equippedAvatar.getFormattedInfo()
            : null,
          inventory: inventory,
          statistics: {
            total_avatars: avatarInventoryRaw.length,
            total_emojis: emojiInventoryRaw.length,
          },
        },
      };
    } catch (error) {
      console.error("Error getting user avatar data:", error);
      return {
        success: false,
        message: "Failed to get user avatar data",
        error: error.message,
      };
    }
  }

  /**
   * Get available items for user to unlock or purchase
   * @param {number} userId - User ID
   * @returns {Object} Available items
   */
  static async getAvailableItems(userId) {
    try {
      // Get user level from User model
      const user = await User.findByPk(userId, {
        attributes: ["current_level", "total_points"],
      });

      const currentLevel = user ? user.current_level : 1;

      // Calculate tier from level using LevelRequirement
      const levelInfo = await LevelRequirement.calculateLevelFromXP(
        user ? user.total_points : 0
      );
      const currentTier = levelInfo.tier_info
        ? levelInfo.tier_info.tier_name
        : "Wood";

      // Get user's current inventory
      const userInventory = await UserInventory.findAll({
        where: { user_id: userId },
        attributes: ["item_type", "item_id"],
      });

      const ownedItems = new Set(
        userInventory.map((item) => `${item.item_type}_${item.item_id}`)
      );

      // Get all available items
      const [avatars, emojis] = await Promise.all([
        Avatar.getAvailableAvatars(),
        EmojiType.findAll({ where: { is_active: true } }),
      ]);

      // Filter and categorize items
      const categorizeItems = (items, itemType) => {
        const owned = [];
        const unlockable = [];
        const locked = [];

        items.forEach((item) => {
          const itemKey = `${itemType}_${
            item[`${itemType.toLowerCase()}_id`] ||
            item.avatar_id ||
            item.emoji_id
          }`;

          if (ownedItems.has(itemKey)) {
            owned.push(item.getFormattedInfo());
          } else {
            let canUnlock = false;

            if (itemType === "AVATAR") {
              canUnlock = item.canBeUnlockedBy(currentLevel);
            } else if (itemType === "EMOJI") {
              canUnlock = item.canBeUnlockedBy(currentLevel);
            }

            if (canUnlock) {
              unlockable.push(item.getFormattedInfo());
            } else {
              locked.push(item.getFormattedInfo());
            }
          }
        });

        return { owned, unlockable, locked };
      };

      return {
        success: true,
        data: {
          user_level: currentLevel,
          user_tier: currentTier,
          avatars: categorizeItems(avatars, "AVATAR"),
          emojis: categorizeItems(emojis, "EMOJI"),
        },
      };
    } catch (error) {
      console.error("Error getting available items:", error);
      return {
        success: false,
        message: "Failed to get available items",
        error: error.message,
      };
    }
  }

  /**
   * Unlock items for user based on level progression
   * @param {number} userId - User ID
   * @param {number} newLevel - New level reached
   * @param {string} newTier - New tier reached
   * @returns {Object} Unlocked items
   */
  static async unlockItemsByLevel(userId, newLevel, newTier) {
    try {
      const unlockedItems = [];

      // Unlock avatars by level
      const unlockableAvatars = await Avatar.getUnlockableAvatarsByLevel(
        newLevel
      );
      for (const avatar of unlockableAvatars) {
        const existing = await UserInventory.checkUserOwnsItem(
          userId,
          "AVATAR",
          avatar.avatar_id
        );
        if (!existing) {
          await UserInventory.addItemToInventory(
            userId,
            "AVATAR",
            avatar.avatar_id,
            "LEVEL_UP"
          );
          unlockedItems.push({
            type: "AVATAR",
            item: avatar.getFormattedInfo(),
          });
        }
      }

      // Unlock emojis by tier
      const unlockableEmojis = await EmojiType.findAll({
        where: {
          tier_requirement: newTier,
          unlock_method: "TIER_PROGRESSION",
          is_active: true,
        },
      });
      
      for (const emoji of unlockableEmojis) {
        const existing = await UserInventory.checkUserOwnsItem(
          userId,
          "EMOJI",
          emoji.emoji_type_id
        );
        if (!existing) {
          await UserInventory.addItemToInventory(
            userId,
            "EMOJI",
            emoji.emoji_type_id,
            "LEVEL_UP"
          );
          unlockedItems.push({
            type: "EMOJI",
            item: emoji.getFormattedInfo(),
          });
        }
      }

      return {
        success: true,
        message: `Unlocked ${unlockedItems.length} new items`,
        data: {
          unlocked_items: unlockedItems,
          level: newLevel,
          tier: newTier,
        },
      };
    } catch (error) {
      console.error("Error unlocking items by level:", error);
      return {
        success: false,
        message: "Failed to unlock items",
        error: error.message,
      };
    }
  }

  /**
   * Equip item for user (generic method for Avatar or Emoji)
   * @param {number} userId - User ID
   * @param {string} itemType - Item type ('avatar' or 'emoji')
   * @param {number} itemId - Item ID
   * @returns {Object} Equip result
   */
  static async equipItem(userId, itemType, itemId) {
    try {
      const normalizedType = itemType.toLowerCase();
      
      if (normalizedType === 'avatar') {
        return await this.equipAvatar(userId, itemId);
      } else if (normalizedType === 'emoji') {
        // For emoji, we just verify ownership since there's no equipped_emoji_id in current schema
        const hasItem = await UserInventory.hasItem(userId, 'EMOJI', itemId);
        
        if (hasItem) {
          return {
            success: true,
            message: "Emoji verified in inventory",
            data: { emoji_type_id: itemId }
          };
        } else {
          return {
            success: false,
            message: "User does not own this emoji"
          };
        }
      } else {
        return {
          success: false,
          message: `Invalid item type: ${itemType}. Must be 'avatar' or 'emoji'`
        };
      }
    } catch (error) {
      console.error("Error equipping item:", error);
      return {
        success: false,
        message: "Failed to equip item",
        error: error.message,
      };
    }
  }

  /**
   * Equip avatar for user
   * @param {number} userId - User ID
   * @param {number} avatarId - Avatar ID
   * @returns {Object} Equip result
   */
  static async equipAvatar(userId, avatarId) {
    try {
      const success = await UserCustomization.equipAvatar(userId, avatarId);

      if (success) {
        // Get updated customization
        const customization = await UserCustomization.getUserCustomization(
          userId
        );
        return {
          success: true,
          message: "Avatar equipped successfully",
          data: customization ? customization.getFormattedInfo() : null,
        };
      } else {
        return {
          success: false,
          message: "Failed to equip avatar. User may not own this avatar.",
        };
      }
    } catch (error) {
      console.error("Error equipping avatar:", error);
      return {
        success: false,
        message: "Failed to equip avatar",
        error: error.message,
      };
    }
  }

  /**
   * Unequip item for user (generic method for Avatar or Emoji)
   * @param {number} userId - User ID
   * @param {string} itemType - Item type ('avatar' or 'emoji')
   * @returns {Object} Unequip result
   */
  static async unequipItem(userId, itemType) {
    try {
      const normalizedType = itemType.toLowerCase();
      
      if (normalizedType === 'avatar') {
        return await this.unequipAvatar(userId);
      } else if (normalizedType === 'emoji') {
        // For emoji, there's nothing to unequip in current schema
        return {
          success: true,
          message: "Emoji unequipped (no-op)",
          data: null
        };
      } else {
        return {
          success: false,
          message: `Invalid item type: ${itemType}. Must be 'avatar' or 'emoji'`
        };
      }
    } catch (error) {
      console.error("Error unequipping item:", error);
      return {
        success: false,
        message: "Failed to unequip item",
        error: error.message,
      };
    }
  }

  /**
   * Unequip avatar for user
   * @param {number} userId - User ID
   * @returns {Object} Unequip result
   */
  static async unequipAvatar(userId) {
    try {
      const success = await UserCustomization.unequipAvatar(userId);

      if (success) {
        const customization = await UserCustomization.getUserCustomization(
          userId
        );
        return {
          success: true,
          message: "Avatar unequipped successfully",
          data: customization ? customization.getFormattedInfo() : null,
        };
      } else {
        return {
          success: false,
          message: "Failed to unequip avatar",
        };
      }
    } catch (error) {
      console.error("Error unequipping avatar:", error);
      return {
        success: false,
        message: "Failed to unequip avatar",
        error: error.message,
      };
    }
  }

  /**
   * Get user display info for leaderboards
   * @param {number} userId - User ID
   * @returns {Object} Display info
   */
  static async getUserDisplayInfo(userId) {
    try {
      const displayInfo = await UserCustomization.getUserDisplayInfo(userId);

      if (!displayInfo) {
        return {
          success: false,
          message: "User display info not found",
        };
      }

      return {
        success: true,
        data: displayInfo,
      };
    } catch (error) {
      console.error("Error getting user display info:", error);
      return {
        success: false,
        message: "Failed to get user display info",
        error: error.message,
      };
    }
  }

  /**
   * Get collection progress for user
   * @param {number} userId - User ID
   * @returns {Object} Collection progress
   */
  static async getCollectionProgress(userId) {
    try {
      // Get total available items
      const [totalAvatars, totalEmojis] = await Promise.all([
        Avatar.count({ where: { is_active: true } }),
        EmojiType.count({ where: { is_active: true } }),
      ]);

      // Get user's inventory stats
      const stats = await UserInventory.getInventoryStatistics(userId);

      const progress = {
        avatars: {
          owned: stats.by_type.avatars.count,
          total: totalAvatars,
          percentage:
            totalAvatars > 0
              ? Math.round((stats.by_type.avatars.count / totalAvatars) * 100)
              : 0,
        },
        emojis: {
          owned: stats.by_type.emojis.count,
          total: totalEmojis,
          percentage:
            totalEmojis > 0
              ? Math.round((stats.by_type.emojis.count / totalEmojis) * 100)
              : 0,
        },
        overall: {
          owned: stats.total_items,
          total: totalAvatars + totalEmojis,
          percentage: 0,
        },
      };

      progress.overall.percentage =
        progress.overall.total > 0
          ? Math.round((progress.overall.owned / progress.overall.total) * 100)
          : 0;

      return {
        success: true,
        data: progress,
      };
    } catch (error) {
      console.error("Error getting collection progress:", error);
      return {
        success: false,
        message: "Failed to get collection progress",
        error: error.message,
      };
    }
  }
}

module.exports = AvatarCustomizationService;
