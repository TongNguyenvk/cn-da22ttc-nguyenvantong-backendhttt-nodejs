/**
 * EggOpeningService - Service xử lý logic đập trứng
 * 
 * Chức năng:
 * - Map egg_type từ frontend (BASIC, CAT, DRAGON...) sang database (BASIC_EGG, CAT_EGG...)
 * - Xác định độ hiếm vật phẩm theo loot table
 * - Random item từ pool EGG_REWARD
 * - Kiểm tra trùng lặp và quy đổi SynCoin
 * - Cập nhật UserInventory
 */

const { sequelize, Avatar, EmojiType, UserInventory, EggOpeningHistory } = require('../models');

/**
 * LOOT TABLE - Tỉ lệ drop theo độ hiếm trứng
 * Source: Frontend docs/API_EGG_OPENING.md
 */
const LOOT_TABLE = {
  COMMON: {
    COMMON: 0.80,      // 80%
    UNCOMMON: 0.19,    // 19%
    RARE: 0.01         // 1%
  },
  UNCOMMON: {
    COMMON: 0.20,      // 20%
    UNCOMMON: 0.60,    // 60%
    RARE: 0.19,        // 19%
    EPIC: 0.01         // 1%
  },
  RARE: {
    UNCOMMON: 0.30,    // 30%
    RARE: 0.60,        // 60%
    EPIC: 0.09,        // 9%
    LEGENDARY: 0.01    // 1%
  },
  EPIC: {
    RARE: 0.40,        // 40%
    EPIC: 0.55,        // 55%
    LEGENDARY: 0.05    // 5%
  },
  LEGENDARY: {
    EPIC: 0.70,        // 70%
    LEGENDARY: 0.30    // 30%
  }
};

/**
 * EGG TYPE MAPPING - Frontend to Database
 * Frontend gửi: BASIC, CAT, DRAGON, RAINBOW, LEGENDARY
 * Database có: BASIC_EGG, CAT_EGG, DRAGON_EGG, RAINBOW_EGG, LEGENDARY_EGG
 */
const EGG_TYPE_TO_RARITY = {
  BASIC: 'COMMON',
  CAT: 'UNCOMMON',
  DRAGON: 'RARE',
  RAINBOW: 'EPIC',
  LEGENDARY: 'LEGENDARY'
};

/**
 * GOLDEN EGG RARITY UPGRADE
 * Trứng vàng tăng 1 bậc độ hiếm
 */
const RARITY_UPGRADE = {
  COMMON: 'UNCOMMON',
  UNCOMMON: 'RARE',
  RARE: 'EPIC',
  EPIC: 'LEGENDARY',
  LEGENDARY: 'LEGENDARY' // Max level
};

/**
 * RARITY ORDER - Để fallback khi không có item
 */
const RARITY_ORDER = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];

/**
 * RARITY DISPLAY CONFIG - Để trả về frontend
 */
const RARITY_CONFIG = {
  COMMON: {
    display: 'Thường',
    color: '#9CA3AF',
    gradient: 'from-gray-400 to-gray-600'
  },
  UNCOMMON: {
    display: 'Không Phổ Biến',
    color: '#10B981',
    gradient: 'from-green-400 to-green-600'
  },
  RARE: {
    display: 'Hiếm',
    color: '#3B82F6',
    gradient: 'from-blue-400 to-blue-600'
  },
  EPIC: {
    display: 'Sử Thi',
    color: '#A855F7',
    gradient: 'from-purple-400 to-purple-600'
  },
  LEGENDARY: {
    display: 'Huyền Thoại',
    color: '#F59E0B',
    gradient: 'from-yellow-400 to-orange-600'
  }
};

class EggOpeningService {
  /**
   * Đập một quả trứng và trả về kết quả
   * 
   * @param {Object} egg - Thông tin quả trứng
   * @param {string} egg.egg_type - Loại trứng: BASIC, CAT, DRAGON, RAINBOW, LEGENDARY
   * @param {boolean} egg.is_golden - Trứng vàng (tăng 1 bậc độ hiếm)
   * @param {number} userId - ID người dùng
   * @param {Set} ownedItemsCache - Cache vật phẩm đã sở hữu (để tránh duplicate trong batch)
   * @param {Object} transaction - Sequelize transaction
   * 
   * @returns {Object} Kết quả đập trứng
   */
  async openEgg(egg, userId, ownedItemsCache, transaction) {
    try {
      console.log('[EggOpeningService] Opening egg:', { egg_type: egg.egg_type, is_golden: egg.is_golden, userId });
      console.log('[EggOpeningService] ownedItemsCache size:', ownedItemsCache.size);
      
      // 1. Xác định độ hiếm trứng
      let eggRarity = EGG_TYPE_TO_RARITY[egg.egg_type];
      if (!eggRarity) {
        throw new Error(`Invalid egg_type: ${egg.egg_type}`);
      }

      // 2. Nếu là golden egg → tăng 1 bậc
      if (egg.is_golden) {
        eggRarity = RARITY_UPGRADE[eggRarity];
      }

      console.log('[EggOpeningService] Egg rarity:', eggRarity);

      // 3. Random độ hiếm vật phẩm theo loot table
      const itemRarity = this._rollItemRarity(eggRarity);
      console.log('[EggOpeningService] Rolled item rarity:', itemRarity);

      // 4. Random item từ pool có độ hiếm tương ứng
      const item = await this._selectRandomItem(itemRarity, ownedItemsCache, transaction);
      console.log('[EggOpeningService] Selected item:', item ? `${item.item_type} - ${item.name}` : 'NULL');

      if (!item) {
        // Không có item nào → fallback trả SynCoin
        console.log('[EggOpeningService] No item found - returning currency');
        return {
          egg_type: egg.egg_type,
          is_golden: egg.is_golden,
          reward_type: 'currency',
          currency: {
            currency_type: 'SYNC',
            amount: 100, // Default fallback amount
            original_item_rarity: itemRarity
          }
        };
      }

      // 5. Kiểm tra trùng lặp
      const itemKey = `${item.item_type}_${item.item_id}`;
      const isDuplicate = ownedItemsCache.has(itemKey);
      console.log('[EggOpeningService] Item key:', itemKey, 'isDuplicate:', isDuplicate);

      if (isDuplicate) {
        // Trùng lặp → trả SynCoin
        return {
          egg_type: egg.egg_type,
          is_golden: egg.is_golden,
          reward_type: 'currency',
          currency: {
            currency_type: 'SYNC',
            amount: item.decomposition_value,
            original_item_rarity: item.rarity
          }
        };
      } else {
        // Vật phẩm mới → thêm vào inventory
        await UserInventory.create({
          user_id: userId,
          item_type: item.item_type,
          item_id: item.item_id,
          acquired_at: new Date()
        }, { transaction });

        // Đánh dấu đã sở hữu trong cache
        ownedItemsCache.add(itemKey);

        // Trả về thông tin vật phẩm
        const rarityConfig = RARITY_CONFIG[item.rarity] || RARITY_CONFIG.COMMON;

        return {
          egg_type: egg.egg_type,
          is_golden: egg.is_golden,
          reward_type: 'item',
          item: {
            item_type: item.item_type,
            item_id: item.item_id,
            item_name: item.name,
            item_code: item.code,
            image_path: item.image_path,
            rarity: item.rarity,
            rarity_display: rarityConfig.display,
            rarity_color: rarityConfig.color,
            rarity_gradient: rarityConfig.gradient
          }
        };
      }
    } catch (error) {
      console.error('[EggOpeningService] Error opening egg:', error);
      throw error;
    }
  }

  /**
   * Đập nhiều trứng (batch processing)
   * 
   * @param {Array} eggs - Danh sách trứng
   * @param {number} userId - ID người dùng
   * @param {number} sessionId - ID phiên practice
   * @param {Object} transaction - Sequelize transaction
   * 
   * @returns {Object} Kết quả đập tất cả trứng + thống kê
   */
  async openMultipleEggs(eggs, userId, sessionId, transaction) {
    try {
      // 1. Validate input
      if (!eggs || eggs.length === 0) {
        return {
          results: [],
          summary: {
            total_eggs_opened: 0,
            new_items_received: 0,
            duplicates_converted: 0,
            total_syncoin_from_duplicates: 0
          }
        };
      }

      // Giới hạn số trứng tối đa
      if (eggs.length > 50) {
        throw new Error('Maximum 50 eggs per session');
      }

      // 2. Load danh sách vật phẩm đã sở hữu
      const ownedItems = await UserInventory.findAll({
        where: { user_id: userId },
        attributes: ['item_type', 'item_id'],
        transaction
      });

      // Tạo cache set để check nhanh
      const ownedItemsCache = new Set(
        ownedItems.map(item => `${item.item_type}_${item.item_id}`)
      );

      // 3. Đập từng quả trứng
      const results = [];
      let newItemsCount = 0;
      let duplicatesCount = 0;
      let totalSyncoinFromDuplicates = 0;

      for (const egg of eggs) {
        const result = await this.openEgg(egg, userId, ownedItemsCache, transaction);
        results.push(result);

        if (result.reward_type === 'item') {
          newItemsCount++;
        } else if (result.reward_type === 'currency') {
          duplicatesCount++;
          totalSyncoinFromDuplicates += result.currency.amount;
        }
      }

      // 4. Lưu lịch sử đập trứng
      // TODO: Fix EggOpeningHistory schema mismatch
      // Current database schema requires egg_type_id (per egg), 
      // but service logic needs session-level history (multiple eggs per session)
      /*
      await EggOpeningHistory.create({
        user_id: userId,
        session_id: sessionId,
        eggs_opened: eggs.length,
        items_received: newItemsCount,
        syncoin_from_duplicates: totalSyncoinFromDuplicates,
        total_value_syncoin: totalSyncoinFromDuplicates,
        opened_at: new Date()
      }, { transaction });
      */

      // 5. Trả về kết quả
      return {
        results,
        summary: {
          total_eggs_opened: eggs.length,
          new_items_received: newItemsCount,
          duplicates_converted: duplicatesCount,
          total_syncoin_from_duplicates: totalSyncoinFromDuplicates
        }
      };
    } catch (error) {
      console.error('[EggOpeningService] Error opening multiple eggs:', error);
      throw error;
    }
  }

  /**
   * Random độ hiếm vật phẩm theo loot table
   * 
   * @param {string} eggRarity - Độ hiếm trứng
   * @returns {string} Độ hiếm vật phẩm
   * @private
   */
  _rollItemRarity(eggRarity) {
    const lootTable = LOOT_TABLE[eggRarity];
    if (!lootTable) {
      return 'COMMON'; // Fallback
    }

    const random = Math.random();
    let cumulative = 0;

    for (const [rarity, probability] of Object.entries(lootTable)) {
      cumulative += probability;
      if (random <= cumulative) {
        return rarity;
      }
    }

    // Fallback (shouldn't reach here)
    return Object.keys(lootTable)[0];
  }

  /**
   * Chọn random một vật phẩm từ pool có độ hiếm tương ứng
   * 
   * @param {string} targetRarity - Độ hiếm cần tìm
   * @param {Set} ownedItemsCache - Cache vật phẩm đã sở hữu
   * @param {Object} transaction - Sequelize transaction
   * @returns {Object|null} Item được chọn hoặc null
   * @private
   */
  async _selectRandomItem(targetRarity, ownedItemsCache, transaction) {
    try {
      // 1. Tìm items có độ hiếm tương ứng
      let items = await this._getAvailableItems(targetRarity, transaction);

      // 2. Nếu không có item → fallback xuống độ hiếm thấp hơn
      if (items.length === 0) {
        const rarityIndex = RARITY_ORDER.indexOf(targetRarity);
        for (let i = rarityIndex - 1; i >= 0; i--) {
          const fallbackRarity = RARITY_ORDER[i];
          items = await this._getAvailableItems(fallbackRarity, transaction);
          if (items.length > 0) break;
        }
      }

      // 3. Nếu vẫn không có → return null
      if (items.length === 0) {
        return null;
      }

      // 4. Ưu tiên items chưa sở hữu
      const unownedItems = items.filter(item => {
        const itemKey = `${item.item_type}_${item.item_id}`;
        return !ownedItemsCache.has(itemKey);
      });

      // 5. Random chọn item
      const pool = unownedItems.length > 0 ? unownedItems : items;
      const randomIndex = Math.floor(Math.random() * pool.length);
      return pool[randomIndex];
    } catch (error) {
      console.error('[EggOpeningService] Error selecting random item:', error);
      return null;
    }
  }

  /**
   * Lấy danh sách items có thể nhận từ trứng theo độ hiếm
   * 
   * @param {string} rarity - Độ hiếm
   * @param {Object} transaction - Sequelize transaction
   * @returns {Array} Danh sách items
   * @private
   */
  async _getAvailableItems(rarity, transaction) {
    try {
      // Lấy avatars
      const avatars = await Avatar.findAll({
        where: {
          unlock_type: 'EGG_REWARD',
          rarity: rarity
        },
        attributes: [
          'avatar_id',
          'avatar_name',
          'avatar_code',
          'image_path',
          'rarity',
          'decomposition_value'
        ],
        transaction
      });

      // Lấy emojis
      const emojis = await EmojiType.findAll({
        where: {
          unlock_method: 'EGG_DROP',
          rarity: rarity
        },
        attributes: [
          'emoji_type_id',
          'emoji_name',
          'emoji_code',
          'emoji_image_path',
          'rarity',
          'decomposition_value'
        ],
        transaction
      });

      // Normalize format
      const normalizedAvatars = avatars.map(a => ({
        item_type: 'AVATAR',
        item_id: a.avatar_id,
        name: a.avatar_name,
        code: a.avatar_code,
        image_path: a.image_path,
        rarity: a.rarity,
        decomposition_value: a.decomposition_value || 50
      }));

      const normalizedEmojis = emojis.map(e => ({
        item_type: 'EMOJI',
        item_id: e.emoji_type_id,
        name: e.emoji_name,
        code: e.emoji_code,
        image_path: e.emoji_image_path,
        rarity: e.rarity,
        decomposition_value: e.decomposition_value || 50
      }));

      // Merge và return
      return [...normalizedAvatars, ...normalizedEmojis];
    } catch (error) {
      console.error('[EggOpeningService] Error getting available items:', error);
      return [];
    }
  }

  /**
   * Lấy thống kê items theo độ hiếm (cho debugging/monitoring)
   * 
   * @returns {Object} Statistics
   */
  async getItemStatistics() {
    try {
      const stats = {
        avatars: {},
        emojis: {},
        total: {}
      };

      for (const rarity of RARITY_ORDER) {
        // Count avatars
        const avatarCount = await Avatar.count({
          where: {
            unlock_type: 'EGG_REWARD',
            rarity: rarity
          }
        });

        // Count emojis
        const emojiCount = await EmojiType.count({
          where: {
            unlock_method: 'EGG_DROP',
            rarity: rarity
          }
        });

        stats.avatars[rarity] = avatarCount;
        stats.emojis[rarity] = emojiCount;
        stats.total[rarity] = avatarCount + emojiCount;
      }

      return stats;
    } catch (error) {
      console.error('[EggOpeningService] Error getting statistics:', error);
      throw error;
    }
  }
}

module.exports = new EggOpeningService();
