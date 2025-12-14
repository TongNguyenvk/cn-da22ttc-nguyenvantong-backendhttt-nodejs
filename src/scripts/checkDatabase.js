const { sequelize } = require('../models');

async function checkDatabaseTables() {
    try {
        console.log('🔍 Checking database tables...');
        console.log('=' .repeat(60));
        
        // Get all tables in database
        const [results] = await sequelize.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        `);
        
        console.log(`📊 Found ${results.length} tables in database:`);
        console.log('-' .repeat(40));
        
        const existingTables = [];
        results.forEach((row, index) => {
            console.log(`${(index + 1).toString().padStart(2)}. ${row.table_name}`);
            existingTables.push(row.table_name);
        });
        
        console.log('\n' + '=' .repeat(60));
        
        // Check models vs tables
        console.log('🔍 Checking models vs database tables...');
        console.log('-' .repeat(40));
        
        // List of expected models/tables
        const expectedTables = [
            // Original tables
            'Users',
            'Roles', 
            'Programs',
            'Courses',
            'Subjects',
            'Chapters',
            'ChapterSections',
            'LOs',
            'ChapterLO',
            'POs',
            'PLOs',
            'PosPlos',
            'Questions',
            'QuestionTypes',
            'Levels',
            'TypeOfKnowledges',
            'TypeSubjects',
            'Answers',
            'Quizzes',
            'QuizQuestions',
            'QuizResults',
            'QuizSessions',
            'QuizAnalytics',
            'UserQuestionHistories',
            'UserQuizTrackings',
            'UserLOTrackings',
            'UserLearningPaths',
            'CourseResults',
            'StudentCourses',
            'Groups',
            'TienQuyets',
            
            // New analytics tables
            'StudentProgramProgress',
            'SubjectOutcomeAnalysis', 
            'ProgramOutcomeTracking',
            'LearningAnalytics'
        ];
        
        // Check which tables exist
        const missingTables = [];
        const extraTables = [];
        
        expectedTables.forEach(table => {
            if (!existingTables.includes(table)) {
                missingTables.push(table);
            }
        });
        
        existingTables.forEach(table => {
            if (!expectedTables.includes(table)) {
                extraTables.push(table);
            }
        });
        
        // Report missing tables
        if (missingTables.length > 0) {
            console.log('❌ Missing tables:');
            missingTables.forEach((table, index) => {
                console.log(`   ${index + 1}. ${table}`);
            });
        } else {
            console.log('✅ All expected tables exist');
        }
        
        // Report extra tables
        if (extraTables.length > 0) {
            console.log('\n📋 Extra tables (not in models):');
            extraTables.forEach((table, index) => {
                console.log(`   ${index + 1}. ${table}`);
            });
        }
        
        console.log('\n' + '=' .repeat(60));
        console.log('📊 SUMMARY:');
        console.log(`   Total tables in DB: ${existingTables.length}`);
        console.log(`   Expected tables: ${expectedTables.length}`);
        console.log(`   Missing tables: ${missingTables.length}`);
        console.log(`   Extra tables: ${extraTables.length}`);
        
        // Check if analytics tables exist
        console.log('\n🔍 Analytics Tables Status:');
        const analyticsTables = [
            'StudentProgramProgress',
            'SubjectOutcomeAnalysis', 
            'ProgramOutcomeTracking',
            'LearningAnalytics'
        ];
        
        analyticsTables.forEach(table => {
            const exists = existingTables.includes(table);
            console.log(`   ${exists ? '✅' : '❌'} ${table}`);
        });
        
        return {
            totalTables: existingTables.length,
            existingTables,
            missingTables,
            extraTables,
            analyticsTablesExist: analyticsTables.every(table => existingTables.includes(table))
        };
        
    } catch (error) {
        console.error('❌ Error checking database:', error);
        throw error;
    }
}

async function checkTableStructures() {
    try {
        console.log('\n🔍 Checking analytics table structures...');
        console.log('-' .repeat(40));
        
        const analyticsTables = [
            'StudentProgramProgress',
            'SubjectOutcomeAnalysis', 
            'ProgramOutcomeTracking',
            'LearningAnalytics'
        ];
        
        for (const tableName of analyticsTables) {
            try {
                const [columns] = await sequelize.query(`
                    SELECT column_name, data_type, is_nullable, column_default
                    FROM information_schema.columns 
                    WHERE table_name = '${tableName}' 
                    ORDER BY ordinal_position;
                `);
                
                if (columns.length > 0) {
                    console.log(`\n📋 ${tableName} (${columns.length} columns):`);
                    columns.forEach(col => {
                        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
                        console.log(`   - ${col.column_name}: ${col.data_type} ${nullable}`);
                    });
                } else {
                    console.log(`❌ ${tableName}: Table not found`);
                }
                
            } catch (error) {
                console.log(`❌ ${tableName}: Error checking structure - ${error.message}`);
            }
        }
        
    } catch (error) {
        console.error('❌ Error checking table structures:', error);
    }
}

async function main() {
    try {
        const result = await checkDatabaseTables();
        await checkTableStructures();
        
        console.log('\n' + '=' .repeat(60));
        
        if (result.missingTables.length > 0) {
            console.log('⚠️  Some tables are missing. You may need to run migrations.');
            console.log('💡 Suggested actions:');
            console.log('   1. Run: npm run migrate (if you have migrations)');
            console.log('   2. Or run: node src/scripts/createAnalyticsTables.js');
            console.log('   3. Or use Sequelize sync: sequelize.sync()');
        } else {
            console.log('🎉 Database structure looks good!');
        }
        
        if (!result.analyticsTablesExist) {
            console.log('\n❌ Analytics tables are missing!');
            console.log('💡 Run the following to create them:');
            console.log('   node src/scripts/createAnalyticsTables.js');
        } else {
            console.log('\n✅ All analytics tables exist!');
        }
        
    } catch (error) {
        console.error('💥 Script failed:', error);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = { checkDatabaseTables, checkTableStructures };
