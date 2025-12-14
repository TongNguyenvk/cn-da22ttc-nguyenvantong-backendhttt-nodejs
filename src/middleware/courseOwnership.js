const { Course } = require('../models');

// Middleware: nếu role là teacher thì phải là owner của course
module.exports = async function courseOwnership(req, res, next) {
  try {
    const courseId = req.params.id;
    if (!courseId) return res.status(400).json({ success: false, message: 'Thiếu course id' });
    if (!req.user) return res.status(401).json({ success: false, message: 'Chưa xác thực' });
    // Admin bỏ qua kiểm tra
    if (req.roleName === 'admin') return next();
    if (req.roleName !== 'teacher') return res.status(403).json({ success: false, message: 'Không có quyền truy cập khóa học này' });
    const course = await Course.findByPk(courseId);
    if (!course) return res.status(404).json({ success: false, message: 'Khóa học không tồn tại' });
    if (course.user_id !== req.user.user_id) {
      return res.status(403).json({ success: false, message: 'Bạn không phải owner của khóa học' });
    }
    next();
  } catch (err) {
    console.error('courseOwnership error:', err);
    res.status(500).json({ success: false, message: 'Lỗi kiểm tra quyền sở hữu khóa học', error: err.message });
  }
};
