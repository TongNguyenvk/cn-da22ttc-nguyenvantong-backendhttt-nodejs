const { sequelize } = require('../models');

async function createAnalyticsTables() {
    try {
        console.log('🚀 Creating missing analytics tables...');
        console.log('=' .repeat(50));

        // 1. Create StudentProgramProgress table
        await createStudentProgramProgressTable();
        
        // 2. Create SubjectOutcomeAnalysis table
        await createSubjectOutcomeAnalysisTable();
        
        // 3. Create ProgramOutcomeTracking table
        await createProgramOutcomeTrackingTable();
        
        // 4. Create LearningAnalytics table
        await createLearningAnalyticsTable();
        
        console.log('✅ All analytics tables created successfully!');
        console.log('🔧 Running database optimization...');
        
        // Apply optimizations
        await applyDatabaseOptimizations();
        
        console.log('🎉 Analytics database setup completed!');
        
    } catch (error) {
        console.error('❌ Error creating analytics tables:', error);
        throw error;
    }
}

async function createStudentProgramProgressTable() {
    console.log('📊 Creating StudentProgramProgress table...');
    
    await sequelize.query(`
        CREATE TABLE IF NOT EXISTS "StudentProgramProgress" (
            "progress_id" SERIAL PRIMARY KEY,
            "user_id" INTEGER NOT NULL REFERENCES "Users"("user_id"),
            "program_id" INTEGER NOT NULL REFERENCES "Programs"("program_id"),
            "overall_progress" JSONB NOT NULL DEFAULT '{}',
            "po_progress" JSONB NOT NULL DEFAULT '{}',
            "plo_progress" JSONB NOT NULL DEFAULT '{}',
            "semester_progress" JSONB NOT NULL DEFAULT '{}',
            "strengths_weaknesses" JSONB NOT NULL DEFAULT '{}',
            "predictions" JSONB NOT NULL DEFAULT '{}',
            "last_updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            "student_status" VARCHAR(20) NOT NULL DEFAULT 'active' CHECK ("student_status" IN ('active', 'on_leave', 'graduated', 'dropped_out')),
            "program_start_date" TIMESTAMP WITH TIME ZONE,
            "expected_graduation_date" TIMESTAMP WITH TIME ZONE,
            "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            UNIQUE("user_id", "program_id")
        );
    `);
    
    console.log('  ✅ StudentProgramProgress table created');
}

async function createSubjectOutcomeAnalysisTable() {
    console.log('📊 Creating SubjectOutcomeAnalysis table...');
    
    await sequelize.query(`
        CREATE TABLE IF NOT EXISTS "SubjectOutcomeAnalysis" (
            "analysis_id" SERIAL PRIMARY KEY,
            "subject_id" INTEGER NOT NULL REFERENCES "Subjects"("subject_id"),
            "program_id" INTEGER NOT NULL REFERENCES "Programs"("program_id"),
            "subject_statistics" JSONB NOT NULL DEFAULT '{}',
            "po_achievement" JSONB NOT NULL DEFAULT '{}',
            "plo_achievement" JSONB NOT NULL DEFAULT '{}',
            "lo_performance" JSONB NOT NULL DEFAULT '{}',
            "difficulty_analysis" JSONB NOT NULL DEFAULT '{}',
            "temporal_trends" JSONB NOT NULL DEFAULT '{}',
            "comparative_analysis" JSONB NOT NULL DEFAULT '{}',
            "improvement_recommendations" JSONB NOT NULL DEFAULT '{}',
            "data_quality_metrics" JSONB NOT NULL DEFAULT '{}',
            "analysis_semester" VARCHAR(10) NOT NULL,
            "academic_year" VARCHAR(10) NOT NULL,
            "analysis_date" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            "analysis_status" VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK ("analysis_status" IN ('draft', 'completed', 'reviewed', 'approved')),
            "analyzed_by" INTEGER REFERENCES "Users"("user_id"),
            "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            UNIQUE("subject_id", "analysis_semester", "academic_year")
        );
    `);
    
    console.log('  ✅ SubjectOutcomeAnalysis table created');
}

async function createProgramOutcomeTrackingTable() {
    console.log('📊 Creating ProgramOutcomeTracking table...');
    
    await sequelize.query(`
        CREATE TABLE IF NOT EXISTS "ProgramOutcomeTracking" (
            "tracking_id" SERIAL PRIMARY KEY,
            "user_id" INTEGER NOT NULL REFERENCES "Users"("user_id"),
            "program_id" INTEGER NOT NULL REFERENCES "Programs"("program_id"),
            "po_id" INTEGER REFERENCES "POs"("po_id"),
            "plo_id" INTEGER REFERENCES "PLOs"("plo_id"),
            "outcome_type" VARCHAR(10) NOT NULL CHECK ("outcome_type" IN ('PO', 'PLO')),
            "current_score" FLOAT NOT NULL DEFAULT 0 CHECK ("current_score" >= 0 AND "current_score" <= 100),
            "target_score" FLOAT NOT NULL DEFAULT 70 CHECK ("target_score" >= 0 AND "target_score" <= 100),
            "achievement_status" VARCHAR(20) NOT NULL DEFAULT 'not_started' CHECK ("achievement_status" IN ('not_started', 'in_progress', 'achieved', 'exceeded', 'at_risk')),
            "score_history" JSONB NOT NULL DEFAULT '[]',
            "detailed_analysis" JSONB NOT NULL DEFAULT '{}',
            "predictions" JSONB NOT NULL DEFAULT '{}',
            "milestones" JSONB NOT NULL DEFAULT '{}',
            "evidence_count" INTEGER NOT NULL DEFAULT 0,
            "last_assessment_date" TIMESTAMP WITH TIME ZONE,
            "first_assessment_date" TIMESTAMP WITH TIME ZONE,
            "program_weight" FLOAT NOT NULL DEFAULT 1.0,
            "notes" TEXT,
            "is_active" BOOLEAN NOT NULL DEFAULT true,
            "last_updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            CHECK (("po_id" IS NOT NULL AND "plo_id" IS NULL AND "outcome_type" = 'PO') OR 
                   ("po_id" IS NULL AND "plo_id" IS NOT NULL AND "outcome_type" = 'PLO'))
        );
    `);
    
    console.log('  ✅ ProgramOutcomeTracking table created');
}

async function createLearningAnalyticsTable() {
    console.log('📊 Creating LearningAnalytics table...');
    
    await sequelize.query(`
        CREATE TABLE IF NOT EXISTS "LearningAnalytics" (
            "analytics_id" SERIAL PRIMARY KEY,
            "program_id" INTEGER NOT NULL REFERENCES "Programs"("program_id"),
            "subject_id" INTEGER REFERENCES "Subjects"("subject_id"),
            "analysis_type" VARCHAR(30) NOT NULL CHECK ("analysis_type" IN ('program_overview', 'subject_analysis', 'student_cohort', 'temporal_analysis', 'comparative_analysis')),
            "time_period" JSONB NOT NULL DEFAULT '{}',
            "overview_metrics" JSONB NOT NULL DEFAULT '{}',
            "outcome_analysis" JSONB NOT NULL DEFAULT '{}',
            "lo_performance" JSONB NOT NULL DEFAULT '{}',
            "difficulty_distribution" JSONB NOT NULL DEFAULT '{}',
            "temporal_trends" JSONB NOT NULL DEFAULT '{}',
            "student_segmentation" JSONB NOT NULL DEFAULT '{}',
            "correlation_analysis" JSONB NOT NULL DEFAULT '{}',
            "predictive_insights" JSONB NOT NULL DEFAULT '{}',
            "benchmark_comparisons" JSONB NOT NULL DEFAULT '{}',
            "data_quality" JSONB NOT NULL DEFAULT '{}',
            "visualization_config" JSONB NOT NULL DEFAULT '{}',
            "analysis_status" VARCHAR(20) NOT NULL DEFAULT 'processing' CHECK ("analysis_status" IN ('processing', 'completed', 'error', 'archived')),
            "created_by" INTEGER NOT NULL REFERENCES "Users"("user_id"),
            "processing_time" INTEGER,
            "data_snapshot_date" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            "analysis_config" JSONB NOT NULL DEFAULT '{}',
            "tags" JSONB NOT NULL DEFAULT '[]',
            "notes" TEXT,
            "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
    `);
    
    console.log('  ✅ LearningAnalytics table created');
}

async function applyDatabaseOptimizations() {
    console.log('🔧 Applying database optimizations...');
    
    // Create indexes for StudentProgramProgress
    await sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_student_program_progress_user_program 
        ON "StudentProgramProgress" ("user_id", "program_id");
    `);
    
    await sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_student_program_progress_status 
        ON "StudentProgramProgress" ("student_status", "last_updated");
    `);
    
    // Create indexes for SubjectOutcomeAnalysis
    await sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_subject_outcome_analysis_semester 
        ON "SubjectOutcomeAnalysis" ("program_id", "analysis_semester", "academic_year");
    `);
    
    await sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_subject_outcome_analysis_status 
        ON "SubjectOutcomeAnalysis" ("analysis_status", "analysis_date");
    `);
    
    // Create indexes for ProgramOutcomeTracking
    await sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_program_outcome_tracking_active 
        ON "ProgramOutcomeTracking" ("program_id", "outcome_type", "is_active");
    `);
    
    await sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_program_outcome_tracking_user_program 
        ON "ProgramOutcomeTracking" ("user_id", "program_id", "outcome_type") 
        WHERE "is_active" = true;
    `);
    
    // Create indexes for LearningAnalytics
    await sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_learning_analytics_type_status 
        ON "LearningAnalytics" ("analysis_type", "analysis_status");
    `);
    
    await sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_learning_analytics_program_date 
        ON "LearningAnalytics" ("program_id", "data_snapshot_date");
    `);
    
    // Create GIN indexes for JSON fields
    await sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_student_progress_po_gin 
        ON "StudentProgramProgress" USING GIN ("po_progress");
    `);
    
    await sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_student_progress_plo_gin 
        ON "StudentProgramProgress" USING GIN ("plo_progress");
    `);
    
    await sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_outcome_tracking_history_gin 
        ON "ProgramOutcomeTracking" USING GIN ("score_history");
    `);
    
    await sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_learning_analytics_overview_gin 
        ON "LearningAnalytics" USING GIN ("overview_metrics");
    `);
    
    console.log('  ✅ Database indexes created');
}

async function verifyTablesCreated() {
    console.log('🔍 Verifying tables were created...');
    
    const tables = [
        'StudentProgramProgress',
        'SubjectOutcomeAnalysis', 
        'ProgramOutcomeTracking',
        'LearningAnalytics'
    ];
    
    for (const table of tables) {
        try {
            const [result] = await sequelize.query(`
                SELECT COUNT(*) as count 
                FROM information_schema.tables 
                WHERE table_name = '${table}';
            `);
            
            if (result[0].count > 0) {
                console.log(`  ✅ ${table} exists`);
            } else {
                console.log(`  ❌ ${table} not found`);
            }
        } catch (error) {
            console.log(`  ❌ ${table} error: ${error.message}`);
        }
    }
}

async function main() {
    try {
        await createAnalyticsTables();
        await verifyTablesCreated();
        
        console.log('\n' + '=' .repeat(50));
        console.log('🎉 Analytics tables setup completed!');
        console.log('💡 Next steps:');
        console.log('   1. Install node-cron: npm install node-cron');
        console.log('   2. Restart server: npm start');
        console.log('   3. Test data flow: node src/scripts/testDataFlow.js');
        console.log('   4. Migrate existing data: node src/scripts/migrateAnalyticsData.js full');
        
    } catch (error) {
        console.error('💥 Setup failed:', error);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = { createAnalyticsTables, verifyTablesCreated };
