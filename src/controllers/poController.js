const { PO, Program, PLO, ProgramOutcomeTracking, sequelize } = require('../models');
const { successResponse, errorResponse, handleError, notFoundResponse, validationErrorResponse } = require('../utils/responseFormatter');
const { Op } = require('sequelize');

exports.getAllPOs = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const pos = await PO.findAndCountAll({
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                { model: Program, attributes: ['program_id', 'name'] },
                { model: PLO, through: { attributes: [] }, attributes: ['plo_id', 'description'] },
            ],
        });

        res.status(200).json({
            success: true,
            data: {
                totalItems: pos.count,
                totalPages: Math.ceil(pos.count / limit),
                currentPage: parseInt(page),
                pos: pos.rows,
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách PO',
            error: error.message
        });
    }
};

exports.getPOById = async (req, res) => {
    try {
        const po = await PO.findByPk(req.params.id, {
            include: [
                { model: Program, attributes: ['program_id', 'name'] },
                { model: PLO, through: { attributes: [] }, attributes: ['plo_id', 'description'] },
            ],
        });

        if (!po) {
            return res.status(404).json({
                success: false,
                message: 'PO không tồn tại'
            });
        }

        res.status(200).json({
            success: true,
            data: po
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin PO',
            error: error.message
        });
    }
};

exports.createPO = async (req, res) => {
    try {
        const { name, description, program_id } = req.body;

        if (!name || !program_id) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu các trường bắt buộc'
            });
        }

        const program = await Program.findByPk(program_id);
        if (!program) {
            return res.status(400).json({
                success: false,
                message: 'Chương trình không tồn tại'
            });
        }

        const newPO = await PO.create({ name, description, program_id });
        res.status(201).json({
            success: true,
            data: newPO
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo PO',
            error: error.message
        });
    }
};

exports.updatePO = async (req, res) => {
    try {
        const { name, description, program_id } = req.body;

        const po = await PO.findByPk(req.params.id);
        if (!po) {
            return res.status(404).json({
                success: false,
                message: 'PO không tồn tại'
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

        await po.update({
            name: name || po.name,
            description: description || po.description,
            program_id: program_id || po.program_id,
        });

        res.status(200).json({
            success: true,
            data: po
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật PO',
            error: error.message
        });
    }
};

exports.deletePO = async (req, res) => {
    try {
        const po = await PO.findByPk(req.params.id);
        if (!po) {
            return res.status(404).json({
                success: false,
                message: 'PO không tồn tại'
            });
        }

        await po.destroy();
        res.status(200).json({
            success: true,
            message: 'Xóa PO thành công'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa PO',
            error: error.message
        });
    }
};

// =====================================================
// NEW ADMIN FUNCTIONS FOR PO MANAGEMENT
// =====================================================

// Get POs by Program
exports.getPOsByProgram = async (req, res) => {
    try {
        const { program_id } = req.params;
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const pos = await PO.findAndCountAll({
            where: { program_id },
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                { model: Program, attributes: ['program_id', 'name'] },
                { model: PLO, through: { attributes: [] }, attributes: ['plo_id', 'description'] },
            ],
        });

        res.status(200).json({
            success: true,
            data: {
                totalItems: pos.count,
                totalPages: Math.ceil(pos.count / limit),
                currentPage: parseInt(page),
                pos: pos.rows,
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error getting POs by program',
            error: error.message
        });
    }
};

// Get PO Statistics
exports.getPOStatistics = async (req, res) => {
    try {
        const { program_id } = req.query;

        let whereClause = {};
        if (program_id) {
            whereClause.program_id = program_id;
        }

        // Get total POs
        const totalPOs = await PO.count({ where: whereClause });

        // Get POs with tracking data
        const posWithTracking = await PO.findAll({
            where: whereClause,
            include: [{
                model: ProgramOutcomeTracking,
                where: { outcome_type: 'PO', is_active: true },
                required: false,
                attributes: ['current_score', 'achievement_status']
            }],
            attributes: ['po_id', 'name']
        });

        // Calculate statistics
        let totalStudentsTracked = 0;
        let achievedCount = 0;
        let averageScore = 0;
        let totalScore = 0;
        let scoreCount = 0;

        posWithTracking.forEach(po => {
            const trackingData = po.ProgramOutcomeTrackings || [];
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
                total_pos: totalPOs,
                pos_with_tracking: posWithTracking.filter(po => po.ProgramOutcomeTrackings?.length > 0).length,
                total_students_tracked: totalStudentsTracked,
                average_score: parseFloat(averageScore),
                achievement_rate: parseFloat(achievementRate)
            },
            po_breakdown: posWithTracking.map(po => ({
                po_id: po.po_id,
                name: po.name,
                students_tracked: po.ProgramOutcomeTrackings?.length || 0,
                average_score: po.ProgramOutcomeTrackings?.length > 0 ?
                    (po.ProgramOutcomeTrackings.reduce((sum, t) => sum + t.current_score, 0) / po.ProgramOutcomeTrackings.length).toFixed(2) : 0
            })),
            generated_at: new Date()
        });

    } catch (error) {
        console.error('Error getting PO statistics:', error);
        return handleError(res, error, "Error getting PO statistics");
    }
};

// Get PO Achievement Analysis
exports.getPOAchievementAnalysis = async (req, res) => {
    try {
        const { program_id } = req.params;
        const { time_period } = req.query;

        // Get POs in program
        const pos = await PO.findAll({
            where: { program_id },
            include: [{
                model: ProgramOutcomeTracking,
                where: {
                    outcome_type: 'PO',
                    is_active: true
                },
                required: false,
                attributes: ['user_id', 'current_score', 'target_score', 'achievement_status', 'score_history']
            }]
        });

        const analysis = pos.map(po => {
            const trackingData = po.ProgramOutcomeTrackings || [];
            const totalStudents = trackingData.length;

            if (totalStudents === 0) {
                return {
                    po_info: {
                        po_id: po.po_id,
                        name: po.name,
                        description: po.description
                    },
                    achievement_metrics: {
                        total_students: 0,
                        achieved_count: 0,
                        achievement_rate: 0,
                        average_score: 0,
                        score_distribution: { excellent: 0, good: 0, average: 0, poor: 0 }
                    }
                };
            }

            const achievedCount = trackingData.filter(t =>
                t.achievement_status === 'achieved' || t.achievement_status === 'exceeded'
            ).length;

            const averageScore = trackingData.reduce((sum, t) => sum + t.current_score, 0) / totalStudents;

            // Score distribution
            const scoreDistribution = { excellent: 0, good: 0, average: 0, poor: 0 };
            trackingData.forEach(t => {
                if (t.current_score >= 90) scoreDistribution.excellent++;
                else if (t.current_score >= 80) scoreDistribution.good++;
                else if (t.current_score >= 70) scoreDistribution.average++;
                else scoreDistribution.poor++;
            });

            return {
                po_info: {
                    po_id: po.po_id,
                    name: po.name,
                    description: po.description
                },
                achievement_metrics: {
                    total_students: totalStudents,
                    achieved_count: achievedCount,
                    achievement_rate: ((achievedCount / totalStudents) * 100).toFixed(2),
                    average_score: averageScore.toFixed(2),
                    score_distribution: scoreDistribution
                }
            };
        });

        // Overall program statistics
        const totalStudentsInProgram = analysis.reduce((sum, po) => sum + po.achievement_metrics.total_students, 0);
        const totalAchieved = analysis.reduce((sum, po) => sum + po.achievement_metrics.achieved_count, 0);
        const overallAchievementRate = totalStudentsInProgram > 0 ?
            ((totalAchieved / totalStudentsInProgram) * 100).toFixed(2) : 0;

        return successResponse(res, 200, "Thành công", {
            program_id: parseInt(program_id),
            total_pos: analysis.length,
            overall_metrics: {
                total_students: totalStudentsInProgram,
                total_achieved: totalAchieved,
                overall_achievement_rate: parseFloat(overallAchievementRate)
            },
            po_analysis: analysis,
            generated_at: new Date()
        });

    } catch (error) {
        console.error('Error getting PO achievement analysis:', error);
        return handleError(res, error, "Error getting PO achievement analysis");
    }
};

// Bulk create POs
exports.bulkCreatePOs = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { pos } = req.body; // Array of PO objects

        if (!Array.isArray(pos) || pos.length === 0) {
            await transaction.rollback();
            return successResponse(res, 400, "Invalid PO list");
        }

        // Validate each PO
        for (const po of pos) {
            if (!po.name || !po.program_id) {
                await transaction.rollback();
                return successResponse(res, 400, "Name and program_id are required for all POs");
            }
        }

        // Create POs
        const createdPOs = await PO.bulkCreate(pos, { transaction });
        await transaction.commit();

        return successResponse(res, 201, "Tạo thành công", {
            message: `Successfully created ${createdPOs.length} POs`,
            created_pos: createdPOs
        });

    } catch (error) {
        await transaction.rollback();
        console.error('Error bulk creating POs:', error);
        return handleError(res, error, "Error bulk creating POs");
    }
};

// Bulk update POs
exports.bulkUpdatePOs = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { updates } = req.body; // Array of {po_id, name, description, program_id}

        if (!Array.isArray(updates) || updates.length === 0) {
            await transaction.rollback();
            return successResponse(res, 400, "Invalid updates list");
        }

        const results = [];
        for (const update of updates) {
            const { po_id, name, description, program_id } = update;

            if (!po_id) {
                continue; // Skip invalid entries
            }

            const po = await PO.findByPk(po_id, { transaction });
            if (po) {
                await po.update({
                    name: name || po.name,
                    description: description !== undefined ? description : po.description,
                    program_id: program_id || po.program_id
                }, { transaction });
                results.push(po);
            }
        }

        await transaction.commit();

        return successResponse(res, 200, "Thành công", {
            message: `Successfully updated ${results.length} POs`,
            updated_pos: results
        });

    } catch (error) {
        await transaction.rollback();
        console.error('Error bulk updating POs:', error);
        return handleError(res, error, "Error bulk updating POs");
    }
};

// Bulk delete POs
exports.bulkDeletePOs = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { po_ids } = req.body; // Array of PO IDs

        if (!Array.isArray(po_ids) || po_ids.length === 0) {
            await transaction.rollback();
            return successResponse(res, 400, "Invalid PO IDs list");
        }

        // Check if any PO has tracking data
        const posWithTracking = await PO.findAll({
            where: { po_id: { [Op.in]: po_ids } },
            include: [{
                model: ProgramOutcomeTracking,
                required: true,
                attributes: ['tracking_id']
            }],
            transaction
        });

        if (posWithTracking.length > 0) {
            await transaction.rollback();
            return successResponse(res, 400, "Hoàn tất", {
                message: 'Cannot delete POs with tracking data',
                pos_with_tracking: posWithTracking.map(po => ({
                    po_id: po.po_id,
                    name: po.name,
                    tracking_count: po.ProgramOutcomeTrackings.length
                }))
            });
        }

        // Delete POs
        const deletedCount = await PO.destroy({
            where: { po_id: { [Op.in]: po_ids } },
            transaction
        });

        await transaction.commit();

        return successResponse(res, 200, "Thành công", {
            message: `Successfully deleted ${deletedCount} POs`,
            deleted_count: deletedCount
        });

    } catch (error) {
        await transaction.rollback();
        console.error('Error bulk deleting POs:', error);
        return handleError(res, error, "Error bulk deleting POs");
    }
};
