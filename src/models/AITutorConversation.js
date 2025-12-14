/**
 * AI Tutor Conversation Model
 * 
 * Lưu lịch sử chat giữa sinh viên và AI Tutor
 */

module.exports = (sequelize, DataTypes) => {
  const AITutorConversation = sequelize.define(
    "AITutorConversation",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "users",
          key: "user_id",
        },
        comment: "ID của sinh viên",
      },
      question_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "questions",
          key: "question_id",
        },
        comment: "ID câu hỏi đang làm (null nếu chat chung)",
      },
      session_id: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "Session ID dạng user_{id}_q_{qid} hoặc user_{id}_general",
      },
      role: {
        type: DataTypes.ENUM("user", "model"),
        allowNull: false,
        comment: "Người gửi: user hoặc model (AI)",
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: "Nội dung tin nhắn",
      },
      context_snapshot: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: "Snapshot context tại thời điểm chat (code, language, etc.)",
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "AITutorConversations",
      timestamps: false,
      indexes: [
        {
          fields: ["user_id"],
        },
        {
          fields: ["session_id"],
        },
        {
          fields: ["user_id", "question_id"],
        },
        {
          fields: ["created_at"],
        },
      ],
    }
  );

  AITutorConversation.associate = (models) => {
    AITutorConversation.belongsTo(models.User, {
      foreignKey: "user_id",
      as: "user",
    });
    AITutorConversation.belongsTo(models.Question, {
      foreignKey: "question_id",
      as: "question",
    });
  };

  return AITutorConversation;
};
