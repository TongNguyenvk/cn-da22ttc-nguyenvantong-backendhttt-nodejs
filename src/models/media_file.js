'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class MediaFile extends Model {
    getFileUrl() {
      try {
        if (this.owner_type === 'answer') {
          if (!this.answer_id) return null;
          return `/api/answers/${this.answer_id}/media/${encodeURIComponent(this.file_name)}`;
        }
        return `/api/questions/media/${this.question_id}/${encodeURIComponent(this.file_name)}`;
      } catch (e) {
        return null;
      }
    }
    static associate(models) {
      MediaFile.belongsTo(models.Question, { foreignKey: 'question_id', as: 'Question' });
      if (models.Answer) {
        MediaFile.belongsTo(models.Answer, { foreignKey: 'answer_id', as: 'Answer' });
      }
    }

    static validateFile(file, fileType) {
      if (!file) throw new Error('No file provided');
      const MAX_SIZE = 50 * 1024 * 1024; // 50MB
      if (file.size > MAX_SIZE) throw new Error('File size exceeds 50MB');
      const allowed = ['image', 'audio', 'video', 'document'];
      if (!allowed.includes(fileType)) throw new Error('Unsupported file type');
    }
  }

  MediaFile.init(
    {
      media_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        autoIncrementIdentity: true
      },
      question_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Questions', key: 'question_id' }
      },
      owner_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'question',
        validate: { isIn: [['question', 'answer']] }
      },
      answer_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Answers', key: 'answer_id' }
      },
      file_type: { type: DataTypes.STRING(20), allowNull: false },
      file_name: { type: DataTypes.STRING(255), allowNull: false },
      file_path: { type: DataTypes.STRING(1024), allowNull: false },
      file_size: { type: DataTypes.INTEGER, allowNull: false },
      mime_type: { type: DataTypes.STRING(100), allowNull: false },
      alt_text: { type: DataTypes.STRING(255), allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      original_filename: { 
        type: DataTypes.STRING(255), 
        allowNull: true,
        comment: 'Tên file gốc khi upload (để map với Excel)'
      }
    },
    {
      sequelize,
      modelName: 'MediaFile',
      tableName: 'MediaFiles',
      hooks: {
        beforeValidate: (mf) => {
          if (mf.owner_type === 'question') {
            mf.answer_id = null; // ensure DB constraint passes
          } else if (mf.owner_type === 'answer') {
            if (!mf.answer_id) throw new Error('answer_id required when owner_type=answer');
          }
        }
      }
    }
  );

  return MediaFile;
};