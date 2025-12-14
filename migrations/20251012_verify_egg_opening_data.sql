-- =====================================================
-- VERIFICATION SCRIPT: Egg Opening Support
-- Date: 2025-10-12
-- Purpose: Verify the migration results
-- =====================================================

-- =====================================================
-- 1. CHECK DECOMPOSITION_VALUE COLUMNS
-- =====================================================
\echo '==========================================';
\echo '1. Checking decomposition_value columns...';
\echo '==========================================';

-- Check Avatars table
SELECT 
    'Avatars' as table_name,
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_name = 'Avatars' 
AND column_name = 'decomposition_value';

-- Check EmojiTypes table
SELECT 
    'EmojiTypes' as table_name,
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_name = 'EmojiTypes' 
AND column_name = 'decomposition_value';

-- =====================================================
-- 2. VERIFY AVATARS DISTRIBUTION
-- =====================================================
\echo '';
\echo '==========================================';
\echo '2. Avatar EGG_REWARD Distribution:';
\echo '==========================================';

SELECT 
    rarity,
    unlock_type,
    COUNT(*) as count,
    MIN(decomposition_value) as min_value,
    MAX(decomposition_value) as max_value,
    STRING_AGG(avatar_name, ', ' ORDER BY avatar_id) as avatar_names
FROM "Avatars"
WHERE unlock_type = 'EGG_REWARD'
GROUP BY rarity, unlock_type
ORDER BY 
    CASE rarity
        WHEN 'COMMON' THEN 1
        WHEN 'UNCOMMON' THEN 2
        WHEN 'RARE' THEN 3
        WHEN 'EPIC' THEN 4
        WHEN 'LEGENDARY' THEN 5
    END;

\echo '';
\echo 'Total EGG_REWARD Avatars:';
SELECT COUNT(*) as total_egg_reward_avatars 
FROM "Avatars" 
WHERE unlock_type = 'EGG_REWARD';

-- =====================================================
-- 3. VERIFY EMOJITYPES DISTRIBUTION
-- =====================================================
\echo '';
\echo '==========================================';
\echo '3. Emoji EGG_DROP Distribution:';
\echo '==========================================';

SELECT 
    rarity,
    unlock_method,
    COUNT(*) as count,
    MIN(decomposition_value) as min_value,
    MAX(decomposition_value) as max_value,
    STRING_AGG(emoji_name, ', ' ORDER BY emoji_type_id LIMIT 5) as sample_names
FROM "EmojiTypes"
WHERE unlock_method = 'EGG_DROP'
GROUP BY rarity, unlock_method
ORDER BY 
    CASE rarity
        WHEN 'COMMON' THEN 1
        WHEN 'UNCOMMON' THEN 2
        WHEN 'RARE' THEN 3
        WHEN 'EPIC' THEN 4
        WHEN 'LEGENDARY' THEN 5
    END;

\echo '';
\echo 'Total EGG_DROP Emojis:';
SELECT COUNT(*) as total_egg_drop_emojis 
FROM "EmojiTypes" 
WHERE unlock_method = 'EGG_DROP';

-- =====================================================
-- 4. VERIFY DECOMPOSITION VALUES
-- =====================================================
\echo '';
\echo '==========================================';
\echo '4. Decomposition Values Verification:';
\echo '==========================================';

\echo 'Avatars decomposition values:';
SELECT 
    rarity,
    decomposition_value,
    COUNT(*) as count
FROM "Avatars"
GROUP BY rarity, decomposition_value
ORDER BY decomposition_value;

\echo '';
\echo 'EmojiTypes decomposition values:';
SELECT 
    rarity,
    decomposition_value,
    COUNT(*) as count
FROM "EmojiTypes"
GROUP BY rarity, decomposition_value
ORDER BY decomposition_value;

-- =====================================================
-- 5. CHECK FOR ISSUES
-- =====================================================
\echo '';
\echo '==========================================';
\echo '5. Checking for potential issues:';
\echo '==========================================';

-- Check for NULL decomposition values
\echo 'Items with NULL decomposition_value:';
SELECT 
    'Avatar' as type, 
    avatar_id as id, 
    avatar_name as name, 
    rarity 
FROM "Avatars" 
WHERE decomposition_value IS NULL
UNION ALL
SELECT 
    'Emoji' as type, 
    emoji_type_id as id, 
    emoji_name as name, 
    rarity 
FROM "EmojiTypes" 
WHERE decomposition_value IS NULL;

-- Check for incorrect decomposition values
\echo '';
\echo 'Avatars with incorrect decomposition values:';
SELECT avatar_id, avatar_name, rarity, decomposition_value
FROM "Avatars"
WHERE 
    (rarity = 'COMMON' AND decomposition_value != 50) OR
    (rarity = 'UNCOMMON' AND decomposition_value != 100) OR
    (rarity = 'RARE' AND decomposition_value != 250) OR
    (rarity = 'EPIC' AND decomposition_value != 500) OR
    (rarity = 'LEGENDARY' AND decomposition_value != 1000);

\echo '';
\echo 'EmojiTypes with incorrect decomposition values:';
SELECT emoji_type_id, emoji_name, rarity, decomposition_value
FROM "EmojiTypes"
WHERE 
    (rarity = 'COMMON' AND decomposition_value != 50) OR
    (rarity = 'UNCOMMON' AND decomposition_value != 100) OR
    (rarity = 'RARE' AND decomposition_value != 250) OR
    (rarity = 'EPIC' AND decomposition_value != 500) OR
    (rarity = 'LEGENDARY' AND decomposition_value != 1000);

-- =====================================================
-- 6. SUMMARY REPORT
-- =====================================================
\echo '';
\echo '==========================================';
\echo '6. SUMMARY REPORT';
\echo '==========================================';

SELECT 
    'Avatar EGG_REWARD' as category,
    rarity,
    COUNT(*) as actual_count,
    CASE 
        WHEN rarity = 'COMMON' THEN '15-20'
        WHEN rarity = 'UNCOMMON' THEN '10-12'
        WHEN rarity = 'RARE' THEN '6-8'
        WHEN rarity = 'EPIC' THEN '3-5'
        WHEN rarity = 'LEGENDARY' THEN '2-3'
    END as target_range,
    CASE 
        WHEN rarity = 'COMMON' AND COUNT(*) BETWEEN 15 AND 20 THEN '✓ OK'
        WHEN rarity = 'UNCOMMON' AND COUNT(*) BETWEEN 10 AND 12 THEN '✓ OK'
        WHEN rarity = 'RARE' AND COUNT(*) BETWEEN 6 AND 8 THEN '✓ OK'
        WHEN rarity = 'EPIC' AND COUNT(*) BETWEEN 3 AND 5 THEN '✓ OK'
        WHEN rarity = 'LEGENDARY' AND COUNT(*) BETWEEN 2 AND 3 THEN '✓ OK'
        WHEN rarity = 'COMMON' AND COUNT(*) >= 6 THEN '⚠ Less than target but acceptable'
        WHEN rarity = 'UNCOMMON' AND COUNT(*) >= 6 THEN '⚠ Less than target but acceptable'
        WHEN rarity = 'RARE' AND COUNT(*) >= 5 THEN '⚠ Less than target but acceptable'
        WHEN rarity = 'EPIC' AND COUNT(*) >= 3 THEN '⚠ Less than target but acceptable'
        WHEN rarity = 'LEGENDARY' AND COUNT(*) >= 1 THEN '⚠ Less than target but acceptable'
        ELSE '✗ NEEDS MORE ITEMS'
    END as status
FROM "Avatars"
WHERE unlock_type = 'EGG_REWARD'
GROUP BY rarity
ORDER BY 
    CASE rarity
        WHEN 'COMMON' THEN 1
        WHEN 'UNCOMMON' THEN 2
        WHEN 'RARE' THEN 3
        WHEN 'EPIC' THEN 4
        WHEN 'LEGENDARY' THEN 5
    END;

\echo '';
\echo 'Emoji EGG_DROP Summary:';

SELECT 
    'Emoji EGG_DROP' as category,
    rarity,
    COUNT(*) as actual_count,
    CASE 
        WHEN rarity = 'COMMON' THEN '15-20'
        WHEN rarity = 'UNCOMMON' THEN '10-12'
        WHEN rarity = 'RARE' THEN '6-8'
        WHEN rarity = 'EPIC' THEN '3-5'
        WHEN rarity = 'LEGENDARY' THEN '2-3'
    END as target_range,
    CASE 
        WHEN COUNT(*) >= 3 THEN '✓ OK'
        ELSE '⚠ LOW'
    END as status
FROM "EmojiTypes"
WHERE unlock_method = 'EGG_DROP'
GROUP BY rarity
ORDER BY 
    CASE rarity
        WHEN 'COMMON' THEN 1
        WHEN 'UNCOMMON' THEN 2
        WHEN 'RARE' THEN 3
        WHEN 'EPIC' THEN 4
        WHEN 'LEGENDARY' THEN 5
    END;

\echo '';
\echo '==========================================';
\echo 'Verification Complete!';
\echo '==========================================';
