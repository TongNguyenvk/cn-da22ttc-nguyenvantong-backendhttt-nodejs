const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const QuizSession = sequelize.define('QuizSession', {
        session_id: {
            type: DataTypes.STRING,
            primaryKey: true
        },
        quiz_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'quizzes',
                key: 'quiz_id'
            }
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'user_id'
            }
        },
        start_time: {
            type: DataTypes.DATE,
            allowNull: false
        },
        end_time: {
            type: DataTypes.DATE,
            allowNull: false
        },
        current_question: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        answers: {
            type: DataTypes.JSONB,
            defaultValue: {}
        },
        status: {
            type: DataTypes.ENUM('pending', 'in_progress', 'completed', 'expired'),
            defaultValue: 'pending'
        },
        last_activity: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        quiz_stages: {
            type: DataTypes.JSONB,
            defaultValue: []
        }
    });

    QuizSession.associate = (models) => {
        QuizSession.belongsTo(models.Quiz, {
            foreignKey: 'quiz_id',
            as: 'Quiz'
        });
        QuizSession.belongsTo(models.User, {
            foreignKey: 'user_id',
            as: 'User'
        });
    };

    return QuizSession;
};
