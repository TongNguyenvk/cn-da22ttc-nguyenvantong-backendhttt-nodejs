-- =====================================================
-- ROLLBACK: Egg Opening Support Migration
-- Date: 2025-10-12
-- Purpose: Rollback changes made by 20251012_add_egg_opening_support.sql
-- WARNING: This will restore the original state
-- =====================================================

BEGIN;

\echo '==========================================';
\echo 'ROLLING BACK Egg Opening Support Migration';
\echo '==========================================';

-- =====================================================
-- PART 1: RESTORE ORIGINAL unlock_type VALUES
-- =====================================================

\echo 'Restoring original unlock_type values...';

-- Restore LEVEL unlock for avatars that were changed
UPDATE "Avatars" 
SET unlock_type = 'LEVEL',
    unlock_condition = CASE 
        WHEN avatar_id = 4 THEN '{"required_level": 5}'::jsonb
        WHEN avatar_id = 5 THEN '{"required_level": 8}'::jsonb
        WHEN avatar_id = 6 THEN '{"required_level": 10}'::jsonb
        WHEN avatar_id = 7 THEN '{"required_level": 12}'::jsonb
        WHEN avatar_id = 8 THEN '{"required_level": 15}'::jsonb
        WHEN avatar_id = 9 THEN '{"required_level": 18}'::jsonb
        WHEN avatar_id = 10 THEN '{"required_level": 20}'::jsonb
        WHEN avatar_id = 11 THEN '{"required_level": 22}'::jsonb
        WHEN avatar_id = 12 THEN '{"required_level": 25}'::jsonb
        WHEN avatar_id = 13 THEN '{"required_level": 28}'::jsonb
        WHEN avatar_id = 14 THEN '{"required_level": 30}'::jsonb
        WHEN avatar_id = 15 THEN '{"required_level": 32}'::jsonb
        WHEN avatar_id = 16 THEN '{"required_level": 35}'::jsonb
        WHEN avatar_id = 17 THEN '{"required_level": 38}'::jsonb
        WHEN avatar_id = 19 THEN '{"required_level": 45}'::jsonb
        WHEN avatar_id = 20 THEN '{"required_level": 50}'::jsonb
        WHEN avatar_id = 21 THEN '{"required_level": 55}'::jsonb
        WHEN avatar_id = 22 THEN '{"required_level": 60}'::jsonb
        WHEN avatar_id = 24 THEN '{"required_level": 70}'::jsonb
        ELSE unlock_condition
    END
WHERE avatar_id IN (4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 21, 22, 24)
AND unlock_type = 'EGG_REWARD';

-- Restore ACHIEVEMENT unlock for Tê Giác
UPDATE "Avatars"
SET unlock_type = 'ACHIEVEMENT',
    unlock_condition = '{"required_achievement": "quiz_master"}'::jsonb
WHERE avatar_id = 25
AND unlock_type = 'EGG_REWARD';

-- Restore EGG unlock for original 3 avatars (Lười, Rắn, Hải Mã)
UPDATE "Avatars" 
SET unlock_type = 'EGG',
    unlock_condition = CASE 
        WHEN avatar_id = 26 THEN '{"egg_types": ["LEGENDARY", "MYTHICAL"]}'::jsonb
        WHEN avatar_id = 27 THEN '{"egg_types": ["ROYAL", "DRAGON"]}'::jsonb
        WHEN avatar_id = 28 THEN '{"egg_types": ["ICE", "KRAKEN"]}'::jsonb
        ELSE unlock_condition
    END
WHERE avatar_id IN (26, 27, 28)
AND unlock_type = 'EGG_REWARD';

-- =====================================================
-- PART 2: RESTORE ORIGINAL unlock_method FOR EMOJIS
-- =====================================================

\echo 'Restoring original emoji unlock_method values...';

-- Restore TIER_PROGRESSION for emojis
UPDATE "EmojiTypes"
SET unlock_method = 'TIER_PROGRESSION'
WHERE emoji_type_id IN (
    1, 2, 3, 4, 5, 7, 8, 9, 11, 12,  -- COMMON
    18, 19, 20, 21, 22, 23, 24,      -- RARE
    25, 26, 27, 28, 29,              -- EPIC
    34, 35, 36                        -- LEGENDARY
)
AND unlock_method = 'EGG_DROP';

-- Keep original EGG_DROP emojis (IDs: 37, 38, 39, 40, 41, 42, 43, 44, 46)

-- =====================================================
-- PART 3: REMOVE decomposition_value COLUMNS
-- =====================================================

\echo 'Removing decomposition_value columns...';

-- Remove from Avatars
ALTER TABLE "Avatars" 
DROP COLUMN IF EXISTS decomposition_value;

-- Remove from EmojiTypes
ALTER TABLE "EmojiTypes" 
DROP COLUMN IF EXISTS decomposition_value;

-- =====================================================
-- PART 4: REMOVE EGG_REWARD FROM ENUM (Optional)
-- =====================================================
-- Note: Removing values from ENUM is complex in PostgreSQL
-- It requires creating a new enum type and migrating
-- We'll leave it for now as it doesn't hurt to have the extra value

\echo '';
\echo 'Note: EGG_REWARD value in enum_Avatars_unlock_type is NOT removed';
\echo 'This is safe and does not affect functionality';

-- =====================================================
-- VERIFICATION
-- =====================================================

\echo '';
\echo 'Verification - EGG unlock avatars (should be 3):';
SELECT avatar_id, avatar_name, unlock_type, rarity 
FROM "Avatars" 
WHERE unlock_type = 'EGG'
ORDER BY avatar_id;

\echo '';
\echo 'Verification - EGG_DROP emojis (should be ~9):';
SELECT COUNT(*) as egg_drop_count
FROM "EmojiTypes" 
WHERE unlock_method = 'EGG_DROP';

\echo '';
\echo 'Verification - decomposition_value columns (should not exist):';
SELECT 
    table_name,
    column_name
FROM information_schema.columns
WHERE (table_name = 'Avatars' OR table_name = 'EmojiTypes')
AND column_name = 'decomposition_value';

COMMIT;

\echo '';
\echo '==========================================';
\echo 'ROLLBACK COMPLETE!';
\echo '==========================================';
\echo 'Original state has been restored.';
\echo '';
