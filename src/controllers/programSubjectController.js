const { Program, Subject, ProgramSubject, Course, TrainingBatch, Sequelize } = require('../models');

const success = (res, data, status=200) => res.status(status).json({ success: true, data });
const fail = (res, status, message, error) => res.status(status).json({ success: false, message, ...(error?{error}: {}) });

// POST /api/programs/:programId/subjects
// Body: { subject_id? , name?, type_id?, noidung_id?, description?, order_index, recommended_semester, is_mandatory }
// If subject_id provided -> attach existing; else create new Subject then attach.
exports.addOrCreateSubjectForProgram = async (req, res) => {
  const t = await ProgramSubject.sequelize.transaction();
  try {
    const { programId } = req.params;
    const { subject_id, name, type_id, noidung_id, description, order_index, recommended_semester, is_mandatory=true } = req.body;

    const program = await Program.findByPk(programId, { transaction: t });
    if (!program) { await t.rollback(); return fail(res, 404, 'Program không tồn tại'); }

    let subject;
    if (subject_id) {
      subject = await Subject.findByPk(subject_id, { transaction: t });
      if (!subject) { await t.rollback(); return fail(res, 404, 'Subject không tồn tại'); }
    } else {
      if (!name || !type_id || !noidung_id) {
        await t.rollback();
        return fail(res, 400, 'Tạo mới môn cần name, type_id, noidung_id');
      }
      subject = await Subject.create({ name, type_id, noidung_id, description }, { transaction: t });
    }

    // Check existing mapping
    const existing = await ProgramSubject.findOne({ where: { program_id: programId, subject_id: subject.subject_id }, transaction: t });
    if (existing) {
      await t.rollback();
      return fail(res, 409, 'Môn đã thuộc chương trình');
    }

    const mapping = await ProgramSubject.create({
      program_id: programId,
      subject_id: subject.subject_id,
      order_index,
      recommended_semester,
      is_mandatory,
      is_active: true
    }, { transaction: t });

    await t.commit();
    return success(res, { mapping, subject });
  } catch (error) {
    await t.rollback();
    return fail(res, 500, 'Lỗi khi thêm môn vào chương trình', error.message);
  }
};

// GET /api/programs/:programId/subjects
exports.listProgramSubjects = async (req, res) => {
  try {
    const { programId } = req.params;
    const program = await Program.findByPk(programId);
    if (!program) return fail(res, 404, 'Program không tồn tại');

    const records = await ProgramSubject.findAll({
      where: { program_id: programId },
      include: [{ model: Subject, as: 'Subject' }],
      order: [[Sequelize.col('order_index'), 'ASC'], ['program_subject_id', 'ASC']]
    });

    // Add has_course flag - get courses through TrainingBatch relationship
    const subjectIds = records.map(r => r.subject_id);
    const trainingBatches = await TrainingBatch.findAll({
      where: { program_id: programId },
      include: [{
        model: Course,
        as: 'Courses',
        where: { subject_id: subjectIds },
        required: true
      }]
    });
    const courses = trainingBatches.flatMap(tb => tb.Courses);
    const hasCourseMap = new Set(courses.map(c => `${c.subject_id}`));

    return success(res, records.map(r => ({
      ...r.toJSON(),
      has_course: hasCourseMap.has(`${r.subject_id}`)
    })));
  } catch (error) {
    return fail(res, 500, 'Lỗi khi lấy danh sách môn của chương trình', error.message);
  }
};

// DELETE /api/programs/:programId/subjects/:subjectId (?force=true)
exports.removeSubjectFromProgram = async (req, res) => {
  const t = await ProgramSubject.sequelize.transaction();
  try {
    const { programId, subjectId } = req.params;
    const { force } = req.query;

    const mapping = await ProgramSubject.findOne({ where: { program_id: programId, subject_id: subjectId }, transaction: t });
    if (!mapping) { await t.rollback(); return fail(res, 404, 'Mapping không tồn tại'); }

    // Count courses through TrainingBatch relationship
    const trainingBatches = await TrainingBatch.findAll({
      where: { program_id: programId },
      include: [{
        model: Course,
        as: 'Courses',
        where: { subject_id: subjectId },
        required: true
      }],
      transaction: t
    });
    const courseCount = trainingBatches.reduce((count, tb) => count + tb.Courses.length, 0);
    if (courseCount > 0 && force !== 'true') {
      await t.rollback();
      return fail(res, 409, 'Đã có course thuộc (program, subject). Thêm ?force=true để xóa mapping');
    }

    await mapping.destroy({ transaction: t });
    await t.commit();
    return success(res, { message: 'Đã xóa mapping môn khỏi chương trình' });
  } catch (error) {
    await t.rollback();
    return fail(res, 500, 'Lỗi khi xóa môn khỏi chương trình', error.message);
  }
};

// PATCH /api/programs/:programId/subjects/:subjectId
// Body: { order_index?, recommended_semester?, is_mandatory?, is_active? }
exports.updateProgramSubjectMapping = async (req, res) => {
  try {
    const { programId, subjectId } = req.params;
    const { order_index, recommended_semester, is_mandatory, is_active } = req.body;

    const mapping = await ProgramSubject.findOne({ where: { program_id: programId, subject_id: subjectId } });
    if (!mapping) return fail(res, 404, 'Mapping không tồn tại');

    const updateData = {};
    if (order_index !== undefined) updateData.order_index = order_index;
    if (recommended_semester !== undefined) updateData.recommended_semester = recommended_semester;
    if (is_mandatory !== undefined) updateData.is_mandatory = is_mandatory;
    if (is_active !== undefined) updateData.is_active = is_active;

    await mapping.update(updateData);
    return success(res, mapping);
  } catch (error) {
    return fail(res, 500, 'Lỗi khi cập nhật mapping', error.message);
  }
};

// Bulk update recommended semester for subjects in program (Admin only)
exports.bulkUpdateRecommendedSemesters = async (req, res) => {
    const t = await ProgramSubject.sequelize.transaction();
    try {
        const { programId } = req.params;
        const { semesterMappings } = req.body; // Array of { subject_id, recommended_semester }

        // Validate program exists
        const program = await Program.findByPk(programId, { transaction: t });
        if (!program) {
            await t.rollback();
            return fail(res, 404, 'Program không tồn tại');
        }

        // Validate semesterMappings is array
        if (!Array.isArray(semesterMappings)) {
            await t.rollback();
            return fail(res, 400, 'semesterMappings phải là array');
        }

        const results = [];
        const errors = [];

        for (const mapping of semesterMappings) {
            const { subject_id, recommended_semester } = mapping;

            try {
                // Validate subject exists in program
                const programSubject = await ProgramSubject.findOne({
                    where: { program_id: programId, subject_id },
                    transaction: t
                });

                if (!programSubject) {
                    errors.push({
                        subject_id,
                        error: 'Subject không thuộc program này'
                    });
                    continue;
                }

                // Update recommended_semester
                await programSubject.update({
                    recommended_semester: recommended_semester
                }, { transaction: t });

                results.push({
                    subject_id,
                    recommended_semester,
                    action: 'updated'
                });

            } catch (error) {
                errors.push({
                    subject_id,
                    recommended_semester,
                    error: error.message
                });
            }
        }

        await t.commit();

        return res.status(200).json({
            success: true,
            message: `Đã cập nhật ${results.length} môn học`,
            data: {
                successful: results,
                failed: errors
            }
        });

    } catch (error) {
        await t.rollback();
        return fail(res, 500, 'Lỗi khi bulk update recommended semesters', error.message);
    }
};

// Bulk add existing subjects to program (Admin only)
exports.bulkAddSubjectsToProgram = async (req, res) => {
    const t = await ProgramSubject.sequelize.transaction();
    try {
        const { programId } = req.params;
        const { subjects } = req.body; // Array of { subject_id, order_index?, recommended_semester?, is_mandatory? }

        // Validate program exists
        const program = await Program.findByPk(programId, { transaction: t });
        if (!program) {
            await t.rollback();
            return fail(res, 404, 'Program không tồn tại');
        }

        // Validate subjects is array
        if (!Array.isArray(subjects)) {
            await t.rollback();
            return fail(res, 400, 'subjects phải là array');
        }

        const results = [];
        const errors = [];

        for (const subjectData of subjects) {
            const { subject_id, order_index, recommended_semester, is_mandatory = true } = subjectData;

            try {
                // Validate subject exists
                const subject = await Subject.findByPk(subject_id, { transaction: t });
                if (!subject) {
                    errors.push({
                        subject_id,
                        error: 'Subject không tồn tại'
                    });
                    continue;
                }

                // Check if mapping already exists
                const existing = await ProgramSubject.findOne({
                    where: { program_id: programId, subject_id },
                    transaction: t
                });

                if (existing) {
                    errors.push({
                        subject_id,
                        error: 'Subject đã thuộc program này'
                    });
                    continue;
                }

                // Create new mapping
                const mapping = await ProgramSubject.create({
                    program_id: programId,
                    subject_id,
                    order_index,
                    recommended_semester,
                    is_mandatory,
                    is_active: true
                }, { transaction: t });

                results.push({
                    subject_id,
                    mapping_id: mapping.program_subject_id,
                    action: 'created'
                });

            } catch (error) {
                errors.push({
                    subject_id,
                    error: error.message
                });
            }
        }

        await t.commit();

        return res.status(200).json({
            success: true,
            message: `Đã thêm ${results.length} môn học vào chương trình`,
            data: {
                successful: results,
                failed: errors
            }
        });

    } catch (error) {
        await t.rollback();
        return fail(res, 500, 'Lỗi khi bulk add subjects to program', error.message);
    }
};
