'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('CourseGradeColumnQuizzes', {
      mapping_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        autoIncrementIdentity: true
      },
      column_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'CourseGradeColumns',
          key: 'column_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      quiz_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Quizzes',
          key: 'quiz_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      assigned_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Users',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      assigned_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      }
    });

    // Tạo indexes
    await queryInterface.addIndex('CourseGradeColumnQuizzes', ['column_id'], {
      name: 'idx_course_grade_column_quizzes_column'
    });

    await queryInterface.addIndex('CourseGradeColumnQuizzes', ['quiz_id'], {
      name: 'idx_course_grade_column_quizzes_quiz'
    });

    // Unique constraint để đảm bảo một quiz chỉ thuộc về một cột điểm
    await queryInterface.addIndex('CourseGradeColumnQuizzes', ['column_id', 'quiz_id'], {
      unique: true,
      name: 'idx_unique_column_quiz'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('CourseGradeColumnQuizzes');
  }
};
