-- =====================================================
-- GAMIFICATION REFACTORING V2 - PostgreSQL Script  
-- =====================================================
-- Date: 8/10/2025
-- SAFE VERSION - Tạo lại ENUMs nếu cần
-- =====================================================

BEGIN;

-- =====================================================
-- PHẦN 1: LOẠI BỎ KRISTAL
-- =====================================================
DO $$ 
BEGIN
    RAISE NOTICE '📦 PHẦN 1: Dọn dẹp hệ thống tiền tệ Kristal...';
    
    -- Xóa các cột Kristal
    ALTER TABLE "EggOpeningHistory" DROP COLUMN IF EXISTS total_value_kristal CASCADE;
    ALTER TABLE "EggOpeningHistory" DROP COLUMN IF EXISTS kristal_from_duplicates CASCADE;
    ALTER TABLE "EggTypes" DROP COLUMN IF EXISTS base_price_kristal CASCADE;
    RAISE NOTICE '  ✓ Removed Kristal columns';
    
    -- Xóa currency Kristal
    DELETE FROM "Currencies" WHERE currency_code = 'KRIS';
    RAISE NOTICE '  ✓ Removed KRIS currency';
    RAISE NOTICE '  ✅ Kristal removal completed!';
END $$;

-- =====================================================
-- PHẦN 2: LOẠI BỎ FRAME & NAME EFFECT
-- =====================================================
DO $$ 
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🖼️  PHẦN 2: Dọn dẹp Frame và Name Effect...';
    
    -- Xóa columns từ UserCustomization (CASCADE sẽ xóa views phụ thuộc)
    ALTER TABLE "UserCustomization" DROP COLUMN IF EXISTS equipped_frame_id CASCADE;
    ALTER TABLE "UserCustomization" DROP COLUMN IF EXISTS equipped_name_effect_id CASCADE;
    RAISE NOTICE '  ✓ Removed frame/effect columns from UserCustomization';
    
    -- Xóa dữ liệu cũ từ UserInventory
    DELETE FROM "UserInventory" WHERE item_type IN ('FRAME', 'NAME_EFFECT');
    RAISE NOTICE '  ✓ Deleted Frame/NameEffect from UserInventory';
    
    -- Xóa tables
    DROP TABLE IF EXISTS "AvatarFrames" CASCADE;
    DROP TABLE IF EXISTS "NameEffects" CASCADE;
    RAISE NOTICE '  ✓ Dropped AvatarFrames & NameEffects tables';
    
    RAISE NOTICE '  ✅ Frame & NameEffect removal completed!';
END $$;

-- =====================================================
-- PHẦN 3: TẠO LẠI ENUMs CHO UserInventory
-- =====================================================
DO $$ 
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🔄 Recreating UserInventory ENUMs...';
    
    -- Tạo ENUM mới
    CREATE TYPE "enum_UserInventory_item_type_new" AS ENUM('AVATAR', 'EMOJI');
    
    -- Update column sang ENUM mới
    ALTER TABLE "UserInventory" 
        ALTER COLUMN item_type TYPE "enum_UserInventory_item_type_new" 
        USING item_type::text::"enum_UserInventory_item_type_new";
    
    -- Đổi tên ENUM
    ALTER TYPE "enum_UserInventory_item_type_new" RENAME TO "enum_UserInventory_item_type";
    
    RAISE NOTICE '  ✓ UserInventory.item_type ENUM updated (AVATAR, EMOJI only)';
END $$;

-- =====================================================
-- PHẦN 4: TẠO LẠI ENUMs CHO EggRewards
-- =====================================================
DO $$ 
BEGIN
    RAISE NOTICE '🔄 Recreating EggRewards ENUMs...';
    
    -- Xóa rewards cũ trước (KRISTAL, FRAME, NAME_EFFECT)
    DELETE FROM "EggRewards" WHERE reward_type IN ('KRISTAL', 'FRAME', 'NAME_EFFECT');
    RAISE NOTICE '  ✓ Deleted old reward types from EggRewards';
    
    -- Tạo ENUM mới
    CREATE TYPE "enum_EggRewards_reward_type_new" AS ENUM('AVATAR', 'EMOJI', 'SYNCOIN', 'XP');
    
    -- Update column sang ENUM mới
    ALTER TABLE "EggRewards" 
        ALTER COLUMN reward_type TYPE "enum_EggRewards_reward_type_new" 
        USING reward_type::text::"enum_EggRewards_reward_type_new";
    
    -- Đổi tên ENUM
    ALTER TYPE "enum_EggRewards_reward_type_new" RENAME TO "enum_EggRewards_reward_type";
    
    RAISE NOTICE '  ✓ EggRewards.reward_type ENUM updated (no FRAME, NAME_EFFECT, KRISTAL)';
END $$;

-- =====================================================
-- PHẦN 5: LOẠI BỎ HỆ THỐNG SKILL
-- =====================================================
DO $$ 
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '⚔️  PHẦN 5: Dọn dẹp hệ thống Skill...';
    
    -- Xóa skill tables
    DROP TABLE IF EXISTS "ActiveSkillEffects" CASCADE;
    DROP TABLE IF EXISTS "SkillUsageHistory" CASCADE;
    DROP TABLE IF EXISTS "QuizSkillLoadouts" CASCADE;
    DROP TABLE IF EXISTS "UserSkills" CASCADE;
    DROP TABLE IF EXISTS "Skills" CASCADE;
    RAISE NOTICE '  ✓ Dropped all Skill tables';
    
    -- Xóa skill columns
    ALTER TABLE "Quizzes" DROP COLUMN IF EXISTS skill_system_enabled CASCADE;
    ALTER TABLE "QuizRacingResults" DROP COLUMN IF EXISTS total_skills_used CASCADE;
    ALTER TABLE "QuizRacingResults" DROP COLUMN IF EXISTS skills_used CASCADE;
    RAISE NOTICE '  ✓ Removed skill columns from Quizzes & QuizRacingResults';
    
    -- Xóa skill functions
    DROP FUNCTION IF EXISTS can_purchase_skill(integer, integer) CASCADE;
    DROP FUNCTION IF EXISTS purchase_skill(integer, integer) CASCADE;
    DROP FUNCTION IF EXISTS calculate_racing_session_stats(character varying) CASCADE;
    DROP FUNCTION IF EXISTS get_user_racing_performance(integer) CASCADE;
    RAISE NOTICE '  ✓ Dropped skill-related functions';
    
    RAISE NOTICE '  ✅ Skill system removal completed!';
END $$;

-- =====================================================
-- SUMMARY
-- =====================================================
DO $$ 
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🎉 Migration completed successfully!';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Changes:';
    RAISE NOTICE '  ✅ Kristal → Removed (SynCoin only)';
    RAISE NOTICE '  ✅ Frames & NameEffects → Removed';
    RAISE NOTICE '  ✅ Skills System → Removed';
    RAISE NOTICE '  ✅ 7 Tables dropped';
    RAISE NOTICE '  ✅ 2 ENUMs simplified';
    RAISE NOTICE '  ✅ 4 Functions dropped';
END $$;

COMMIT;

-- =====================================================
-- VERIFICATION
-- =====================================================
\echo ''
\echo '=== VERIFICATION ==='

-- Check currencies
SELECT 'Currencies:' as check, currency_code, currency_name FROM "Currencies";

-- Check ENUMs
SELECT 'UserInventory.item_type:' as check, 
       unnest(enum_range(NULL::enum_UserInventory_item_type))::text as value;

SELECT 'EggRewards.reward_type:' as check,
       unnest(enum_range(NULL::enum_EggRewards_reward_type))::text as value;

-- Check removed tables
SELECT 'Removed tables (should be 0):' as check,
       COUNT(*) as count
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('AvatarFrames', 'NameEffects', 'Skills', 'UserSkills', 
                   'QuizSkillLoadouts', 'SkillUsageHistory', 'ActiveSkillEffects');

\echo ''
\echo '✅ Refactoring completed successfully!'
