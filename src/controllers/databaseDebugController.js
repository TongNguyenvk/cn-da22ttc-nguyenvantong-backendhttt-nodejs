/**
 * DATABASE DEBUG CONTROLLER
 * Controller để debug và kiểm tra database structure
 */

const { sequelize } = require('../models');

/**
 * Test database connection và cấu trúc cơ bản
 */
const testDatabaseConnection = async (req, res) => {
    try {
        // Test connection
        await sequelize.authenticate();
        
        // Test basic queries
        const tests = {};
        
        // Test các bảng chính
        tests.courses = await sequelize.query('SELECT COUNT(*) as count FROM courses', { 
            type: sequelize.QueryTypes.SELECT 
        });
        
        tests.subjects = await sequelize.query('SELECT COUNT(*) as count FROM subjects', { 
            type: sequelize.QueryTypes.SELECT 
        });
        
        tests.chapters = await sequelize.query('SELECT COUNT(*) as count FROM chapters', { 
            type: sequelize.QueryTypes.SELECT 
        });
        
        tests.los = await sequelize.query('SELECT COUNT(*) as count FROM los', { 
            type: sequelize.QueryTypes.SELECT 
        });
        
        tests.chapter_lo = await sequelize.query('SELECT COUNT(*) as count FROM chapter_lo', { 
            type: sequelize.QueryTypes.SELECT 
        });
        
        tests.questions = await sequelize.query('SELECT COUNT(*) as count FROM questions', { 
            type: sequelize.QueryTypes.SELECT 
        });
        
        tests.user_question_histories = await sequelize.query('SELECT COUNT(*) as count FROM user_question_histories', { 
            type: sequelize.QueryTypes.SELECT 
        });

        // Test relationship query
        tests.course_structure = await sequelize.query(`
            SELECT 
                c.course_id,
                c.course_name,
                COUNT(DISTINCT s.subject_id) as subject_count,
                COUNT(DISTINCT ch.chapter_id) as chapter_count,
                COUNT(DISTINCT l.lo_id) as lo_count
            FROM courses c
            LEFT JOIN subjects s ON c.course_id = s.course_id
            LEFT JOIN chapters ch ON s.subject_id = ch.subject_id
            LEFT JOIN chapter_lo cl ON ch.chapter_id = cl.chapter_id
            LEFT JOIN los l ON cl.lo_id = l.lo_id
            GROUP BY c.course_id, c.course_name
            LIMIT 5
        `, { type: sequelize.QueryTypes.SELECT });

        res.json({
            success: true,
            data: {
                connection: 'OK',
                table_counts: tests,
                sample_course_structure: tests.course_structure
            }
        });

    } catch (error) {
        console.error('Database test error:', error);
        res.status(500).json({
            success: false,
            error: 'Database connection failed',
            details: error.message
        });
    }
};

/**
 * Test specific course data structure
 */
const testCourseStructure = async (req, res) => {
    try {
        const { courseId } = req.params;

        // Test query tương tự như trong practice controller
        const losQuery = `
            SELECT 
                l.lo_id,
                l.lo_name,
                l.description,
                s.subject_name,
                c.name as chapter_name,
                lv.level_name
            FROM los l
            JOIN chapter_lo cl ON l.lo_id = cl.lo_id
            JOIN chapters c ON cl.chapter_id = c.chapter_id
            JOIN subjects s ON c.subject_id = s.subject_id
            LEFT JOIN levels lv ON l.level_id = lv.level_id
            WHERE s.course_id = :courseId
            ORDER BY s.subject_name, c.name, l.lo_name
        `;

        const courseLos = await sequelize.query(losQuery, {
            replacements: { courseId },
            type: sequelize.QueryTypes.SELECT
        });

        // Test question counts per LO
        const questionCounts = await Promise.all(
            courseLos.slice(0, 5).map(async (lo) => {
                const count = await sequelize.query(
                    'SELECT COUNT(*) as count FROM questions WHERE lo_id = :loId',
                    {
                        replacements: { loId: lo.lo_id },
                        type: sequelize.QueryTypes.SELECT
                    }
                );
                return {
                    lo_id: lo.lo_id,
                    lo_name: lo.lo_name,
                    question_count: count[0].count
                };
            })
        );

        res.json({
            success: true,
            data: {
                course_id: courseId,
                total_los: courseLos.length,
                los_sample: courseLos.slice(0, 10),
                question_counts_sample: questionCounts
            }
        });

    } catch (error) {
        console.error('Course structure test error:', error);
        res.status(500).json({
            success: false,
            error: 'Course structure test failed',
            details: error.message
        });
    }
};

/**
 * Test user history data
 */
const testUserHistory = async (req, res) => {
    try {
        const { userId } = req.params;

        // Test user question history
        const historyQuery = `
            SELECT 
                uqh.history_id,
                uqh.user_id,
                uqh.question_id,
                uqh.is_correct,
                uqh.time_spent,
                q.lo_id,
                l.lo_name
            FROM user_question_histories uqh
            JOIN questions q ON uqh.question_id = q.question_id
            JOIN los l ON q.lo_id = l.lo_id
            WHERE uqh.user_id = :userId
            ORDER BY uqh.history_id DESC
            LIMIT 20
        `;

        const userHistory = await sequelize.query(historyQuery, {
            replacements: { userId },
            type: sequelize.QueryTypes.SELECT
        });

        // Tính thống kê cơ bản
        const stats = {
            total_attempts: userHistory.length,
            correct_attempts: userHistory.filter(h => h.is_correct).length,
            unique_los: [...new Set(userHistory.map(h => h.lo_id))].length,
            avg_time_spent: userHistory.length > 0 
                ? userHistory.reduce((sum, h) => sum + (h.time_spent || 0), 0) / userHistory.length
                : 0
        };

        res.json({
            success: true,
            data: {
                user_id: userId,
                stats,
                recent_history: userHistory
            }
        });

    } catch (error) {
        console.error('User history test error:', error);
        res.status(500).json({
            success: false,
            error: 'User history test failed',
            details: error.message
        });
    }
};

module.exports = {
    testDatabaseConnection,
    testCourseStructure,
    testUserHistory
};
