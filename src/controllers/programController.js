const { Program, PO, PLO, Course, User, Subject, POsPLOs, TrainingBatch } = require('../models');
const { Op } = require('sequelize');

// ---------------- Helper utilities ----------------
const respondSuccess = (res, data, status = 200) => res.status(status).json({ success: true, data });
const respondError = (res, status, message, error) => res.status(status).json({ success: false, message, ...(error ? { error } : {}) });

const validateProgramPayload = ({ name, description }, isUpdate = false) => {
    if (!isUpdate && !name) return 'Tên chương trình là bắt buộc';
    if (name && name.length > 50) return 'Tên chương trình không được vượt quá 50 ký tự';
    if (description && description.length > 100) return 'Mô tả chương trình không được vượt quá 100 ký tự';
    return null;
};

// --------------- Existing endpoints (refactored) ---------------
// Lấy danh sách tất cả chương trình (có phân trang + filter optional)
exports.getAllPrograms = async (req, res) => {
    try {
        const { page = 1, limit = 10, search } = req.query;
        const offset = (page - 1) * limit;
        const where = {};
        if (search) {
            where[Op.or] = [
                { name: { [Op.iLike]: `%${search}%` } },
                { description: { [Op.iLike]: `%${search}%` } }
            ];
        }
        const programs = await Program.findAndCountAll({
            where,
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                { model: PO, attributes: ['po_id', 'name'] },
                { model: PLO, attributes: ['plo_id', 'description'] },
                {
                    model: TrainingBatch,
                    as: 'TrainingBatches',
                    attributes: ['batch_id', 'name'],
                    include: [{
                        model: Course,
                        as: 'Courses',
                        attributes: ['course_id', 'name']
                    }]
                },
            ],
            order: [['program_id', 'ASC']]
        });

        return respondSuccess(res, {
            pagination: {
                totalItems: programs.count,
                totalPages: Math.ceil(programs.count / limit),
                currentPage: parseInt(page),
                pageSize: parseInt(limit)
            },
            records: programs.rows
        });
    } catch (error) {
        return respondError(res, 500, 'Lỗi khi lấy danh sách chương trình', error.message);
    }
};

// Lấy thông tin chi tiết một chương trình
exports.getProgramById = async (req, res) => {
    try {
        const program = await Program.findByPk(req.params.id, {
            include: [
                { model: PO, attributes: ['po_id', 'name'] },
                { model: PLO, attributes: ['plo_id', 'description'] },
                {
                    model: TrainingBatch,
                    as: 'TrainingBatches',
                    attributes: ['batch_id', 'name'],
                    include: [{
                        model: Course,
                        as: 'Courses',
                        attributes: ['course_id', 'name']
                    }]
                },
            ],
        });

        if (!program) return respondError(res, 404, 'Chương trình không tồn tại');
        return respondSuccess(res, program);
    } catch (error) {
        return respondError(res, 500, 'Lỗi khi lấy thông tin chương trình', error.message);
    }
};

// Tạo một chương trình mới
exports.createProgram = async (req, res) => {
    try {
        const { name, description } = req.body;
        const validationMsg = validateProgramPayload({ name, description });
        if (validationMsg) return respondError(res, 400, validationMsg);

        const newProgram = await Program.create({ name, description });
        return respondSuccess(res, newProgram, 201);
    } catch (error) {
        if (error.name === 'SequelizeValidationError') {
            return respondError(res, 400, 'Lỗi validation', error.errors.map(e => ({ field: e.path, message: e.message })));
        }
        if (error.name === 'SequelizeUniqueConstraintError') {
            return respondError(res, 400, 'Tên chương trình đã tồn tại');
        }
        return respondError(res, 500, 'Lỗi khi tạo chương trình', error.message);
    }
};

// Cập nhật thông tin một chương trình
exports.updateProgram = async (req, res) => {
    try {
        const { name, description } = req.body;
        const validationMsg = validateProgramPayload({ name, description }, true);
        if (validationMsg) return respondError(res, 400, validationMsg);

        const program = await Program.findByPk(req.params.id);
        if (!program) return respondError(res, 404, 'Chương trình không tồn tại');

        await program.update({ name: name || program.name, description: description || program.description });
        return respondSuccess(res, program);
    } catch (error) {
        if (error.name === 'SequelizeValidationError') {
            return respondError(res, 400, 'Lỗi validation', error.errors.map(e => ({ field: e.path, message: e.message })));
        }
        if (error.name === 'SequelizeUniqueConstraintError') {
            return respondError(res, 400, 'Tên chương trình đã tồn tại');
        }
        return respondError(res, 500, 'Lỗi khi cập nhật chương trình', error.message);
    }
};

// Xóa một chương trình (hard delete - TODO: soft delete nếu cần)
exports.deleteProgram = async (req, res) => {
    const { sequelize } = require('../models');
    const transaction = await sequelize.transaction();
    
    try {
        const programId = req.params.id;
        const program = await Program.findByPk(programId);
        
        if (!program) {
            await transaction.rollback();
            return respondError(res, 404, 'Chương trình không tồn tại');
        }

        // Kiểm tra xem Program có đang được sử dụng trong TrainingBatches không
        const trainingBatchesCount = await TrainingBatch.count({
            where: { program_id: programId },
            transaction
        });

        if (trainingBatchesCount > 0) {
            await transaction.rollback();
            return respondError(res, 400, 
                `Không thể xóa Program vì còn ${trainingBatchesCount} training batch(es) thuộc chương trình này. Vui lòng xóa hoặc chuyển các training batches trước.`
            );
        }

        // Kiểm tra PLOs thuộc program này
        const ploCount = await PLO.count({
            where: { program_id: programId },
            transaction
        });

        if (ploCount > 0) {
            await transaction.rollback();
            return respondError(res, 400,
                `Không thể xóa Program vì còn ${ploCount} PLO(s) thuộc chương trình này. Vui lòng xóa hoặc chuyển các PLOs trước.`
            );
        }

        await program.destroy({ transaction });
        await transaction.commit();
        
        return respondSuccess(res, { message: 'Xóa chương trình thành công' });
    } catch (error) {
        await transaction.rollback();
        console.error('Error deleting program:', error);
        return respondError(res, 500, 'Lỗi khi xóa chương trình', error.message);
    }
};

// Lấy danh sách courses theo program
exports.getCoursesByProgram = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const program = await Program.findByPk(id);
        if (!program) return respondError(res, 404, 'Chương trình không tồn tại');

        // Get courses through TrainingBatch relationship
        const trainingBatches = await TrainingBatch.findAll({
            where: { program_id: id },
            include: [{
                model: Course,
                as: 'Courses',
                include: [
                    { model: User, attributes: ['user_id', 'name'] },
                    { model: Subject, attributes: ['subject_id', 'name'] },
                ],
            }],
        });

        // Flatten courses from all training batches
        const allCourses = [];
        trainingBatches.forEach(batch => {
            if (batch.Courses) {
                allCourses.push(...batch.Courses);
            }
        });

        // Apply pagination to flattened courses
        const paginatedCourses = allCourses.slice(offset, offset + parseInt(limit));

        return respondSuccess(res, {
            program: { program_id: program.program_id, name: program.name, description: program.description },
            pagination: {
                totalItems: allCourses.length,
                totalPages: Math.ceil(allCourses.length / limit),
                currentPage: parseInt(page),
                pageSize: parseInt(limit)
            },
            records: paginatedCourses,
        });
    } catch (error) {
        return respondError(res, 500, 'Lỗi khi lấy danh sách courses theo program', error.message);
    }
};

// Lấy danh sách POs theo program
exports.getPOsByProgram = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const program = await Program.findByPk(id);
        if (!program) return respondError(res, 404, 'Chương trình không tồn tại');

        const pos = await PO.findAndCountAll({
            where: { program_id: id },
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [{ model: PLO, through: { attributes: [] }, attributes: ['plo_id', 'description'] }],
            order: [['po_id', 'ASC']]
        });

        return respondSuccess(res, {
            program: { program_id: program.program_id, name: program.name, description: program.description },
            pagination: {
                totalItems: pos.count,
                totalPages: Math.ceil(pos.count / limit),
                currentPage: parseInt(page),
                pageSize: parseInt(limit)
            },
            records: pos.rows,
        });
    } catch (error) {
        return respondError(res, 500, 'Lỗi khi lấy danh sách POs theo program', error.message);
    }
};

// Lấy danh sách PLOs theo program
exports.getPLOsByProgram = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const program = await Program.findByPk(id);
        if (!program) return respondError(res, 404, 'Chương trình không tồn tại');

        const plos = await PLO.findAndCountAll({
            where: { program_id: id },
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                { model: PO, through: { attributes: [] }, attributes: ['po_id', 'name'] },
                { model: Subject, attributes: ['subject_id', 'name'] },
            ],
            order: [['plo_id', 'ASC']]
        });

        return respondSuccess(res, {
            program: { program_id: program.program_id, name: program.name, description: program.description },
            pagination: {
                totalItems: plos.count,
                totalPages: Math.ceil(plos.count / limit),
                currentPage: parseInt(page),
                pageSize: parseInt(limit)
            },
            records: plos.rows,
        });
    } catch (error) {
        return respondError(res, 500, 'Lỗi khi lấy danh sách PLOs theo program', error.message);
    }
};

// ---------------- New extended management endpoints ----------------
// Tạo PO cho program
exports.createPOForProgram = async (req, res) => {
    try {
        const { id } = req.params; // program_id
        const { name, description } = req.body;
        if (!name) return respondError(res, 400, 'Tên PO là bắt buộc');

        const program = await Program.findByPk(id);
        if (!program) return respondError(res, 404, 'Chương trình không tồn tại');

        const po = await PO.create({ name, description, program_id: id });
        return respondSuccess(res, po, 201);
    } catch (error) {
        return respondError(res, 500, 'Lỗi khi tạo PO', error.message);
    }
};

// Tạo PLO cho program
exports.createPLOForProgram = async (req, res) => {
    try {
        const { id } = req.params; // program_id
        const { description } = req.body;
        if (!description) return respondError(res, 400, 'Mô tả PLO là bắt buộc');
        if (description.length > 100) return respondError(res, 400, 'Mô tả PLO không vượt quá 100 ký tự');

        const program = await Program.findByPk(id);
        if (!program) return respondError(res, 404, 'Chương trình không tồn tại');

        const plo = await PLO.create({ description, program_id: id });
        return respondSuccess(res, plo, 201);
    } catch (error) {
        return respondError(res, 500, 'Lỗi khi tạo PLO', error.message);
    }
};

// Liên kết PO và PLO (thêm vào bảng trung gian)
exports.linkPOToPLO = async (req, res) => {
    try {
        const { programId, poId, ploId } = req.params;
        // Validate program + po + plo belong
        const [program, po, plo] = await Promise.all([
            Program.findByPk(programId),
            PO.findByPk(poId),
            PLO.findByPk(ploId)
        ]);
        if (!program) return respondError(res, 404, 'Program không tồn tại');
        if (!po || po.program_id != programId) return respondError(res, 400, 'PO không thuộc program');
        if (!plo || plo.program_id != programId) return respondError(res, 400, 'PLO không thuộc program');

        const existing = await POsPLOs.findOne({ where: { po_id: poId, plo_id: ploId } });
        if (existing) return respondError(res, 409, 'Liên kết đã tồn tại');

        await POsPLOs.create({ po_id: poId, plo_id: ploId });
        return respondSuccess(res, { message: 'Liên kết PO - PLO thành công' }, 201);
    } catch (error) {
        return respondError(res, 500, 'Lỗi khi liên kết PO & PLO', error.message);
    }
};

// Hủy liên kết PO-PLO
exports.unlinkPOFromPLO = async (req, res) => {
    try {
        const { programId, poId, ploId } = req.params;
        const link = await POsPLOs.findOne({ where: { po_id: poId, plo_id: ploId } });
        if (!link) return respondError(res, 404, 'Liên kết không tồn tại');

        await link.destroy();
        return respondSuccess(res, { message: 'Đã hủy liên kết PO - PLO' });
    } catch (error) {
        return respondError(res, 500, 'Lỗi khi hủy liên kết', error.message);
    }
};

// Danh sách mapping PO-PLO của chương trình
exports.getPOMappings = async (req, res) => {
    try {
        const { id } = req.params; // program id
        const program = await Program.findByPk(id);
        if (!program) return respondError(res, 404, 'Chương trình không tồn tại');

        // Fetch POs with linked PLOs
        const pos = await PO.findAll({
            where: { program_id: id },
            include: [{ model: PLO, through: { attributes: [] }, attributes: ['plo_id', 'description'] }],
            order: [['po_id', 'ASC']]
        });

        const mappings = pos.map(po => ({
            po_id: po.po_id,
            po_name: po.name,
            plos: po.PLOs?.map(p => ({ plo_id: p.plo_id, description: p.description })) || []
        }));

        return respondSuccess(res, { program: { program_id: program.program_id, name: program.name }, mappings });
    } catch (error) {
        return respondError(res, 500, 'Lỗi khi lấy mapping PO-PLO', error.message);
    }
};