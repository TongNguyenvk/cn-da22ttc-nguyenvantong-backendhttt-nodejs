const { QuestionType, Level, LO, Question, Answer, Subject, MediaFile, sequelize } = require('../models'); // Thêm MediaFile
const fs = require('fs');
const csv = require('fast-csv');
const xlsx = require('xlsx');
const { Op, literal } = require('sequelize');
const path = require('path');
const AdmZip = require('adm-zip');

// Helper function for MIME type
function getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4',
        '.webm': 'video/webm', '.avi': 'video/x-msvideo', '.mov': 'video/quicktime',
        '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg'
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

// Lấy danh sách tất cả câu hỏi (có phân trang và lọc theo lo_id)
exports.getAllQuestions = async (req, res) => {
    try {
        const { page = 1, limit = 10, lo_id } = req.query;
        const offset = (page - 1) * limit;

        const where = lo_id ? { lo_id } : {};

        const questions = await Question.findAndCountAll({
            where,
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                { model: QuestionType, attributes: ['question_type_id', 'name'] },
                { model: Level, attributes: ['level_id', 'name'] },
                { model: LO, as: 'LO', attributes: ['lo_id', 'name'] },
                { model: Answer, attributes: ['answer_id', 'answer_text', 'iscorrect'] },
            ],
        });

        res.status(200).json({
            success: true,
            data: {
                totalItems: questions.count,
                totalPages: Math.ceil(questions.count / limit),
                currentPage: parseInt(page),
                questions: questions.rows,
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách câu hỏi',
            error: error.message
        });
    }
};

// Lấy thông tin chi tiết một câu hỏi
exports.getQuestionById = async (req, res) => {
    try {
        const question = await Question.findByPk(req.params.id, {
            include: [
                { model: QuestionType, attributes: ['question_type_id', 'name'] },
                { model: Level, attributes: ['level_id', 'name'] },
                { model: LO, as: 'LO', attributes: ['lo_id', 'name'] },
                { model: Answer, attributes: ['answer_id', 'answer_text', 'iscorrect'] }
            ],
        });

        if (!question) {
            return res.status(404).json({ message: 'Câu hỏi không tồn tại' });
        }

        // Query media files separately
        const mediaFiles = await MediaFile.findAll({
            where: { question_id: req.params.id },
            attributes: ['media_id', 'file_name', 'file_path', 'file_type', 'mime_type', 'original_filename', 'owner_type', 'answer_id']
        });

        // Get base URL for media files
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        
        // Add full URL to media files
        const mediaWithUrls = mediaFiles.map(m => {
            const media = m.toJSON();
            return {
                ...media,
                url: `${baseUrl}${media.file_path}`
            };
        });

        // Attach media to question and answers
        const questionData = question.toJSON();
        
        // Question media
        questionData.MediaFiles = mediaWithUrls.filter(m => m.owner_type === 'question');
        
        // Answer media
        if (questionData.Answers) {
            questionData.Answers = questionData.Answers.map(answer => {
                const answerMedia = mediaWithUrls.filter(m => m.owner_type === 'answer' && m.answer_id === answer.answer_id);
                return {
                    ...answer,
                    MediaFiles: answerMedia
                };
            });
        }

        // SECURITY: Hide test cases from students (only show to teachers/admins)
        // Students can see the question but NOT the test cases (input/expected values)
        if (questionData.validation_rules && questionData.validation_rules.test_cases) {
            const userRole = req.user?.Role?.name || req.roleName;
            if (!['teacher', 'admin'].includes(userRole)) {
                // Student: Remove test cases but keep other validation rules
                questionData.validation_rules = {
                    ...questionData.validation_rules,
                    test_cases: [], // Clear test cases
                    test_case_count: questionData.validation_rules.test_cases.length // Show count only
                };
            }
        }

        res.status(200).json({
            success: true,
            data: questionData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin câu hỏi',
            error: error.message
        });
    }
};

// Tạo một câu hỏi mới
exports.createQuestion = async (req, res) => {
    try {
        const { question_type_id, level_id, question_text, lo_id } = req.body;

        // Kiểm tra các trường bắt buộc
        if (!question_type_id || !level_id || !question_text || !lo_id) {
            return res.status(400).json({ success: false, message: 'Thiếu các trường bắt buộc' });
        }

        // Kiểm tra xem question_type_id, level_id, lo_id có tồn tại không
        const questionType = await QuestionType.findByPk(question_type_id);
        const level = await Level.findByPk(level_id);
        const lo = await LO.findByPk(lo_id);

        if (!questionType) {
            return res.status(400).json({ success: false, message: 'Loại câu hỏi không tồn tại' });
        }
        if (!level) {
            return res.status(400).json({ success: false, message: 'Độ khó không tồn tại' });
        }
        if (!lo) {
            return res.status(400).json({ success: false, message: 'Learning Outcome không tồn tại' });
        }

        const newQuestion = await Question.create({
            question_type_id,
            level_id,
            question_text,
            lo_id,
        });

        res.status(201).json({
            success: true,
            message: 'Tạo câu hỏi thành công',
            data: newQuestion
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi khi tạo câu hỏi', error: error.message });
    }
};

// Cập nhật thông tin một câu hỏi
exports.updateQuestion = async (req, res) => {
    try {
        const { question_type_id, level_id, question_text } = req.body;

        const question = await Question.findByPk(req.params.id);
        if (!question) {
            return res.status(404).json({ message: 'Câu hỏi không tồn tại' });
        }

        // Kiểm tra các trường nếu được cung cấp
        if (question_type_id) {
            const questionType = await QuestionType.findByPk(question_type_id);
            if (!questionType) {
                return res.status(400).json({ success: false, message: 'Loại câu hỏi không tồn tại' });
            }
        }
        if (level_id) {
            const level = await Level.findByPk(level_id);
            if (!level) {
                return res.status(400).json({ success: false, message: 'Độ khó không tồn tại' });
            }
        }

        await question.update({
            question_type_id: question_type_id || question.question_type_id,
            level_id: level_id || question.level_id,
            question_text: question_text || question.question_text,
        });

        res.status(200).json({
            success: true,
            message: 'Cập nhật câu hỏi thành công',
            data: question
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật câu hỏi',
            error: error.message
        });
    }
};

// Xóa một câu hỏi
exports.deleteQuestion = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
        const questionId = req.params.id;
        const question = await Question.findByPk(questionId);
        
        if (!question) {
            await transaction.rollback();
            return res.status(404).json({ 
                success: false,
                message: 'Câu hỏi không tồn tại' 
            });
        }

        // Bước 1: Xóa tất cả các answers liên quan đến câu hỏi này
        await Answer.destroy({
            where: { question_id: questionId },
            transaction
        });

        // Bước 2: Xóa tất cả lịch sử trả lời của user cho câu hỏi này
        const { UserQuestionHistory } = require('../models');
        await UserQuestionHistory.destroy({
            where: { question_id: questionId },
            transaction
        });

        // Bước 3: Xóa câu hỏi khỏi các quiz (many-to-many relationship)
        const { QuizQuestion } = require('../models');
        await QuizQuestion.destroy({
            where: { question_id: questionId },
            transaction
        });

        // Bước 4: Xóa câu hỏi chính
        await question.destroy({ transaction });

        await transaction.commit();
        
        res.status(200).json({
            success: true,
            message: 'Xóa câu hỏi và tất cả dữ liệu liên quan thành công',
            data: { question_id: questionId }
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error deleting question:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa câu hỏi',
            error: error.message
        });
    }
};

// Xóa nhiều câu hỏi cùng lúc (bulk delete)
exports.bulkDeleteQuestions = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
        const { question_ids } = req.body;
        
        // Validate input
        if (!question_ids || !Array.isArray(question_ids) || question_ids.length === 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Vui lòng cung cấp danh sách question_ids (array)'
            });
        }

        // Validate all IDs are numbers
        const invalidIds = question_ids.filter(id => isNaN(parseInt(id)));
        if (invalidIds.length > 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Danh sách chứa ID không hợp lệ',
                invalidIds
            });
        }

        const questionIdsInt = question_ids.map(id => parseInt(id));

        // Check which questions exist
        const existingQuestions = await Question.findAll({
            where: { question_id: questionIdsInt },
            attributes: ['question_id']
        });

        const existingIds = existingQuestions.map(q => q.question_id);
        const notFoundIds = questionIdsInt.filter(id => !existingIds.includes(id));

        if (existingIds.length === 0) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy câu hỏi nào để xóa',
                notFoundIds
            });
        }

        // Bước 1: Xóa tất cả answers
        await Answer.destroy({
            where: { question_id: existingIds },
            transaction
        });

        // Bước 2: Xóa lịch sử trả lời
        const { UserQuestionHistory } = require('../models');
        await UserQuestionHistory.destroy({
            where: { question_id: existingIds },
            transaction
        });

        // Bước 3: Xóa khỏi quiz
        const { QuizQuestion } = require('../models');
        await QuizQuestion.destroy({
            where: { question_id: existingIds },
            transaction
        });

        // Bước 4: Xóa media files
        const { MediaFile } = require('../models');
        const mediaFiles = await MediaFile.findAll({
            where: { question_id: existingIds }
        });
        
        // Delete physical files
        const fs = require('fs');
        for (const media of mediaFiles) {
            if (fs.existsSync(media.file_path)) {
                try {
                    fs.unlinkSync(media.file_path);
                } catch (err) {
                    console.error(`Failed to delete file: ${media.file_path}`, err);
                }
            }
        }
        
        // Delete media records
        await MediaFile.destroy({
            where: { question_id: existingIds },
            transaction
        });

        // Bước 5: Xóa câu hỏi
        await Question.destroy({
            where: { question_id: existingIds },
            transaction
        });

        await transaction.commit();

        res.status(200).json({
            success: true,
            message: `Xóa thành công ${existingIds.length} câu hỏi`,
            data: {
                deletedCount: existingIds.length,
                deletedIds: existingIds,
                notFoundIds: notFoundIds.length > 0 ? notFoundIds : undefined
            }
        });

    } catch (error) {
        await transaction.rollback();
        console.error('Error bulk deleting questions:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa câu hỏi',
            error: error.message
        });
    }
};

// Lấy danh sách câu hỏi theo lo_id (có phân trang)
exports.getQuestionsByLoId = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const lo = await LO.findByPk(req.params.lo_id);
        if (!lo) {
            return res.status(404).json({ success: false, message: 'Learning Outcome không tồn tại' });
        }

        const questions = await Question.findAndCountAll({
            where: { lo_id: req.params.lo_id },
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                { model: QuestionType, attributes: ['question_type_id', 'name'] },
                { model: Level, attributes: ['level_id', 'name'] },
                { model: LO, as: 'LO', attributes: ['lo_id', 'name'] },
                { model: Answer, attributes: ['answer_id', 'answer_text', 'iscorrect'] },
            ],
        });

        res.status(200).json({
            success: true,
            data: {
                totalItems: questions.count,
                totalPages: Math.ceil(questions.count / limit),
                currentPage: parseInt(page),
                questions: questions.rows,
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách câu hỏi theo lo_id',
            error: error.message
        });
    }
};


exports.importQuestionsFromCSV = async (req, res) => {
    try {
        console.log('Received request to import questions');
        console.log('req.file:', req.file);
        console.log('req.body:', req.body);

        if (!req.file) {
            console.log('No file uploaded');
            return res.status(400).json({ success: false, message: 'Vui lòng tải lên file CSV' });
        }

        const questions = [];
        const errors = [];
        const rows = [];

        console.log('Starting to read CSV file:', req.file.path);
        fs.createReadStream(req.file.path)
            .pipe(csv.parse({ headers: true, delimiter: ',', skipEmptyLines: true }))
            .on('data', (row) => {
                rows.push(row);
            })
            .on('error', (error) => {
                console.error('Error reading CSV file:', error.message);
                res.status(500).json({ success: false, message: 'Lỗi khi đọc file CSV', error: error.message });
            })
            .on('end', async () => {
                console.log('Finished reading CSV file');
                try {
                    for (const row of rows) {
                        try {
                            console.log('Processing row:', row);
                            const { question_type_id, level_id, question_text, lo_id, lo_name, subject_id, explanation } = row;

                            if (!question_type_id || !level_id || !question_text || (!lo_id && !lo_name)) {
                                console.log('Missing required fields in row:', row);
                                errors.push({ row, error: 'Thiếu các trường bắt buộc (question_type_id, level_id, question_text, và lo_id hoặc lo_name)' });
                                continue;
                            }

                            const questionType = await QuestionType.findByPk(question_type_id);
                            const level = await Level.findByPk(level_id);
                            
                            if (!questionType) {
                                errors.push({ row, error: `QuestionType với ID ${question_type_id} không tồn tại` });
                                continue;
                            }
                            if (!level) {
                                errors.push({ row, error: `Level với ID ${level_id} không tồn tại` });
                                continue;
                            }

                            // Xử lý LO: Tìm theo ID hoặc tạo mới theo tên
                            let lo;
                            if (lo_id) {
                                // Sử dụng lo_id có sẵn
                                lo = await LO.findByPk(lo_id);
                                if (!lo) {
                                    errors.push({ row, error: `LO với ID ${lo_id} không tồn tại` });
                                    continue;
                                }
                            } else if (lo_name) {
                                // Tìm theo tên hoặc tạo mới
                                lo = await LO.findOne({ where: { name: lo_name } });
                                if (!lo) {
                                    // Tạo LO mới, cần có subject_id
                                    const defaultSubjectId = subject_id || req.body.default_subject_id || 1;
                                    lo = await LO.create({ 
                                        name: lo_name,
                                        subject_id: defaultSubjectId 
                                    });
                                    console.log(`Created new LO: ${lo_name} with ID: ${lo.lo_id} and subject_id: ${defaultSubjectId}`);
                                }
                            }

                            const newQuestion = await Question.create({
                                question_type_id: parseInt(question_type_id),
                                level_id: parseInt(level_id),
                                question_text,
                                lo_id: lo.lo_id, // Sử dụng lo_id từ LO đã tìm thấy hoặc tạo mới
                                explanation: explanation || null,
                            });

                            const answers = [];
                            for (let i = 1; i <= 4; i++) {
                                const answerText = row[`answer_${i}`];
                                const isCorrect = row[`iscorrect_${i}`];

                                if (answerText && isCorrect !== undefined) {
                                    const answer = await Answer.create({
                                        question_id: newQuestion.question_id,
                                        answer_text: answerText,
                                        iscorrect: isCorrect === 'true' || isCorrect === '1',
                                    });
                                    answers.push(answer);
                                }
                            }

                            questions.push({ ...newQuestion.toJSON(), Answers: answers });
                        } catch (error) {
                            errors.push({ row, error: error.message });
                        }
                    }

                    try {
                        fs.unlinkSync(req.file.path);
                    } catch (error) {
                        console.error('Error deleting temporary file:', error.message);
                    }

                    if (errors.length > 0) {
                        return res.status(400).json({
                            success: false,
                            message: 'Có lỗi xảy ra khi nhập câu hỏi',
                            errors,
                            questionsImported: questions,
                        });
                    }

                    res.status(201).json({
                        success: true,
                        message: 'Nhập câu hỏi thành công',
                        data: {
                            questions: questions,
                            totalImported: questions.length
                        }
                    });
                } catch (error) {
                    res.status(500).json({ success: false, message: 'Lỗi khi xử lý dữ liệu CSV', error: error.message });
                }
            });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi khi nhập câu hỏi từ CSV', error: error.message });
    }
};

// Import questions với auto-create LO (Enhanced version)
exports.importQuestionsAdvanced = async (req, res) => {
    try {
        console.log('Received request to import questions (Advanced)');
        console.log('req.file:', req.file);
        console.log('req.body:', req.body);

        if (!req.file) {
            console.log('No file uploaded');
            return res.status(400).json({ success: false, message: 'Vui lòng tải lên file CSV/Excel' });
        }

        const { default_subject_id = 1, create_missing_los = true } = req.body;
        const questions = [];
        const errors = [];
        const createdLOs = [];

        // Determine file type
        const fileExtension = req.file.originalname.split('.').pop().toLowerCase();
        
        if (fileExtension === 'csv') {
            // Handle CSV
            const rows = [];
            fs.createReadStream(req.file.path)
                .pipe(csv.parse({ headers: true, delimiter: ',', skipEmptyLines: true }))
                .on('data', (row) => rows.push(row))
                .on('error', (error) => {
                    console.error('Error reading CSV file:', error.message);
                    res.status(500).json({ success: false, message: 'Lỗi khi đọc file CSV', error: error.message });
                })
                .on('end', async () => {
                    await processImportRows(rows, questions, errors, createdLOs, default_subject_id, create_missing_los, req, res);
                });
        } else if (['xlsx', 'xls'].includes(fileExtension)) {
            // Handle Excel
            const workbook = xlsx.readFile(req.file.path);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = xlsx.utils.sheet_to_json(sheet);
            fs.unlinkSync(req.file.path);
            await processImportRows(rows, questions, errors, createdLOs, default_subject_id, create_missing_los, req, res);
        } else {
            return res.status(400).json({ success: false, message: 'Định dạng file không được hỗ trợ. Chỉ chấp nhận CSV và Excel.' });
        }

    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi khi import câu hỏi', error: error.message });
    }
};

// Helper function để xử lý import rows
async function processImportRows(rows, questions, errors, createdLOs, defaultSubjectId, createMissingLOs, req, res) {
    try {
        for (const row of rows) {
            try {
                console.log('Processing row:', row);
                const { 
                    question_type_id, 
                    level_id, 
                    question_text, 
                    lo_id, 
                    lo_name, 
                    subject_id,
                    explanation,
                    answer_1, answer_2, answer_3, answer_4,
                    iscorrect_1, iscorrect_2, iscorrect_3, iscorrect_4
                } = row;

                if (!question_type_id || !level_id || !question_text) {
                    errors.push({ row, error: 'Thiếu các trường bắt buộc: question_type_id, level_id, question_text' });
                    continue;
                }

                // Validate question type and level
                const questionType = await QuestionType.findByPk(question_type_id);
                const level = await Level.findByPk(level_id);
                
                if (!questionType) {
                    errors.push({ row, error: `QuestionType với ID ${question_type_id} không tồn tại` });
                    continue;
                }
                if (!level) {
                    errors.push({ row, error: `Level với ID ${level_id} không tồn tại` });
                    continue;
                }

                // Handle LO: Find by ID or create by name
                let lo;
                if (lo_id) {
                    lo = await LO.findByPk(lo_id);
                    if (!lo) {
                        errors.push({ row, error: `LO với ID ${lo_id} không tồn tại` });
                        continue;
                    }
                } else if (lo_name) {
                    lo = await LO.findOne({ where: { name: lo_name } });
                    if (!lo && createMissingLOs) {
                        const loSubjectId = subject_id || defaultSubjectId;
                        
                        // Validate subject exists
                        const subject = await Subject.findByPk(loSubjectId);
                        if (!subject) {
                            errors.push({ row, error: `Subject với ID ${loSubjectId} không tồn tại` });
                            continue;
                        }

                        lo = await LO.create({ 
                            name: lo_name,
                            subject_id: loSubjectId 
                        });
                        createdLOs.push(lo);
                        console.log(`Created new LO: ${lo_name} with ID: ${lo.lo_id} and subject_id: ${loSubjectId}`);
                    } else if (!lo) {
                        errors.push({ row, error: `LO "${lo_name}" không tồn tại và create_missing_los = false` });
                        continue;
                    }
                } else {
                    errors.push({ row, error: 'Phải cung cấp lo_id hoặc lo_name' });
                    continue;
                }

                // Create question
                const newQuestion = await Question.create({
                    question_type_id: parseInt(question_type_id),
                    level_id: parseInt(level_id),
                    question_text,
                    lo_id: lo.lo_id,
                    explanation: explanation || null,
                });

                // Create answers
                const answers = [];
                for (let i = 1; i <= 4; i++) {
                    const answerText = row[`answer_${i}`];
                    const isCorrect = row[`iscorrect_${i}`];

                    if (answerText && isCorrect !== undefined) {
                        const answer = await Answer.create({
                            question_id: newQuestion.question_id,
                            answer_text: answerText,
                            iscorrect: isCorrect === 'true' || isCorrect === '1' || isCorrect === 1,
                        });
                        answers.push(answer);
                    }
                }

                questions.push({ ...newQuestion.toJSON(), Answers: answers });
            } catch (error) {
                errors.push({ row, error: error.message });
            }
        }

        // Clean up temp file if CSV
        try {
            if (req.file && req.file.path) {
                fs.unlinkSync(req.file.path);
            }
        } catch (error) {
            console.error('Error deleting temporary file:', error.message);
        }

        // Send response
        res.status(errors.length > 0 ? 207 : 201).json({
            success: errors.length === 0,
            message: `Import hoàn tất. Đã tạo ${questions.length} câu hỏi${createdLOs.length > 0 ? ` và ${createdLOs.length} LO mới` : ''}.`,
            data: {
                questions,
                totalImported: questions.length,
                createdLOs,
                totalCreatedLOs: createdLOs.length,
                errors: errors.length > 0 ? errors : undefined
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi khi xử lý dữ liệu import', error: error.message });
    }
}




exports.importQuestionsFromExcel = async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: "No file uploaded" });

    // FIX LỖI 2: Validate subject_id bắt buộc
    const { subject_id } = req.body;
    if (!subject_id) {
        // Xóa file đã upload
        if (file.path) fs.unlinkSync(file.path);
        
        return res.status(400).json({ 
            success: false, 
            message: "subject_id là bắt buộc khi import câu hỏi",
            hint: "Vui lòng cung cấp subject_id trong form-data của request. Ví dụ: subject_id=5",
            example: {
                method: "POST",
                url: "/api/questions/import-excel",
                formData: {
                    file: "file.xlsx",
                    subject_id: "5"
                }
            }
        });
    }

    try {
        // Kiểm tra subject_id có tồn tại không
        const subject = await Subject.findByPk(subject_id);
        if (!subject) {
            fs.unlinkSync(file.path);
            return res.status(404).json({
                success: false,
                message: `Môn học với ID ${subject_id} không tồn tại`,
                hint: "Vui lòng kiểm tra lại subject_id"
            });
        }

        console.log(`[Import] Starting import for subject: ${subject.name} (ID: ${subject_id})`);

        const workbook = xlsx.readFile(file.path);
        const sheetNames = workbook.SheetNames;
        const sheet1 = workbook.Sheets[sheetNames[0]];
        const sheet2 = workbook.Sheets[sheetNames[1]];

        console.log('Sheet names:', sheetNames);
        console.log('Sheet 1 range:', sheet1['!ref']);
        console.log('Sheet 2 range:', sheet2['!ref']);

        // Chuẩn hoá mã KQHT: hỗ trợ định dạng "KQHT1", "KQHT 1", "KQHT1:", ...
        const normalizeKQHT = (val) => {
            if (val === undefined || val === null) return null;
            const s = String(val).toUpperCase().trim();
            const m = s.match(/KQHT\s*:?[\s]*0*(\d+)/);
            return m ? `KQHT${m[1]}` : null;
        };

        // 1. Đọc sheet 2: lấy đúng 2 cột KQHT và tên KQHT
        const loRows = xlsx.utils.sheet_to_json(sheet2, { header: 1 });
        console.log('LO rows from sheet 2:', loRows);
        const loMap = {}; // { KQHT: lo_id }

        for (let i = 1; i < loRows.length; i++) { // Bỏ header
            const row = loRows[i];
            console.log(`Processing LO row ${i}:`, row);

            // Bỏ qua các row header và tổng cộng
            if (!row || row.length < 3 ||
                (typeof row[0] === 'string' && row[0].toUpperCase().includes('TỔNG')) ||
                (typeof row[1] === 'string' && row[1].toUpperCase().includes('TỔNG'))) {
                console.log(`Skipping row ${i} - header or total row`);
                continue;
            }

            // Cột KQHT là cột thứ 2 (index 1), Mã LO là cột thứ 3 (index 2), Tên KQHT là cột thứ 4 (index 3)
            const kqhtCode = row[1];
            const loCode = row[2];      // ⭐ NEW: Mã LO (LO1, LO2, LO3...)
            const tenKQHT = row[3];     // ⭐ CHANGED: Tên KQHT (description)

            if (!kqhtCode || !loCode || !tenKQHT) {
                console.log(`Skipping row ${i} - missing KQHT code, LO code, or name`);
                continue;
            }

            // Chuẩn hoá mã KQHT từ số thành "KQHT1", "KQHT2", ...
            const normalizedKQHT = `KQHT${kqhtCode}`;
            console.log(`Row ${i}: KQHT=${normalizedKQHT}, LO Code=${loCode}, Description=${tenKQHT}`);

            // Tìm hoặc tạo LO theo Mã LO + subject_id
            let lo = await LO.findOne({ 
                where: { 
                    name: loCode,           // ⭐ Tìm theo Mã LO (LO1, LO2...)
                    subject_id: subject_id 
                } 
            });
            
            if (!lo) {
                // Tạo LO mới
                lo = await LO.create({ 
                    name: loCode,           // ⭐ LO1, LO2, LO3...
                    description: tenKQHT,   // ⭐ Tổng quan về thiết kế web
                    subject_id: subject_id
                });
                console.log(`Created new LO: ${loCode} - "${tenKQHT}" (ID: ${lo.lo_id})`);
            } else {
                // Update description nếu khác
                if (lo.description !== tenKQHT) {
                    await lo.update({ description: tenKQHT });
                    console.log(`Updated LO: ${loCode} - "${tenKQHT}" (ID: ${lo.lo_id})`);
                } else {
                    console.log(`Found existing LO: ${loCode} - "${tenKQHT}" (ID: ${lo.lo_id})`);
                }
            }
            
            // Lưu map theo mã KQHT đã chuẩn hoá
            loMap[normalizedKQHT] = lo.lo_id;
        }

        console.log('Final LO map:', loMap);

        // 2. Đọc sheet 1 như cũ, nhưng lấy lo_id từ loMap
        const rawData = xlsx.utils.sheet_to_json(sheet1, { header: 1 });
        console.log('Raw data from sheet 1 (first 10 rows):', rawData.slice(0, 10));
        fs.unlinkSync(file.path);

        let currentKQHT = '';
        let currentLoId = '';
        let i = 0;
        let imported = 0;
        let errors = [];
        const questions = [];

        while (i < rawData.length) {
            const row = rawData[i];
            // Check for KQHTx để cập nhật currentKQHT và currentLoId (chuẩn hoá)
            if (row && typeof row[0] === 'string' && row[0].toUpperCase().includes('KQHT')) {
                const code = normalizeKQHT(row[0]);
                currentKQHT = code || '';
                currentLoId = currentKQHT ? (loMap[currentKQHT] || '') : '';
                console.log(`Found KQHT row ${i}: raw="${row[0]}", normalized="${code}", currentKQHT="${currentKQHT}", currentLoId="${currentLoId}"`);

                if (!currentLoId) {
                    const errorMsg = `Không tìm thấy LO cho ${currentKQHT || 'KQHT'}. Available keys: ${Object.keys(loMap).join(', ')}`;
                    console.log(errorMsg);
                    errors.push({ row: i + 1, error: errorMsg });
                } else {
                    console.log(`Successfully mapped ${currentKQHT} to LO ID ${currentLoId}`);
                }
                i += 2; // Skip header row
                continue;
            }
            // Xử lý câu hỏi: mỗi câu hỏi chiếm 4 rows (câu hỏi + 3 đáp án)
            if (i + 3 >= rawData.length) break;

            const q_row = rawData[i];           // Row câu hỏi chính
            const a_row = rawData[i];           // Row đáp án A (cùng row với câu hỏi)
            const b_row = rawData[i + 1];       // Row đáp án B  
            const c_row = rawData[i + 2];       // Row đáp án C
            const d_row = rawData[i + 3];       // Row đáp án D

            console.log(`Processing question at row ${i}:`, {
                question: q_row,
                answerA: a_row,
                answerB: b_row,
                answerC: c_row
            });

            const question_type_id = 1;
            const level_id = (q_row[0] !== undefined && q_row[0] !== null && q_row[0] !== '') ? parseInt(q_row[0]) : 1;
            const question_text = q_row[2] ? String(q_row[2]).trim() : '';

            // Đọc đáp án từ các row tương ứng
            const answer_a = a_row[3] ? String(a_row[3]).replace('A.', '').trim() : '';
            const answer_b = b_row[3] ? String(b_row[3]).replace('B.', '').trim() : '';
            const answer_c = c_row[3] ? String(c_row[3]).replace('C.', '').trim() : '';
            const answer_d = c_row[3] ? String(c_row[3]).replace('D.', '').trim() : '';

            const correct = q_row[4] ? String(q_row[4]).trim().toUpperCase() : '';
            const iscorrect = [
                correct === 'A' ? 1 : 0,
                correct === 'B' ? 1 : 0,
                correct === 'C' ? 1 : 0,
                correct === 'D' ? 1 : 0,
            ];
            const explanation = q_row[5] ? String(q_row[5]).trim() : '';

            console.log(`Question data:`, {
                level_id,
                question_text,
                answer_a,
                answer_b,
                answer_c,
                answer_d,
                correct,
                explanation,
                currentLoId
            });

            if (!question_text || !currentLoId || !answer_a || !answer_b || !answer_c || !answer_d) {
                const errorMsg = `Thiếu dữ liệu bắt buộc hoặc không xác định được LO. Question: "${question_text}", LO: "${currentLoId}", Answers: A:"${answer_a}", B:"${answer_b}", C:"${answer_c}", D:"${answer_d}"`;
                console.log(errorMsg);
                errors.push({ row: i + 1, error: errorMsg });
                i += 4;
                continue;
            }
            try {
                const newQuestion = await Question.create({
                    question_type_id,
                    level_id,
                    question_text,
                    lo_id: currentLoId,
                    explanation,
                });
                const answers = [
                    { answer_text: answer_a, iscorrect: iscorrect[0] },
                    { answer_text: answer_b, iscorrect: iscorrect[1] },
                    { answer_text: answer_c, iscorrect: iscorrect[2] },
                    { answer_text: answer_d, iscorrect: iscorrect[3] },
                ];
                for (const ans of answers) {
                    await Answer.create({
                        question_id: newQuestion.question_id,
                        answer_text: ans.answer_text,
                        iscorrect: ans.iscorrect,
                    });
                }
                imported++;
                questions.push(newQuestion);
            } catch (err) {
                errors.push({ row: i + 1, error: err.message });
            }
            i += 4;
        }
        
        // FIX LỖI 2: Log chi tiết để debug
        console.log('[Import] Summary:', {
            subject_id: subject_id,
            subject_name: subject.name,
            totalImported: imported,
            totalErrors: errors.length,
            loMap: Object.keys(loMap).reduce((acc, key) => {
                acc[key] = loMap[key];
                return acc;
            }, {})
        });
        
        res.status(errors.length > 0 ? 207 : 201).json({
            success: errors.length === 0,
            message: `Đã import ${imported} câu hỏi vào môn học ${subject.name}.`,
            data: {
                subject_id: parseInt(subject_id),
                subject_name: subject.name,
                questions,
                totalImported: imported,
                totalLOs: Object.keys(loMap).length,
                loMapping: loMap,
                errors: errors.length > 0 ? errors : undefined
            }
        });
    } catch (err) {
        if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }
        res.status(500).json({ success: false, message: "Lỗi đọc file Excel", error: err.message });
    }
};


// controllers/questionController.js


// Hàm tiện ích để lấy câu hỏi (tách logic từ getQuestionsByLOs)
const fetchQuestionsByLOs = async (loIds, totalQuestions, difficultyRatio, type = null) => {
    // Kiểm tra đầu vào
    if (!Array.isArray(loIds) || loIds.length === 0) {
        throw new Error('loIds phải là một mảng không rỗng');
    }
    if (!Number.isInteger(totalQuestions) || totalQuestions <= 0) {
        throw new Error('totalQuestions phải là số nguyên dương');
    }
    if (!difficultyRatio || typeof difficultyRatio !== 'object') {
        throw new Error('difficultyRatio phải là một object');
    }

    const { easy = 0, medium = 0, hard = 0 } = difficultyRatio;
    const totalRatio = easy + medium + hard;
    if (totalRatio !== 100) {
        throw new Error('Tổng tỷ lệ (easy + medium + hard) phải bằng 100');
    }

    // Tính số lượng câu hỏi cho từng mức độ khó
    let easyCount = Math.round((easy / 100) * totalQuestions);
    let mediumCount = Math.round((medium / 100) * totalQuestions);
    let hardCount = totalQuestions - easyCount - mediumCount;

    // Truy vấn câu hỏi theo từng mức độ khó
    const questions = [];
    const excludeQuestionIds = new Set();

    // Hàm lấy câu hỏi ngẫu nhiên cho một mức độ khó
    const fetchQuestionsByDifficulty = async (levelId, count) => {
        if (count <= 0) return [];

        const fetchedQuestions = await Question.findAll({
            attributes: [
                'question_id',
                'question_type_id',
                'level_id',
                'question_text',
                'lo_id',
                'explanation',
            ],
            where: {
                lo_id: { [Op.in]: loIds },
                level_id: levelId,
                question_id: { [Op.notIn]: Array.from(excludeQuestionIds) },
                ...(type && { question_type_id: type }), // Lọc theo type nếu có
            },
            order: literal('random()'),
            limit: count,
            include: [
                {
                    model: LO,
                    as: 'LO',
                    attributes: ['lo_id', 'name'],
                },
                {
                    model: Answer,
                    attributes: ['answer_id', 'answer_text', 'iscorrect'],
                },
                {
                    model: QuestionType,
                    attributes: ['question_type_id', 'name'],
                },
                {
                    model: Level,
                    attributes: ['level_id', 'name'],
                },
            ],
        });

        fetchedQuestions.forEach(q => excludeQuestionIds.add(q.question_id));
        return fetchedQuestions;
    };

    // Lấy câu hỏi dễ (level_id = 1)
    let easyQuestions = await fetchQuestionsByDifficulty(1, easyCount);
    questions.push(...easyQuestions);
    easyCount = easyQuestions.length;

    // Lấy câu hỏi trung bình (level_id = 2)
    let mediumQuestions = await fetchQuestionsByDifficulty(2, mediumCount);
    questions.push(...mediumQuestions);
    mediumCount = mediumQuestions.length;

    // Lấy câu hỏi khó (level_id = 3)
    let hardQuestions = await fetchQuestionsByDifficulty(3, hardCount);
    questions.push(...hardQuestions);
    hardCount = hardQuestions.length;

    // Nếu không đủ câu hỏi, thử lấy thêm từ các mức độ khác
    let remainingCount = totalQuestions - questions.length;
    if (remainingCount > 0) {
        const additionalMedium = await fetchQuestionsByDifficulty(2, remainingCount);
        questions.push(...additionalMedium);
        remainingCount -= additionalMedium.length;

        if (remainingCount > 0) {
            const additionalEasy = await fetchQuestionsByDifficulty(1, remainingCount);
            questions.push(...additionalEasy);
            remainingCount -= additionalEasy.length;
        }

        if (remainingCount > 0) {
            const additionalHard = await fetchQuestionsByDifficulty(3, remainingCount);
            questions.push(...additionalHard);
            remainingCount -= additionalHard.length;
        }
    }

    // Kiểm tra số lượng câu hỏi thực tế
    if (questions.length < totalQuestions) {
        throw new Error(
            `Không đủ câu hỏi theo yêu cầu. Yêu cầu ${totalQuestions} câu, nhưng chỉ tìm thấy ${questions.length} câu.`
        );
    }

    // Trả về danh sách câu hỏi
    return questions.map(q => ({
        question_id: q.question_id,
        question_type: {
            question_type_id: q.QuestionType?.question_type_id,
            name: q.QuestionType?.name,
        },
        level: {
            level_id: q.Level?.level_id,
            name: q.Level?.name,
        },
        question_text: q.question_text,
        lo_id: q.lo_id,
        lo_name: q.LO?.name,
        explanation: q.explanation,
        answers: q.Answer?.map(a => ({
            answer_id: a.answer_id,
            answer_text: a.answer_text,
            iscorrect: a.iscorrect,
        })) || [],
    }));
};

// =====================================================
// HELPER FUNCTIONS FOR MEDIA IMPORT
// =====================================================

/**
 * Get file type from mime type
 */
const getFileType = (mimeType) => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    return 'document';
};

/**
 * Map tên file gốc sang media_id
 * @param {string} originalFilename - Tên file gốc từ Excel
 * @returns {number|null} - media_id hoặc null nếu không tìm thấy
 */
const getMediaIdByFilename = async (originalFilename) => {
    if (!originalFilename || originalFilename.trim() === '') {
        return null;
    }
    
    const media = await MediaFile.findOne({
        where: {
            original_filename: originalFilename.trim(),
            owner_type: 'pending'
        },
        order: [['media_id', 'DESC']] // Lấy file mới nhất nếu trùng tên
    });
    
    return media ? media.media_id : null;
};

/**
 * Link media to question/answer
 */
const linkMediaToQuestion = async (mediaId, questionId, ownerType, answerId, transaction) => {
    const media = await MediaFile.findByPk(mediaId);
    
    if (!media) {
        throw new Error(`Media với ID ${mediaId} không tồn tại`);
    }
    
    if (media.owner_type !== 'pending') {
        throw new Error(`Media ${mediaId} đã được sử dụng cho câu hỏi/đáp án khác`);
    }
    
    // Xác định đường dẫn mới
    let newDir, newPath;
    
    if (ownerType === 'answer') {
        newDir = path.join(process.cwd(), 'uploads', 'answers', String(answerId));
        newPath = path.join(newDir, media.file_name);
    } else {
        newDir = path.join(process.cwd(), 'uploads', 'questions', String(questionId));
        newPath = path.join(newDir, media.file_name);
    }
    
    // Tạo thư mục nếu chưa có
    if (!fs.existsSync(newDir)) {
        fs.mkdirSync(newDir, { recursive: true });
    }
    
    // Di chuyển file từ temp sang vị trí chính thức
    const oldPath = media.file_path;
    if (fs.existsSync(oldPath)) {
        fs.renameSync(oldPath, newPath);
    }
    
    // Update media record
    await media.update({
        question_id: questionId,
        owner_type: ownerType,
        answer_id: answerId,
        file_path: newPath
    }, { transaction });
    
    return media;
};

// =====================================================
// BATCH UPLOAD MEDIA
// =====================================================

/**
 * Upload nhiều file media cùng lúc
 * POST /api/questions/batch-upload-media
 */
exports.batchUploadMedia = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
        if (!req.files || req.files.length === 0) {
            await transaction.rollback();
            return res.status(400).json({ 
                success: false, 
                message: 'Không có file nào được upload' 
            });
        }

        const uploadedMedia = [];
        const tempDir = path.join(process.cwd(), 'uploads', 'temp');
        
        // Tạo thư mục temp nếu chưa có
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        for (const file of req.files) {
            // Validate file
            const fileType = getFileType(file.mimetype);
            MediaFile.validateFile(file, fileType);
            
            // Lưu tên file gốc
            const originalName = file.originalname;
            
            // Tạo tên file unique cho storage
            const uniqueName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${originalName}`;
            const tempPath = path.join(tempDir, uniqueName);
            
            // Di chuyển file vào temp
            fs.renameSync(file.path, tempPath);
            
            // Tạo media record với status pending
            const media = await MediaFile.create({
                question_id: 0, // Temporary
                owner_type: 'pending',
                answer_id: null,
                file_type: fileType,
                file_name: uniqueName,
                file_path: tempPath,
                file_size: file.size,
                mime_type: file.mimetype,
                alt_text: req.body[`alt_text_${originalName}`] || '',
                description: req.body[`description_${originalName}`] || '',
                original_filename: originalName // Lưu tên file gốc
            }, { transaction });
            
            uploadedMedia.push({
                original_name: originalName,
                media_id: media.media_id,
                file_name: media.file_name,
                file_type: media.file_type,
                file_size: media.file_size,
                preview_url: `/api/questions/temp-media/${media.file_name}`
            });
        }
        
        await transaction.commit();
        
        res.status(201).json({
            success: true,
            message: `Đã upload ${uploadedMedia.length} file thành công`,
            data: {
                media: uploadedMedia,
                instruction: 'Sử dụng tên file gốc (original_name) trong Excel để tham chiếu đến hình ảnh',
                example: {
                    excel_column_6: 'cau1.jpg',
                    excel_column_7: 'cau1_dapan_a.jpg'
                },
                note: 'Các file này sẽ tự động xóa sau 24 giờ nếu không được sử dụng'
            }
        });
        
    } catch (error) {
        await transaction.rollback();
        console.error('Batch upload error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi upload files',
            error: error.message
        });
    }
};

/**
 * Serve temp media file
 * GET /api/questions/temp-media/:filename
 */
exports.serveTempMedia = async (req, res) => {
    try {
        const { filename } = req.params;
        const tempPath = path.join(process.cwd(), 'uploads', 'temp', filename);
        
        if (!fs.existsSync(tempPath)) {
            return res.status(404).json({ 
                success: false, 
                message: 'File không tồn tại' 
            });
        }
        
        // Get media info from database
        const media = await MediaFile.findOne({
            where: { file_name: filename, owner_type: 'pending' }
        });
        
        if (!media) {
            return res.status(404).json({ 
                success: false, 
                message: 'Media không tồn tại trong database' 
            });
        }
        
        res.setHeader('Content-Type', media.mime_type);
        res.setHeader('Content-Length', media.file_size);
        res.sendFile(tempPath);
        
    } catch (error) {
        console.error('Serve temp media error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tải file',
            error: error.message
        });
    }
};

// =====================================================
// IMPORT QUESTIONS WITH MEDIA
// =====================================================

/**
 * Import questions from Excel with media support
 * POST /api/questions/import-excel-with-media
 */
exports.importQuestionsWithMedia = async (req, res) => {
    const transaction = await sequelize.transaction();
    const file = req.file;
    
    if (!file) {
        await transaction.rollback();
        return res.status(400).json({ 
            success: false, 
            message: "No file uploaded" 
        });
    }

    const { subject_id } = req.body;
    if (!subject_id) {
        if (file.path) fs.unlinkSync(file.path);
        await transaction.rollback();
        return res.status(400).json({ 
            success: false, 
            message: "subject_id là bắt buộc khi import câu hỏi"
        });
    }

    try {
        // Kiểm tra subject_id có tồn tại không
        const subject = await Subject.findByPk(subject_id);
        if (!subject) {
            fs.unlinkSync(file.path);
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: `Môn học với ID ${subject_id} không tồn tại`
            });
        }

        console.log(`[Import With Media] Starting import for subject: ${subject.name} (ID: ${subject_id})`);

        const workbook = xlsx.readFile(file.path);
        const sheetNames = workbook.SheetNames;
        const sheet1 = workbook.Sheets[sheetNames[0]];
        const sheet2 = workbook.Sheets[sheetNames[1]];

        // Chuẩn hoá mã KQHT (GIỐNG Y HÀM CŨ)
        const normalizeKQHT = (val) => {
            if (val === undefined || val === null) return null;
            const s = String(val).toUpperCase().trim();
            const m = s.match(/KQHT\s*:?[\s]*0*(\d+)/);
            return m ? `KQHT${m[1]}` : null;
        };

        // 1. Đọc sheet 2: LOs (GIỐNG Y HÀM CŨ)
        const loRows = xlsx.utils.sheet_to_json(sheet2, { header: 1 });
        const loMap = {};

        for (let i = 1; i < loRows.length; i++) {
            const row = loRows[i];
            
            if (!row || row.length < 3 ||
                (typeof row[0] === 'string' && row[0].toUpperCase().includes('TỔNG')) ||
                (typeof row[1] === 'string' && row[1].toUpperCase().includes('TỔNG'))) {
                continue;
            }

            const kqhtCode = row[1];
            const tenKQHT = row[2];

            if (!kqhtCode || !tenKQHT) continue;

            const normalizedKQHT = `KQHT${kqhtCode}`;

            let lo = await LO.findOne({ where: { name: tenKQHT } });
            if (!lo) {
                lo = await LO.create({ 
                    name: tenKQHT,
                    subject_id: subject_id
                }, { transaction });
                console.log(`Created new LO: ${tenKQHT} with ID: ${lo.lo_id}`);
            }
            
            loMap[normalizedKQHT] = lo.lo_id;
        }

        // 2. Đọc sheet 1: Questions WITH MEDIA (LOGIC GIỐNG, THÊM MEDIA)
        const rawData = xlsx.utils.sheet_to_json(sheet1, { header: 1 });
        fs.unlinkSync(file.path);

        let currentKQHT = '';
        let currentLoId = '';
        let i = 0;
        let imported = 0;
        let errors = [];
        const questions = [];
        const linkedMedia = [];
        const mediaNotFound = [];

        while (i < rawData.length) {
            const row = rawData[i];
            
            // Check for KQHT header (GIỐNG Y HÀM CŨ)
            if (row && typeof row[0] === 'string' && row[0].toUpperCase().includes('KQHT')) {
                const code = normalizeKQHT(row[0]);
                currentKQHT = code || '';
                currentLoId = currentKQHT ? (loMap[currentKQHT] || '') : '';
                
                if (!currentLoId) {
                    errors.push({ 
                        row: i + 1, 
                        error: `Không tìm thấy LO cho ${currentKQHT}` 
                    });
                }
                
                i += 2; // Skip header row
                continue;
            }
            
            // Process question (4 rows) (GIỐNG Y HÀM CŨ)
            if (i + 3 >= rawData.length) break;

            const q_row = rawData[i];
            const a_row = rawData[i];
            const b_row = rawData[i + 1];
            const c_row = rawData[i + 2];
            const d_row = rawData[i + 3];

            try {
                // Extract data (GIỐNG Y HÀM CŨ)
                const question_type_id = 1;
                const level_id = (q_row[0] !== undefined && q_row[0] !== null && q_row[0] !== '') 
                    ? parseInt(q_row[0]) : 1;
                const question_text = q_row[2] ? String(q_row[2]).trim() : '';
                
                // MỚI: Extract media filenames thay vì IDs
                const question_image_file = q_row[6] ? String(q_row[6]).trim() : null;
                const question_media_id = question_image_file 
                    ? await getMediaIdByFilename(question_image_file) 
                    : null;
                
                // Log warning nếu không tìm thấy file
                if (question_image_file && !question_media_id) {
                    mediaNotFound.push({
                        row: i + 1,
                        filename: question_image_file,
                        type: 'question'
                    });
                }

                const answer_a = a_row[3] ? String(a_row[3]).replace('A.', '').trim() : '';
                const answer_b = b_row[3] ? String(b_row[3]).replace('B.', '').trim() : '';
                const answer_c = c_row[3] ? String(c_row[3]).replace('C.', '').trim() : '';
                const answer_d = d_row[3] ? String(d_row[3]).replace('D.', '').trim() : '';

                // MỚI: Extract answer media filenames
                const answer_a_image_file = a_row[7] ? String(a_row[7]).trim() : null;
                const answer_a_media_id = answer_a_image_file 
                    ? await getMediaIdByFilename(answer_a_image_file) 
                    : null;
                
                const answer_b_image_file = b_row[7] ? String(b_row[7]).trim() : null;
                const answer_b_media_id = answer_b_image_file 
                    ? await getMediaIdByFilename(answer_b_image_file) 
                    : null;
                
                const answer_c_image_file = c_row[7] ? String(c_row[7]).trim() : null;
                const answer_c_media_id = answer_c_image_file 
                    ? await getMediaIdByFilename(answer_c_image_file) 
                    : null;
                
                const answer_d_image_file = d_row[7] ? String(d_row[7]).trim() : null;
                const answer_d_media_id = answer_d_image_file 
                    ? await getMediaIdByFilename(answer_d_image_file) 
                    : null;
                
                // Log warnings
                if (answer_a_image_file && !answer_a_media_id) {
                    mediaNotFound.push({ row: i + 1, filename: answer_a_image_file, type: 'answer_a' });
                }
                if (answer_b_image_file && !answer_b_media_id) {
                    mediaNotFound.push({ row: i + 1, filename: answer_b_image_file, type: 'answer_b' });
                }
                if (answer_c_image_file && !answer_c_media_id) {
                    mediaNotFound.push({ row: i + 1, filename: answer_c_image_file, type: 'answer_c' });
                }
                if (answer_d_image_file && !answer_d_media_id) {
                    mediaNotFound.push({ row: i + 1, filename: answer_d_image_file, type: 'answer_d' });
                }

                const correct = q_row[4] ? String(q_row[4]).trim().toUpperCase() : '';
                const iscorrect = [
                    correct === 'A' ? 1 : 0,
                    correct === 'B' ? 1 : 0,
                    correct === 'C' ? 1 : 0,
                    correct === 'D' ? 1 : 0,
                ];
                const explanation = q_row[5] ? String(q_row[5]).trim() : '';

                // Validate (GIỐNG Y HÀM CŨ)
                if (!question_text || !currentLoId || !answer_a || !answer_b || !answer_c || !answer_d) {
                    errors.push({ 
                        row: i + 1, 
                        error: 'Thiếu dữ liệu bắt buộc' 
                    });
                    i += 4;
                    continue;
                }
                
                // Create question (GIỐNG Y HÀM CŨ)
                const newQuestion = await Question.create({
                    question_type_id,
                    level_id,
                    question_text,
                    lo_id: currentLoId,
                    explanation,
                }, { transaction });
                
                // MỚI: Link question media if exists
                if (question_media_id) {
                    try {
                        await linkMediaToQuestion(
                            question_media_id,
                            newQuestion.question_id,
                            'question',
                            null,
                            transaction
                        );
                        linkedMedia.push({
                            media_id: question_media_id,
                            filename: question_image_file,
                            question_id: newQuestion.question_id,
                            type: 'question'
                        });
                    } catch (mediaError) {
                        console.warn(`Warning: Could not link media ${question_media_id}:`, mediaError.message);
                    }
                }
                
                // Create answers (GIỐNG Y HÀM CŨ, THÊM MEDIA)
                const answersData = [
                    { text: answer_a, iscorrect: iscorrect[0], media_id: answer_a_media_id, filename: answer_a_image_file },
                    { text: answer_b, iscorrect: iscorrect[1], media_id: answer_b_media_id, filename: answer_b_image_file },
                    { text: answer_c, iscorrect: iscorrect[2], media_id: answer_c_media_id, filename: answer_c_image_file },
                    { text: answer_d, iscorrect: iscorrect[3], media_id: answer_d_media_id, filename: answer_d_image_file },
                ];
                
                for (const ans of answersData) {
                    const newAnswer = await Answer.create({
                        question_id: newQuestion.question_id,
                        answer_text: ans.text,
                        iscorrect: ans.iscorrect,
                    }, { transaction });
                    
                    // MỚI: Link answer media if exists
                    if (ans.media_id) {
                        try {
                            await linkMediaToQuestion(
                                ans.media_id,
                                newQuestion.question_id,
                                'answer',
                                newAnswer.answer_id,
                                transaction
                            );
                            linkedMedia.push({
                                media_id: ans.media_id,
                                filename: ans.filename,
                                answer_id: newAnswer.answer_id,
                                type: 'answer'
                            });
                        } catch (mediaError) {
                            console.warn(`Warning: Could not link media ${ans.media_id}:`, mediaError.message);
                        }
                    }
                }
                
                imported++;
                questions.push(newQuestion);
                
            } catch (err) {
                errors.push({ row: i + 1, error: err.message });
            }
            
            i += 4;
        }
        
        await transaction.commit();
        
        console.log('[Import With Media] Summary:', {
            subject_id: subject_id,
            subject_name: subject.name,
            totalImported: imported,
            totalErrors: errors.length,
            totalMediaLinked: linkedMedia.length,
            totalMediaNotFound: mediaNotFound.length
        });
        
        res.status(errors.length > 0 ? 207 : 201).json({
            success: errors.length === 0,
            message: `Đã import ${imported} câu hỏi vào môn học ${subject.name}.`,
            data: {
                subject_id: parseInt(subject_id),
                subject_name: subject.name,
                questions,
                totalImported: imported,
                totalLOs: Object.keys(loMap).length,
                totalMediaLinked: linkedMedia.length,
                linkedMedia: linkedMedia,
                mediaNotFound: mediaNotFound.length > 0 ? mediaNotFound : undefined,
                loMapping: loMap,
                errors: errors.length > 0 ? errors : undefined
            }
        });
        
    } catch (err) {
        await transaction.rollback();
        if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }
        console.error('Import with media error:', err);
        res.status(500).json({ 
            success: false, 
            message: "Lỗi đọc file Excel", 
            error: err.message 
        });
    }
};

// Giữ nguyên getQuestionsByLOs để sử dụng như một route handler
exports.getQuestionsByLOs = async (req, res) => {
    try {
        const { loIds, totalQuestions, difficultyRatio } = req.body;

        const questions = await fetchQuestionsByLOs(loIds, totalQuestions, difficultyRatio);

        res.status(200).json({
            success: true,
            message: 'Lấy danh sách câu hỏi theo LO và tỷ lệ khó thành công',
            data: {
                total: questions.length,
                questions,
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách câu hỏi',
            error: error.message,
        });
    }
};


// =====================================================
// MEDIA UPLOAD & MANAGEMENT FUNCTIONS
// =====================================================

/**
 * Batch upload media files
 * POST /api/questions/batch-upload-media
 */
exports.batchUploadMedia = async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng tải lên ít nhất một file media'
            });
        }

        const uploadedFiles = [];
        const errors = [];

        // Process each uploaded file
        for (const file of req.files) {
            try {
                // Store file info
                uploadedFiles.push({
                    originalName: file.originalname,
                    tempPath: file.path,
                    filename: file.filename,
                    size: file.size,
                    mimetype: file.mimetype
                });

                console.log(`Uploaded: ${file.originalname} → ${file.path}`);
            } catch (error) {
                errors.push({
                    filename: file.originalname,
                    error: error.message
                });
            }
        }

        res.status(201).json({
            success: true,
            message: `Upload ${uploadedFiles.length} media files thành công`,
            data: {
                uploadedFiles,
                totalUploaded: uploadedFiles.length,
                errors: errors.length > 0 ? errors : undefined
            }
        });

    } catch (error) {
        console.error('Batch upload error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi upload media files',
            error: error.message
        });
    }
};

/**
 * Serve temp media file
 * GET /api/questions/temp-media/:filename
 */
exports.serveTempMedia = async (req, res) => {
    try {
        const { filename } = req.params;
        const tempDir = path.join(__dirname, '../../uploads/temp');
        const filePath = path.join(tempDir, filename);

        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'File không tồn tại'
            });
        }

        // Send file
        res.sendFile(filePath);

    } catch (error) {
        console.error('Serve temp media error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi serve media file',
            error: error.message
        });
    }
};

/**
 * Import questions with media support
 * POST /api/questions/import-excel-with-media
 */
exports.importQuestionsWithMedia = async (req, res) => {
    const file = req.file;
    if (!file) {
        return res.status(400).json({ 
            success: false, 
            message: "Vui lòng tải lên file Excel" 
        });
    }

    // Validate subject_id
    const { subject_id } = req.body;
    if (!subject_id) {
        if (file.path) fs.unlinkSync(file.path);
        return res.status(400).json({ 
            success: false, 
            message: "subject_id là bắt buộc khi import câu hỏi"
        });
    }

    const transaction = await sequelize.transaction();

    try {
        // Check subject exists
        const subject = await Subject.findByPk(subject_id);
        if (!subject) {
            fs.unlinkSync(file.path);
            return res.status(404).json({
                success: false,
                message: `Môn học với ID ${subject_id} không tồn tại`
            });
        }

        console.log(`[Import with Media] Starting import for subject: ${subject.name} (ID: ${subject_id})`);

        // Read Excel file
        const workbook = xlsx.readFile(file.path);
        const sheetNames = workbook.SheetNames;
        const sheet1 = workbook.Sheets[sheetNames[0]];
        const sheet2 = workbook.Sheets[sheetNames[1]];

        // Normalize KQHT code
        const normalizeKQHT = (val) => {
            if (val === undefined || val === null) return null;
            const s = String(val).toUpperCase().trim();
            const m = s.match(/KQHT\s*:?[\s]*0*(\d+)/);
            return m ? `KQHT${m[1]}` : null;
        };

        // Process Sheet 2: Learning Outcomes
        const loRows = xlsx.utils.sheet_to_json(sheet2, { header: 1 });
        const loMap = {}; // { KQHT: lo_id }

        for (let i = 1; i < loRows.length; i++) {
            const row = loRows[i];
            
            if (!row || row.length < 3 ||
                (typeof row[0] === 'string' && row[0].toUpperCase().includes('TỔNG')) ||
                (typeof row[1] === 'string' && row[1].toUpperCase().includes('TỔNG'))) {
                continue;
            }

            const kqhtCode = row[1];
            const tenKQHT = row[2];

            if (!kqhtCode || !tenKQHT) continue;

            const normalizedKQHT = `KQHT${kqhtCode}`;

            // Find or create LO
            let lo = await LO.findOne({ where: { name: tenKQHT } });
            if (!lo) {
                lo = await LO.create({ 
                    name: tenKQHT,
                    subject_id: subject_id
                }, { transaction });
                console.log(`Created new LO: ${tenKQHT} with ID: ${lo.lo_id}`);
            }
            
            loMap[normalizedKQHT] = lo.lo_id;
        }

        console.log('LO map:', loMap);

        // Process Sheet 1: Questions
        const rawData = xlsx.utils.sheet_to_json(sheet1, { header: 1 });
        
        let currentKQHT = '';
        let currentLoId = '';
        let i = 0;
        let imported = 0;
        const errors = [];
        const linkedMedia = [];
        const mediaNotFound = [];
        const tempDir = path.join(__dirname, '../../uploads/temp');
        const mediaDir = path.join(__dirname, '../../uploads/media');

        // Ensure media directory exists
        if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, { recursive: true });
        }

        while (i < rawData.length) {
            const row = rawData[i];
            
            // Check for KQHT header
            if (row && typeof row[0] === 'string' && row[0].toUpperCase().includes('KQHT')) {
                const code = normalizeKQHT(row[0]);
                currentKQHT = code || '';
                currentLoId = currentKQHT ? (loMap[currentKQHT] || '') : '';
                
                if (!currentLoId) {
                    errors.push({ row: i + 1, error: `Không tìm thấy LO cho ${currentKQHT}` });
                }
                
                i += 2; // Skip header row
                continue;
            }

            // Process question (4 rows: question + 3 answer rows)
            if (i + 3 >= rawData.length) break;

            const q_row = rawData[i];
            const b_row = rawData[i + 1];
            const c_row = rawData[i + 2];
            const d_row = rawData[i + 3];

            try {
                const stt = q_row[0];
                const questionText = q_row[1];
                const answerA = q_row[2];
                const answerB = b_row[2];
                const answerC = c_row[2];
                const answerD = d_row[2];
                const correctAnswer = q_row[6];
                const difficulty = q_row[7];
                const mediaFile = q_row[8]; // Question media
                const mediaA = q_row[9];
                const mediaB = q_row[10];
                const mediaC = q_row[11];
                const mediaD = q_row[12];

                if (!questionText || !currentLoId) {
                    i += 4;
                    continue;
                }

                // Create question
                const newQuestion = await Question.create({
                    question_type_id: 1, // Multiple choice
                    level_id: parseInt(difficulty) || 1,
                    question_text: questionText,
                    lo_id: currentLoId
                }, { transaction });

                // Link question media if exists
                if (mediaFile) {
                    const mediaPath = path.join(tempDir, mediaFile);
                    if (fs.existsSync(mediaPath)) {
                        const permanentPath = path.join(mediaDir, mediaFile);
                        fs.copyFileSync(mediaPath, permanentPath);
                        
                        const mimeType = getMimeType(mediaFile);
                        await MediaFile.create({
                            file_name: mediaFile,
                            file_path: `/uploads/media/${mediaFile}`,
                            file_size: fs.statSync(permanentPath).size,
                            mime_type: mimeType,
                            file_type: getFileType(mimeType),
                            original_filename: mediaFile,
                            question_id: newQuestion.question_id,
                            owner_type: 'question'
                        }, { transaction });

                        linkedMedia.push({
                            questionId: newQuestion.question_id,
                            mediaFile: mediaFile,
                            type: 'question'
                        });
                    } else {
                        mediaNotFound.push(mediaFile);
                    }
                }

                // Create answers
                const answers = [
                    { text: answerA, correct: correctAnswer === 'A', media: mediaA },
                    { text: answerB, correct: correctAnswer === 'B', media: mediaB },
                    { text: answerC, correct: correctAnswer === 'C', media: mediaC },
                    { text: answerD, correct: correctAnswer === 'D', media: mediaD }
                ];

                for (const ans of answers) {
                    if (!ans.text) continue;

                    const answer = await Answer.create({
                        question_id: newQuestion.question_id,
                        answer_text: ans.text,
                        iscorrect: ans.correct
                    }, { transaction });

                    // Link answer media if exists
                    if (ans.media) {
                        const mediaPath = path.join(tempDir, ans.media);
                        if (fs.existsSync(mediaPath)) {
                            const permanentPath = path.join(mediaDir, ans.media);
                            fs.copyFileSync(mediaPath, permanentPath);
                            
                            const mimeType = getMimeType(ans.media);
                            await MediaFile.create({
                                file_name: ans.media,
                                file_path: `/uploads/media/${ans.media}`,
                                file_size: fs.statSync(permanentPath).size,
                                mime_type: mimeType,
                                file_type: getFileType(mimeType),
                                original_filename: ans.media,
                                question_id: newQuestion.question_id,
                                answer_id: answer.answer_id,
                                owner_type: 'answer'
                            }, { transaction });

                            linkedMedia.push({
                                questionId: newQuestion.question_id,
                                answerId: answer.answer_id,
                                mediaFile: ans.media,
                                type: 'answer'
                            });
                        } else {
                            mediaNotFound.push(ans.media);
                        }
                    }
                }

                imported++;
            } catch (error) {
                errors.push({ row: i + 1, error: error.message });
            }

            i += 4; // Move to next question
        }

        await transaction.commit();

        // Cleanup uploaded Excel file
        if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }

        res.status(errors.length > 0 ? 207 : 201).json({
            success: errors.length === 0,
            message: `Import ${imported} câu hỏi thành công${linkedMedia.length > 0 ? ` với ${linkedMedia.length} media files` : ''}`,
            data: {
                totalImported: imported,
                totalMediaLinked: linkedMedia.length,
                linkedMedia: linkedMedia,
                mediaNotFound: mediaNotFound.length > 0 ? mediaNotFound : undefined,
                loMapping: loMap,
                errors: errors.length > 0 ? errors : undefined
            }
        });
        
    } catch (err) {
        await transaction.rollback();
        if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }
        console.error('Import with media error:', err);
        res.status(500).json({ 
            success: false, 
            message: "Lỗi đọc file Excel", 
            error: err.message 
        });
    }
};


/**
 * Import questions with media - ALL IN ONE
 * Upload Excel + media files in single request
 * POST /api/questions/import-all-in-one
 */
exports.importAllInOne = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
        // Validate files
        if (!req.files || !req.files.excel_file || !req.files.excel_file[0]) {
            return res.status(400).json({ 
                success: false, 
                message: "Vui lòng tải lên file Excel" 
            });
        }

        const excelFile = req.files.excel_file[0];
        const mediaFiles = req.files.media_files || [];

        console.log(`[Import All-in-One] Excel: ${excelFile.originalname}, Media: ${mediaFiles.length} files`);

        // Validate subject_id
        const { subject_id } = req.body;
        if (!subject_id) {
            // Cleanup uploaded files
            fs.unlinkSync(excelFile.path);
            mediaFiles.forEach(f => fs.unlinkSync(f.path));
            
            return res.status(400).json({ 
                success: false, 
                message: "subject_id là bắt buộc khi import câu hỏi"
            });
        }

        // Check subject exists
        const subject = await Subject.findByPk(subject_id);
        if (!subject) {
            // Cleanup
            fs.unlinkSync(excelFile.path);
            mediaFiles.forEach(f => fs.unlinkSync(f.path));
            
            return res.status(404).json({
                success: false,
                message: `Môn học với ID ${subject_id} không tồn tại`
            });
        }

        console.log(`[Import All-in-One] Subject: ${subject.name} (ID: ${subject_id})`);

        // Create media file map: originalname -> file object
        const mediaMap = {};
        mediaFiles.forEach(file => {
            mediaMap[file.originalname.toLowerCase()] = file;
        });

        console.log(`[Import All-in-One] Media map:`, Object.keys(mediaMap));

        // Read Excel file
        const workbook = xlsx.readFile(excelFile.path);
        const sheetNames = workbook.SheetNames;
        const sheet1 = workbook.Sheets[sheetNames[0]];
        const sheet2 = workbook.Sheets[sheetNames[1]];

        // Normalize KQHT code
        const normalizeKQHT = (val) => {
            if (val === undefined || val === null) return null;
            const s = String(val).toUpperCase().trim();
            const m = s.match(/KQHT\s*:?[\s]*0*(\d+)/);
            return m ? `KQHT${m[1]}` : null;
        };

        // Process Sheet 2: Learning Outcomes
        const loRows = xlsx.utils.sheet_to_json(sheet2, { header: 1 });
        const loMap = {};

        for (let i = 1; i < loRows.length; i++) {
            const row = loRows[i];
            
            if (!row || row.length < 3 ||
                (typeof row[0] === 'string' && row[0].toUpperCase().includes('TỔNG')) ||
                (typeof row[1] === 'string' && row[1].toUpperCase().includes('TỔNG'))) {
                continue;
            }

            const kqhtCode = row[1];
            const tenKQHT = row[2];

            if (!kqhtCode || !tenKQHT) continue;

            const normalizedKQHT = `KQHT${kqhtCode}`;

            let lo = await LO.findOne({ where: { name: tenKQHT } });
            if (!lo) {
                lo = await LO.create({ 
                    name: tenKQHT,
                    subject_id: subject_id
                }, { transaction });
                console.log(`Created new LO: ${tenKQHT} with ID: ${lo.lo_id}`);
            }
            
            loMap[normalizedKQHT] = lo.lo_id;
        }

        console.log('[Import All-in-One] LO map:', loMap);

        // Process Sheet 1: Questions
        const rawData = xlsx.utils.sheet_to_json(sheet1, { header: 1 });
        
        let currentKQHT = '';
        let currentLoId = '';
        let i = 0;
        let imported = 0;
        const errors = [];
        const linkedMedia = [];
        const mediaNotFound = [];
        const mediaDir = path.join(__dirname, '../../uploads/media');

        // Ensure media directory exists
        if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, { recursive: true });
        }

        while (i < rawData.length) {
            const row = rawData[i];
            
            // Check for KQHT header
            if (row && typeof row[0] === 'string' && row[0].toUpperCase().includes('KQHT')) {
                const code = normalizeKQHT(row[0]);
                currentKQHT = code || '';
                currentLoId = currentKQHT ? (loMap[currentKQHT] || '') : '';
                
                if (!currentLoId) {
                    errors.push({ row: i + 1, error: `Không tìm thấy LO cho ${currentKQHT}` });
                }
                
                i += 2;
                continue;
            }

            if (i + 3 >= rawData.length) break;

            const q_row = rawData[i];
            const b_row = rawData[i + 1];
            const c_row = rawData[i + 2];
            const d_row = rawData[i + 3];

            try {
                const questionText = q_row[1];
                const answerA = q_row[2];
                const answerB = b_row[2];
                const answerC = c_row[2];
                const answerD = d_row[2];
                const correctAnswer = q_row[6];
                const difficulty = q_row[7];
                const mediaFile = q_row[8];
                const mediaA = q_row[9];
                const mediaB = q_row[10];
                const mediaC = q_row[11];
                const mediaD = q_row[12];

                if (!questionText || !currentLoId) {
                    i += 4;
                    continue;
                }

                // Create question
                const newQuestion = await Question.create({
                    question_type_id: 1,
                    level_id: parseInt(difficulty) || 1,
                    question_text: questionText,
                    lo_id: currentLoId
                }, { transaction });

                // Helper function to link media
                const linkMedia = async (mediaFileName, questionId, answerId = null) => {
                    if (!mediaFileName) return false;
                    
                    const mediaKey = mediaFileName.toLowerCase();
                    const mediaFileObj = mediaMap[mediaKey];
                    
                    if (mediaFileObj) {
                        // Copy to permanent storage
                        const permanentPath = path.join(mediaDir, mediaFileName);
                        fs.copyFileSync(mediaFileObj.path, permanentPath);
                        
                        // Create MediaFile record
                        const mimeType = getMimeType(mediaFileName);
                        await MediaFile.create({
                            file_name: mediaFileName,
                            file_path: `/uploads/media/${mediaFileName}`,
                            file_size: fs.statSync(permanentPath).size,
                            mime_type: mimeType,
                            file_type: getFileType(mimeType),
                            original_filename: mediaFileName,
                            question_id: questionId,
                            answer_id: answerId,
                            owner_type: answerId ? 'answer' : 'question'
                        }, { transaction });

                        linkedMedia.push({
                            questionId: questionId,
                            answerId: answerId,
                            mediaFile: mediaFileName,
                            type: answerId ? 'answer' : 'question'
                        });
                        
                        return true;
                    } else {
                        mediaNotFound.push(mediaFileName);
                        return false;
                    }
                };

                // Link question media
                await linkMedia(mediaFile, newQuestion.question_id);

                // Create answers
                const answers = [
                    { text: answerA, correct: correctAnswer === 'A', media: mediaA },
                    { text: answerB, correct: correctAnswer === 'B', media: mediaB },
                    { text: answerC, correct: correctAnswer === 'C', media: mediaC },
                    { text: answerD, correct: correctAnswer === 'D', media: mediaD }
                ];

                for (const ans of answers) {
                    if (!ans.text) continue;

                    const answer = await Answer.create({
                        question_id: newQuestion.question_id,
                        answer_text: ans.text,
                        iscorrect: ans.correct
                    }, { transaction });

                    // Link answer media
                    await linkMedia(ans.media, newQuestion.question_id, answer.answer_id);
                }

                imported++;
            } catch (error) {
                errors.push({ row: i + 1, error: error.message });
            }

            i += 4;
        }

        await transaction.commit();

        // Cleanup uploaded files
        fs.unlinkSync(excelFile.path);
        mediaFiles.forEach(file => {
            if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }
        });

        res.status(errors.length > 0 ? 207 : 201).json({
            success: errors.length === 0,
            message: `Import ${imported} câu hỏi thành công${linkedMedia.length > 0 ? ` với ${linkedMedia.length} media files` : ''}`,
            data: {
                totalImported: imported,
                totalMediaUploaded: mediaFiles.length,
                totalMediaLinked: linkedMedia.length,
                linkedMedia: linkedMedia,
                mediaNotFound: mediaNotFound.length > 0 ? [...new Set(mediaNotFound)] : undefined,
                loMapping: loMap,
                errors: errors.length > 0 ? errors : undefined
            }
        });
        
    } catch (err) {
        await transaction.rollback();
        
        // Cleanup on error
        if (req.files) {
            if (req.files.excel_file && req.files.excel_file[0]) {
                fs.unlinkSync(req.files.excel_file[0].path);
            }
            if (req.files.media_files) {
                req.files.media_files.forEach(f => {
                    if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
                });
            }
        }
        
        console.error('Import all-in-one error:', err);
        res.status(500).json({ 
            success: false, 
            message: "Lỗi khi import", 
            error: err.message 
        });
    }
};


/**
 * Import from ZIP file (Excel + Media)
 * User uploads 1 ZIP file containing Excel + all media files
 * POST /api/questions/import-from-zip
 * 
 * ZIP structure:
 * questions.zip
 * ├── questions.xlsx (or any .xlsx file)
 * └── images/
 *     ├── question1.png
 *     ├── question2.png
 *     └── ...
 */
exports.importFromZip = async (req, res) => {
    const AdmZip = require('adm-zip');
    const transaction = await sequelize.transaction();
    
    try {
        // Validate ZIP file
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                message: "Vui lòng tải lên file ZIP" 
            });
        }

        const zipFile = req.file;
        console.log(`[Import from ZIP] File: ${zipFile.originalname}, Size: ${zipFile.size} bytes`);

        // Validate subject_id
        const { subject_id } = req.body;
        if (!subject_id) {
            fs.unlinkSync(zipFile.path);
            return res.status(400).json({ 
                success: false, 
                message: "subject_id là bắt buộc khi import câu hỏi"
            });
        }

        // Check subject exists
        const subject = await Subject.findByPk(subject_id);
        if (!subject) {
            fs.unlinkSync(zipFile.path);
            return res.status(404).json({
                success: false,
                message: `Môn học với ID ${subject_id} không tồn tại`
            });
        }

        console.log(`[Import from ZIP] Subject: ${subject.name} (ID: ${subject_id})`);

        // Extract ZIP file
        const zip = new AdmZip(zipFile.path);
        const zipEntries = zip.getEntries();
        
        console.log(`[Import from ZIP] Found ${zipEntries.length} files in ZIP`);

        // Find Excel file and media files
        let excelEntry = null;
        const mediaEntries = [];
        
        zipEntries.forEach(entry => {
            if (entry.isDirectory) return;
            
            const fileName = entry.entryName;
            const ext = path.extname(fileName).toLowerCase();
            
            if (ext === '.xlsx' || ext === '.xls') {
                excelEntry = entry;
                console.log(`[Import from ZIP] Found Excel: ${fileName}`);
            } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.avi', '.mov', '.mp3', '.wav', '.ogg'].includes(ext)) {
                mediaEntries.push(entry);
                console.log(`[Import from ZIP] Found media: ${fileName}`);
            }
        });

        // Validate Excel file exists
        if (!excelEntry) {
            fs.unlinkSync(zipFile.path);
            return res.status(400).json({
                success: false,
                message: "Không tìm thấy file Excel (.xlsx hoặc .xls) trong ZIP"
            });
        }

        console.log(`[Import from ZIP] Excel: 1 file, Media: ${mediaEntries.length} files`);

        // Extract Excel to temp location
        const tempDir = path.join(__dirname, '../../uploads/temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const excelTempPath = path.join(tempDir, `${Date.now()}-${path.basename(excelEntry.entryName)}`);
        fs.writeFileSync(excelTempPath, excelEntry.getData());

        // Create media map from ZIP entries
        const mediaMap = {};
        mediaEntries.forEach(entry => {
            const fileName = path.basename(entry.entryName).toLowerCase();
            mediaMap[fileName] = entry;
        });

        console.log(`[Import from ZIP] Media map:`, Object.keys(mediaMap));

        // Read Excel file
        const workbook = xlsx.readFile(excelTempPath);
        const sheetNames = workbook.SheetNames;
        const sheet1 = workbook.Sheets[sheetNames[0]];
        const sheet2 = workbook.Sheets[sheetNames[1]];

        // Normalize KQHT code
        const normalizeKQHT = (val) => {
            if (val === undefined || val === null) return null;
            const s = String(val).toUpperCase().trim();
            const m = s.match(/KQHT\s*:?[\s]*0*(\d+)/);
            return m ? `KQHT${m[1]}` : null;
        };

        // Process Sheet 2: Learning Outcomes
        const loRows = xlsx.utils.sheet_to_json(sheet2, { header: 1 });
        const loMap = {};

        for (let i = 1; i < loRows.length; i++) {
            const row = loRows[i];
            
            if (!row || row.length < 3 ||
                (typeof row[0] === 'string' && row[0].toUpperCase().includes('TỔNG')) ||
                (typeof row[1] === 'string' && row[1].toUpperCase().includes('TỔNG'))) {
                continue;
            }

            const kqhtCode = row[1];
            const tenKQHT = row[2];

            if (!kqhtCode || !tenKQHT) continue;

            const normalizedKQHT = `KQHT${kqhtCode}`;

            let lo = await LO.findOne({ where: { name: tenKQHT } });
            if (!lo) {
                lo = await LO.create({ 
                    name: tenKQHT,
                    subject_id: subject_id
                }, { transaction });
                console.log(`Created new LO: ${tenKQHT} with ID: ${lo.lo_id}`);
            }
            
            loMap[normalizedKQHT] = lo.lo_id;
        }

        console.log('[Import from ZIP] LO map:', loMap);

        // Process Sheet 1: Questions
        const rawData = xlsx.utils.sheet_to_json(sheet1, { header: 1 });
        
        let currentKQHT = '';
        let currentLoId = '';
        let i = 0;
        let imported = 0;
        const errors = [];
        const linkedMedia = [];
        const mediaNotFound = [];
        const mediaDir = path.join(__dirname, '../../uploads/media');

        // Ensure media directory exists
        if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, { recursive: true });
        }

        while (i < rawData.length) {
            const row = rawData[i];
            
            // Check for KQHT header
            if (row && typeof row[0] === 'string' && row[0].toUpperCase().includes('KQHT')) {
                const code = normalizeKQHT(row[0]);
                currentKQHT = code || '';
                currentLoId = currentKQHT ? (loMap[currentKQHT] || '') : '';
                
                if (!currentLoId) {
                    errors.push({ row: i + 1, error: `Không tìm thấy LO cho ${currentKQHT}` });
                }
                
                i += 2;
                continue;
            }

            if (i + 3 >= rawData.length) break;

            const q_row = rawData[i];
            const b_row = rawData[i + 1];
            const c_row = rawData[i + 2];
            const d_row = rawData[i + 3];

            try {
                // Excel structure (8 columns):
                // A: Mức độ, B: TT, C: Nội dung câu hỏi, D: Các phương án chọn
                // E: Đáp án, F: Hướng dẫn trả lời, G: Hình câu hỏi, H: Hình đáp án
                const difficulty = q_row[0] ? parseInt(q_row[0]) : 1;  // Col A
                const questionText = q_row[2] ? String(q_row[2]).trim() : '';  // Col C
                const answerA = q_row[3] ? String(q_row[3]).replace('A.', '').trim() : '';  // Col D (row 1)
                const answerB = b_row[3] ? String(b_row[3]).replace('B.', '').trim() : '';  // Col D (row 2)
                const answerC = c_row[3] ? String(c_row[3]).replace('C.', '').trim() : '';  // Col D (row 3)
                const answerD = d_row[3] ? String(d_row[3]).replace('D.', '').trim() : '';  // Col D (row 4)
                const correctAnswer = q_row[4] ? String(q_row[4]).trim().toUpperCase() : '';  // Col E
                const explanation = q_row[5] ? String(q_row[5]).trim() : '';  // Col F
                const questionMediaFile = q_row[6] ? String(q_row[6]).trim() : null;  // Col G
                const answerMediaFile = q_row[7] ? String(q_row[7]).trim() : null;  // Col H

                if (!questionText || !currentLoId || !answerA || !answerB || !answerC || !answerD) {
                    i += 4;
                    continue;
                }

                // Create question
                const newQuestion = await Question.create({
                    question_type_id: 1,
                    level_id: difficulty,
                    question_text: questionText,
                    lo_id: currentLoId,
                    explanation: explanation
                }, { transaction });

                // Helper function to link media from ZIP
                const linkMediaFromZip = async (mediaFileName, questionId, answerId = null) => {
                    if (!mediaFileName) return false;
                    
                    const mediaKey = mediaFileName.toLowerCase();
                    const mediaEntry = mediaMap[mediaKey];
                    
                    if (mediaEntry) {
                        // Extract and save to permanent storage
                        const permanentPath = path.join(mediaDir, mediaFileName);
                        fs.writeFileSync(permanentPath, mediaEntry.getData());
                        
                        // Create MediaFile record
                        const mimeType = getMimeType(mediaFileName);
                        await MediaFile.create({
                            file_name: mediaFileName,
                            file_path: `/uploads/media/${mediaFileName}`,
                            file_size: fs.statSync(permanentPath).size,
                            mime_type: mimeType,
                            file_type: getFileType(mimeType),
                            original_filename: mediaFileName,
                            question_id: questionId,
                            answer_id: answerId,
                            owner_type: answerId ? 'answer' : 'question'
                        }, { transaction });

                        linkedMedia.push({
                            questionId: questionId,
                            answerId: answerId,
                            mediaFile: mediaFileName,
                            type: answerId ? 'answer' : 'question'
                        });
                        
                        return true;
                    } else {
                        if (mediaFileName) mediaNotFound.push(mediaFileName);
                        return false;
                    }
                };

                // Link question media
                await linkMediaFromZip(questionMediaFile, newQuestion.question_id);

                // Determine which answer has media based on correct answer
                const correctIndex = ['A', 'B', 'C', 'D'].indexOf(correctAnswer);
                
                // Create answers
                const answers = [
                    { text: answerA, correct: correctAnswer === 'A' },
                    { text: answerB, correct: correctAnswer === 'B' },
                    { text: answerC, correct: correctAnswer === 'C' },
                    { text: answerD, correct: correctAnswer === 'D' }
                ];

                for (let idx = 0; idx < answers.length; idx++) {
                    const ans = answers[idx];
                    if (!ans.text) continue;

                    const answer = await Answer.create({
                        question_id: newQuestion.question_id,
                        answer_text: ans.text,
                        iscorrect: ans.correct ? 1 : 0
                    }, { transaction });

                    // Link answer media (only if this is the correct answer and has media)
                    if (ans.correct && answerMediaFile) {
                        await linkMediaFromZip(answerMediaFile, newQuestion.question_id, answer.answer_id);
                    }
                }

                imported++;
            } catch (error) {
                errors.push({ row: i + 1, error: error.message });
            }

            i += 4;
        }

        await transaction.commit();

        // Cleanup
        fs.unlinkSync(zipFile.path);
        fs.unlinkSync(excelTempPath);

        res.status(errors.length > 0 ? 207 : 201).json({
            success: errors.length === 0,
            message: `Import ${imported} câu hỏi thành công từ ZIP${linkedMedia.length > 0 ? ` với ${linkedMedia.length} media files` : ''}`,
            data: {
                totalImported: imported,
                totalMediaInZip: mediaEntries.length,
                totalMediaLinked: linkedMedia.length,
                linkedMedia: linkedMedia,
                mediaNotFound: mediaNotFound.length > 0 ? [...new Set(mediaNotFound)] : undefined,
                loMapping: loMap,
                errors: errors.length > 0 ? errors : undefined
            }
        });
        
    } catch (err) {
        await transaction.rollback();
        
        // Cleanup on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        console.error('Import from ZIP error:', err);
        res.status(500).json({ 
            success: false, 
            message: "Lỗi khi import từ ZIP", 
            error: err.message 
        });
    }
};
