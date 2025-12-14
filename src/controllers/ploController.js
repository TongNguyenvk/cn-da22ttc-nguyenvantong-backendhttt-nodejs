const { PLO, Program, PO, Subject, ProgramOutcomeTracking, SubjectPLO, LO, LOsPLO, sequelize } = require('../models');
const { successResponse, errorResponse, handleError, notFoundResponse, validationErrorResponse } = require('../utils/responseFormatter');
const { Op } = require('sequelize');

exports.getAllPLOs = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const plos = await PLO.findAndCountAll({
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                { model: Program, attributes: ['program_id', 'name'] },
                { model: PO, through: { attributes: [] }, attributes: ['po_id', 'name'] },
                { 
                    model: Subject, 
                    as: 'Subjects',
                    attributes: ['subject_id', 'name'],
                    through: { attributes: [] },
                    required: false
                },
                {
                    model: LO,
                    as: 'LOs',
                    attributes: ['lo_id', 'name', 'subject_id'],
                    through: { attributes: [] }
                },
            ],
        });

        res.status(200).json({
            success: true,
            data: {
                totalItems: plos.count,
                totalPages: Math.ceil(plos.count / limit),
                currentPage: parseInt(page),
                plos: plos.rows,
            }
        });
    } catch (error) {
        console.error('Error getting PLOs:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách PLO',
            error: error.message
        });
    }
};

exports.getPLOById = async (req, res) => {
    try {
        const plo = await PLO.findByPk(req.params.id, {
            include: [
                { model: Program, attributes: ['program_id', 'name'] },
                { model: PO, through: { attributes: [] }, attributes: ['po_id', 'name'] },
                { 
                    model: Subject, 
                    as: 'Subjects',
                    attributes: ['subject_id', 'name'],
                    through: { attributes: [] },
                    required: false
                },
                {
                    model: LO,
                    as: 'LOs',
                    attributes: ['lo_id', 'name', 'subject_id'],
                    through: { attributes: [] }
                },
            ],
        });

        if (!plo) {
            return res.status(404).json({
                success: false,
                message: 'PLO không tồn tại'
            });
        }

        res.status(200).json({
            success: true,
            data: plo
        });
    } catch (error) {
        console.error('Error getting PLO by ID:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin PLO',
            error: error.message
        });
    }
};

exports.createPLO = async (req, res) => {
    try {
        const { name, description, program_id, lo_ids } = req.body;
        
        console.log('createPLO - Raw Request body:', req.body);

        // Validation với kiểm tra kỹ hơn
        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Tên PLO là bắt buộc và phải là chuỗi ký tự không rỗng',
                debug: { name, nameType: typeof name }
            });
        }

        if (!description || typeof description !== 'string' || description.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Mô tả PLO là bắt buộc và phải là chuỗi ký tự không rỗng'
            });
        }

        if (!program_id || isNaN(parseInt(program_id))) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu trường bắt buộc: program_id và phải là số'
            });
        }

        // (Removed) Giới hạn độ dài cứng cho name (50) và description (100) vì description đã chuyển sang TEXT và name cho phép tới 100 ký tự trong model.
        // Giữ kiểm tra cơ bản name không rỗng ở phía trên.

        // Kiểm tra program có tồn tại không
        const program = await Program.findByPk(parseInt(program_id));
        if (!program) {
            return res.status(400).json({
                success: false,
                message: 'Chương trình không tồn tại'
            });
        }

        const finalValues = {
            name: name.trim(),
            description: description.trim(),
            program_id: parseInt(program_id)
        };

        console.log('Before creating PLO - Final values:', finalValues);

        const newPLO = await PLO.create(finalValues);

        // Validate and link LOs if provided
        let linkedLOs = [];
        if (Array.isArray(lo_ids) && lo_ids.length > 0) {
            // Remove duplicates & falsy
            const uniqueLOIds = [
                ...new Set(lo_ids.filter((id) => Number.isInteger(id))),
            ];
            if (uniqueLOIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Danh sách lo_ids không hợp lệ",
                });
            }
            // Load LOs
            linkedLOs = await LO.findAll({
                where: { lo_id: uniqueLOIds },
            });
            if (linkedLOs.length !== uniqueLOIds.length) {
                const found = new Set(linkedLOs.map((lo) => lo.lo_id));
                const missing = uniqueLOIds.filter((id) => !found.has(id));
                return res.status(400).json({
                    success: false,
                    message: `Các LO không tồn tại: ${missing.join(", ")}`,
                });
            }

            // Create join records
            const loJoinRows = linkedLOs.map((lo) => ({
                lo_id: lo.lo_id,
                plo_id: newPLO.plo_id,
            }));
            await LOsPLO.bulkCreate(loJoinRows, {
                ignoreDuplicates: true,
            });
        }

        res.status(201).json({
            success: true,
            data: {
                plo: newPLO,
                linked_los: linkedLOs.map((lo) => ({
                    lo_id: lo.lo_id,
                    name: lo.name,
                    subject_id: lo.subject_id,
                })),
            }
        });
    } catch (error) {
        console.error('Error creating PLO:', error);

        // Xử lý lỗi validation chi tiết
        if (error.name === 'SequelizeValidationError') {
            const validationErrors = error.errors.map(err => ({
                field: err.path,
                message: err.message
            }));
            return res.status(400).json({
                success: false,
                message: 'Lỗi validation',
                errors: validationErrors
            });
        }

        if (error.name === 'SequelizeForeignKeyConstraintError') {
            return res.status(400).json({
                success: false,
                message: 'Chương trình không tồn tại'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo PLO',
            error: error.message
        });
    }
};

exports.updatePLO = async (req, res) => {
    try {
        const { name, description, program_id, lo_ids } = req.body;

        const plo = await PLO.findByPk(req.params.id);
        if (!plo) {
            return res.status(404).json({
                success: false,
                message: 'PLO không tồn tại'
            });
        }

        // Kiểm tra độ dài name nếu có cập nhật
        if (name && name.length > 50) {
            return res.status(400).json({
                success: false,
                message: 'Tên PLO không được vượt quá 50 ký tự'
            });
        }

        // Kiểm tra độ dài description nếu có cập nhật
        if (description && description.length > 100) {
            return res.status(400).json({
                success: false,
                message: 'Mô tả PLO không được vượt quá 100 ký tự'
            });
        }

        if (program_id) {
            const program = await Program.findByPk(program_id);
            if (!program) {
                return res.status(400).json({
                    success: false,
                    message: 'Chương trình không tồn tại'
                });
            }
        }

        await plo.update({
            name: name || plo.name,
            description: description || plo.description,
            program_id: program_id || plo.program_id,
        });

        // Optional LO association update
        if (lo_ids !== undefined) {
            if (!Array.isArray(lo_ids)) {
                return res.status(400).json({
                    success: false,
                    message: "lo_ids phải là mảng",
                });
            }

            // Remove duplicates & keep only integers
            const uniqueLOIds = [
                ...new Set(lo_ids.filter((idVal) => Number.isInteger(idVal))),
            ];

            // Load existing linked LOs
            const existingLOLinks = await LOsPLO.findAll({
                where: { plo_id: req.params.id },
                attributes: ["lo_id"],
            });
            const existingLOSet = new Set(existingLOLinks.map((l) => l.lo_id));

            // Validate and load new LOs (if any expected)
            let losToLink = [];
            if (uniqueLOIds.length > 0) {
                losToLink = await LO.findAll({
                    where: { lo_id: uniqueLOIds },
                });
                if (losToLink.length !== uniqueLOIds.length) {
                    const found = new Set(losToLink.map((lo) => lo.lo_id));
                    const missing = uniqueLOIds.filter((lid) => !found.has(lid));
                    return res.status(400).json({
                        success: false,
                        message: `Các LO không tồn tại: ${missing.join(", ")}`,
                    });
                }
            }

            // Determine adds & removals
            const desiredLOSet = new Set(uniqueLOIds);
            const loToAdd = [...desiredLOSet]
                .filter((lid) => !existingLOSet.has(lid))
                .map((lid) => ({ lo_id: lid, plo_id: Number(req.params.id) }));
            const loToRemove = [...existingLOSet].filter((lid) => !desiredLOSet.has(lid));

            if (loToAdd.length > 0) {
                await LOsPLO.bulkCreate(loToAdd, {
                    ignoreDuplicates: true,
                });
            }
            if (loToRemove.length > 0) {
                await LOsPLO.destroy({
                    where: { plo_id: req.params.id, lo_id: loToRemove },
                });
            }
        }

        // Reload PLO with associations after update
        const updatedPLO = await PLO.findByPk(req.params.id, {
            include: [
                { model: Program, attributes: ['program_id', 'name'] },
                { model: PO, through: { attributes: [] }, attributes: ['po_id', 'name'] },
                { 
                    model: Subject, 
                    as: 'Subjects',
                    attributes: ['subject_id', 'name'],
                    through: { attributes: [] },
                    required: false
                },
                {
                    model: LO,
                    as: 'LOs',
                    attributes: ['lo_id', 'name', 'subject_id'],
                    through: { attributes: [] }
                },
            ],
        });

        res.status(200).json({
            success: true,
            data: updatedPLO
        });
    } catch (error) {
        console.error('Error updating PLO:', error);

        // Xử lý lỗi validation chi tiết
        if (error.name === 'SequelizeValidationError') {
            const validationErrors = error.errors.map(err => ({
                field: err.path,
                message: err.message
            }));
            return res.status(400).json({
                success: false,
                message: 'Lỗi validation',
                errors: validationErrors
            });
        }

        if (error.name === 'SequelizeForeignKeyConstraintError') {
            return res.status(400).json({
                success: false,
                message: 'Chương trình không tồn tại'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật PLO',
            error: error.message
        });
    }
};

exports.deletePLO = async (req, res) => {
    try {
        const plo = await PLO.findByPk(req.params.id, {
            include: [
                { 
                    model: Subject, 
                    as: 'Subjects',
                    attributes: ['subject_id', 'name'],
                    through: { attributes: [] },
                    required: false
                }
            ]
        });

        if (!plo) {
            return res.status(404).json({
                success: false,
                message: 'PLO không tồn tại'
            });
        }

        // Kiểm tra xem PLO có đang được sử dụng không
        const subjectsUsingPLO = plo.Subjects || [];

        if (subjectsUsingPLO.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Không thể xóa PLO vì đang được sử dụng',
                data: {
                    subjects_count: subjectsUsingPLO.length,
                    subjects: subjectsUsingPLO.map(s => ({ subject_id: s.subject_id, name: s.name }))
                }
            });
        }

        await plo.destroy();
        res.status(200).json({
            success: true,
            message: 'Xóa PLO thành công'
        });
    } catch (error) {
        console.error('Error deleting PLO:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa PLO',
            error: error.message
        });
    }
};

// =====================================================
// NEW ADMIN FUNCTIONS FOR PLO MANAGEMENT
// =====================================================

// Get PLOs by Program
exports.getPLOsByProgram = async (req, res) => {
    try {
        const { program_id } = req.params;
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const plos = await PLO.findAndCountAll({
            where: { program_id },
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                { model: Program, attributes: ['program_id', 'name'] },
                { model: PO, through: { attributes: [] }, attributes: ['po_id', 'name'] },
                { 
                    model: Subject, 
                    as: 'Subjects',
                    attributes: ['subject_id', 'name'],
                    through: { attributes: [] },
                    required: false  // LEFT JOIN để PLO không có subject vẫn hiển thị
                },
            ],
        });

        res.status(200).json({
            success: true,
            data: {
                totalItems: plos.count,
                totalPages: Math.ceil(plos.count / limit),
                currentPage: parseInt(page),
                plos: plos.rows,
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error getting PLOs by program',
            error: error.message
        });
    }
};

// Get PLO Statistics
exports.getPLOStatistics = async (req, res) => {
    try {
        const { program_id } = req.query;

        let whereClause = {};
        if (program_id) {
            whereClause.program_id = program_id;
        }

        // Get total PLOs
        const totalPLOs = await PLO.count({ where: whereClause });

        // Get PLOs with tracking data
        const plosWithTracking = await PLO.findAll({
            where: whereClause,
            include: [{
                model: ProgramOutcomeTracking,
                where: { outcome_type: 'PLO', is_active: true },
                required: false,
                attributes: ['current_score', 'achievement_status']
            }],
            attributes: ['plo_id', 'description']
        });

        // Calculate statistics
        let totalStudentsTracked = 0;
        let achievedCount = 0;
        let averageScore = 0;
        let totalScore = 0;
        let scoreCount = 0;

        plosWithTracking.forEach(plo => {
            const trackingData = plo.ProgramOutcomeTrackings || [];
            totalStudentsTracked += trackingData.length;

            trackingData.forEach(tracking => {
                if (tracking.achievement_status === 'achieved' || tracking.achievement_status === 'exceeded') {
                    achievedCount++;
                }
                totalScore += tracking.current_score;
                scoreCount++;
            });
        });

        averageScore = scoreCount > 0 ? (totalScore / scoreCount).toFixed(2) : 0;
        const achievementRate = totalStudentsTracked > 0 ? ((achievedCount / totalStudentsTracked) * 100).toFixed(2) : 0;

        return successResponse(res, 200, "Thành công", {
            overview: {
                total_plos: totalPLOs,
                plos_with_tracking: plosWithTracking.filter(plo => plo.ProgramOutcomeTrackings?.length > 0).length,
                total_students_tracked: totalStudentsTracked,
                average_score: parseFloat(averageScore),
                achievement_rate: parseFloat(achievementRate)
            },
            plo_breakdown: plosWithTracking.map(plo => ({
                plo_id: plo.plo_id,
                description: plo.description,
                students_tracked: plo.ProgramOutcomeTrackings?.length || 0,
                average_score: plo.ProgramOutcomeTrackings?.length > 0 ?
                    (plo.ProgramOutcomeTrackings.reduce((sum, t) => sum + t.current_score, 0) / plo.ProgramOutcomeTrackings.length).toFixed(2) : 0
            })),
            generated_at: new Date()
        });

    } catch (error) {
        console.error('Error getting PLO statistics:', error);
        return handleError(res, error, "Error getting PLO statistics");
    }
};

// Get PLO Achievement Analysis
exports.getPLOAchievementAnalysis = async (req, res) => {
    try {
        const { program_id } = req.params;

        // Get PLOs in program
        const plos = await PLO.findAll({
            where: { program_id },
            include: [{
                model: ProgramOutcomeTracking,
                where: {
                    outcome_type: 'PLO',
                    is_active: true
                },
                required: false,
                attributes: ['user_id', 'current_score', 'target_score', 'achievement_status']
            }]
        });

        const analysis = plos.map(plo => {
            const trackingData = plo.ProgramOutcomeTrackings || [];
            const totalStudents = trackingData.length;

            if (totalStudents === 0) {
                return {
                    plo_info: {
                        plo_id: plo.plo_id,
                        description: plo.description
                    },
                    achievement_metrics: {
                        total_students: 0,
                        achieved_count: 0,
                        achievement_rate: 0,
                        average_score: 0,
                        mastery_distribution: { expert: 0, proficient: 0, developing: 0, novice: 0 }
                    }
                };
            }

            const achievedCount = trackingData.filter(t =>
                t.achievement_status === 'achieved' || t.achievement_status === 'exceeded'
            ).length;

            const averageScore = trackingData.reduce((sum, t) => sum + t.current_score, 0) / totalStudents;

            // Mastery distribution for PLOs
            const masteryDistribution = { expert: 0, proficient: 0, developing: 0, novice: 0 };
            trackingData.forEach(t => {
                if (t.current_score >= 90) masteryDistribution.expert++;
                else if (t.current_score >= 80) masteryDistribution.proficient++;
                else if (t.current_score >= 70) masteryDistribution.developing++;
                else masteryDistribution.novice++;
            });

            return {
                plo_info: {
                    plo_id: plo.plo_id,
                    description: plo.description
                },
                achievement_metrics: {
                    total_students: totalStudents,
                    achieved_count: achievedCount,
                    achievement_rate: ((achievedCount / totalStudents) * 100).toFixed(2),
                    average_score: averageScore.toFixed(2),
                    mastery_distribution: masteryDistribution
                }
            };
        });

        return successResponse(res, 200, "Thành công", {
            program_id: parseInt(program_id),
            total_plos: analysis.length,
            plo_analysis: analysis,
            generated_at: new Date()
        });

    } catch (error) {
        console.error('Error getting PLO achievement analysis:', error);
        return handleError(res, error, "Error getting PLO achievement analysis");
    }
};

// Bulk create PLOs
exports.bulkCreatePLOs = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { plos } = req.body; // Array of PLO objects

        if (!Array.isArray(plos) || plos.length === 0) {
            await transaction.rollback();
            return successResponse(res, 400, "Invalid PLO list");
        }

        // Validate each PLO
        for (const plo of plos) {
            if (!plo.description || !plo.program_id) {
                await transaction.rollback();
                return successResponse(res, 400, "Description and program_id are required for all PLOs");
            }

            // Bỏ kiểm tra độ dài cứng 100 ký tự cho description
        }

        // Create PLOs
        const createdPLOs = await PLO.bulkCreate(plos, { transaction });
        await transaction.commit();

        return successResponse(res, 201, "Tạo thành công", {
            message: `Successfully created ${createdPLOs.length} PLOs`,
            created_plos: createdPLOs
        });

    } catch (error) {
        await transaction.rollback();
        console.error('Error bulk creating PLOs:', error);
        return handleError(res, error, "Error bulk creating PLOs");
    }
};

// Bulk update PLOs
exports.bulkUpdatePLOs = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { updates } = req.body; // Array of {plo_id, description, program_id}

        if (!Array.isArray(updates) || updates.length === 0) {
            await transaction.rollback();
            return successResponse(res, 400, "Invalid updates list");
        }

        const results = [];
        for (const update of updates) {
            const { plo_id, description, program_id } = update;

            if (!plo_id) {
                continue; // Skip invalid entries
            }

            // Bỏ kiểm tra giới hạn 100 ký tự khi cập nhật description

            const plo = await PLO.findByPk(plo_id, { transaction });
            if (plo) {
                await plo.update({
                    description: description || plo.description,
                    program_id: program_id || plo.program_id
                }, { transaction });
                results.push(plo);
            }
        }

        await transaction.commit();

        return successResponse(res, 200, "Thành công", {
            message: `Successfully updated ${results.length} PLOs`,
            updated_plos: results
        });

    } catch (error) {
        await transaction.rollback();
        console.error('Error bulk updating PLOs:', error);
        return handleError(res, error, "Error bulk updating PLOs");
    }
};

// Bulk delete PLOs
exports.bulkDeletePLOs = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { plo_ids } = req.body; // Array of PLO IDs

        if (!Array.isArray(plo_ids) || plo_ids.length === 0) {
            await transaction.rollback();
            return successResponse(res, 400, "Invalid PLO IDs list");
        }

        // Check if any PLO has tracking data
        const plosWithTracking = await PLO.findAll({
            where: { plo_id: { [Op.in]: plo_ids } },
            include: [{
                model: ProgramOutcomeTracking,
                required: true,
                attributes: ['tracking_id']
            }],
            transaction
        });

        if (plosWithTracking.length > 0) {
            await transaction.rollback();
            return successResponse(res, 400, "Hoàn tất", {
                message: 'Cannot delete PLOs with tracking data',
                plos_with_tracking: plosWithTracking.map(plo => ({
                    plo_id: plo.plo_id,
                    description: plo.description,
                    tracking_count: plo.ProgramOutcomeTrackings.length
                }))
            });
        }

        // Delete PLOs
        const deletedCount = await PLO.destroy({
            where: { plo_id: { [Op.in]: plo_ids } },
            transaction
        });

        await transaction.commit();

        return successResponse(res, 200, "Thành công", {
            message: `Successfully deleted ${deletedCount} PLOs`,
            deleted_count: deletedCount
        });

    } catch (error) {
        await transaction.rollback();
        console.error('Error bulk deleting PLOs:', error);
        return handleError(res, error, "Error bulk deleting PLOs");
    }
};

// =====================================================
// PLO-LO RELATIONSHIP MANAGEMENT
// =====================================================

/**
 * Add LOs to a PLO
 * POST /api/plos/:id/los
 * Body: { lo_ids: [1, 2, 3] }
 */
exports.addLOsToPLO = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { lo_ids } = req.body;

        if (!Array.isArray(lo_ids) || lo_ids.length === 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "lo_ids phải là mảng và không được rỗng",
            });
        }

        const plo = await PLO.findByPk(id, { transaction });
        if (!plo) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy PLO",
            });
        }

        // Remove duplicates & validate
        const uniqueLOIds = [...new Set(lo_ids.filter((id) => Number.isInteger(id)))];
        if (uniqueLOIds.length === 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "Danh sách lo_ids không hợp lệ",
            });
        }

        // Load LOs
        const los = await LO.findAll({
            where: { lo_id: uniqueLOIds },
            transaction,
        });

        if (los.length !== uniqueLOIds.length) {
            const found = new Set(los.map((lo) => lo.lo_id));
            const missing = uniqueLOIds.filter((id) => !found.has(id));
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `Các LO không tồn tại: ${missing.join(", ")}`,
            });
        }

        // Create join records (ignore duplicates)
        const joinRows = los.map((lo) => ({
            lo_id: lo.lo_id,
            plo_id: Number(id),
        }));

        const createdCount = await LOsPLO.bulkCreate(joinRows, {
            transaction,
            ignoreDuplicates: true,
        });

        await transaction.commit();

        return res.status(200).json({
            success: true,
            message: `Đã thêm ${createdCount.length} mối quan hệ PLO-LO`,
            data: {
                plo_id: id,
                added_los: los.map((lo) => ({
                    lo_id: lo.lo_id,
                    name: lo.name,
                })),
            },
        });
    } catch (error) {
        await transaction.rollback();
        console.error("Error adding LOs to PLO:", error);
        return handleError(res, error, "Lỗi khi thêm LO vào PLO");
    }
};

/**
 * Remove LOs from a PLO
 * DELETE /api/plos/:id/los
 * Body: { lo_ids: [1, 2, 3] }
 */
exports.removeLOsFromPLO = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { lo_ids } = req.body;

        if (!Array.isArray(lo_ids) || lo_ids.length === 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "lo_ids phải là mảng và không được rỗng",
            });
        }

        const plo = await PLO.findByPk(id, { transaction });
        if (!plo) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy PLO",
            });
        }

        // Remove duplicates & validate
        const uniqueLOIds = [...new Set(lo_ids.filter((id) => Number.isInteger(id)))];

        // Delete relationships
        const deletedCount = await LOsPLO.destroy({
            where: {
                plo_id: id,
                lo_id: uniqueLOIds,
            },
            transaction,
        });

        await transaction.commit();

        return res.status(200).json({
            success: true,
            message: `Đã xóa ${deletedCount} mối quan hệ PLO-LO`,
            data: {
                plo_id: id,
                removed_lo_ids: uniqueLOIds,
            },
        });
    } catch (error) {
        await transaction.rollback();
        console.error("Error removing LOs from PLO:", error);
        return handleError(res, error, "Lỗi khi xóa LO khỏi PLO");
    }
};

/**
 * Get LOs of a PLO
 * GET /api/plos/:id/los
 */
exports.getLOsOfPLO = async (req, res) => {
    try {
        const { id } = req.params;

        const plo = await PLO.findByPk(id, {
            include: [
                {
                    model: LO,
                    as: "LOs",
                    attributes: ["lo_id", "name", "description", "subject_id"],
                    through: { attributes: [] },
                    include: [
                        {
                            model: Subject,
                            attributes: ["subject_id", "name"],
                        },
                    ],
                },
            ],
        });

        if (!plo) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy PLO",
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                plo: {
                    plo_id: plo.plo_id,
                    name: plo.name,
                    program_id: plo.program_id,
                },
                los: plo.LOs,
            },
        });
    } catch (error) {
        console.error("Error getting LOs of PLO:", error);
        return handleError(res, error, "Lỗi khi lấy danh sách LO của PLO");
    }
};
