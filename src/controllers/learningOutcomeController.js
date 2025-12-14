const {
    QuizResult,
    UserQuestionHistory,
    Question,
    LO,
    Level,
    Quiz,
    Subject,
    Course,
    User,
    Chapter,
    ChapterLO,
    ChapterSection
} = require('../models');
const { Op } = require('sequelize');
const {
    analyzeLOCompletionPercentage,
    createPersonalizedStudyPlan
} = require('../utils/learningAnalysisHelpers');

/**
 * LEARNING OUTCOME CONTROLLER
 * Chuyên xử lý phân tích Learning Outcomes theo % hoàn thành
 */

/**
 * API: Phân tích chi tiết LO theo % hoàn thành
 * GET /api/learning-outcomes/completion-analysis/:course_id/:user_id
 */
const getLOCompletionAnalysis = async (req, res) => {
    try {
        const { course_id, user_id } = req.params;
        const requestingUserId = req.user.user_id;
        const userRole = req.user.role;

        // Kiểm tra quyền truy cập
        if (userRole === 'student' && parseInt(user_id) !== requestingUserId) {
            return res.status(403).json({
                success: false,
                message: 'Bạn chỉ có thể xem phân tích của chính mình'
            });
        }

        // Lấy thông tin course và subject
        const course = await Course.findByPk(course_id, {
            include: [{
                model: Subject,
                as: 'Subject',
                attributes: ['subject_id', 'name', 'description']
            }]
        });
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy khóa học'
            });
        }

        // Lấy thông tin sinh viên
        const student = await User.findByPk(user_id);
        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy sinh viên'
            });
        }

        // Lấy tất cả quiz results của user trong khóa học này
        const quizResults = await QuizResult.findAll({
            where: { user_id: user_id },
            include: [
                {
                    model: Quiz,
                    as: 'Quiz',
                    where: { course_id: course_id },
                    attributes: ['quiz_id', 'name', 'course_id']
                }
            ]
        });

        if (quizResults.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy kết quả quiz nào cho khóa học này'
            });
        }

        // Lấy quiz IDs
        const quizIds = quizResults.map(result => result.Quiz.quiz_id);

        // Lấy lịch sử trả lời câu hỏi chi tiết
        const questionHistory = await UserQuestionHistory.findAll({
            where: {
                user_id: user_id,
                quiz_id: { [Op.in]: quizIds }
            },
            include: [
                {
                    model: Question,
                    as: 'Question',
                    include: [
                        {
                            model: LO,
                            as: 'LO',
                            attributes: ['lo_id', 'name', 'description']
                        },
                        {
                            model: Level,
                            attributes: ['level_id', 'name']
                        }
                    ]
                }
            ]
        });

        if (questionHistory.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy lịch sử trả lời câu hỏi'
            });
        }

        // Phân tích LO theo % hoàn thành
        const loAnalysis = await analyzeLOCompletionPercentage(
            questionHistory, 
            course.Subject.subject_id, 
            60 // threshold 60%
        );

        // Tạo gợi ý học tập cá nhân hóa
        const learningRecommendations = createPersonalizedStudyPlan(loAnalysis);

        // Chuẩn bị response
        const response = {
            success: true,
            data: {
                course_info: {
                    course_id: course.course_id,
                    course_name: course.name,
                    subject_info: {
                        subject_id: course.Subject.subject_id,
                        subject_name: course.Subject.name,
                        description: course.Subject.description || ''
                    }
                },
                student_info: {
                    user_id: student.user_id,
                    name: student.name
                },
                lo_analysis: loAnalysis,
                learning_recommendations: learningRecommendations,
                generated_at: new Date().toISOString()
            }
        };

        res.json(response);

    } catch (error) {
        console.error('Error in getLOCompletionAnalysis:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi phân tích LO completion',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * API: Lấy danh sách LO của một khóa học
 * GET /api/learning-outcomes/course/:course_id
 */
const getLOsByCourse = async (req, res) => {
    try {
        const { course_id } = req.params;

        // Lấy course và subject information
        const course = await Course.findByPk(course_id, {
            include: [{
                model: Subject,
                as: 'Subject',
                attributes: ['subject_id', 'name']
            }]
        });

        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy khóa học'
            });
        }

        // Lấy các LO thông qua Chapter của Subject
        const los = await LO.findAll({
            include: [
                {
                    model: Chapter,
                    as: 'Chapters',
                    through: { model: ChapterLO },
                    include: [
                        {
                            model: Subject,
                            as: 'Subject',
                            where: { subject_id: course.Subject.subject_id }
                        }
                    ]
                }
            ],
            distinct: true
        });

        res.json({
            success: true,
            data: {
                course_id: parseInt(course_id),
                subject_id: course.Subject.subject_id,
                learning_outcomes: los.map(lo => ({
                    lo_id: lo.lo_id,
                    name: lo.name,
                    description: lo.description || '',
                    related_chapters: lo.Chapters?.map(chapter => ({
                        chapter_id: chapter.chapter_id,
                        chapter_name: chapter.name
                    })) || []
                }))
            }
        });

    } catch (error) {
        console.error('Error in getLOsBySubject:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi lấy danh sách LO',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * API: Lấy chi tiết một LO cụ thể
 * GET /api/learning-outcomes/:lo_id/details
 */
const getLODetails = async (req, res) => {
    try {
        const { lo_id } = req.params;

        const lo = await LO.findByPk(lo_id, {
            include: [
                {
                    model: Chapter,
                    as: 'Chapters',
                    through: { model: ChapterLO },
                    include: [
                        {
                            model: ChapterSection,
                            as: 'Sections',
                            attributes: ['section_id', 'title', 'content', 'order']
                        },
                        {
                            model: Subject,
                            as: 'Subject',
                            attributes: ['subject_id', 'name']
                        }
                    ]
                }
            ]
        });

        if (!lo) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy Learning Outcome'
            });
        }

        res.json({
            success: true,
            data: {
                lo_id: lo.lo_id,
                name: lo.name,
                description: lo.description || '',
                related_chapters: lo.Chapters?.map(chapter => ({
                    chapter_id: chapter.chapter_id,
                    chapter_name: chapter.name,
                    chapter_description: chapter.description || '',
                    subject: chapter.Subject ? {
                        subject_id: chapter.Subject.subject_id,
                        subject_name: chapter.Subject.name
                    } : null,
                    sections: chapter.Sections?.map(section => ({
                        section_id: section.section_id,
                        section_name: section.title,
                        content_preview: section.content ? 
                            section.content.substring(0, 200) + '...' : '',
                        order: section.order
                    })).sort((a, b) => a.order - b.order) || []
                })) || []
            }
        });

    } catch (error) {
        console.error('Error in getLODetails:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi lấy chi tiết LO',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    getLOCompletionAnalysis,
    getLOsByCourse,
    getLODetails
};
