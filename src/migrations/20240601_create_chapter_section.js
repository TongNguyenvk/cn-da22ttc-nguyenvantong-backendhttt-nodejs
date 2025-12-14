'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('ChapterSections', {
            section_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            chapter_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Chapters',
                    key: 'chapter_id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            title: {
                type: Sequelize.STRING,
                allowNull: false,
            },
            content: {
                type: Sequelize.TEXT,
                allowNull: true,
            },
            order: {
                type: Sequelize.INTEGER,
                allowNull: true,
            }
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('ChapterSections');
    }
}; 