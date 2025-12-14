'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // 1. Xóa cột subject_id trong bảng LOs (khớp với tên bảng trong DB)


      // 2. Tạo bảng trung gian chapter_lo để biểu diễn quan hệ nhiều-nhiều giữa LO và Chapter
      await queryInterface.createTable(
        'ChapterLO',
        {
          chapter_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'Chapters',
              key: 'chapter_id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
            primaryKey: true,
          },
          lo_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'LOs', // Khớp với tên bảng trong DB
              key: 'lo_id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
            primaryKey: true,
          },
        },
        { transaction }
      );
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // 1. Xóa bảng trung gian chapter_lo
      await queryInterface.dropTable('chapter_lo', { transaction });

      // 2. Thêm lại cột subject_id vào bảng LOs (khớp với tên bảng trong DB)
      await queryInterface.addColumn(
        'LOs',
        'subject_id',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'Subjects',
            key: 'subject_id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        { transaction }
      );
    });
  },
};