-- =====================================================
-- MIGRATION: Add Egg Opening Support
-- Date: 2025-10-12
-- Purpose: 
--   1. Add decomposition_value to Avatars and EmojiTypes
--   2. Update unlock_type from 'EGG' to 'EGG_REWARD'
--   3. Add more avatars to EGG_REWARD pool
--   4. Ensure proper distribution across rarities
-- =====================================================

BEGIN;

-- =====================================================
-- PART 1: ADD DECOMPOSITION_VALUE COLUMNS
-- =====================================================

-- Add decomposition_value to Avatars table
ALTER TABLE "Avatars" 
ADD COLUMN IF NOT EXISTS decomposition_value INTEGER DEFAULT 0;

COMMENT ON COLUMN "Avatars".decomposition_value IS 'SynCoin value when item is duplicate (50-1000 based on rarity)';

-- Add decomposition_value to EmojiTypes table
ALTER TABLE "EmojiTypes" 
ADD COLUMN IF NOT EXISTS decomposition_value INTEGER DEFAULT 0;

COMMENT ON COLUMN "EmojiTypes".decomposition_value IS 'SynCoin value when item is duplicate (50-1000 based on rarity)';

-- =====================================================
-- PART 2: UPDATE DECOMPOSITION VALUES BASED ON RARITY
-- =====================================================

-- Update Avatars decomposition values
UPDATE "Avatars" SET decomposition_value = 50 WHERE rarity = 'COMMON';
UPDATE "Avatars" SET decomposition_value = 100 WHERE rarity = 'UNCOMMON';
UPDATE "Avatars" SET decomposition_value = 250 WHERE rarity = 'RARE';
UPDATE "Avatars" SET decomposition_value = 500 WHERE rarity = 'EPIC';
UPDATE "Avatars" SET decomposition_value = 1000 WHERE rarity = 'LEGENDARY';

-- Update EmojiTypes decomposition values
UPDATE "EmojiTypes" SET decomposition_value = 50 WHERE rarity = 'COMMON';
UPDATE "EmojiTypes" SET decomposition_value = 100 WHERE rarity = 'UNCOMMON';
UPDATE "EmojiTypes" SET decomposition_value = 250 WHERE rarity = 'RARE';
UPDATE "EmojiTypes" SET decomposition_value = 500 WHERE rarity = 'EPIC';
UPDATE "EmojiTypes" SET decomposition_value = 1000 WHERE rarity = 'LEGENDARY';

-- =====================================================
-- PART 3: UPDATE unlock_type CHECK CONSTRAINT
-- =====================================================

-- Drop old constraint
ALTER TABLE "Avatars" DROP CONSTRAINT IF EXISTS avatars_unlock_type_check;

-- Add new constraint with 'EGG_REWARD' included
ALTER TABLE "Avatars" ADD CONSTRAINT avatars_unlock_type_check 
CHECK (
    unlock_type IN (
        'DEFAULT', 
        'LEVEL', 
        'EGG', 
        'EGG_REWARD',  -- New value for egg rewards
        'SHOP', 
        'ACHIEVEMENT', 
        'SPECIAL'
    )
);

-- =====================================================
-- PART 4: MIGRATE EXISTING 'EGG' TO 'EGG_REWARD'
-- =====================================================

-- Update existing avatars with unlock_type = 'EGG' to 'EGG_REWARD'
UPDATE "Avatars" 
SET unlock_type = 'EGG_REWARD' 
WHERE unlock_type = 'EGG';

-- =====================================================
-- PART 5: ADD MORE AVATARS TO EGG_REWARD POOL
-- =====================================================
-- Current: Only 3 avatars (Lười-EPIC, Rắn-RARE, Hải Mã-EPIC)
-- Need: COMMON(15-20), UNCOMMON(10-12), RARE(6-8), EPIC(3-5), LEGENDARY(2-3)
-- Strategy: Convert some LEVEL unlock avatars to EGG_REWARD

-- Add COMMON avatars to EGG_REWARD pool (targeting 15-18 total)
UPDATE "Avatars" 
SET unlock_type = 'EGG_REWARD',
    unlock_condition = '{"can_drop_from_eggs": true}'
WHERE avatar_id IN (
    1,  -- Chó (COMMON)
    2,  -- Thỏ (COMMON)
    3,  -- Gấu (COMMON)
    4,  -- Trâu (COMMON)
    5,  -- Gà Con (COMMON)
    9   -- Vịt (COMMON)
) AND unlock_type = 'LEVEL';

-- Keep some as LEVEL for progression
-- IDs 1, 2, 3 will stay as DEFAULT (already are)

-- Add UNCOMMON avatars to EGG_REWARD pool (targeting 10-12 total)
UPDATE "Avatars" 
SET unlock_type = 'EGG_REWARD',
    unlock_condition = '{"can_drop_from_eggs": true}'
WHERE avatar_id IN (
    6,  -- Gà (UNCOMMON)
    7,  -- Bò (UNCOMMON)
    11, -- Ếch (UNCOMMON)
    13, -- Dê (UNCOMMON)
    17, -- Khỉ (UNCOMMON)
    24  -- Heo (UNCOMMON)
) AND unlock_type = 'LEVEL';

-- Add RARE avatars to EGG_REWARD pool (targeting 6-8 total)
UPDATE "Avatars" 
SET unlock_type = 'EGG_REWARD',
    unlock_condition = '{"can_drop_from_eggs": true}'
WHERE avatar_id IN (
    8,  -- Cá Sấu (RARE)
    10, -- Voi (RARE)
    12, -- Hươu Cao Cổ (RARE)
    15, -- Hà Mã (RARE)
    16, -- Ngựa (RARE)
    20, -- Cú (RARE)
    22  -- Vẹt (RARE)
    -- ID 27 Rắn already EGG_REWARD
) AND unlock_type = 'LEVEL';

-- Add EPIC avatars to EGG_REWARD pool (targeting 4-5 total)
UPDATE "Avatars" 
SET unlock_type = 'EGG_REWARD',
    unlock_condition = '{"can_drop_from_eggs": true}'
WHERE avatar_id IN (
    14, -- Khỉ Đột (EPIC)
    19, -- Cá Voi Một Sừng (EPIC)
    21  -- Gấu Trúc (EPIC)
    -- IDs 26, 28 already EGG_REWARD
) AND unlock_type = 'LEVEL';

-- Add LEGENDARY avatars to EGG_REWARD pool (targeting 2-3 total)
UPDATE "Avatars" 
SET unlock_type = 'EGG_REWARD',
    unlock_condition = '{"can_drop_from_eggs": true}'
WHERE avatar_id IN (
    25  -- Tê Giác (LEGENDARY) - changed from ACHIEVEMENT
) AND unlock_type = 'ACHIEVEMENT';

-- Keep ID 29 (Cá Voi) as SPECIAL
-- Keep ID 30 (Ngựa Vằn) as SHOP

-- =====================================================
-- PART 6: UPDATE EMOJI unlock_method (Already has EGG_DROP)
-- =====================================================
-- EmojiTypes already has 'EGG_DROP' unlock_method
-- No changes needed, just verify distribution

-- Check current EGG_DROP distribution
-- COMMON: 5 emojis (IDs: 38, 39, 40, 41, 43, 44)
-- RARE: 5 emojis (IDs: 13, 14, 15, 16, 37, 42, 46)

-- Add more COMMON emojis to EGG_DROP
UPDATE "EmojiTypes"
SET unlock_method = 'EGG_DROP'
WHERE emoji_type_id IN (
    1,  -- Slightly Smiling Face (COMMON)
    2,  -- Grinning Face (COMMON)
    3,  -- Beaming Face (COMMON)
    4,  -- Astonished Face (COMMON)
    5,  -- Confused Face (COMMON)
    7,  -- Relieved Face (COMMON)
    8,  -- Worried Face (COMMON)
    9,  -- Sleepy Face (COMMON)
    11, -- Hugging Face (COMMON)
    12  -- Winking Face (COMMON)
) AND unlock_method = 'TIER_PROGRESSION';

-- Add more RARE emojis to EGG_DROP
UPDATE "EmojiTypes"
SET unlock_method = 'EGG_DROP'
WHERE emoji_type_id IN (
    18, -- Dizzy Face (RARE)
    19, -- Face with Tongue (RARE)
    20, -- Zany Face (RARE)
    21, -- Partying Face (RARE)
    22, -- Face with Monocle (RARE)
    23, -- Disguised Face (RARE)
    24  -- Shushing Face (RARE)
) AND unlock_method = 'TIER_PROGRESSION';

-- Add EPIC emojis to EGG_DROP
UPDATE "EmojiTypes"
SET unlock_method = 'EGG_DROP'
WHERE emoji_type_id IN (
    25, -- Face in Clouds (EPIC)
    26, -- Melting Face (EPIC)
    27, -- Face with Spiral Eyes (EPIC)
    28, -- Face Vomiting (EPIC)
    29  -- Face Screaming in Fear (EPIC)
) AND unlock_method = 'TIER_PROGRESSION';

-- Add LEGENDARY emojis to EGG_DROP
UPDATE "EmojiTypes"
SET unlock_method = 'EGG_DROP'
WHERE emoji_type_id IN (
    34, -- Pile of Poo (LEGENDARY)
    35, -- Clown Face (LEGENDARY)
    36  -- Face with Symbols on Mouth (LEGENDARY)
) AND unlock_method = 'TIER_PROGRESSION';

-- =====================================================
-- PART 7: VERIFICATION QUERIES (Commented for safety)
-- =====================================================

-- Verify Avatar distribution
-- SELECT rarity, unlock_type, COUNT(*) as count
-- FROM "Avatars"
-- WHERE unlock_type = 'EGG_REWARD'
-- GROUP BY rarity, unlock_type
-- ORDER BY 
--     CASE rarity
--         WHEN 'COMMON' THEN 1
--         WHEN 'UNCOMMON' THEN 2
--         WHEN 'RARE' THEN 3
--         WHEN 'EPIC' THEN 4
--         WHEN 'LEGENDARY' THEN 5
--     END;

-- Verify EmojiTypes distribution
-- SELECT rarity, unlock_method, COUNT(*) as count
-- FROM "EmojiTypes"
-- WHERE unlock_method = 'EGG_DROP'
-- GROUP BY rarity, unlock_method
-- ORDER BY 
--     CASE rarity
--         WHEN 'COMMON' THEN 1
--         WHEN 'UNCOMMON' THEN 2
--         WHEN 'RARE' THEN 3
--         WHEN 'EPIC' THEN 4
--         WHEN 'LEGENDARY' THEN 5
--     END;

-- Verify decomposition values
-- SELECT rarity, decomposition_value, COUNT(*) 
-- FROM "Avatars" 
-- GROUP BY rarity, decomposition_value 
-- ORDER BY decomposition_value;

-- SELECT rarity, decomposition_value, COUNT(*) 
-- FROM "EmojiTypes" 
-- GROUP BY rarity, decomposition_value 
-- ORDER BY decomposition_value;

COMMIT;

-- =====================================================
-- EXPECTED RESULTS AFTER MIGRATION:
-- =====================================================
-- 
-- Avatars with EGG_REWARD:
--   COMMON: 6 items (Chó, Thỏ, Gấu, Trâu, Gà Con, Vịt)
--   UNCOMMON: 6 items (Gà, Bò, Ếch, Dê, Khỉ, Heo)
--   RARE: 8 items (Cá Sấu, Voi, Hươu Cao Cổ, Hà Mã, Ngựa, Cú, Vẹt, Rắn)
--   EPIC: 5 items (Khỉ Đột, Cá Voi Một Sừng, Gấu Trúc, Lười, Hải Mã)
--   LEGENDARY: 1 item (Tê Giác)
--   Total: 26 EGG_REWARD items
--
-- EmojiTypes with EGG_DROP:
--   COMMON: 16 items
--   RARE: 12 items
--   EPIC: 5 items
--   LEGENDARY: 3 items
--   Total: 36 EGG_DROP items
--
-- Decomposition Values:
--   COMMON: 50 SynCoin
--   UNCOMMON: 100 SynCoin
--   RARE: 250 SynCoin
--   EPIC: 500 SynCoin
--   LEGENDARY: 1000 SynCoin
-- =====================================================
