const { Chapter, Subject, LO, ChapterLO, ChapterSection, Question, sequelize } = require('../models');
const { successResponse, errorResponse, handleError, notFoundResponse, validationErrorResponse } = require('../utils/responseFormatter');
const { Op } = require('sequelize');

// Get all chapters with pagination
exports.getAllChapters = async (req, res) => {
    try {
        const { page = 1, limit = 10, subject_id } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = {};
        if (subject_id) {
            whereClause.subject_id = subject_id;
        }

        const chapters = await Chapter.findAndCountAll({
            where: whereClause,
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                { model: Subject, as: 'Subject', attributes: ['subject_id', 'name'] },
                { model: LO, as: 'LOs', attributes: ['lo_id', 'name', 'description'], through: { attributes: [] } },
                { model: ChapterSection, as: 'Sections', attributes: ['section_id', ['title','name'], 'content', ['order','order_index']] }
            ],
            order: [['chapter_id', 'ASC']]
        });

        res.status(200).json({
            success: true,
            data: {
                totalItems: chapters.count,
                totalPages: Math.ceil(chapters.count / limit),
                currentPage: parseInt(page),
                chapters: chapters.rows,
            }
        });
    } catch (error) {
        console.error('Error getting chapters:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting chapters',
            error: error.message
        });
    }
};

// Get chapter by ID
exports.getChapterById = async (req, res) => {
    try {
        const { id } = req.params;

        const chapter = await Chapter.findByPk(id, {
            include: [
                {
                    model: Subject,
                    as: 'Subject',
                    attributes: ['subject_id', 'name', 'description']
                },
                {
                    model: LO,
                    as: 'LOs',
                    attributes: ['lo_id', 'name', 'description'],
                    through: { attributes: [] }
                },
                {
                    model: ChapterSection,
                    as: 'Sections',
                    attributes: ['section_id', ['title','name'], 'content', ['order','order_index']]
                }
            ]
        });

        if (!chapter) {
            return successResponse(res, 404, "Chapter not found");
        }

        return successResponse(res, 200, "Thành công", chapter);
    } catch (error) {
        console.error('Error getting chapter:', error);
        return handleError(res, error, "Error getting chapter");
    }
};

// Get chapters by subject
exports.getChaptersBySubject = async (req, res) => {
    try {
        const { subject_id } = req.params;
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const chapters = await Chapter.findAndCountAll({
            where: { subject_id },
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                {
                    model: LO,
                    as: 'LOs',
                    attributes: ['lo_id', 'name'],
                    through: { attributes: [] }
                }
            ],
            order: [['chapter_id', 'ASC']]
        });

        res.status(200).json({
            success: true,
            data: {
                totalItems: chapters.count,
                totalPages: Math.ceil(chapters.count / limit),
                currentPage: parseInt(page),
                chapters: chapters.rows,
            }
        });
    } catch (error) {
        console.error('Error getting chapters by subject:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting chapters by subject',
            error: error.message
        });
    }
};

// Create new chapter
exports.createChapter = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { name, description, subject_id, lo_ids, sections } = req.body;

        if (!name || !subject_id) {
            await transaction.rollback();
            return successResponse(res, 400, "Name and subject_id are required");
        }

        // Check if subject exists
        const subject = await Subject.findByPk(subject_id, { transaction });
        if (!subject) {
            await transaction.rollback();
            return successResponse(res, 404, "Subject not found");
        }

        // Create chapter
        const chapter = await Chapter.create({
            name,
            description: (description === undefined || description === null) ? '' : description,
            subject_id
        }, { transaction });

        // Associate with LOs if provided
        if (lo_ids && Array.isArray(lo_ids) && lo_ids.length > 0) {
            const los = await LO.findAll({
                where: { lo_id: { [Op.in]: lo_ids } },
                transaction
            });

            if (los.length !== lo_ids.length) {
                await transaction.rollback();
                return successResponse(res, 400, "Some LO IDs are invalid");
            }

            await chapter.addLOs(los, { transaction });
        }

        // Create sections if provided
        if (sections && Array.isArray(sections) && sections.length > 0) {
            const sectionsData = sections.map((section, index) => ({
                title: section.name || section.title || `Section ${index+1}`,
                content: section.content || null,
                order: section.order_index || section.order || index + 1,
                chapter_id: chapter.chapter_id
            }));

            await ChapterSection.bulkCreate(sectionsData, { transaction });
        }

        // Fetch the created chapter WITHIN the transaction to avoid post-commit errors
        const createdChapter = await Chapter.findByPk(chapter.chapter_id, {
            transaction,
            include: [
                { model: Subject, as: 'Subject', attributes: ['subject_id', 'name'] },
                { model: LO, as: 'LOs', attributes: ['lo_id', 'name'], through: { attributes: [] } },
                { model: ChapterSection, as: 'Sections', attributes: ['section_id', ['title','name'], 'content', ['order','order_index']] }
            ]
        });

        await transaction.commit();

        return successResponse(res, 201, "Tạo thành công", {
            message: 'Chapter created successfully',
            chapter: createdChapter
        });

    } catch (error) {
        try {
            if (transaction && !transaction.finished) await transaction.rollback();
        } catch (rbErr) {
            console.error('Rollback skipped/failed (createChapter):', rbErr.message);
        }
        console.error('Error creating chapter:', error);
        return handleError(res, error, "Error creating chapter");
    }
};

// Update chapter
exports.updateChapter = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { name, description, subject_id, lo_ids, sections } = req.body;

        const chapter = await Chapter.findByPk(id, { transaction });
        if (!chapter) {
            await transaction.rollback();
            return successResponse(res, 404, "Chapter not found");
        }

        // Update basic info
        await chapter.update({
            name: name || chapter.name,
            description: description !== undefined ? description : chapter.description,
            subject_id: subject_id || chapter.subject_id
        }, { transaction });

        // Update LO associations if provided
        if (lo_ids && Array.isArray(lo_ids)) {
            if (lo_ids.length > 0) {
                const los = await LO.findAll({
                    where: { lo_id: { [Op.in]: lo_ids } },
                    transaction
                });

                if (los.length !== lo_ids.length) {
                    await transaction.rollback();
                    return successResponse(res, 400, "Some LO IDs are invalid");
                }

                await chapter.setLOs(los, { transaction });
            } else {
                await chapter.setLOs([], { transaction });
            }
        }

        // Update sections if provided
        if (sections && Array.isArray(sections)) {
            await ChapterSection.destroy({ where: { chapter_id: id }, transaction });

            if (sections.length > 0) {
                const sectionsData = sections.map((section, index) => ({
                    title: section.name || section.title || `Section ${index+1}`,
                    content: section.content || null,
                    order: section.order_index || section.order || index + 1,
                    chapter_id: id
                }));
                await ChapterSection.bulkCreate(sectionsData, { transaction });
            }
        }

        // Fetch updated chapter within transaction
        const updatedChapter = await Chapter.findByPk(id, {
            transaction,
            include: [
                { model: Subject, as: 'Subject', attributes: ['subject_id', 'name'] },
                { model: LO, as: 'LOs', attributes: ['lo_id', 'name'], through: { attributes: [] } },
                { model: ChapterSection, as: 'Sections', attributes: ['section_id', ['title','name'], 'content', ['order','order_index']] }
            ]
        });

        await transaction.commit();

        return successResponse(res, 200, "Thành công", {
            message: 'Chapter updated successfully',
            chapter: updatedChapter
        });

    } catch (error) {
        try {
            if (transaction && !transaction.finished) await transaction.rollback();
        } catch (rbErr) {
            console.error('Rollback skipped/failed (updateChapter):', rbErr.message);
        }
        console.error('Error updating chapter:', error);
        return handleError(res, error, "Error updating chapter");
    }
};

// Delete chapter
exports.deleteChapter = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { id } = req.params;
    // Hỗ trợ nhận force và reassign_to_chapter_id qua body hoặc query params
    const bodyForce = (req.body && typeof req.body.force !== 'undefined') ? req.body.force : undefined;
    const bodyReassign = req.body ? req.body.reassign_to_chapter_id : undefined;
    const queryForce = typeof req.query.force !== 'undefined' ? (req.query.force === 'true' || req.query.force === '1') : undefined;
    const queryReassign = req.query.reassign_to_chapter_id;
    const force = bodyForce !== undefined ? bodyForce : (queryForce !== undefined ? queryForce : false);
    const reassign_to_chapter_id = bodyReassign !== undefined ? bodyReassign : (queryReassign !== undefined ? queryReassign : undefined);

        const chapter = await Chapter.findByPk(id, { transaction });
        if (!chapter) {
            await transaction.rollback();
            return successResponse(res, 404, "Chapter not found");
        }

        // Count total questions linked through this chapter (for reporting)
        const questionCount = await Question.count({
            include: [{
                model: LO,
                as: 'LO',
                include: [{
                    model: Chapter,
                    as: 'Chapters',
                    where: { chapter_id: id },
                    through: { attributes: [] }
                }]
            }],
            transaction
        });

        // Fast path: no questions, proceed as before
        if (questionCount === 0 && !reassign_to_chapter_id) {
            await chapter.destroy({ transaction });
            await transaction.commit();
            return successResponse(res, 200, "Chapter deleted successfully", { deleted_chapter_id: Number(id), question_count: 0 });
        }

        // Reassignment path has priority over force
        if (reassign_to_chapter_id) {
            if (Number(reassign_to_chapter_id) === Number(id)) {
                await transaction.rollback();
                return successResponse(res, 400, "Invalid reassignment target", { message: 'Target chapter must be different' });
            }

            const targetChapter = await Chapter.findByPk(reassign_to_chapter_id, { transaction });
            if (!targetChapter) {
                await transaction.rollback();
                return successResponse(res, 400, "Invalid reassignment target", { message: 'Target chapter not found' });
            }
            if (targetChapter.subject_id !== chapter.subject_id) {
                await transaction.rollback();
                return successResponse(res, 400, "Invalid reassignment target", { message: 'Chapters must belong to same subject' });
            }

            // Fetch LO ids linked to the source chapter
            const chapterLinks = await ChapterLO.findAll({ where: { chapter_id: id }, attributes: ['lo_id'], transaction });
            const loIds = [...new Set(chapterLinks.map(l => l.lo_id))];

            let reassigned = 0;
            if (loIds.length > 0) {
                // Find which already linked to target
                const existingTargetLinks = await ChapterLO.findAll({ where: { chapter_id: reassign_to_chapter_id, lo_id: { [Op.in]: loIds } }, attributes: ['lo_id'], transaction });
                const existingSet = new Set(existingTargetLinks.map(r => r.lo_id));
                const newLinks = loIds.filter(loId => !existingSet.has(loId)).map(loId => ({ chapter_id: reassign_to_chapter_id, lo_id: loId }));
                if (newLinks.length > 0) {
                    await ChapterLO.bulkCreate(newLinks, { transaction });
                    reassigned = newLinks.length;
                }
            }

            await chapter.destroy({ transaction });
            await transaction.commit();
            return successResponse(res, 200, "Chapter reassigned & deleted", {
                deleted_chapter_id: Number(id),
                target_chapter_id: Number(reassign_to_chapter_id),
                reassigned_lo_count: reassigned,
                question_count: questionCount
            });
        }

        // Force deletion logic (safe force: only if every LO with questions is shared with another chapter)
        if (force) {
            // Get LO ids linked to this chapter
            const chapterLinks = await ChapterLO.findAll({ where: { chapter_id: id }, attributes: ['lo_id'], transaction });
            const loIds = [...new Set(chapterLinks.map(l => l.lo_id))];

            if (loIds.length === 0) {
                // No LOs, just delete
                await chapter.destroy({ transaction });
                await transaction.commit();
                return successResponse(res, 200, "Chapter deleted (no LOs)", { deleted_chapter_id: Number(id), question_count: questionCount });
            }

            // Load LOs with full chapter & question context
            const los = await LO.findAll({
                where: { lo_id: { [Op.in]: loIds } },
                include: [
                    { model: Chapter, as: 'Chapters', attributes: ['chapter_id'], through: { attributes: [] } },
                    { model: Question, as: 'Questions', attributes: ['question_id'] }
                ],
                transaction
            });

            const blocking = los.filter(lo => lo.Questions.length > 0 && lo.Chapters.every(c => Number(c.chapter_id) === Number(id)));
            if (blocking.length > 0) {
                await transaction.rollback();
                return successResponse(res, 400, "Hoàn tất", {
                    message: 'Cannot force delete: some LOs with questions only belong to this chapter',
                    blocking_los: blocking.map(lo => ({ lo_id: lo.lo_id, name: lo.name, question_count: lo.Questions.length })),
                    suggestion: 'Reassign these LOs to another chapter or provide reassign_to_chapter_id'
                });
            }

            await chapter.destroy({ transaction });
            await transaction.commit();
            return successResponse(res, 200, "Chapter force-deleted", { deleted_chapter_id: Number(id), question_count: questionCount });
        }

        // Default: blocked (questions exist, no reassignment or force)
        await transaction.rollback();
        return successResponse(res, 400, "Hoàn tất", {
            message: 'Cannot delete chapter with associated questions',
            question_count: questionCount,
            hint: 'Use force=true or reassign_to_chapter_id to proceed safely'
        });

    } catch (error) {
        try {
            if (transaction && !transaction.finished) await transaction.rollback();
        } catch (rbErr) {
            console.error('Rollback skipped/failed (deleteChapter):', rbErr.message);
        }
        console.error('Error deleting chapter:', error);
        return handleError(res, error, "Error deleting chapter");
    }
};

// =====================================================
// ADMIN STATISTICS AND BULK OPERATIONS
// =====================================================

// Get chapter statistics
exports.getChapterStatistics = async (req, res) => {
    try {
        const { subject_id, program_id } = req.query;

        let whereClause = {};
        if (subject_id) {
            whereClause.subject_id = subject_id;
        }

        // Get total chapters
        const totalChapters = await Chapter.count({ where: whereClause });

        // Get chapters with LOs
        const chaptersWithLOs = await Chapter.count({
            where: whereClause,
            include: [{
                model: LO,
                as: 'LOs',
                required: true,
                through: { attributes: [] }
            }]
        });

        // Get chapters with sections
        const chaptersWithSections = await Chapter.count({
            where: whereClause,
            include: [{
                model: ChapterSection,
                as: 'Sections',
                required: true
            }]
        });

        // Get LO distribution
        const chapterLOData = await Chapter.findAll({
            where: whereClause,
            include: [{
                model: LO,
                as: 'LOs',
                attributes: ['lo_id'],
                through: { attributes: [] }
            }],
            attributes: ['chapter_id', 'name']
        });

        const loDistribution = {};
        chapterLOData.forEach(chapter => {
            const loCount = chapter.LOs.length;
            loDistribution[loCount] = (loDistribution[loCount] || 0) + 1;
        });

        return successResponse(res, 200, "Thành công", {
            overview: {
                total_chapters: totalChapters,
                chapters_with_los: chaptersWithLOs,
                chapters_with_sections: chaptersWithSections,
                chapters_without_los: totalChapters - chaptersWithLOs,
                chapters_without_sections: totalChapters - chaptersWithSections
            },
            lo_distribution: loDistribution,
            generated_at: new Date()
        });

    } catch (error) {
        console.error('Error getting chapter statistics:', error);
        return handleError(res, error, "Error getting chapter statistics");
    }
};

// Bulk create chapters
exports.bulkCreateChapters = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { chapters } = req.body;

        if (!Array.isArray(chapters) || chapters.length === 0) {
            await transaction.rollback();
            return successResponse(res, 400, "Invalid chapters list");
        }

        for (const chapter of chapters) {
            if (!chapter.name || !chapter.subject_id) {
                await transaction.rollback();
                return successResponse(res, 400, "Name and subject_id are required for all chapters");
            }
        }

        const normalizedChapters = chapters.map(c => ({
            name: c.name,
            subject_id: c.subject_id,
            description: (c.description === undefined || c.description === null) ? '' : c.description
        }));
        const createdChapters = await Chapter.bulkCreate(normalizedChapters, { transaction });
        await transaction.commit();

        return successResponse(res, 201, "Tạo thành công", {
            message: `Successfully created ${createdChapters.length} chapters`,
            created_chapters: createdChapters
        });

    } catch (error) {
        try {
            if (transaction && !transaction.finished) await transaction.rollback();
        } catch (rbErr) {
            console.error('Rollback skipped/failed (bulkCreateChapters):', rbErr.message);
        }
        console.error('Error bulk creating chapters:', error);
        return handleError(res, error, "Error bulk creating chapters");
    }
};

// Bulk delete chapters
exports.bulkDeleteChapters = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { chapter_ids, force = false, reassign_to_chapter_id } = req.body;

        if (!Array.isArray(chapter_ids) || chapter_ids.length === 0) {
            await transaction.rollback();
            return successResponse(res, 400, "Invalid chapter IDs list");
        }

        // Validate reassignment target if provided
        let targetChapter = null;
        if (reassign_to_chapter_id) {
            targetChapter = await Chapter.findByPk(reassign_to_chapter_id, { transaction });
            if (!targetChapter) {
                await transaction.rollback();
                return successResponse(res, 400, "Invalid reassignment target", { message: 'Target chapter not found' });
            }
        }

        // Load chapters with LOs & Questions for analysis
        const chapters = await Chapter.findAll({
            where: { chapter_id: { [Op.in]: chapter_ids } },
            include: [{
                model: LO,
                as: 'LOs',
                include: [{ model: Question, attributes: ['question_id'] }],
                through: { attributes: [] }
            }],
            transaction
        });

        if (chapters.length === 0) {
            await transaction.rollback();
            return successResponse(res, 404, "Chapters not found");
        }

        if (reassign_to_chapter_id) {
            // Subject consistency check: all source chapters must share subject with target
            const inconsistent = chapters.filter(c => c.subject_id !== targetChapter.subject_id);
            if (inconsistent.length > 0) {
                await transaction.rollback();
                return successResponse(res, 400, "Invalid reassignment target", { message: 'All chapters must share subject with target' });
            }
            // Collect LO ids per chapter and reassign missing links
            let totalReassigned = 0;
            for (const ch of chapters) {
                const links = await ChapterLO.findAll({ where: { chapter_id: ch.chapter_id }, attributes: ['lo_id'], transaction });
                const loIds = [...new Set(links.map(l => l.lo_id))];
                if (loIds.length === 0) continue;
                const existingTargetLinks = await ChapterLO.findAll({ where: { chapter_id: reassign_to_chapter_id, lo_id: { [Op.in]: loIds } }, attributes: ['lo_id'], transaction });
                const existingSet = new Set(existingTargetLinks.map(r => r.lo_id));
                const newLinks = loIds.filter(loId => !existingSet.has(loId)).map(loId => ({ chapter_id: reassign_to_chapter_id, lo_id: loId }));
                if (newLinks.length > 0) {
                    await ChapterLO.bulkCreate(newLinks, { transaction });
                    totalReassigned += newLinks.length;
                }
            }
            const deletedCount = await Chapter.destroy({ where: { chapter_id: { [Op.in]: chapter_ids } }, transaction });
            await transaction.commit();
            return successResponse(res, 200, "Chapters reassigned & deleted", {
                deleted_count: deletedCount,
                target_chapter_id: Number(reassign_to_chapter_id),
                reassigned_lo_links: totalReassigned
            });
        }

        // If not reassignment and not force -> block if any questions exist
        if (!force) {
            const chaptersWithQuestions = chapters.filter(ch => ch.LOs.some(lo => lo.Questions.length > 0));
            if (chaptersWithQuestions.length > 0) {
                await transaction.rollback();
                return successResponse(res, 400, "Hoàn tất", {
                    message: 'Cannot delete chapters with associated questions',
                    chapters_with_questions: chaptersWithQuestions.map(ch => ({
                        chapter_id: ch.chapter_id,
                        name: ch.name,
                        question_count: ch.LOs.reduce((s, lo) => s + lo.Questions.length, 0)
                    })),
                    hint: 'Use force=true or reassign_to_chapter_id'
                });
            }
            const deletedCount = await Chapter.destroy({ where: { chapter_id: { [Op.in]: chapter_ids } }, transaction });
            await transaction.commit();
            return successResponse(res, 200, "Thành công", { deleted_count: deletedCount });
        }

        // Force (safe) path: ensure every LO with questions is shared beyond its source chapter
        // Build LO id -> set of chapter ids & question counts
        const chapterLOLinks = await ChapterLO.findAll({ where: { chapter_id: { [Op.in]: chapter_ids } }, attributes: ['chapter_id', 'lo_id'], transaction });
        const loIds = [...new Set(chapterLOLinks.map(l => l.lo_id))];
        let los = [];
        if (loIds.length > 0) {
            los = await LO.findAll({
                where: { lo_id: { [Op.in]: loIds } },
                include: [
                    { model: Chapter, as: 'Chapters', attributes: ['chapter_id'], through: { attributes: [] } },
                    { model: Question, as: 'Questions', attributes: ['question_id'] }
                ],
                transaction
            });
        }
        const chapterSet = new Set(chapter_ids.map(Number));
        const blockingLOs = los.filter(lo => lo.Questions.length > 0 && lo.Chapters.every(c => chapterSet.has(Number(c.chapter_id))));
        if (blockingLOs.length > 0) {
            await transaction.rollback();
            return successResponse(res, 400, "Hoàn tất", {
                message: 'Cannot force delete: some LOs with questions would become orphaned',
                blocking_los: blockingLOs.map(lo => ({ lo_id: lo.lo_id, name: lo.name, question_count: lo.Questions.length })),
                suggestion: 'Reassign these LOs first (reassign_to_chapter_id)'
            });
        }
        const deletedCount = await Chapter.destroy({ where: { chapter_id: { [Op.in]: chapter_ids } }, transaction });
        await transaction.commit();
        return successResponse(res, 200, "Chapters force-deleted", { deleted_count: deletedCount });

    } catch (error) {
        try {
            if (transaction && !transaction.finished) await transaction.rollback();
        } catch (rbErr) {
            console.error('Rollback skipped/failed (bulkDeleteChapters):', rbErr.message);
        }
        console.error('Error bulk deleting chapters:', error);
        return handleError(res, error, "Error bulk deleting chapters");
    }
};

// Chapter-LO Relationship Management - Admin + Teacher
exports.addLOsToChapter = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { lo_ids } = req.body;

        if (!Array.isArray(lo_ids) || lo_ids.length === 0) {
            await transaction.rollback();
            return successResponse(res, 400, "Invalid LO IDs list");
        }

        const chapter = await Chapter.findByPk(id, { transaction });
        if (!chapter) {
            await transaction.rollback();
            return successResponse(res, 404, "Chapter not found");
        }

        const los = await LO.findAll({
            where: { lo_id: { [Op.in]: lo_ids } },
            transaction
        });

        if (los.length !== lo_ids.length) {
            await transaction.rollback();
            return successResponse(res, 400, "Some LO IDs not found");
        }

        await chapter.addLOs(los, { transaction });
        await transaction.commit();

        return successResponse(res, 200, "LOs added to chapter successfully", {
            chapter_id: Number(id),
            added_lo_ids: lo_ids
        });

    } catch (error) {
        try {
            if (transaction && !transaction.finished) await transaction.rollback();
        } catch (rbErr) {
            console.error('Rollback failed (addLOsToChapter):', rbErr.message);
        }
        console.error('Error adding LOs to chapter:', error);
        return handleError(res, error, "Error adding LOs to chapter");
    }
};

exports.removeLOsFromChapter = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { lo_ids } = req.body;

        if (!Array.isArray(lo_ids) || lo_ids.length === 0) {
            await transaction.rollback();
            return successResponse(res, 400, "Invalid LO IDs list");
        }

        const chapter = await Chapter.findByPk(id, { transaction });
        if (!chapter) {
            await transaction.rollback();
            return successResponse(res, 404, "Chapter not found");
        }

        const los = await LO.findAll({
            where: { lo_id: { [Op.in]: lo_ids } },
            transaction
        });

        await chapter.removeLOs(los, { transaction });
        await transaction.commit();

        return successResponse(res, 200, "LOs removed from chapter successfully", {
            chapter_id: Number(id),
            removed_lo_ids: lo_ids
        });

    } catch (error) {
        try {
            if (transaction && !transaction.finished) await transaction.rollback();
        } catch (rbErr) {
            console.error('Rollback failed (removeLOsFromChapter):', rbErr.message);
        }
        console.error('Error removing LOs from chapter:', error);
        return handleError(res, error, "Error removing LOs from chapter");
    }
};

exports.getLOsOfChapter = async (req, res) => {
    try {
        const { id } = req.params;

        const chapter = await Chapter.findByPk(id, {
            include: [
                {
                    model: LO,
                    as: 'LOs',
                    attributes: ['lo_id', 'name', 'description'],
                    through: { attributes: [] }
                }
            ]
        });

        if (!chapter) {
            return successResponse(res, 404, "Chapter not found");
        }

        return successResponse(res, 200, "Success", {
            chapter: {
                chapter_id: chapter.chapter_id,
                name: chapter.name,
                description: chapter.description
            },
            los: chapter.LOs
        });

    } catch (error) {
        console.error('Error getting LOs of chapter:', error);
        return handleError(res, error, "Error getting LOs of chapter");
    }
};

// Chapter Section Management - Admin + Teacher
exports.addSectionsToChapter = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { sections } = req.body;

        if (!Array.isArray(sections) || sections.length === 0) {
            await transaction.rollback();
            return successResponse(res, 400, "Invalid sections list");
        }

        const chapter = await Chapter.findByPk(id, { transaction });
        if (!chapter) {
            await transaction.rollback();
            return successResponse(res, 404, "Chapter not found");
        }

        const sectionsData = sections.map((section, index) => ({
            chapter_id: Number(id),
            title: section.title || section.name || `Section ${index + 1}`,
            content: section.content || null,
            order: section.order || section.order_index || index + 1
        }));

        const createdSections = await ChapterSection.bulkCreate(sectionsData, { transaction });
        await transaction.commit();

        return successResponse(res, 201, "Sections added to chapter successfully", {
            chapter_id: Number(id),
            created_sections: createdSections
        });

    } catch (error) {
        try {
            if (transaction && !transaction.finished) await transaction.rollback();
        } catch (rbErr) {
            console.error('Rollback failed (addSectionsToChapter):', rbErr.message);
        }
        console.error('Error adding sections to chapter:', error);
        return handleError(res, error, "Error adding sections to chapter");
    }
};

exports.getSectionsOfChapter = async (req, res) => {
    try {
        const { id } = req.params;

        const chapter = await Chapter.findByPk(id, {
            include: [
                {
                    model: ChapterSection,
                    as: 'Sections',
                    attributes: ['section_id', 'title', 'content', 'order'],
                    order: [['order', 'ASC']]
                }
            ]
        });

        if (!chapter) {
            return successResponse(res, 404, "Chapter not found");
        }

        return successResponse(res, 200, "Success", {
            chapter: {
                chapter_id: chapter.chapter_id,
                name: chapter.name,
                description: chapter.description
            },
            sections: chapter.Sections
        });

    } catch (error) {
        console.error('Error getting sections of chapter:', error);
        return handleError(res, error, "Error getting sections of chapter");
    }
};

exports.updateChapterSection = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { id, sectionId } = req.params;
        const { title, content, order } = req.body;

        const section = await ChapterSection.findOne({
            where: { section_id: sectionId, chapter_id: id },
            transaction
        });

        if (!section) {
            await transaction.rollback();
            return successResponse(res, 404, "Section not found in this chapter");
        }

        await section.update({
            title: title || section.title,
            content: content !== undefined ? content : section.content,
            order: order || section.order
        }, { transaction });

        await transaction.commit();

        return successResponse(res, 200, "Section updated successfully", section);

    } catch (error) {
        try {
            if (transaction && !transaction.finished) await transaction.rollback();
        } catch (rbErr) {
            console.error('Rollback failed (updateChapterSection):', rbErr.message);
        }
        console.error('Error updating chapter section:', error);
        return handleError(res, error, "Error updating chapter section");
    }
};

exports.deleteChapterSection = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { id, sectionId } = req.params;

        const section = await ChapterSection.findOne({
            where: { section_id: sectionId, chapter_id: id },
            transaction
        });

        if (!section) {
            await transaction.rollback();
            return successResponse(res, 404, "Section not found in this chapter");
        }

        await section.destroy({ transaction });
        await transaction.commit();

        return successResponse(res, 200, "Section deleted successfully", {
            deleted_section_id: sectionId
        });

    } catch (error) {
        try {
            if (transaction && !transaction.finished) await transaction.rollback();
        } catch (rbErr) {
            console.error('Rollback failed (deleteChapterSection):', rbErr.message);
        }
        console.error('Error deleting chapter section:', error);
        return handleError(res, error, "Error deleting chapter section");
    }
};
