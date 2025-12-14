const { Quiz, Question, Level, LO, QuizQuestion, Subject, User, sequelize } = require('../models');
const AdaptiveQuizService = require('../services/adaptiveQuizService');

// Tạo quiz thích ứng dựa trên điểm yếu của học sinh
exports.generateAdaptiveQuiz = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
        const { user_id, subject_id, course_id, quiz_config, manual_config } = req.body;

        // Validate input - support both subject_id (deprecated) and course_id (new)
        if (!user_id || (!subject_id && !course_id) || !quiz_config) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Thiếu thông tin bắt buộc: user_id, (subject_id hoặc course_id), quiz_config'
            });
        }

        let targetCourseId = course_id;
        let targetSubjectId = subject_id;

        // Handle backward compatibility
        if (subject_id && !course_id) {
            // DEPRECATED: Convert subject_id to course_id
            const { Course } = require('../models');
            const course = await Course.findOne({ 
                where: { subject_id: subject_id },
                transaction 
            });
            
            if (!course) {
                await transaction.rollback();
                return res.status(404).json({
                    success: false,
                    message: `Không tìm thấy khóa học cho subject ${subject_id}. Vui lòng sử dụng course_id.`
                });
            }
            targetCourseId = course.course_id;
        } else if (course_id && !subject_id) {
            // NEW: Get primary subject for course
            const { Course } = require('../models');
            const course = await Course.findByPk(course_id, {
                include: [{ model: Subject, as: 'Subjects' }],
                transaction
            });
            
            if (!course || !course.Subjects || course.Subjects.length === 0) {
                await transaction.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Khóa học không tồn tại hoặc không có môn học nào'
                });
            }
            
            // Use first subject as default (or implement logic for primary subject)
            targetSubjectId = course.Subjects[0].subject_id;
        }

        // Validate user exists
        const user = await User.findByPk(user_id);
        if (!user) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Học sinh không tồn tại'
            });
        }

        // Validate subject exists
        const subject = await Subject.findByPk(targetSubjectId);
        if (!subject) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Môn học không tồn tại'
            });
        }

        const adaptiveService = new AdaptiveQuizService();

        // 1. Phân tích điểm yếu của học sinh
        console.log('Analyzing user weakness...');
        const weaknessAnalysis = await adaptiveService.analyzeUserWeakness(user_id, targetSubjectId);

        // 2. Tính toán LO priorities
        console.log('Calculating LO priorities...');
        const loPriorities = adaptiveService.calculateLOPriorities(weaknessAnalysis.weak_chapters);

        if (loPriorities.length === 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Không tìm thấy dữ liệu học tập của học sinh để tạo quiz thích ứng. Học sinh cần hoàn thành ít nhất một quiz trước.'
            });
        }

        // 3. Tạo phân phối câu hỏi
        console.log('Generating question distribution...');
        const {
            total_questions = 20,
            focus_mode = 'weak_areas',
            difficulty_adjustment = 'auto'
        } = quiz_config;

        let distribution;
        if (difficulty_adjustment === 'manual' && manual_config) {
            // Sử dụng cấu hình manual
            distribution = adaptiveService.generateManualDistribution(
                loPriorities,
                total_questions,
                manual_config
            );
        } else {
            // Sử dụng cấu hình tự động
            distribution = adaptiveService.generateQuestionDistribution(
                loPriorities,
                weaknessAnalysis.weak_levels,
                total_questions,
                focus_mode
            );
        }

        // 4. Chọn câu hỏi thích ứng
        console.log('Selecting adaptive questions...');
        const selectedQuestions = await adaptiveService.selectAdaptiveQuestions(
            distribution,
            targetSubjectId,  // Use targetSubjectId instead of subject_id
            loPriorities
        );

        if (selectedQuestions.length === 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Không tìm thấy đủ câu hỏi phù hợp để tạo quiz thích ứng'
            });
        }

        // 5. Tạo quiz với metadata adaptive
        console.log('Creating adaptive quiz...');
        const pin = await generatePin();
        
        const adaptiveConfig = {
            user_id: user_id,
            focus_mode: focus_mode,
            difficulty_adjustment: difficulty_adjustment,
            weak_areas_identified: [
                ...loPriorities.filter(lo => lo.priority === 'high').slice(0, 3).map(lo => ({
                    type: 'lo',
                    name: lo.lo_name,
                    accuracy: lo.accuracy,
                    priority: lo.priority
                })),
                ...(weaknessAnalysis.weak_levels.weakest_level ? [{
                    type: 'level',
                    name: weaknessAnalysis.weak_levels.weakest_level.level,
                    accuracy: weaknessAnalysis.weak_levels.weakest_level.accuracy,
                    priority: weaknessAnalysis.weak_levels.weakest_level.improvement_priority
                }] : [])
            ],
            question_distribution: distribution,
            generated_at: new Date(),
            target_user: {
                user_id: user_id,
                user_name: user.name
            }
        };

        const quiz = await Quiz.create({
            course_id: targetCourseId,  // NEW: Use course_id instead of subject_id
            name: quiz_config.name || `Quiz Thích Ứng - ${user.name}`,
            duration: quiz_config.duration || 30,
            status: 'pending',
            pin: pin,
            adaptive_config: adaptiveConfig,
            update_time: new Date()
        }, { transaction });

        // 6. Tạo liên kết quiz-question
        const quizQuestions = selectedQuestions.map(question => ({
            quiz_id: quiz.quiz_id,
            question_id: question.question_id
        }));

        await QuizQuestion.bulkCreate(quizQuestions, { transaction });

        // 7. Tạo recommendations
        const recommendations = adaptiveService.generateRecommendations(
            loPriorities,
            weaknessAnalysis.weak_levels,
            distribution
        );

        await transaction.commit();

        // 8. Trả về response
        res.status(201).json({
            success: true,
            quiz: {
                quiz_id: quiz.quiz_id,
                name: quiz.name,
                total_questions: selectedQuestions.length,
                duration: quiz.duration,
                pin: quiz.pin,
                status: quiz.status,
                adaptive_config: adaptiveConfig
            },
            recommendations: recommendations,
            analysis_summary: {
                user_performance: weaknessAnalysis.overall_performance,
                weak_areas_count: loPriorities.filter(lo => lo.priority === 'high').length,
                focus_areas: loPriorities.slice(0, 3).map(lo => ({
                    name: lo.lo_name,
                    accuracy: lo.accuracy,
                    priority: lo.priority
                }))
            }
        });

    } catch (error) {
        await transaction.rollback();
        console.error('Error generating adaptive quiz:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo quiz thích ứng',
            error: error.message
        });
    }
};

// Lấy thông tin preview trước khi tạo quiz thích ứng
exports.getAdaptiveQuizPreview = async (req, res) => {
    try {
        const { user_id, subject_id, course_id } = req.query;

        if (!user_id || (!subject_id && !course_id)) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu thông tin: user_id và (subject_id hoặc course_id)'
            });
        }

        let targetSubjectId = subject_id;

        // Handle course_id to subject_id conversion if needed
        if (course_id && !subject_id) {
            const { Course } = require('../models');
            const course = await Course.findByPk(course_id, {
                include: [{ model: Subject, as: 'Subjects' }]
            });
            
            if (!course || !course.Subjects || course.Subjects.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Khóa học không tồn tại hoặc không có môn học nào'
                });
            }
            
            targetSubjectId = course.Subjects[0].subject_id;
        }

        const adaptiveService = new AdaptiveQuizService();

        // Phân tích điểm yếu
        const weaknessAnalysis = await adaptiveService.analyzeUserWeakness(
            parseInt(user_id), 
            parseInt(targetSubjectId)
        );

        // Tính toán LO priorities
        const loPriorities = adaptiveService.calculateLOPriorities(weaknessAnalysis.weak_chapters);

        if (loPriorities.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Học sinh chưa có dữ liệu học tập để tạo quiz thích ứng'
            });
        }

        // Tạo preview distribution với các focus modes khác nhau
        const previewDistributions = {};
        const focusModes = ['weak_areas', 'balanced', 'challenge'];
        
        focusModes.forEach(mode => {
            previewDistributions[mode] = adaptiveService.generateQuestionDistribution(
                loPriorities,
                weaknessAnalysis.weak_levels,
                20, // default 20 questions for preview
                mode
            );
        });

        res.status(200).json({
            success: true,
            user_analysis: {
                overall_performance: weaknessAnalysis.overall_performance,
                weak_levels: weaknessAnalysis.weak_levels.levels_analysis,
                weak_los: loPriorities.filter(lo => lo.priority !== 'low').slice(0, 5),
                weakest_level: weaknessAnalysis.weak_levels.weakest_level
            },
            preview_distributions: previewDistributions,
            recommendations: {
                suggested_focus_mode: weaknessAnalysis.overall_performance.performance_level === 'needs_improvement' ? 
                    'weak_areas' : 'balanced',
                suggested_questions: Math.max(15, Math.min(25, loPriorities.length * 3)),
                suggested_duration: 30
            }
        });

    } catch (error) {
        console.error('Error getting adaptive quiz preview:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy preview quiz thích ứng',
            error: error.message
        });
    }
};

// Lấy danh sách học sinh có thể tạo quiz thích ứng
exports.getEligibleStudents = async (req, res) => {
    try {
        const { subject_id, course_id } = req.query;

        if (!subject_id && !course_id) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu subject_id hoặc course_id'
            });
        }

        let whereClause = {};
        
        if (subject_id) {
            // DEPRECATED: Use subject_id for backward compatibility
            whereClause = { subject_id: parseInt(subject_id) };
        } else if (course_id) {
            // NEW: Use course_id 
            whereClause = { course_id: parseInt(course_id) };
        }

        // Lấy danh sách học sinh đã từng làm quiz trong subject/course này
        const studentsWithHistory = await User.findAll({
            include: [{
                model: require('../models').UserQuestionHistory,
                as: 'QuestionHistories',
                include: [{
                    model: require('../models').Quiz,
                    as: 'Quiz',
                    where: whereClause,
                    attributes: ['quiz_id', 'name']
                }],
                attributes: ['user_id'],
                required: true
            }],
            attributes: ['user_id', 'name', 'email'],
            group: ['User.user_id'],
            having: sequelize.literal('COUNT(DISTINCT `QuestionHistories->Quiz`.`quiz_id`) > 0')
        });

        res.status(200).json({
            success: true,
            eligible_students: studentsWithHistory.map(student => ({
                user_id: student.user_id,
                name: student.name,
                email: student.email,
                quiz_count: student.QuestionHistories ? 
                    [...new Set(student.QuestionHistories.map(h => h.Quiz.quiz_id))].length : 0
            }))
        });

    } catch (error) {
        console.error('Error getting eligible students:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách học sinh',
            error: error.message
        });
    }
};

// Helper function để tạo PIN (tái sử dụng từ quizController)
async function generatePin() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let pin;
    let isUnique = false;

    while (!isUnique) {
        pin = '';
        for (let i = 0; i < 6; i++) {
            pin += characters.charAt(Math.floor(Math.random() * characters.length));
        }

        const existingQuiz = await Quiz.findOne({ where: { pin } });
        if (!existingQuiz) {
            isUnique = true;
        }
    }

    return pin;
}

module.exports = {
    generateAdaptiveQuiz: exports.generateAdaptiveQuiz,
    getAdaptiveQuizPreview: exports.getAdaptiveQuizPreview,
    getEligibleStudents: exports.getEligibleStudents
};
