'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('CourseGradeColumns', {
      column_id: {
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
      column_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      weight_percentage: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        validate: {
          min: 0.01,
          max: 100
        }
      },
      column_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      }
    });

    // Tạo indexes
    await queryInterface.addIndex('CourseGradeColumns', ['course_id'], {
      name: 'idx_course_grade_columns_course_id'
    });

    await queryInterface.addIndex('CourseGradeColumns', ['course_id', 'column_order'], {
      unique: true,
      name: 'idx_course_grade_columns_order'
    });

    // Thêm constraints
    await queryInterface.addConstraint('CourseGradeColumns', {
      fields: ['weight_percentage'],
      type: 'check',
      name: 'chk_weight_percentage_range',
      where: {
        weight_percentage: {
          [Sequelize.Op.and]: [
            { [Sequelize.Op.gt]: 0 },
            { [Sequelize.Op.lte]: 100 }
          ]
        }
      }
    });

    await queryInterface.addConstraint('CourseGradeColumns', {
      fields: ['column_order'],
      type: 'check',
      name: 'chk_column_order_positive',
      where: {
        column_order: {
          [Sequelize.Op.gt]: 0
        }
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('CourseGradeColumns');
  }
};
