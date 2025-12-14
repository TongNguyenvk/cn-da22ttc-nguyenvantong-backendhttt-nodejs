'use strict';
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('Subjects', {
            subject_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            course_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Courses',
                    key: 'course_id',
                },
            },
            type_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'TypeSubjects',
                    key: 'type_id',
                },
            },
            noidung_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'TypeOfKnowledges',
                    key: 'noidung_id',
                },
            },
            name: {
                type: Sequelize.STRING(50),
                allowNull: false,
            },
            description: {
                type: Sequelize.STRING(100),
            },
            created_at: {
                type: Sequelize.DATEONLY,
            },
            plo_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'PLOs',
                    key: 'plo_id',
                },
            },
        });
    },
    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('Subjects');
    },
};