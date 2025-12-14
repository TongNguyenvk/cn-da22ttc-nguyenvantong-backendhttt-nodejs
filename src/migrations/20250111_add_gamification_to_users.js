'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        // Thêm các trường gamification vào bảng Users
        await queryInterface.addColumn('Users', 'total_points', {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: 'Tổng điểm tích lũy của người dùng'
        });

        await queryInterface.addColumn('Users', 'current_level', {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 1,
            comment: 'Cấp độ hiện tại của người dùng'
        });

        await queryInterface.addColumn('Users', 'experience_points', {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: 'Điểm kinh nghiệm trong cấp độ hiện tại'
        });

        await queryInterface.addColumn('Users', 'gamification_stats', {
            type: Sequelize.JSON,
            allowNull: false,
            defaultValue: {
                total_quizzes_completed: 0,
                total_correct_answers: 0,
                total_questions_answered: 0,
                average_response_time: 0,
                best_streak: 0,
                current_streak: 0,
                speed_bonus_earned: 0,
                perfect_scores: 0
            },
            comment: 'Thống kê gamification của người dùng'
        });

        // Tạo index cho performance
        await queryInterface.addIndex('Users', ['total_points'], {
            name: 'idx_users_total_points'
        });

        await queryInterface.addIndex('Users', ['current_level'], {
            name: 'idx_users_current_level'
        });
    },

    down: async (queryInterface, Sequelize) => {
        // Xóa index trước
        await queryInterface.removeIndex('Users', 'idx_users_total_points');
        await queryInterface.removeIndex('Users', 'idx_users_current_level');
        
        // Xóa các cột
        await queryInterface.removeColumn('Users', 'total_points');
        await queryInterface.removeColumn('Users', 'current_level');
        await queryInterface.removeColumn('Users', 'experience_points');
        await queryInterface.removeColumn('Users', 'gamification_stats');
    }
};
