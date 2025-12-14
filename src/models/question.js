'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Question extends Model {
        static associate(models) {
            Question.belongsTo(models.QuestionType, { foreignKey: 'question_type_id' });
            Question.belongsTo(models.Level, { foreignKey: 'level_id' });
            Question.belongsTo(models.LO, { foreignKey: 'lo_id', as: 'LO' });
            Question.belongsToMany(models.Quiz, { through: models.QuizQuestion, foreignKey: 'question_id' });
            Question.hasMany(models.Answer, { foreignKey: 'question_id' });
            
            // New association for code submissions
            Question.hasMany(models.CodeSubmission, { 
                foreignKey: 'question_id',
                as: 'CodeSubmissions'
            });

            // Media files association (enhanced questions)
            if (models.MediaFile) {
                Question.hasMany(models.MediaFile, { foreignKey: 'question_id', as: 'MediaFiles' });
            }
        }

        /**
         * Check if this is a code exercise question
         */
        isCodeExercise() {
            return this.QuestionType && this.QuestionType.name === 'code_exercise';
        }

        /**
         * Get starter code from question_text
         */
        getStarterCode(language = 'javascript') {
            if (!this.isCodeExercise()) {
                return null;
            }

            const text = this.question_text || '';
            const starterMatch = text.match(/Starter Code \(JavaScript\):\s*([\s\S]*?)(?=\n\nTest Cases:|$)/i);
            
            if (starterMatch) {
                return starterMatch[1].trim();
            }

            // Default starter code if not found in question_text
            const defaultStarters = {
                javascript: '// Viết code của bạn ở đây\n',
                python: '# Viết code của bạn ở đây\npass',
                java: '// Viết code của bạn ở đây\n'
            };

            return defaultStarters[language] || defaultStarters.javascript;
        }

        /**
         * Get test cases from validation_rules or question_text
         */
        getTestCases() {
            if (!this.isCodeExercise()) {
                return [];
            }

            // NEW: Try to get test cases from validation_rules first
            if (this.validation_rules && Array.isArray(this.validation_rules.test_cases)) {
                return this.validation_rules.test_cases.map(tc => ({
                    input: tc.input,
                    expected: tc.expected || tc.output, // Support both 'expected' and 'output'
                    output: tc.output || tc.expected,   // Support both 'output' and 'expected'
                    description: tc.description || ''
                }));
            }

            // FALLBACK: Parse from question_text (legacy format)
            const text = this.question_text || '';
            const testCasesMatch = text.match(/Test Cases:\s*([\s\S]*?)$/i);
            
            if (!testCasesMatch) {
                return [];
            }

            const testCasesText = testCasesMatch[1];
            const lines = testCasesText.split('\n').filter(line => line.trim());
            
            const testCases = [];
            for (const line of lines) {
                const match = line.match(/^\d+\.\s*(.+?)\s*→\s*(.+?)\s*\((.+?)\)$/);
                if (match) {
                    testCases.push({
                        input: match[1].trim(),
                        output: match[2].trim(),
                        expected: match[2].trim(),
                        description: match[3].trim()
                    });
                }
            }

            return testCases;
        }

        /**
         * Get code exercise configuration
         */
        getCodeConfig() {
            if (!this.isCodeExercise()) {
                return null;
            }

            return {
                difficulty: 'easy',
                time_limit: 1000,
                memory_limit: 128,
                // Mở rộng danh sách ngôn ngữ được phép (ưu tiên C/C++)
                allowed_languages: ['javascript', 'python', 'java', 'c++', 'cpp', 'c'],
                constraints: this.getConstraints(),
                starter_code: {
                    javascript: this.getStarterCode('javascript'),
                    python: this.getStarterCode('python'),
                    java: this.getStarterCode('java')
                }
            };
        }

        /**
         * Parse constraints/ràng buộc từ question_text
         * Hỗ trợ định dạng:
         * Constraints:\n  <nội dung>\n\n
         * hoặc Ràng buộc:\n  <nội dung>\n\n
         * Kết thúc block khi gặp dòng trống kế tiếp hoặc từ khóa Starter Code / Test Cases.
         */
        getConstraints() {
            if (!this.isCodeExercise()) return null;
            const text = this.question_text || '';
            const match = text.match(/Constraints:\s*([\s\S]*?)(?:\n\n|Starter Code|Test Cases:|$)/i);
            if (match) return match[1].trim();
            const match2 = text.match(/Ràng buộc:\s*([\s\S]*?)(?:\n\n|Starter Code|Test Cases:|$)/i);
            if (match2) return match2[1].trim();
            return null;
        }
    }

    Question.init(
        {
            question_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            },
            question_type_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'QuestionTypes',
                    key: 'question_type_id',
                },
            },
            level_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'Levels',
                    key: 'level_id',
                },
            },
            question_text: {
                type: DataTypes.TEXT,
                allowNull: false,
            },
            lo_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'LOs',
                    key: 'lo_id',
                },
            },
            explanation: { // Thêm cột explanation
                type: DataTypes.TEXT,
                allowNull: true, // Có thể để null nếu không có giải thích
            },
            question_data: {
                type: DataTypes.JSONB,
                allowNull: true,
                comment: 'Code-specific data: starter_code, test_cases, solution_code, programming_languages, etc.'
            },
            validation_rules: {
                type: DataTypes.JSONB,
                allowNull: true
            },
            hints: {
                type: DataTypes.JSONB,
                allowNull: true
            },
            time_limit: {
                type: DataTypes.INTEGER,
                allowNull: true
            },
            tags: {
                type: DataTypes.ARRAY(DataTypes.STRING),
                allowNull: true
            },
            difficulty_score: {
                type: DataTypes.FLOAT,
                allowNull: true
            }
        },
        {
            sequelize,
            modelName: 'Question',
            tableName: 'Questions',
        }
    );

    return Question;
};