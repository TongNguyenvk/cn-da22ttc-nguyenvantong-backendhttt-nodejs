-- =====================================================
-- GAMIFICATION REFACTORING V2 - PostgreSQL Script
-- =====================================================
-- Mục tiêu:
-- 1. Loại bỏ Kristal - chỉ giữ SynCoin
-- 2. Loại bỏ Frame và Name Effect
-- 3. Loại bỏ hệ thống Skill
--
-- Date: 8/10/2025
-- =====================================================

BEGIN;

-- =====================================================
-- PHẦN 1: LOẠI BỎ KRISTAL - CHỈ GIỮ SYNCOIN
-- =====================================================
DO $$ 
BEGIN
    RAISE NOTICE '📦 PHẦN 1: Dọn dẹp hệ thống tiền tệ Kristal...';
    
    -- 1.1. Xóa cột Kristal từ EggOpeningHistory
    RAISE NOTICE '  ➤ Removing Kristal columns from EggOpeningHistory...';
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'EggOpeningHistory' 
        AND column_name = 'total_value_kristal'
    ) THEN
        ALTER TABLE "EggOpeningHistory" DROP COLUMN IF EXISTS total_value_kristal;
        RAISE NOTICE '    ✓ Removed total_value_kristal';
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'EggOpeningHistory' 
        AND column_name = 'kristal_from_duplicates'
    ) THEN
        ALTER TABLE "EggOpeningHistory" DROP COLUMN IF EXISTS kristal_from_duplicates;
        RAISE NOTICE '    ✓ Removed kristal_from_duplicates';
    END IF;
    
    -- 1.2. Xóa cột giá Kristal từ EggTypes
    RAISE NOTICE '  ➤ Removing Kristal price from EggTypes...';
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'EggTypes' 
        AND column_name = 'base_price_kristal'
    ) THEN
        ALTER TABLE "EggTypes" DROP COLUMN IF EXISTS base_price_kristal;
        RAISE NOTICE '    ✓ Removed base_price_kristal';
    END IF;
    
    -- 1.3. Xóa bản ghi tiền tệ Kristal
    RAISE NOTICE '  ➤ Removing Kristal currency record...';
    DELETE FROM "Currencies" WHERE currency_code = 'KRIS';
    RAISE NOTICE '    ✓ Removed KRIS currency';
    
    RAISE NOTICE '  ✅ Kristal removal completed!';
END $$;

-- =====================================================
-- PHẦN 2: LOẠI BỎ FRAME & NAME EFFECT
-- =====================================================
DO $$ 
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🖼️  PHẦN 2: Dọn dẹp Frame và Name Effect...';
    
    -- 2.1. Xóa foreign keys từ UserCustomization
    RAISE NOTICE '  ➤ Removing Frame and NameEffect FK from UserCustomization...';
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'UserCustomization' 
        AND column_name = 'equipped_frame_id'
    ) THEN
        ALTER TABLE "UserCustomization" DROP COLUMN IF EXISTS equipped_frame_id CASCADE;
        RAISE NOTICE '    ✓ Removed equipped_frame_id';
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'UserCustomization' 
        AND column_name = 'equipped_name_effect_id'
    ) THEN
        ALTER TABLE "UserCustomization" DROP COLUMN IF EXISTS equipped_name_effect_id CASCADE;
        RAISE NOTICE '    ✓ Removed equipped_name_effect_id';
    END IF;
    
    -- 2.2. Xóa bản ghi Frame và NameEffect từ UserInventory
    RAISE NOTICE '  ➤ Removing Frame and NameEffect from UserInventory...';
    DELETE FROM "UserInventory" WHERE item_type IN ('FRAME', 'NAME_EFFECT');
    RAISE NOTICE '    ✓ Deleted Frame and NameEffect inventory items';
    
    -- 2.3. Xóa bảng AvatarFrames
    RAISE NOTICE '  ➤ Dropping AvatarFrames table...';
    DROP TABLE IF EXISTS "AvatarFrames" CASCADE;
    RAISE NOTICE '    ✓ Dropped AvatarFrames';
    
    -- 2.4. Xóa bảng NameEffects
    RAISE NOTICE '  ➤ Dropping NameEffects table...';
    DROP TABLE IF EXISTS "NameEffects" CASCADE;
    RAISE NOTICE '    ✓ Dropped NameEffects';
    
    -- 2.5. Cập nhật ENUM UserInventory.item_type
    RAISE NOTICE '  ➤ Updating UserInventory item_type ENUM...';
    ALTER TYPE "enum_UserInventory_item_type" RENAME TO "enum_UserInventory_item_type_old";
    CREATE TYPE "enum_UserInventory_item_type" AS ENUM('AVATAR', 'EMOJI');
    ALTER TABLE "UserInventory" 
        ALTER COLUMN item_type TYPE "enum_UserInventory_item_type" 
        USING item_type::text::"enum_UserInventory_item_type";
    DROP TYPE "enum_UserInventory_item_type_old";
    RAISE NOTICE '    ✓ Updated item_type ENUM (AVATAR, EMOJI only)';
    
    -- 2.6. Cập nhật ENUM EggRewards.reward_type
    RAISE NOTICE '  ➤ Updating EggRewards reward_type ENUM...';
    ALTER TYPE "enum_EggRewards_reward_type" RENAME TO "enum_EggRewards_reward_type_old";
    CREATE TYPE "enum_EggRewards_reward_type" AS ENUM('AVATAR', 'EMOJI', 'SYNCOIN', 'XP');
    ALTER TABLE "EggRewards" 
        ALTER COLUMN reward_type TYPE "enum_EggRewards_reward_type" 
        USING reward_type::text::"enum_EggRewards_reward_type";
    DROP TYPE "enum_EggRewards_reward_type_old";
    RAISE NOTICE '    ✓ Updated reward_type ENUM (removed FRAME, NAME_EFFECT, KRISTAL)';
    
    RAISE NOTICE '  ✅ Frame & NameEffect removal completed!';
END $$;

-- =====================================================
-- PHẦN 3: LOẠI BỎ HỆ THỐNG SKILL
-- =====================================================
DO $$ 
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '⚔️  PHẦN 3: Dọn dẹp hệ thống Skill...';
    
    -- 3.1. Xóa các bảng có foreign keys đến Skills trước
    RAISE NOTICE '  ➤ Dropping skill-related tables...';
    DROP TABLE IF EXISTS "ActiveSkillEffects" CASCADE;
    RAISE NOTICE '    ✓ Dropped ActiveSkillEffects';
    
    DROP TABLE IF EXISTS "SkillUsageHistory" CASCADE;
    RAISE NOTICE '    ✓ Dropped SkillUsageHistory';
    
    DROP TABLE IF EXISTS "QuizSkillLoadouts" CASCADE;
    RAISE NOTICE '    ✓ Dropped QuizSkillLoadouts';
    
    DROP TABLE IF EXISTS "UserSkills" CASCADE;
    RAISE NOTICE '    ✓ Dropped UserSkills';
    
    -- 3.2. Xóa bảng Skills chính
    RAISE NOTICE '  ➤ Dropping Skills table...';
    DROP TABLE IF EXISTS "Skills" CASCADE;
    RAISE NOTICE '    ✓ Dropped Skills';
    
    -- 3.3. Xóa các cột liên quan đến skill từ Quizzes
    RAISE NOTICE '  ➤ Removing skill columns from Quizzes...';
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Quizzes' 
        AND column_name = 'skill_system_enabled'
    ) THEN
        ALTER TABLE "Quizzes" DROP COLUMN IF EXISTS skill_system_enabled;
        RAISE NOTICE '    ✓ Removed skill_system_enabled';
    END IF;
    
    -- 3.4. Xóa các cột skill từ QuizRacingResults
    RAISE NOTICE '  ➤ Removing skill columns from QuizRacingResults...';
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'QuizRacingResults' 
        AND column_name = 'total_skills_used'
    ) THEN
        ALTER TABLE "QuizRacingResults" DROP COLUMN IF EXISTS total_skills_used;
        RAISE NOTICE '    ✓ Removed total_skills_used';
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'QuizRacingResults' 
        AND column_name = 'skills_used'
    ) THEN
        ALTER TABLE "QuizRacingResults" DROP COLUMN IF EXISTS skills_used;
        RAISE NOTICE '    ✓ Removed skills_used';
    END IF;
    
    RAISE NOTICE '  ✅ Skill system removal completed!';
END $$;

-- =====================================================
-- PHẦN 4: DỌN DẸP FUNCTIONS
-- =====================================================
DO $$ 
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🔧 PHẦN 4: Dọn dẹp functions liên quan...';
    
    -- Xóa các functions liên quan đến skill
    DROP FUNCTION IF EXISTS can_purchase_skill(integer, integer) CASCADE;
    RAISE NOTICE '    ✓ Dropped function can_purchase_skill';
    
    DROP FUNCTION IF EXISTS purchase_skill(integer, integer) CASCADE;
    RAISE NOTICE '    ✓ Dropped function purchase_skill';
    
    DROP FUNCTION IF EXISTS calculate_racing_session_stats(character varying) CASCADE;
    RAISE NOTICE '    ✓ Dropped function calculate_racing_session_stats';
    
    DROP FUNCTION IF EXISTS get_user_racing_performance(integer) CASCADE;
    RAISE NOTICE '    ✓ Dropped function get_user_racing_performance';
    
    RAISE NOTICE '  ✅ Functions cleanup completed!';
END $$;

-- =====================================================
-- SUMMARY
-- =====================================================
DO $$ 
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🎉 Migration completed successfully!';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Summary:';
    RAISE NOTICE '  ✅ Kristal currency removed - SynCoin only';
    RAISE NOTICE '  ✅ Frame & NameEffect removed - Avatar & Emoji only';
    RAISE NOTICE '  ✅ Skill system removed - Simplified gameplay';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  NEXT STEPS:';
    RAISE NOTICE '  1. Delete model files: avatarFrame.js, nameEffect.js, skill.js, etc.';
    RAISE NOTICE '  2. Update Services: Remove skill/frame/nameEffect logic';
    RAISE NOTICE '  3. Update Controllers: Remove related endpoints';
    RAISE NOTICE '  4. Update Routes: Remove skill/frame routes';
    RAISE NOTICE '  5. Restart backend server';
END $$;

COMMIT;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Kiểm tra các bảng đã bị xóa
SELECT 
    'Tables removed:' as status,
    COUNT(*) as count
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('AvatarFrames', 'NameEffects', 'Skills', 'UserSkills', 
                   'QuizSkillLoadouts', 'SkillUsageHistory', 'ActiveSkillEffects');

-- Kiểm tra ENUMs đã được cập nhật
SELECT 
    'UserInventory.item_type ENUM:' as description,
    unnest(enum_range(NULL::enum_UserInventory_item_type))::text as allowed_values;

SELECT 
    'EggRewards.reward_type ENUM:' as description,
    unnest(enum_range(NULL::enum_EggRewards_reward_type))::text as allowed_values;

-- Kiểm tra Currencies chỉ còn SYNC
SELECT 
    'Remaining currencies:' as status,
    currency_code, 
    currency_name 
FROM "Currencies";
