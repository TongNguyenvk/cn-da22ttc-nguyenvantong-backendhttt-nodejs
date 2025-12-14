'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('CourseGradeResults', {
      result_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        autoIncrementIdentity: true
      },
      course_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Courses',
          key: 'course_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      column_scores: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      process_average: {
        type: Sequelize.DECIMAL(4, 2),
        allowNull: true
      },
      final_exam_score: {
        type: Sequelize.DECIMAL(4, 2),
        allowNull: true
      },
      total_score: {
        type: Sequelize.DECIMAL(4, 2),
        allowNull: true
      },
      grade: {
        type: Sequelize.STRING(10),
        allowNull: true
      },
      calculated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      },
      last_updated: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      }
    });

    // Tạo indexes
    await queryInterface.addIndex('CourseGradeResults', ['course_id'], {
      name: 'idx_course_grade_results_course'
    });

    await queryInterface.addIndex('CourseGradeResults', ['user_id'], {
      name: 'idx_course_grade_results_user'
    });

    // Unique constraint để đảm bảo mỗi sinh viên chỉ có một kết quả cho mỗi khóa học
    await queryInterface.addIndex('CourseGradeResults', ['course_id', 'user_id'], {
      unique: true,
      name: 'idx_unique_course_user_result'
    });

    // Thêm constraints cho điểm số
    await queryInterface.addConstraint('CourseGradeResults', {
      fields: ['process_average'],
      type: 'check',
      name: 'chk_process_average_range',
      where: {
        process_average: {
          [Sequelize.Op.and]: [
            { [Sequelize.Op.gte]: 0 },
            { [Sequelize.Op.lte]: 10 }
          ]
        }
      }
    });

    await queryInterface.addConstraint('CourseGradeResults', {
      fields: ['final_exam_score'],
      type: 'check',
      name: 'chk_final_exam_score_range',
      where: {
        final_exam_score: {
          [Sequelize.Op.and]: [
            { [Sequelize.Op.gte]: 0 },
            { [Sequelize.Op.lte]: 10 }
          ]
        }
      }
    });

    await queryInterface.addConstraint('CourseGradeResults', {
      fields: ['total_score'],
      type: 'check',
      name: 'chk_total_score_range',
      where: {
        total_score: {
          [Sequelize.Op.and]: [
            { [Sequelize.Op.gte]: 0 },
            { [Sequelize.Op.lte]: 10 }
          ]
        }
      }
    });

    await queryInterface.addConstraint('CourseGradeResults', {
      fields: ['grade'],
      type: 'check',
      name: 'chk_grade_values',
      where: {
        grade: {
          [Sequelize.Op.in]: ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F']
        }
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('CourseGradeResults');
  }
};
