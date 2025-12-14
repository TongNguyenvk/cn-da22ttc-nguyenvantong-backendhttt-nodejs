'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.sequelize.transaction(async (transaction) => {
            // Xóa cột plo_id khỏi bảng LOs
            await queryInterface.removeColumn('LOs', 'plo_id', { transaction });
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.sequelize.transaction(async (transaction) => {
            // Thêm lại cột plo_id vào bảng LOs
            await queryInterface.addColumn(
                'LOs',
                'plo_id',
                {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: {
                        model: 'PLOs',
                        key: 'plo_id',
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'CASCADE',
                },
                { transaction }
            );
        });
    },
}; 