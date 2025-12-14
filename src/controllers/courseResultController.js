const { CourseResult, User, Course } = require('../models');

exports.getAllCourseResults = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const courseResults = await CourseResult.findAndCountAll({
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                { model: User, attributes: ['user_id', 'name'] },
                { model: Course, attributes: ['course_id', 'name'] },
            ],
        });

        res.status(200).json({success: true, data: {totalItems: courseResults.count,
            totalPages: Math.ceil(courseResults.count / limit),
            currentPage: parseInt(page),
            courseResults: courseResults.rows,
        }});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi lấy danh sách CourseResult', error: error.message });
    }
};

exports.getCourseResultById = async (req, res) => {
    try {
        const courseResult = await CourseResult.findByPk(req.params.id, {
            include: [
                { model: User, attributes: ['user_id', 'name'] },
                { model: Course, attributes: ['course_id', 'name'] },
            ],
        });

        if (!courseResult) return res.status(404).json({success: false, message: 'CourseResult không tồn tại' });
        res.status(200).json({success: true, data: courseResult});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi lấy thông tin CourseResult', error: error.message });
    }
};

exports.createCourseResult = async (req, res) => {
    try {
        const { user_id, course_id, average_score, total_quizzes, update_time } = req.body;

        if (!user_id || !course_id || !average_score || !total_quizzes) {
            return res.status(400).json({success: false, message: 'Thiếu các trường bắt buộc' });
        }

        const user = await User.findByPk(user_id);
        const course = await Course.findByPk(course_id);

        if (!user) return res.status(400).json({success: false, message: 'Người dùng không tồn tại' });
        if (!course) return res.status(400).json({success: false, message: 'Khóa học không tồn tại' });

        const newCourseResult = await CourseResult.create({
            user_id,
            course_id,
            average_score,
            total_quizzes,
            update_time,
        });

        res.status(201).json({success: true, data: newCourseResult});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi tạo CourseResult', error: error.message });
    }
};

exports.updateCourseResult = async (req, res) => {
    try {
        const { user_id, course_id, average_score, total_quizzes, update_time } = req.body;

        const courseResult = await CourseResult.findByPk(req.params.id);
        if (!courseResult) return res.status(404).json({success: false, message: 'CourseResult không tồn tại' });

        if (user_id) {
            const user = await User.findByPk(user_id);
            if (!user) return res.status(400).json({success: false, message: 'Người dùng không tồn tại' });
        }
        if (course_id) {
            const course = await Course.findByPk(course_id);
            if (!course) return res.status(400).json({success: false, message: 'Khóa học không tồn tại' });
        }

        await courseResult.update({
            user_id: user_id || courseResult.user_id,
            course_id: course_id || courseResult.course_id,
            average_score: average_score || courseResult.average_score,
            total_quizzes: total_quizzes || courseResult.total_quizzes,
            update_time: update_time || courseResult.update_time,
        });

        res.status(200).json({success: true, data: courseResult});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi cập nhật CourseResult', error: error.message });
    }
};

exports.deleteCourseResult = async (req, res) => {
    try {
        const courseResult = await CourseResult.findByPk(req.params.id);
        if (!courseResult) return res.status(404).json({success: false, message: 'CourseResult không tồn tại' });

        await courseResult.destroy();
        res.status(200).json({success: true, data: {message: 'Xóa CourseResult thành công' }});
    } catch (error) {
        res.status(500).json({success: false, message: 'Lỗi khi xóa CourseResult', error: error.message });
    }
};