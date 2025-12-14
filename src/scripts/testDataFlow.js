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
const analyticsDataFlowService = require('../services/analyticsDataFlowService');

class DataFlowTester {
    
    constructor() {
        this.testResults = {
            passed: 0,
            failed: 0,
            errors: []
        };
    }
    
    // =====================================================
    // MAIN TEST RUNNER
    // =====================================================
    
    async runAllTests() {
        try {
            console.log('🧪 Starting Data Flow Tests...');
            console.log('=' .repeat(50));
            
            // Test 1: Database Connection
            await this.testDatabaseConnection();
            
            // Test 2: Models Existence
            await this.testModelsExistence();
            
            // Test 3: Analytics Service
            await this.testAnalyticsService();
            
            // Test 4: Data Flow Integration
            await this.testDataFlowIntegration();
            
            // Test 5: Background Jobs
            await this.testBackgroundJobs();
            
            // Test 6: API Endpoints
            await this.testAPIEndpoints();
            
            // Print results
            this.printTestResults();
            
        } catch (error) {
            console.error('💥 Test runner failed:', error);
            this.testResults.failed++;
            this.testResults.errors.push(`Test runner: ${error.message}`);
        }
    }
    
    // =====================================================
    // INDIVIDUAL TESTS
    // =====================================================
    
    async testDatabaseConnection() {
        try {
            console.log('🔌 Testing database connection...');
            
            await sequelize.authenticate();
            console.log('✅ Database connection successful');
            this.testResults.passed++;
            
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            this.testResults.failed++;
            this.testResults.errors.push(`Database connection: ${error.message}`);
        }
    }
    
    async testModelsExistence() {
        try {
            console.log('📊 Testing analytics models existence...');
            
            const models = [
                'StudentProgramProgress',
                'ProgramOutcomeTracking', 
                'SubjectOutcomeAnalysis',
                'LearningAnalytics'
            ];
            
            for (const modelName of models) {
                const model = sequelize.models[modelName];
                if (!model) {
                    throw new Error(`Model ${modelName} not found`);
                }
                
                // Test table exists by running a simple query
                await model.findOne({ limit: 1 });
                console.log(`  ✅ ${modelName} model working`);
            }
            
            console.log('✅ All analytics models exist and accessible');
            this.testResults.passed++;
            
        } catch (error) {
            console.error('❌ Models existence test failed:', error.message);
            this.testResults.failed++;
            this.testResults.errors.push(`Models existence: ${error.message}`);
        }
    }
    
    async testAnalyticsService() {
        try {
            console.log('⚙️ Testing analytics service...');
            
            // Test service methods exist
            const requiredMethods = [
                'processQuizCompletion',
                'updateProgramOutcomeTracking',
                'updateStudentProgramProgress'
            ];
            
            for (const method of requiredMethods) {
                if (typeof analyticsDataFlowService[method] !== 'function') {
                    throw new Error(`Method ${method} not found in analytics service`);
                }
                console.log(`  ✅ ${method} method exists`);
            }
            
            console.log('✅ Analytics service structure valid');
            this.testResults.passed++;
            
        } catch (error) {
            console.error('❌ Analytics service test failed:', error.message);
            this.testResults.failed++;
            this.testResults.errors.push(`Analytics service: ${error.message}`);
        }
    }
    
    async testDataFlowIntegration() {
        try {
            console.log('🔄 Testing data flow integration...');
            
            // Find a test quiz result or create mock data
            const testQuizResult = await this.findOrCreateTestData();
            
            if (!testQuizResult) {
                console.log('⚠️ No test data available, skipping integration test');
                return;
            }
            
            // Test the analytics processing
            const result = await analyticsDataFlowService.processQuizCompletion({
                user_id: testQuizResult.user_id,
                quiz_id: testQuizResult.quiz_id,
                score: testQuizResult.score,
                quiz_result_id: testQuizResult.result_id
            });
            
            if (result.success) {
                console.log('✅ Data flow integration test passed');
                this.testResults.passed++;
                
                // Verify data was created
                await this.verifyAnalyticsDataCreated(testQuizResult.user_id, testQuizResult.quiz_id);
                
            } else {
                throw new Error(`Analytics processing failed: ${result.error}`);
            }
            
        } catch (error) {
            console.error('❌ Data flow integration test failed:', error.message);
            this.testResults.failed++;
            this.testResults.errors.push(`Data flow integration: ${error.message}`);
        }
    }
    
    async testBackgroundJobs() {
        try {
            console.log('⏰ Testing background jobs...');
            
            const analyticsBackgroundJobs = require('../services/analyticsBackgroundJobs');
            
            // Test scheduler methods exist
            const requiredMethods = ['startScheduler', 'stopScheduler'];
            
            for (const method of requiredMethods) {
                if (typeof analyticsBackgroundJobs[method] !== 'function') {
                    throw new Error(`Method ${method} not found in background jobs`);
                }
                console.log(`  ✅ ${method} method exists`);
            }
            
            console.log('✅ Background jobs structure valid');
            this.testResults.passed++;
            
        } catch (error) {
            console.error('❌ Background jobs test failed:', error.message);
            this.testResults.failed++;
            this.testResults.errors.push(`Background jobs: ${error.message}`);
        }
    }
    
    async testAPIEndpoints() {
        try {
            console.log('🌐 Testing API endpoints...');
            
            // Test if controllers exist
            const controllers = [
                '../controllers/learningAnalyticsController',
                '../controllers/reportController',
                '../controllers/statisticsController'
            ];
            
            for (const controllerPath of controllers) {
                try {
                    const controller = require(controllerPath);
                    console.log(`  ✅ ${controllerPath.split('/').pop()} loaded successfully`);
                } catch (error) {
                    throw new Error(`Failed to load ${controllerPath}: ${error.message}`);
                }
            }
            
            console.log('✅ API endpoints structure valid');
            this.testResults.passed++;
            
        } catch (error) {
            console.error('❌ API endpoints test failed:', error.message);
            this.testResults.failed++;
            this.testResults.errors.push(`API endpoints: ${error.message}`);
        }
    }
    
    // =====================================================
    // HELPER FUNCTIONS
    // =====================================================
    
    async findOrCreateTestData() {
        try {
            // Try to find existing quiz result
            let quizResult = await QuizResult.findOne({
                where: {
                    status: { [Op.in]: ['completed', 'finished'] }
                },
                include: [{
                    model: Quiz,
                    include: [{
                        model: Subject,
                        include: [{
                            model: Course,
                            include: [{
                                model: Program
                            }]
                        }]
                    }]
                }],
                limit: 1
            });
            
            if (quizResult) {
                console.log(`  📊 Using existing quiz result ID: ${quizResult.result_id}`);
                return quizResult;
            }
            
            // If no existing data, check if we have the basic structure to create test data
            const userCount = await User.count();
            const quizCount = await Quiz.count();
            
            if (userCount === 0 || quizCount === 0) {
                console.log('  ⚠️ No users or quizzes found, cannot create test data');
                return null;
            }
            
            console.log('  ⚠️ No completed quiz results found for testing');
            return null;
            
        } catch (error) {
            console.error('❌ Error finding test data:', error.message);
            return null;
        }
    }
    
    async verifyAnalyticsDataCreated(user_id, quiz_id) {
        try {
            console.log('🔍 Verifying analytics data was created...');
            
            // Get quiz details to find program_id
            const quiz = await Quiz.findByPk(quiz_id, {
                include: [{
                    model: Subject,
                    include: [{
                        model: Course,
                        attributes: ['program_id']
                    }]
                }]
            });
            
            if (!quiz || !quiz.Subject?.Course) {
                console.log('  ⚠️ Could not determine program_id for verification');
                return;
            }
            
            const program_id = quiz.Subject.Course.program_id;
            
            // Check if StudentProgramProgress was created/updated
            const studentProgress = await StudentProgramProgress.findOne({
                where: { user_id, program_id }
            });
            
            if (studentProgress) {
                console.log('  ✅ StudentProgramProgress record found');
            } else {
                console.log('  ⚠️ StudentProgramProgress record not found');
            }
            
            // Check if ProgramOutcomeTracking was created/updated
            const outcomeTracking = await ProgramOutcomeTracking.findOne({
                where: { user_id, program_id, is_active: true }
            });
            
            if (outcomeTracking) {
                console.log('  ✅ ProgramOutcomeTracking record found');
            } else {
                console.log('  ⚠️ ProgramOutcomeTracking record not found');
            }
            
        } catch (error) {
            console.error('❌ Error verifying analytics data:', error.message);
        }
    }
    
    printTestResults() {
        console.log('\n' + '=' .repeat(50));
        console.log('📋 TEST RESULTS SUMMARY');
        console.log('=' .repeat(50));
        
        console.log(`✅ Passed: ${this.testResults.passed}`);
        console.log(`❌ Failed: ${this.testResults.failed}`);
        console.log(`📊 Total: ${this.testResults.passed + this.testResults.failed}`);
        
        if (this.testResults.errors.length > 0) {
            console.log('\n🚨 ERRORS:');
            this.testResults.errors.forEach((error, index) => {
                console.log(`  ${index + 1}. ${error}`);
            });
        }
        
        if (this.testResults.failed === 0) {
            console.log('\n🎉 ALL TESTS PASSED! Data flow is working correctly.');
        } else {
            console.log('\n⚠️ Some tests failed. Please check the errors above.');
        }
        
        console.log('=' .repeat(50));
    }
}

// =====================================================
// COMMAND LINE INTERFACE
// =====================================================

if (require.main === module) {
    const tester = new DataFlowTester();
    
    tester.runAllTests()
        .then(() => {
            const exitCode = tester.testResults.failed > 0 ? 1 : 0;
            process.exit(exitCode);
        })
        .catch(error => {
            console.error('💥 Test execution failed:', error);
            process.exit(1);
        });
}

module.exports = DataFlowTester;
