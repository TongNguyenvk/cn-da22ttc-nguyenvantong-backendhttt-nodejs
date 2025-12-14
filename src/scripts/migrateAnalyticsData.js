const {
    StudentProgramProgress,
    ProgramOutcomeTracking,
    SubjectOutcomeAnalysis,
    LearningAnalytics,
    QuizResult,
    UserQuestionHistory,
    Question,
    Quiz,
    Subject,
    Course,
    Program,
    LO,
    PO,
    PLO,
    User,
    sequelize
} = require('../models');
const { Op } = require('sequelize');
const analyticsDataFlowService = require('../services/analyticsDataFlowService');

class AnalyticsDataMigration {
    
    constructor() {
        this.batchSize = 100;
        this.processedCount = 0;
        this.totalCount = 0;
    }
    
    // =====================================================
    // MAIN MIGRATION FUNCTIONS
    // =====================================================
    
    async runFullMigration() {
        try {
            console.log('🚀 Starting full analytics data migration...');
            console.log('⚠️  This process may take a while depending on data size');
            
            const startTime = Date.now();
            
            // Step 1: Migrate existing quiz results to analytics
            await this.migrateQuizResultsToAnalytics();
            
            // Step 2: Initialize student program progress
            await this.initializeStudentProgramProgress();
            
            // Step 3: Initialize program outcome tracking
            await this.initializeProgramOutcomeTracking();
            
            // Step 4: Generate initial subject analytics
            await this.generateInitialSubjectAnalytics();
            
            // Step 5: Generate initial learning analytics
            await this.generateInitialLearningAnalytics();
            
            const endTime = Date.now();
            const duration = Math.round((endTime - startTime) / 1000);
            
            console.log('✅ Full analytics data migration completed!');
            console.log(`⏱️  Total time: ${duration} seconds`);
            console.log(`📊 Total records processed: ${this.processedCount}`);
            
        } catch (error) {
            console.error('❌ Error in full migration:', error);
            throw error;
        }
    }
    
    // =====================================================
    // STEP 1: MIGRATE QUIZ RESULTS
    // =====================================================
    
    async migrateQuizResultsToAnalytics() {
        try {
            console.log('📚 Step 1: Migrating quiz results to analytics...');
            
            // Get all completed quiz results
            const totalQuizResults = await QuizResult.count({
                where: {
                    status: { [Op.in]: ['completed', 'finished'] }
                }
            });
            
            console.log(`📊 Found ${totalQuizResults} completed quiz results to process`);
            this.totalCount += totalQuizResults;
            
            let offset = 0;
            let processedBatch = 0;
            
            while (offset < totalQuizResults) {
                const quizResults = await QuizResult.findAll({
                    where: {
                        status: { [Op.in]: ['completed', 'finished'] }
                    },
                    limit: this.batchSize,
                    offset: offset,
                    order: [['createdAt', 'ASC']]
                });
                
                console.log(`🔄 Processing batch ${Math.floor(offset / this.batchSize) + 1}/${Math.ceil(totalQuizResults / this.batchSize)} (${quizResults.length} records)`);
                
                for (const quizResult of quizResults) {
                    try {
                        await analyticsDataFlowService.processQuizCompletion({
                            user_id: quizResult.user_id,
                            quiz_id: quizResult.quiz_id,
                            score: quizResult.score,
                            quiz_result_id: quizResult.result_id
                        });
                        
                        processedBatch++;
                        this.processedCount++;
                        
                        // Progress indicator
                        if (processedBatch % 10 === 0) {
                            const progress = Math.round((this.processedCount / totalQuizResults) * 100);
                            console.log(`   📈 Progress: ${this.processedCount}/${totalQuizResults} (${progress}%)`);
                        }
                        
                    } catch (error) {
                        console.error(`❌ Error processing quiz result ${quizResult.result_id}:`, error.message);
                        // Continue with next record
                    }
                }
                
                offset += this.batchSize;
                
                // Small delay to prevent overwhelming the database
                await this.sleep(100);
            }
            
            console.log(`✅ Step 1 completed: Processed ${processedBatch} quiz results`);
            
        } catch (error) {
            console.error('❌ Error in quiz results migration:', error);
            throw error;
        }
    }
    
    // =====================================================
    // STEP 2: INITIALIZE STUDENT PROGRESS
    // =====================================================
    
    async initializeStudentProgramProgress() {
        try {
            console.log('👥 Step 2: Initializing student program progress...');
            
            // Get all unique user-program combinations from quiz results
            const userProgramCombinations = await sequelize.query(`
                SELECT DISTINCT qr.user_id, c.program_id
                FROM "QuizResults" qr
                JOIN "Quizzes" q ON qr.quiz_id = q.quiz_id
                JOIN "Subjects" s ON q.subject_id = s.subject_id
                JOIN "Courses" c ON s.course_id = c.course_id
                WHERE qr.status IN ('completed', 'finished')
            `, {
                type: sequelize.QueryTypes.SELECT
            });
            
            console.log(`📊 Found ${userProgramCombinations.length} user-program combinations`);
            
            let processedCount = 0;
            
            for (const combination of userProgramCombinations) {
                try {
                    const { user_id, program_id } = combination;
                    
                    // Check if progress record already exists
                    const existingProgress = await StudentProgramProgress.findOne({
                        where: { user_id, program_id }
                    });
                    
                    if (!existingProgress) {
                        // Create initial progress record
                        await StudentProgramProgress.create({
                            user_id,
                            program_id,
                            overall_progress: {
                                total_subjects: 0,
                                completed_subjects: 0,
                                in_progress_subjects: 0,
                                completion_percentage: 0,
                                gpa: 0,
                                credits_earned: 0,
                                total_credits_required: 0
                            },
                            po_progress: {},
                            plo_progress: {},
                            semester_progress: {},
                            strengths_weaknesses: {
                                strong_areas: [],
                                weak_areas: [],
                                improvement_suggestions: []
                            },
                            predictions: {
                                graduation_probability: 0,
                                expected_graduation_date: null,
                                at_risk_subjects: [],
                                recommended_actions: []
                            },
                            student_status: 'active'
                        });
                        
                        processedCount++;
                    }
                    
                    if (processedCount % 50 === 0) {
                        console.log(`   📈 Created ${processedCount} student progress records`);
                    }
                    
                } catch (error) {
                    console.error(`❌ Error creating progress for user ${combination.user_id}, program ${combination.program_id}:`, error.message);
                }
            }
            
            console.log(`✅ Step 2 completed: Created ${processedCount} student progress records`);
            
        } catch (error) {
            console.error('❌ Error in student progress initialization:', error);
            throw error;
        }
    }
    
    // =====================================================
    // STEP 3: INITIALIZE OUTCOME TRACKING
    // =====================================================
    
    async initializeProgramOutcomeTracking() {
        try {
            console.log('🎯 Step 3: Initializing program outcome tracking...');
            
            // Get all programs with their POs and PLOs
            const programs = await Program.findAll({
                include: [
                    { model: PO, attributes: ['po_id', 'name'] },
                    { model: PLO, attributes: ['plo_id', 'description'] }
                ]
            });
            
            // Get all students who have quiz results
            const activeStudents = await User.findAll({
                include: [{
                    model: QuizResult,
                    required: true,
                    where: {
                        status: { [Op.in]: ['completed', 'finished'] }
                    },
                    include: [{
                        model: Quiz,
                        include: [{
                            model: Subject,
                            include: [{
                                model: Course,
                                attributes: ['program_id']
                            }]
                        }]
                    }]
                }],
                attributes: ['user_id']
            });
            
            console.log(`📊 Found ${programs.length} programs and ${activeStudents.length} active students`);
            
            let trackingRecordsCreated = 0;
            
            for (const program of programs) {
                for (const student of activeStudents) {
                    // Check if student has activity in this program
                    const hasActivityInProgram = student.QuizResults.some(qr => 
                        qr.Quiz?.Subject?.Course?.program_id === program.program_id
                    );
                    
                    if (!hasActivityInProgram) continue;
                    
                    // Create PO tracking records
                    for (const po of program.POs) {
                        const existingPOTracking = await ProgramOutcomeTracking.findOne({
                            where: {
                                user_id: student.user_id,
                                program_id: program.program_id,
                                po_id: po.po_id,
                                outcome_type: 'PO',
                                is_active: true
                            }
                        });
                        
                        if (!existingPOTracking) {
                            await ProgramOutcomeTracking.create({
                                user_id: student.user_id,
                                program_id: program.program_id,
                                po_id: po.po_id,
                                outcome_type: 'PO',
                                current_score: 0,
                                target_score: 70,
                                achievement_status: 'not_started',
                                score_history: [],
                                detailed_analysis: {
                                    contributing_subjects: {},
                                    assessment_breakdown: {},
                                    improvement_trend: 0,
                                    consistency_score: 0
                                },
                                predictions: {
                                    predicted_final_score: 0,
                                    probability_of_achievement: 0,
                                    estimated_completion_date: null,
                                    risk_factors: [],
                                    recommended_interventions: []
                                },
                                evidence_count: 0,
                                is_active: true
                            });
                            
                            trackingRecordsCreated++;
                        }
                    }
                    
                    // Create PLO tracking records
                    for (const plo of program.PLOs) {
                        const existingPLOTracking = await ProgramOutcomeTracking.findOne({
                            where: {
                                user_id: student.user_id,
                                program_id: program.program_id,
                                plo_id: plo.plo_id,
                                outcome_type: 'PLO',
                                is_active: true
                            }
                        });
                        
                        if (!existingPLOTracking) {
                            await ProgramOutcomeTracking.create({
                                user_id: student.user_id,
                                program_id: program.program_id,
                                plo_id: plo.plo_id,
                                outcome_type: 'PLO',
                                current_score: 0,
                                target_score: 70,
                                achievement_status: 'not_started',
                                score_history: [],
                                detailed_analysis: {
                                    contributing_subjects: {},
                                    assessment_breakdown: {},
                                    improvement_trend: 0,
                                    consistency_score: 0
                                },
                                predictions: {
                                    predicted_final_score: 0,
                                    probability_of_achievement: 0,
                                    estimated_completion_date: null,
                                    risk_factors: [],
                                    recommended_interventions: []
                                },
                                evidence_count: 0,
                                is_active: true
                            });
                            
                            trackingRecordsCreated++;
                        }
                    }
                }
                
                if (trackingRecordsCreated % 100 === 0) {
                    console.log(`   📈 Created ${trackingRecordsCreated} tracking records`);
                }
            }
            
            console.log(`✅ Step 3 completed: Created ${trackingRecordsCreated} outcome tracking records`);
            
        } catch (error) {
            console.error('❌ Error in outcome tracking initialization:', error);
            throw error;
        }
    }
    
    // =====================================================
    // STEP 4: GENERATE SUBJECT ANALYTICS
    // =====================================================
    
    async generateInitialSubjectAnalytics() {
        try {
            console.log('📊 Step 4: Generating initial subject analytics...');
            
            // Get all subjects with quiz activity
            const subjects = await Subject.findAll({
                include: [{
                    model: Quiz,
                    required: true,
                    include: [{
                        model: QuizResult,
                        required: true,
                        where: {
                            status: { [Op.in]: ['completed', 'finished'] }
                        }
                    }]
                }, {
                    model: Course,
                    attributes: ['program_id']
                }]
            });
            
            console.log(`📊 Found ${subjects.length} subjects with quiz activity`);
            
            let analyticsCreated = 0;
            const currentSemester = this.getCurrentSemester();
            const academicYear = this.getCurrentAcademicYear();
            
            for (const subject of subjects) {
                try {
                    const existingAnalysis = await SubjectOutcomeAnalysis.findOne({
                        where: {
                            subject_id: subject.subject_id,
                            program_id: subject.Course.program_id,
                            analysis_semester: currentSemester,
                            academic_year: academicYear
                        }
                    });
                    
                    if (!existingAnalysis) {
                        await SubjectOutcomeAnalysis.create({
                            subject_id: subject.subject_id,
                            program_id: subject.Course.program_id,
                            subject_statistics: {
                                total_students_enrolled: 0,
                                total_students_completed: 0,
                                completion_rate: 0,
                                average_score: 0,
                                pass_rate: 0,
                                dropout_rate: 0
                            },
                            po_achievement: {},
                            plo_achievement: {},
                            lo_performance: {},
                            difficulty_analysis: {
                                easy: { question_count: 0, average_score: 0, pass_rate: 0 },
                                medium: { question_count: 0, average_score: 0, pass_rate: 0 },
                                hard: { question_count: 0, average_score: 0, pass_rate: 0 }
                            },
                            temporal_trends: {},
                            comparative_analysis: {
                                vs_program_average: 0,
                                vs_previous_semester: 0,
                                ranking_in_program: 0,
                                benchmark_comparison: {}
                            },
                            improvement_recommendations: {
                                weak_areas: [],
                                suggested_interventions: [],
                                resource_recommendations: [],
                                teaching_method_suggestions: []
                            },
                            data_quality_metrics: {
                                sample_size: 0,
                                data_completeness: 0,
                                confidence_level: 0,
                                last_assessment_date: null
                            },
                            analysis_semester: currentSemester,
                            academic_year: academicYear,
                            analysis_date: new Date(),
                            analysis_status: 'draft'
                        });
                        
                        analyticsCreated++;
                    }
                    
                } catch (error) {
                    console.error(`❌ Error creating analytics for subject ${subject.subject_id}:`, error.message);
                }
            }
            
            console.log(`✅ Step 4 completed: Created ${analyticsCreated} subject analytics records`);
            
        } catch (error) {
            console.error('❌ Error in subject analytics generation:', error);
            throw error;
        }
    }
    
    // =====================================================
    // STEP 5: GENERATE LEARNING ANALYTICS
    // =====================================================
    
    async generateInitialLearningAnalytics() {
        try {
            console.log('🧠 Step 5: Generating initial learning analytics...');
            
            const programs = await Program.findAll({
                attributes: ['program_id', 'name']
            });
            
            let analyticsCreated = 0;
            
            for (const program of programs) {
                try {
                    await LearningAnalytics.create({
                        program_id: program.program_id,
                        analysis_type: 'program_overview',
                        time_period: {
                            start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
                            end_date: new Date()
                        },
                        overview_metrics: {
                            total_students: 0,
                            total_assessments: 0,
                            average_performance: 0,
                            completion_rate: 0,
                            engagement_score: 0
                        },
                        outcome_analysis: {},
                        lo_performance: {},
                        difficulty_distribution: {
                            easy: { count: 0, avg_score: 0, pass_rate: 0 },
                            medium: { count: 0, avg_score: 0, pass_rate: 0 },
                            hard: { count: 0, avg_score: 0, pass_rate: 0 }
                        },
                        temporal_trends: {},
                        student_segmentation: {
                            high_performers: { count: 0, characteristics: [] },
                            average_performers: { count: 0, characteristics: [] },
                            at_risk_students: { count: 0, characteristics: [] },
                            improvement_needed: { count: 0, characteristics: [] }
                        },
                        correlation_analysis: {},
                        predictive_insights: {
                            performance_predictions: {},
                            risk_assessments: {},
                            intervention_recommendations: [],
                            resource_optimization: {}
                        },
                        benchmark_comparisons: {
                            vs_previous_periods: {},
                            vs_other_programs: {},
                            vs_national_standards: {},
                            improvement_areas: []
                        },
                        data_quality: {
                            completeness_score: 0,
                            reliability_score: 0,
                            sample_size: 0,
                            confidence_intervals: {},
                            data_sources: []
                        },
                        analysis_status: 'completed',
                        created_by: 1, // System user
                        data_snapshot_date: new Date()
                    });
                    
                    analyticsCreated++;
                    
                } catch (error) {
                    console.error(`❌ Error creating learning analytics for program ${program.program_id}:`, error.message);
                }
            }
            
            console.log(`✅ Step 5 completed: Created ${analyticsCreated} learning analytics records`);
            
        } catch (error) {
            console.error('❌ Error in learning analytics generation:', error);
            throw error;
        }
    }
    
    // =====================================================
    // UTILITY FUNCTIONS
    // =====================================================
    
    getCurrentSemester() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        
        if (month >= 9 || month <= 1) {
            return `${year}-1`;
        } else if (month >= 2 && month <= 6) {
            return `${year}-2`;
        } else {
            return `${year}-3`;
        }
    }
    
    getCurrentAcademicYear() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        
        if (month >= 9) {
            return `${year}-${year + 1}`;
        } else {
            return `${year - 1}-${year}`;
        }
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// =====================================================
// COMMAND LINE INTERFACE
// =====================================================

if (require.main === module) {
    const migration = new AnalyticsDataMigration();
    
    const command = process.argv[2];
    
    switch (command) {
        case 'full':
            migration.runFullMigration()
                .then(() => {
                    console.log('🎉 Migration completed successfully!');
                    process.exit(0);
                })
                .catch(error => {
                    console.error('💥 Migration failed:', error);
                    process.exit(1);
                });
            break;
            
        case 'quiz-results':
            migration.migrateQuizResultsToAnalytics()
                .then(() => {
                    console.log('🎉 Quiz results migration completed!');
                    process.exit(0);
                })
                .catch(error => {
                    console.error('💥 Quiz results migration failed:', error);
                    process.exit(1);
                });
            break;
            
        case 'student-progress':
            migration.initializeStudentProgramProgress()
                .then(() => {
                    console.log('🎉 Student progress initialization completed!');
                    process.exit(0);
                })
                .catch(error => {
                    console.error('💥 Student progress initialization failed:', error);
                    process.exit(1);
                });
            break;
            
        default:
            console.log('📖 Usage:');
            console.log('  node migrateAnalyticsData.js full              # Run full migration');
            console.log('  node migrateAnalyticsData.js quiz-results      # Migrate quiz results only');
            console.log('  node migrateAnalyticsData.js student-progress  # Initialize student progress only');
            process.exit(0);
    }
}

module.exports = AnalyticsDataMigration;
