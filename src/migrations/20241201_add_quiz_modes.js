'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        try {
            // Try to create the ENUM type if it doesn't exist
            await queryInterface.sequelize.query(`
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_Quizzes_quiz_mode') THEN
                        CREATE TYPE enum_Quizzes_quiz_mode AS ENUM ('assessment', 'practice');
                    END IF;
                END
                $$;
            `);
        } catch (error) {
            // ENUM might already exist, continue
            console.log('ENUM type might already exist, continuing...');
        }

        // Check if column already exists before adding
        const [results] = await queryInterface.sequelize.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='Quizzes' AND column_name='quiz_mode';
        `);

        if (results.length === 0) {
            await queryInterface.addColumn('Quizzes', 'quiz_mode', {
                type: Sequelize.ENUM('assessment', 'practice'),
                allowNull: false,
                defaultValue: 'assessment',
                comment: 'Quiz mode: assessment (no gamification) or practice (with gamification)'
            });
        }

        // Add other columns with similar checks
        const columnsToAdd = [
            {
                name: 'gamification_enabled',
                definition: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: false,
                    comment: 'Whether gamification features are enabled for this quiz'
                }
            },
            {
                name: 'skill_system_enabled',
                definition: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: false,
                    comment: 'Whether skill system is enabled for this quiz'
                }
            },
            {
                name: 'avatar_system_enabled',
                definition: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: false,
                    comment: 'Whether avatar system is enabled for this quiz'
                }
            },
            {
                name: 'level_progression_enabled',
                definition: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: false,
                    comment: 'Whether level progression is enabled for this quiz'
                }
            },
            {
                name: 'real_time_leaderboard_enabled',
                definition: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: false,
                    comment: 'Whether real-time leaderboard is enabled for this quiz'
                }
            }
        ];

        for (const column of columnsToAdd) {
            const [colResults] = await queryInterface.sequelize.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='Quizzes' AND column_name='${column.name}';
            `);

            if (colResults.length === 0) {
                await queryInterface.addColumn('Quizzes', column.name, column.definition);
            }
        }
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('Quizzes', 'real_time_leaderboard_enabled');
        await queryInterface.removeColumn('Quizzes', 'level_progression_enabled');
        await queryInterface.removeColumn('Quizzes', 'avatar_system_enabled');
        await queryInterface.removeColumn('Quizzes', 'skill_system_enabled');
        await queryInterface.removeColumn('Quizzes', 'gamification_enabled');
        await queryInterface.removeColumn('Quizzes', 'quiz_mode');
        await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_Quizzes_quiz_mode;');
    }
}; 