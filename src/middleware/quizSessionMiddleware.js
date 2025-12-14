const { getCache } = require('../redis/utils');

const checkQuizSession = async (req, res, next) => {
    try {
        const { session_id } = req.headers;
        if (!session_id) {
            return res.status(401).json({ error: 'Không tìm thấy session' });
        }

        const session = await getCache(`quiz_session:${session_id}`);
        if (!session) {
            return res.status(401).json({ error: 'Session không tồn tại hoặc đã hết hạn' });
        }

        if (session.status !== 'in_progress') {
            return res.status(400).json({ error: 'Session không còn hoạt động' });
        }

        // Kiểm tra thời gian
        const now = new Date();
        if (now > new Date(session.end_time)) {
            await updateQuizSession(session_id, { status: 'expired' });
            return res.status(400).json({ error: 'Thời gian làm bài đã hết' });
        }

        req.quizSession = session;
        next();
    } catch (error) {
        console.error('Lỗi trong checkQuizSession:', error);
        return res.status(500).json({ error: 'Lỗi khi kiểm tra session' });
    }
};

module.exports = { checkQuizSession };
