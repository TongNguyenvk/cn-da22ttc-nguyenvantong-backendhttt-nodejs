const {
    User,
    Course,
    Subject,
    Program,
    UserLearningPath,
    QuizResult,
    UserQuestionHistory,
    Question,
    LO,
    Chapter,
    ChapterLO,
    sequelize
} = require('../models');
const { Op } = require('sequelize');
const ProgressService = require('../services/progressService');

/**
 * LEARNING PATH CONTROLLER
 * Cung cấp gợi ý học tập tiếp theo và progression path cho sinh viên
 */

/**
 * GET /api/learning-path/next-recommendations
 * Gợi ý phần học tiếp theo và môn học tiếp theo
 * Query params: user_id (required), current_course_id (optional)
 */
const getNextLearningRecommendations = async (req, res) => {
    try {
        const { user_id, current_course_id } = req.query;

        if (!user_id) {
            return res.status(400).json({
                success: false,
                message: 'user_id là bắt buộc'
            });
        }

        // 1. Lấy thông tin user và program hiện tại
        const user = await User.findByPk(user_id, {
            include: [{
                model: sequelize.models.StudentProgramProgress,
                as: 'StudentProgramProgress',
                include: [{
                    model: Program,
                    as: 'Program',
                    attributes: ['program_id', 'name', 'description']
                }]
            }]
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy user'
            });
        }

        // Lấy program từ StudentProgramProgress (thường user có 1 program chính)
        const userProgram = user.StudentProgramProgress && user.StudentProgramProgress.length > 0
            ? user.StudentProgramProgress[0].Program
            : null;

        let currentCourse = null;
        if (current_course_id) {
            currentCourse = await Course.findByPk(current_course_id, {
                include: [{
                    model: Subject,
                    as: 'Subject',
                    attributes: ['subject_id', 'name', 'description']
                }]
            });
        }

        // 2. Phân tích tiến độ học tập hiện tại
        const progressAnalysis = await analyzeCurrentProgress(user_id, current_course_id);

        // 3. Đưa ra gợi ý dựa trên tiến độ
        const recommendations = await generateLearningRecommendations(
            user_id, 
            progressAnalysis, 
            currentCourse,
            userProgram
        );

        res.json({
            success: true,
            data: {
                user_info: {
                    user_id: user.user_id,
                    name: user.name,
                    program: userProgram
                },
                current_course: currentCourse ? {
                    course_id: currentCourse.course_id,
                    name: currentCourse.name,
                    subject: currentCourse.Subject
                } : null,
                progress_analysis: progressAnalysis,
                recommendations: recommendations,
                generated_at: new Date()
            }
        });

    } catch (error) {
        console.error('Error in getNextLearningRecommendations:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo gợi ý học tập',
            error: error.message
        });
    }
};

/**
 * Phân tích tiến độ học tập hiện tại của sinh viên
 */
const analyzeCurrentProgress = async (userId, currentCourseId = null) => {
    const analysis = {
        overall_progress: 0,
        current_course_progress: null,
        completed_courses: [],
        weak_areas: [],
        strong_areas: [],
        learning_velocity: 0,
        total_study_time: 0
    };

    try {
        // Lấy tất cả learning paths của user
        const learningPaths = await UserLearningPath.findAll({
            where: { user_id: userId },
            include: [{
                model: Subject,
                as: 'Subject',
                attributes: ['subject_id', 'name'],
                include: [{
                    model: Course,
                    as: 'Courses',
                    attributes: ['course_id', 'name', 'level', 'description']
                }]
            }]
        });

        // Phân tích từng course
        for (const path of learningPaths) {
            const progress = path.learning_progress;
            const masteryLevel = progress.mastery_level || 0;

            const courseInfo = {
                subject_id: path.subject_id,
                subject_name: path.Subject?.name || 'Unknown',
                courses: path.Subject?.Courses || [],
                mastery_level: masteryLevel,
                completed_los: progress.completed_los || 0,
                total_los: progress.total_los || 0,
                last_updated: progress.last_updated
            };

            if (masteryLevel >= 80) {
                analysis.completed_courses.push(courseInfo);
            } else if (masteryLevel >= 60) {
                analysis.strong_areas.push(courseInfo);
            } else {
                analysis.weak_areas.push(courseInfo);
            }

            // Phân tích course hiện tại
            if (currentCourseId && courseInfo.courses.some(c => c.course_id == currentCourseId)) {
                analysis.current_course_progress = {
                    ...courseInfo,
                    recommendation: masteryLevel >= 70 ? 'ready_for_next' : 'need_more_practice'
                };
            }
        }

        // Tính overall progress
        const totalPaths = learningPaths.length;
        if (totalPaths > 0) {
            const totalProgress = learningPaths.reduce((sum, path) => 
                sum + (path.learning_progress.mastery_level || 0), 0);
            analysis.overall_progress = Math.round(totalProgress / totalPaths);
        }

        // Tính learning velocity (số LO hoàn thành trong 30 ngày gần đây)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentQuizResults = await QuizResult.findAll({
            where: {
                user_id: userId,
                update_time: { [Op.gte]: thirtyDaysAgo }
            },
            attributes: ['score', 'update_time']
        });

        analysis.learning_velocity = recentQuizResults.length;
        analysis.total_study_time = recentQuizResults.length * 30; // Ước tính 30 phút/quiz

        return analysis;

    } catch (error) {
        console.error('Error analyzing current progress:', error);
        return analysis;
    }
};

/**
 * Tạo gợi ý học tập dựa trên phân tích tiến độ
 */
const generateLearningRecommendations = async (userId, progressAnalysis, currentCourse, userProgram) => {
    const recommendations = {
        immediate_actions: [],
        next_courses: [],
        learning_path: [],
        study_plan: {
            priority: 'medium',
            estimated_time: '2-3 tuần',
            focus_areas: []
        }
    };

    try {
        // 1. Gợi ý hành động ngay lập tức
        if (progressAnalysis.current_course_progress) {
            const currentProgress = progressAnalysis.current_course_progress;
            
            if (currentProgress.recommendation === 'ready_for_next') {
                recommendations.immediate_actions.push({
                    type: 'advance',
                    title: 'Sẵn sàng chuyển sang môn học tiếp theo',
                    description: `Bạn đã đạt ${currentProgress.mastery_level}% trong ${currentProgress.subject_name}`,
                    action: 'Tìm hiểu môn học tiếp theo trong chương trình',
                    priority: 'high'
                });
            } else {
                recommendations.immediate_actions.push({
                    type: 'improve',
                    title: 'Cần cải thiện môn học hiện tại',
                    description: `Hiện tại chỉ đạt ${currentProgress.mastery_level}% trong ${currentProgress.subject_name}`,
                    action: 'Tập trung ôn tập các LO yếu và làm thêm bài tập',
                    priority: 'high'
                });
            }
        }

        // 2. Gợi ý môn học tiếp theo
        const nextCourses = await suggestNextCourses(userId, progressAnalysis, userProgram);
        recommendations.next_courses = nextCourses;

        // 3. Tạo learning path
        const learningPath = await createLearningPath(progressAnalysis, nextCourses);
        recommendations.learning_path = learningPath;

        // 4. Tạo study plan
        recommendations.study_plan = await createStudyPlan(progressAnalysis, nextCourses);

        return recommendations;

    } catch (error) {
        console.error('Error generating learning recommendations:', error);
        return recommendations;
    }
};

/**
 * Gợi ý các môn học tiếp theo dựa trên tiến độ và program
 */
const suggestNextCourses = async (userId, progressAnalysis, userProgram) => {
    const suggestions = [];

    try {
        if (!userProgram) {
            return [{
                course_id: null,
                name: 'Chưa xác định được chương trình học',
                reason: 'Cần cập nhật thông tin chương trình học của sinh viên',
                readiness_score: 0,
                prerequisites_met: false
            }];
        }

        // Lấy tất cả courses trong program
        const programCourses = await Course.findAll({
            where: { program_id: userProgram.program_id },
            include: [{
                model: Subject,
                as: 'Subject',
                attributes: ['subject_id', 'name', 'description']
            }],
            attributes: ['course_id', 'name', 'level', 'description', 'subject_id']
        });

        // Lấy danh sách subjects đã hoàn thành
        const completedSubjectIds = progressAnalysis.completed_courses.map(c => c.subject_id);
        const strongSubjectIds = progressAnalysis.strong_areas.map(c => c.subject_id);

        for (const course of programCourses) {
            const subjectId = course.subject_id;
            
            // Bỏ qua nếu đã hoàn thành
            if (completedSubjectIds.includes(subjectId)) continue;

            // Kiểm tra prerequisites thông qua Subject relationships
            let prerequisitesMet = true;
            let readinessScore = 50; // Base score

            // Lấy prerequisites của subject này
            const subjectWithPrereqs = await Subject.findByPk(subjectId, {
                include: [{
                    model: Subject,
                    as: 'PrerequisiteSubjects',
                    attributes: ['subject_id', 'name']
                }]
            });

            if (subjectWithPrereqs && subjectWithPrereqs.PrerequisiteSubjects && subjectWithPrereqs.PrerequisiteSubjects.length > 0) {
                const prereqSubjectIds = subjectWithPrereqs.PrerequisiteSubjects.map(p => p.subject_id);
                const metPrerequisites = prereqSubjectIds.filter(prereq => 
                    completedSubjectIds.includes(prereq) || strongSubjectIds.includes(prereq)
                );
                prerequisitesMet = metPrerequisites.length === prereqSubjectIds.length;
                readinessScore = prereqSubjectIds.length > 0 ? (metPrerequisites.length / prereqSubjectIds.length) * 100 : 70;
            }

            // Tăng readiness score dựa trên overall progress
            if (progressAnalysis.overall_progress >= 70) {
                readinessScore += 20;
            } else if (progressAnalysis.overall_progress >= 50) {
                readinessScore += 10;
            }

            // Điều chỉnh dựa trên learning velocity
            if (progressAnalysis.learning_velocity >= 10) {
                readinessScore += 15;
            } else if (progressAnalysis.learning_velocity >= 5) {
                readinessScore += 10;
            }

            const suggestion = {
                course_id: course.course_id,
                name: course.name,
                subject_name: course.Subject.name,
                level: course.level || 'Cơ bản',
                description: course.description || 'Không có mô tả',
                readiness_score: Math.min(readinessScore, 100),
                prerequisites_met: prerequisitesMet,
                prerequisites: subjectWithPrereqs?.PrerequisiteSubjects?.map(p => p.subject_id) || [],
                reason: prerequisitesMet 
                    ? 'Đã đáp ứng đủ điều kiện tiên quyết'
                    : 'Chưa hoàn thành đủ môn tiên quyết',
                estimated_duration: estimateCourseDuration(course.level),
                difficulty_level: course.level || 'Cơ bản'
            };

            suggestions.push(suggestion);
        }

        // Sắp xếp theo readiness score
        return suggestions
            .sort((a, b) => b.readiness_score - a.readiness_score)
            .slice(0, 5); // Lấy top 5

    } catch (error) {
        console.error('Error suggesting next courses:', error);
        return [];
    }
};

/**
 * Tạo learning path tổng thể
 */
const createLearningPath = async (progressAnalysis, nextCourses) => {
    const path = [];

    // Phase 1: Hoàn thiện courses hiện tại
    if (progressAnalysis.weak_areas.length > 0) {
        path.push({
            phase: 1,
            title: 'Củng cố kiến thức hiện tại',
            duration: '2-4 tuần',
            courses: progressAnalysis.weak_areas.map(area => ({
                subject_name: area.subject_name,
                current_progress: area.mastery_level,
                target_progress: 70,
                focus: 'Cải thiện các LO yếu'
            })),
            priority: 'high'
        });
    }

    // Phase 2: Bắt đầu courses mới
    const readyCourses = nextCourses.filter(c => c.prerequisites_met && c.readiness_score >= 70);
    if (readyCourses.length > 0) {
        path.push({
            phase: 2,
            title: 'Bắt đầu môn học mới',
            duration: '4-8 tuần',
            courses: readyCourses.slice(0, 2).map(course => ({
                course_id: course.course_id,
                name: course.name,
                readiness_score: course.readiness_score,
                focus: 'Học các kiến thức cơ bản'
            })),
            priority: 'medium'
        });
    }

    // Phase 3: Nâng cao
    const advancedCourses = nextCourses.filter(c => c.difficulty_level === 'Nâng cao');
    if (advancedCourses.length > 0) {
        path.push({
            phase: 3,
            title: 'Nâng cao kiến thức',
            duration: '6-12 tuần',
            courses: advancedCourses.slice(0, 2).map(course => ({
                course_id: course.course_id,
                name: course.name,
                readiness_score: course.readiness_score,
                focus: 'Chuyên sâu và ứng dụng thực tế'
            })),
            priority: 'low'
        });
    }

    return path;
};

/**
 * Tạo study plan chi tiết
 */
const createStudyPlan = async (progressAnalysis, nextCourses) => {
    const plan = {
        priority: 'medium',
        estimated_time: '4-6 tuần',
        focus_areas: [],
        weekly_schedule: {},
        success_metrics: []
    };

    // Xác định priority
    if (progressAnalysis.weak_areas.length > 2) {
        plan.priority = 'high';
        plan.estimated_time = '6-8 tuần';
        plan.focus_areas.push('Củng cố kiến thức cơ bản');
    } else if (progressAnalysis.overall_progress >= 80) {
        plan.priority = 'low';
        plan.estimated_time = '2-4 tuần';
        plan.focus_areas.push('Chuẩn bị cho cấp độ nâng cao');
    }

    // Focus areas
    if (progressAnalysis.current_course_progress) {
        const current = progressAnalysis.current_course_progress;
        if (current.mastery_level < 70) {
            plan.focus_areas.push(`Hoàn thiện ${current.subject_name}`);
        }
    }

    const topCourse = nextCourses.find(c => c.prerequisites_met);
    if (topCourse) {
        plan.focus_areas.push(`Chuẩn bị cho ${topCourse.name}`);
    }

    // Weekly schedule
    plan.weekly_schedule = {
        week_1: {
            focus: 'Đánh giá và lập kế hoạch',
            activities: ['Ôn tập kiến thức yếu', 'Tìm hiểu môn học tiếp theo', 'Lập lịch học tập']
        },
        week_2: {
            focus: 'Củng cố kiến thức',
            activities: ['Làm bài tập bổ trợ', 'Thực hành các LO yếu', 'Tự kiểm tra tiến độ']
        },
        week_3: {
            focus: 'Chuẩn bị môn mới',
            activities: ['Đọc tài liệu môn mới', 'Bắt đầu các bài học cơ bản', 'Tham gia thảo luận']
        },
        week_4: {
            focus: 'Áp dụng và đánh giá',
            activities: ['Làm bài tập tổng hợp', 'Đánh giá tiến độ', 'Điều chỉnh kế hoạch']
        }
    };

    // Success metrics
    plan.success_metrics = [
        'Đạt trên 70% accuracy cho tất cả LO yếu',
        'Hoàn thành ít nhất 80% bài tập được giao',
        'Sẵn sàng bắt đầu môn học tiếp theo'
    ];

    return plan;
};

/**
 * Helper function: Ước tính thời gian học một course
 */
const estimateCourseDuration = (level) => {
    switch (level?.toLowerCase()) {
        case 'cơ bản':
        case 'basic':
            return '4-6 tuần';
        case 'trung bình':
        case 'intermediate':
            return '6-8 tuần';
        case 'nâng cao':
        case 'advanced':
            return '8-12 tuần';
        default:
            return '4-8 tuần';
    }
};

/**
 * GET /api/learning-path/course-prerequisites
 * Kiểm tra prerequisites cho một course cụ thể
 */
const checkCoursePrerequisites = async (req, res) => {
    try {
        const { user_id, course_id } = req.query;

        if (!user_id || !course_id) {
            return res.status(400).json({
                success: false,
                message: 'user_id và course_id là bắt buộc'
            });
        }

        const course = await Course.findByPk(course_id, {
            include: [{
                model: Subject,
                as: 'Subject',
                attributes: ['subject_id', 'name'],
                include: [{
                    model: Subject,
                    as: 'PrerequisiteSubjects',
                    attributes: ['subject_id', 'name']
                }]
            }],
            attributes: ['course_id', 'name', 'level', 'subject_id']
        });

        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy course'
            });
        }

        // Kiểm tra tiến độ của user
        const progressAnalysis = await analyzeCurrentProgress(user_id);
        const completedSubjectIds = progressAnalysis.completed_courses.map(c => c.subject_id);
        const strongSubjectIds = progressAnalysis.strong_areas.map(c => c.subject_id);

        let prerequisitesMet = true;
        let missingPrerequisites = [];
        let prerequisites = [];

        if (course.Subject && course.Subject.PrerequisiteSubjects && course.Subject.PrerequisiteSubjects.length > 0) {
            prerequisites = course.Subject.PrerequisiteSubjects.map(p => ({
                subject_id: p.subject_id,
                name: p.name
            }));

            missingPrerequisites = course.Subject.PrerequisiteSubjects.filter(prereq => 
                !completedSubjectIds.includes(prereq.subject_id) && 
                !strongSubjectIds.includes(prereq.subject_id)
            ).map(p => ({
                subject_id: p.subject_id,
                name: p.name
            }));

            prerequisitesMet = missingPrerequisites.length === 0;
        }

        res.json({
            success: true,
            data: {
                course: {
                    course_id: course.course_id,
                    name: course.name,
                    subject_name: course.Subject.name,
                    level: course.level
                },
                prerequisites_met: prerequisitesMet,
                prerequisites: prerequisites,
                missing_prerequisites: missingPrerequisites,
                user_progress: progressAnalysis.overall_progress,
                recommendation: prerequisitesMet ? 'ready_to_enroll' : 'complete_prerequisites_first'
            }
        });

    } catch (error) {
        console.error('Error checking course prerequisites:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi kiểm tra điều kiện tiên quyết',
            error: error.message
        });
    }
};

/**
 * GET /api/learning-path/user-progress
 * Lấy tổng quan tiến độ học tập của sinh viên
 */
const getUserProgressOverview = async (req, res) => {
    try {
        const { user_id } = req.query;

        if (!user_id) {
            return res.status(400).json({
                success: false,
                message: 'user_id là bắt buộc'
            });
        }

        const user = await User.findByPk(user_id, {
            attributes: ['user_id', 'name', 'email']
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy user'
            });
        }

        // Phân tích tiến độ hiện tại
        const progressAnalysis = await analyzeCurrentProgress(user_id);

        res.json({
            success: true,
            data: {
                user: {
                    user_id: user.user_id,
                    name: user.name,
                    email: user.email
                },
                overall_progress: progressAnalysis.overall_progress,
                learning_velocity: progressAnalysis.learning_velocity,
                total_study_time: progressAnalysis.total_study_time,
                completed_courses: progressAnalysis.completed_courses,
                strong_areas: progressAnalysis.strong_areas,
                weak_areas: progressAnalysis.weak_areas,
                current_course_progress: progressAnalysis.current_course_progress,
                generated_at: new Date()
            }
        });

    } catch (error) {
        console.error('Error getting user progress overview:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy tổng quan tiến độ học tập',
            error: error.message
        });
    }
};

/**
 * POST /api/learning-path/update-progress
 * Cập nhật tiến độ học tập của sinh viên
 */
const updateUserProgress = async (req, res) => {
    try {
        const { user_id, subject_id, progress_data } = req.body;

        if (!user_id || !subject_id || !progress_data) {
            return res.status(400).json({
                success: false,
                message: 'user_id, subject_id và progress_data là bắt buộc'
            });
        }

        // Tìm hoặc tạo UserLearningPath
        let learningPath = await UserLearningPath.findOne({
            where: { user_id, subject_id }
        });

        if (!learningPath) {
            learningPath = await UserLearningPath.create({
                user_id,
                subject_id,
                learning_progress: {
                    mastery_level: 0,
                    completed_los: 0,
                    total_los: 0,
                    last_updated: new Date()
                }
            });
        }

        // Cập nhật progress
        const updatedProgress = {
            ...learningPath.learning_progress,
            ...progress_data,
            last_updated: new Date()
        };

        await learningPath.update({
            learning_progress: updatedProgress
        });

        res.json({
            success: true,
            message: 'Cập nhật tiến độ học tập thành công',
            data: {
                user_id,
                subject_id,
                updated_progress: updatedProgress,
                updated_at: new Date()
            }
        });

    } catch (error) {
        console.error('Error updating user progress:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật tiến độ học tập',
            error: error.message
        });
    }
};

module.exports = {
    getNextLearningRecommendations,
    checkCoursePrerequisites,
    getUserProgressOverview,
    updateUserProgress
};
