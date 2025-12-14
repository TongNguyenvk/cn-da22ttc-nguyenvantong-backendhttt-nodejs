'use strict';

/**
 * MIGRATION: Refactor Gamification System V2
 * 
 * Mục tiêu:
 * 1. Loại bỏ tiền tệ Kristal - chỉ giữ SynCoin
 * 2. Loại bỏ Frame và Name Effect
 * 3. Loại bỏ hệ thống Skill
 * 
 * Frontend Requirements: GAME.md
 * Date: 8/10/2025
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      console.log('🚀 Starting Gamification Refactoring V2...');

      // ==========================================
      // PHẦN 1: LOẠI BỎ KRISTAL - CHỈ GIỮ SYNCOIN
      // ==========================================
      console.log('\n📦 PHẦN 1: Dọn dẹp hệ thống tiền tệ Kristal...');

      try {
        // 1.1. Xóa cột Kristal từ UserCurrencies (nếu có)
        console.log('  ➤ Removing Kristal columns from UserCurrencies...');
        const userCurrenciesColumns = await queryInterface.describeTable('UserCurrencies');
        if (userCurrenciesColumns.kristal_balance) {
          await queryInterface.removeColumn('UserCurrencies', 'kristal_balance', { transaction });
          console.log('    ✓ Removed kristal_balance');
        }

        // 1.2. Xóa cột Kristal từ EggOpeningHistory
        console.log('  ➤ Removing Kristal columns from EggOpeningHistory...');
        const eggHistoryColumns = await queryInterface.describeTable('EggOpeningHistory');
        if (eggHistoryColumns.total_value_kristal) {
          await queryInterface.removeColumn('EggOpeningHistory', 'total_value_kristal', { transaction });
          console.log('    ✓ Removed total_value_kristal');
        }
        if (eggHistoryColumns.kristal_from_duplicates) {
          await queryInterface.removeColumn('EggOpeningHistory', 'kristal_from_duplicates', { transaction });
          console.log('    ✓ Removed kristal_from_duplicates');
        }

        // 1.3. Xóa cột giá Kristal từ EggTypes
        console.log('  ➤ Removing Kristal price from EggTypes...');
        const eggTypesColumns = await queryInterface.describeTable('EggTypes');
        if (eggTypesColumns.base_price_kristal) {
          await queryInterface.removeColumn('EggTypes', 'base_price_kristal', { transaction });
          console.log('    ✓ Removed base_price_kristal');
        }

        // 1.4. Cập nhật ENUM của Skill cost_type (nếu bảng Skills vẫn còn)
        const skillsTable = await queryInterface.describeTable('Skills').catch(() => null);
        if (skillsTable) {
          console.log('  ➤ Updating Skill cost_type ENUM...');
          // Đổi tên ENUM cũ
          await queryInterface.sequelize.query(
            'ALTER TYPE "enum_Skills_cost_type" RENAME TO "enum_Skills_cost_type_old";',
            { transaction }
          );
          // Tạo ENUM mới chỉ có SYNCOIN
          await queryInterface.sequelize.query(
            "CREATE TYPE \"enum_Skills_cost_type\" AS ENUM('SYNCOIN');",
            { transaction }
          );
          // Cập nhật cột sử dụng ENUM mới
          await queryInterface.sequelize.query(
            'ALTER TABLE "Skills" ALTER COLUMN cost_type TYPE "enum_Skills_cost_type" USING cost_type::text::"enum_Skills_cost_type";',
            { transaction }
          );
          // Xóa ENUM cũ
          await queryInterface.sequelize.query(
            'DROP TYPE "enum_Skills_cost_type_old";',
            { transaction }
          );
          console.log('    ✓ Updated cost_type ENUM to SYNCOIN only');
        }

        // 1.5. Xóa bản ghi tiền tệ Kristal
        console.log('  ➤ Removing Kristal currency record...');
        await queryInterface.bulkDelete('Currencies', { currency_code: 'KRIS' }, { transaction });
        console.log('    ✓ Removed KRIS currency');

        console.log('  ✅ Kristal removal completed!');
      } catch (error) {
        console.error('  ❌ Error in Kristal removal:', error.message);
        throw error;
      }

      // ==========================================
      // PHẦN 2: LOẠI BỎ FRAME & NAME EFFECT
      // ==========================================
      console.log('\n🖼️  PHẦN 2: Dọn dẹp Frame và Name Effect...');

      try {
        // 2.1. Xóa foreign keys từ UserCustomization
        console.log('  ➤ Removing Frame and NameEffect FK from UserCustomization...');
        const customizationColumns = await queryInterface.describeTable('UserCustomization');
        
        if (customizationColumns.equipped_frame_id) {
          await queryInterface.removeColumn('UserCustomization', 'equipped_frame_id', { transaction });
          console.log('    ✓ Removed equipped_frame_id');
        }
        if (customizationColumns.equipped_name_effect_id) {
          await queryInterface.removeColumn('UserCustomization', 'equipped_name_effect_id', { transaction });
          console.log('    ✓ Removed equipped_name_effect_id');
        }

        // 2.2. Xóa bản ghi Frame và NameEffect từ UserInventory
        console.log('  ➤ Removing Frame and NameEffect from UserInventory...');
        await queryInterface.bulkDelete(
          'UserInventory',
          { item_type: ['FRAME', 'NAME_EFFECT'] },
          { transaction }
        );
        console.log('    ✓ Deleted Frame and NameEffect inventory items');

        // 2.3. Xóa bảng AvatarFrames
        console.log('  ➤ Dropping AvatarFrames table...');
        await queryInterface.dropTable('AvatarFrames', { transaction });
        console.log('    ✓ Dropped AvatarFrames');

        // 2.4. Xóa bảng NameEffects
        console.log('  ➤ Dropping NameEffects table...');
        await queryInterface.dropTable('NameEffects', { transaction });
        console.log('    ✓ Dropped NameEffects');

        // 2.5. Cập nhật ENUM UserInventory.item_type
        console.log('  ➤ Updating UserInventory item_type ENUM...');
        await queryInterface.sequelize.query(
          'ALTER TYPE "enum_UserInventory_item_type" RENAME TO "enum_UserInventory_item_type_old";',
          { transaction }
        );
        await queryInterface.sequelize.query(
          "CREATE TYPE \"enum_UserInventory_item_type\" AS ENUM('AVATAR', 'EMOJI');",
          { transaction }
        );
        await queryInterface.sequelize.query(
          'ALTER TABLE "UserInventory" ALTER COLUMN item_type TYPE "enum_UserInventory_item_type" USING item_type::text::"enum_UserInventory_item_type";',
          { transaction }
        );
        await queryInterface.sequelize.query(
          'DROP TYPE "enum_UserInventory_item_type_old";',
          { transaction }
        );
        console.log('    ✓ Updated item_type ENUM (AVATAR, EMOJI only)');

        // 2.6. Cập nhật ENUM EggRewards.reward_type
        console.log('  ➤ Updating EggRewards reward_type ENUM...');
        await queryInterface.sequelize.query(
          'ALTER TYPE "enum_EggRewards_reward_type" RENAME TO "enum_EggRewards_reward_type_old";',
          { transaction }
        );
        await queryInterface.sequelize.query(
          "CREATE TYPE \"enum_EggRewards_reward_type\" AS ENUM('AVATAR', 'EMOJI', 'SYNCOIN', 'XP');",
          { transaction }
        );
        await queryInterface.sequelize.query(
          'ALTER TABLE "EggRewards" ALTER COLUMN reward_type TYPE "enum_EggRewards_reward_type" USING reward_type::text::"enum_EggRewards_reward_type";',
          { transaction }
        );
        await queryInterface.sequelize.query(
          'DROP TYPE "enum_EggRewards_reward_type_old";',
          { transaction }
        );
        console.log('    ✓ Updated reward_type ENUM (removed FRAME, NAME_EFFECT, KRISTAL)');

        console.log('  ✅ Frame & NameEffect removal completed!');
      } catch (error) {
        console.error('  ❌ Error in Frame/NameEffect removal:', error.message);
        throw error;
      }

      // ==========================================
      // PHẦN 3: LOẠI BỎ HỆ THỐNG SKILL
      // ==========================================
      console.log('\n⚔️  PHẦN 3: Dọn dẹp hệ thống Skill...');

      try {
        // 3.1. Xóa các bảng có foreign keys đến Skills trước
        console.log('  ➤ Dropping skill-related tables...');
        
        // Kiểm tra và xóa từng bảng
        const tablesToDrop = [
          'ActiveSkillEffects',
          'SkillUsageHistory', 
          'QuizSkillLoadouts',
          'UserSkills'
        ];

        for (const tableName of tablesToDrop) {
          try {
            await queryInterface.dropTable(tableName, { transaction });
            console.log(`    ✓ Dropped ${tableName}`);
          } catch (error) {
            console.log(`    ⚠ Table ${tableName} not found or already dropped`);
          }
        }

        // 3.2. Xóa bảng Skills chính
        console.log('  ➤ Dropping Skills table...');
        try {
          await queryInterface.dropTable('Skills', { transaction });
          console.log('    ✓ Dropped Skills');
        } catch (error) {
          console.log('    ⚠ Skills table not found or already dropped');
        }

        // 3.3. Xóa các cột liên quan đến skill từ Quizzes
        console.log('  ➤ Removing skill columns from Quizzes...');
        const quizzesColumns = await queryInterface.describeTable('Quizzes');
        
        if (quizzesColumns.skill_system_enabled) {
          await queryInterface.removeColumn('Quizzes', 'skill_system_enabled', { transaction });
          console.log('    ✓ Removed skill_system_enabled');
        }

        // 3.4. Xóa các cột skill từ QuizRacingResults (nếu có)
        const racingResultsTable = await queryInterface.describeTable('QuizRacingResults').catch(() => null);
        if (racingResultsTable) {
          console.log('  ➤ Removing skill columns from QuizRacingResults...');
          
          if (racingResultsTable.total_skills_used) {
            await queryInterface.removeColumn('QuizRacingResults', 'total_skills_used', { transaction });
            console.log('    ✓ Removed total_skills_used');
          }
          if (racingResultsTable.skills_used) {
            await queryInterface.removeColumn('QuizRacingResults', 'skills_used', { transaction });
            console.log('    ✓ Removed skills_used');
          }
        }

        console.log('  ✅ Skill system removal completed!');
      } catch (error) {
        console.error('  ❌ Error in Skill removal:', error.message);
        throw error;
      }

      // ==========================================
      // PHẦN 4: DỌN DẸP FUNCTIONS (OPTIONAL)
      // ==========================================
      console.log('\n🔧 PHẦN 4: Dọn dẹp functions liên quan...');

      try {
        // Xóa các functions liên quan đến skill
        const functionsToCheck = [
          'can_purchase_skill(integer, integer)',
          'purchase_skill(integer, integer)',
          'calculate_racing_session_stats(character varying)',
          'get_user_racing_performance(integer)'
        ];

        for (const funcSignature of functionsToCheck) {
          try {
            await queryInterface.sequelize.query(
              `DROP FUNCTION IF EXISTS ${funcSignature} CASCADE;`,
              { transaction }
            );
            console.log(`    ✓ Dropped function ${funcSignature}`);
          } catch (error) {
            console.log(`    ⚠ Function ${funcSignature} not found`);
          }
        }

        console.log('  ✅ Functions cleanup completed!');
      } catch (error) {
        console.error('  ⚠️  Warning in functions cleanup:', error.message);
        // Không throw error vì functions cleanup không critical
      }

      console.log('\n🎉 Migration completed successfully!');
      console.log('\n📊 Summary:');
      console.log('  ✅ Kristal currency removed - SynCoin only');
      console.log('  ✅ Frame & NameEffect removed - Avatar & Emoji only');
      console.log('  ✅ Skill system removed - Simplified gameplay');
      console.log('\n⚠️  NEXT STEPS:');
      console.log('  1. Update Models: Delete model files for removed features');
      console.log('  2. Update Services: Remove skill/frame/nameEffect logic');
      console.log('  3. Update Controllers: Remove related endpoints');
      console.log('  4. Update Routes: Remove skill/frame routes');
      console.log('  5. Update Frontend: Remove UI for removed features');
      console.log('  6. Test thoroughly: Quiz racing, egg opening, shop');
    });
  },

  async down(queryInterface, Sequelize) {
    console.log('⚠️  ROLLBACK WARNING:');
    console.log('This migration makes significant structural changes.');
    console.log('Rollback is complex and may result in data loss.');
    console.log('It is recommended to restore from a database backup instead.');
    console.log('\n❌ Rollback not implemented for safety reasons.');
    
    throw new Error('Rollback for gamification refactoring is not supported. Please restore from backup if needed.');
  }
};
