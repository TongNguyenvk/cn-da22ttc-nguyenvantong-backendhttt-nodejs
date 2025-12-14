const { Subject, Course, Quiz, TypeSubject, TypeOfKnowledge, PLO, TienQuyet, Chapter, LO, ChapterSection, SubjectPLO } = require('../models');

exports.getAllSubjects = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        // Tách riêng count và data để tránh sai count do includes
        const totalCount = await Subject.count();
        
        const subjects = await Subject.findAll({
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                { model: Course, as: 'Courses', attributes: ['course_id', 'name'] },
                { model: TypeSubject, attributes: ['type_id', 'description'] },
                { model: TypeOfKnowledge, attributes: ['noidung_id', 'description'] },
                { 
                    model: PLO, 
                    as: 'PLOs',
                    attributes: ['plo_id', 'name', 'description'],
                    through: { attributes: [] } // Ẩn thông tin bảng junction
                },
                { model: Subject, as: 'PrerequisiteSubjects', attributes: ['subject_id', 'name'] },
                {
                    model: Chapter,
                    as: 'Chapters',
                    attributes: ['chapter_id', 'name', 'description'],
                    include: [
                        {
                            model: LO,
                            as: 'LOs',
                            attributes: ['lo_id', 'name', 'description']
                        }
                    ]
                },
            ],
        });

        res.status(200).json({
            success: true,
            data: {
                totalItems: totalCount,
                totalPages: Math.ceil(totalCount / limit),
                currentPage: parseInt(page),
                subjects: subjects,
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách Subject',
            error: error.message
        });
    }
};

exports.getSubjectById = async (req, res) => {
    try {
        const subject = await Subject.findByPk(req.params.id, {
            include: [
                { 
                    model: Course, 
                    as: 'Courses', 
                    attributes: ['course_id', 'name', 'description'],
                    include: [{
                        model: Quiz,
                        as: 'Quizzes',
                        attributes: ['quiz_id', 'name', 'status']
                    }]
                },
                { model: TypeSubject, attributes: ['type_id', 'description'] },
                { model: TypeOfKnowledge, attributes: ['noidung_id', 'description'] },
                { 
                    model: PLO, 
                    as: 'PLOs',
                    attributes: ['plo_id', 'name', 'description'],
                    through: { attributes: [] } // Ẩn thông tin bảng junction
                }
            ],
        });

        if (!subject) {
            return res.status(404).json({
                success: false,
                message: 'Subject không tồn tại'
            });
        }

        res.status(200).json({
            success: true,
            data: subject
        });
    } catch (error) {
        console.error('Error in getSubjectById:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin Subject',
            error: error.message
        });
    }
};

exports.createSubject = async (req, res) => {
    try {
        const { type_id, noidung_id, name, description, created_at, plo_ids } = req.body;

        // Cập nhật validation - bây giờ plo_ids là array
        if (!type_id || !noidung_id || !name || !plo_ids || !Array.isArray(plo_ids) || plo_ids.length === 0) {
            return res.status(400).json({ 
                message: 'Thiếu các trường bắt buộc: type_id, noidung_id, name, plo_ids (array)' 
            });
        }

        // Validate type_id và noidung_id
        const typeSubject = await TypeSubject.findByPk(type_id);
        const typeOfKnowledge = await TypeOfKnowledge.findByPk(noidung_id);

        if (!typeSubject) return res.status(400).json({ message: 'TypeSubject không tồn tại' });
        if (!typeOfKnowledge) return res.status(400).json({ message: 'TypeOfKnowledge không tồn tại' });

        // Validate tất cả PLO IDs
        const plos = await PLO.findAll({
            where: {
                plo_id: plo_ids
            }
        });

        if (plos.length !== plo_ids.length) {
            return res.status(400).json({ message: 'Một hoặc nhiều PLO không tồn tại' });
        }

        // Tạo Subject mới (không có plo_id nữa)
        const newSubject = await Subject.create({
            type_id,
            noidung_id,
            name,
            description,
            created_at,
        });

        // Thêm quan hệ với PLOs vào bảng junction
        await newSubject.setPLOs(plo_ids);

        // Lấy subject với PLOs để trả về
        const subjectWithPLOs = await Subject.findByPk(newSubject.subject_id, {
            include: [
                { 
                    model: PLO, 
                    as: 'PLOs',
                    attributes: ['plo_id', 'name', 'description'],
                    through: { attributes: [] }
                }
            ]
        });

        res.status(201).json({
            success: true,
            data: subjectWithPLOs,
            message: 'Subject created successfully'
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi tạo Subject', error: error.message });
    }
};

exports.updateSubject = async (req, res) => {
    try {
        const { type_id, noidung_id, name, description, created_at, plo_ids } = req.body;
        const subject = await Subject.findByPk(req.params.id);

        if (!subject) {
            return res.status(404).json({ message: 'Subject không tồn tại' });
        }

        // Validate nếu có thay đổi
        if (type_id) {
            const typeSubject = await TypeSubject.findByPk(type_id);
            if (!typeSubject) return res.status(400).json({ message: 'TypeSubject không tồn tại' });
        }
        if (noidung_id) {
            const typeOfKnowledge = await TypeOfKnowledge.findByPk(noidung_id);
            if (!typeOfKnowledge) return res.status(400).json({ message: 'TypeOfKnowledge không tồn tại' });
        }
        if (plo_ids && Array.isArray(plo_ids)) {
            const plos = await PLO.findAll({
                where: {
                    plo_id: plo_ids
                }
            });
            if (plos.length !== plo_ids.length) {
                return res.status(400).json({ message: 'Một hoặc nhiều PLO không tồn tại' });
            }
        }

        // Cập nhật thông tin Subject
        await subject.update({
            type_id: type_id || subject.type_id,
            noidung_id: noidung_id || subject.noidung_id,
            name: name || subject.name,
            description: description || subject.description,
            created_at: created_at || subject.created_at,
        });

        // Cập nhật quan hệ PLOs nếu có
        if (plo_ids && Array.isArray(plo_ids)) {
            await subject.setPLOs(plo_ids);
        }

        // Lấy subject đã update với PLOs
        const updatedSubject = await Subject.findByPk(subject.subject_id, {
            include: [
                { 
                    model: PLO, 
                    as: 'PLOs',
                    attributes: ['plo_id', 'name', 'description'],
                    through: { attributes: [] }
                }
            ]
        });

        res.status(200).json({
            success: true,
            data: updatedSubject,
            message: 'Subject updated successfully'
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi cập nhật Subject', error: error.message });
    }
};

exports.deleteSubject = async (req, res) => {
    try {
        const subject = await Subject.findByPk(req.params.id);

        if (!subject) {
            return res.status(404).json({ message: 'Subject không tồn tại' });
        }

        // Xóa quan hệ với PLOs trước (cascade sẽ tự động xử lý)
        await subject.destroy();

        res.status(200).json({
            success: true,
            message: 'Subject đã được xóa thành công'
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi xóa Subject', error: error.message });
    }
};

// Thêm methods mới để quản lý quan hệ PLO-Subject

exports.addPLOsToSubject = async (req, res) => {
    try {
        const { subject_id } = req.params;
        const { plo_ids } = req.body;

        if (!Array.isArray(plo_ids) || plo_ids.length === 0) {
            return res.status(400).json({ message: 'plo_ids phải là array và không được rỗng' });
        }

        const subject = await Subject.findByPk(subject_id);
        if (!subject) {
            return res.status(404).json({ message: 'Subject không tồn tại' });
        }

        // Validate PLOs
        const plos = await PLO.findAll({
            where: { plo_id: plo_ids }
        });

        if (plos.length !== plo_ids.length) {
            return res.status(400).json({ message: 'Một hoặc nhiều PLO không tồn tại' });
        }

        // Thêm PLOs vào Subject (sẽ không duplicate do unique constraint)
        await subject.addPLOs(plo_ids);

        res.status(200).json({
            success: true,
            message: 'PLOs đã được thêm vào Subject thành công'
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi thêm PLOs vào Subject', error: error.message });
    }
};

exports.removePLOsFromSubject = async (req, res) => {
    try {
        const { subject_id } = req.params;
        const { plo_ids } = req.body;

        if (!Array.isArray(plo_ids) || plo_ids.length === 0) {
            return res.status(400).json({ message: 'plo_ids phải là array và không được rỗng' });
        }

        const subject = await Subject.findByPk(subject_id);
        if (!subject) {
            return res.status(404).json({ message: 'Subject không tồn tại' });
        }

        // Xóa quan hệ với PLOs
        await subject.removePLOs(plo_ids);

        res.status(200).json({
            success: true,
            message: 'PLOs đã được xóa khỏi Subject thành công'
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi xóa PLOs khỏi Subject', error: error.message });
    }
};

exports.getSubjectPLOs = async (req, res) => {
    try {
        const { subject_id } = req.params;

        const subject = await Subject.findByPk(subject_id, {
            include: [
                { 
                    model: PLO, 
                    as: 'PLOs',
                    attributes: ['plo_id', 'name', 'description'],
                    through: { attributes: [] }
                }
            ]
        });

        if (!subject) {
            return res.status(404).json({ message: 'Subject không tồn tại' });
        }

        res.status(200).json({
            success: true,
            data: {
                subject_id: subject.subject_id,
                subject_name: subject.name,
                plos: subject.PLOs
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi lấy danh sách PLOs của Subject', error: error.message });
    }
};

// Phần còn lại của controller giữ nguyên...
// (Các methods khác như getSubjectQuizzes, getQuizzesBySubjectId, etc.)

// Override deleteSubject với logic tốt hơn
exports.deleteSubject = async (req, res) => {
    const { sequelize } = require('../models');
    const transaction = await sequelize.transaction();
    
    try {
        const subjectId = req.params.id;
        const subject = await Subject.findByPk(subjectId);
        
        if (!subject) {
            await transaction.rollback();
            return res.status(404).json({ 
                success: false,
                message: 'Subject không tồn tại' 
            });
        }

        // Kiểm tra xem Subject có đang được sử dụng không
        const { Course, Chapter, LO, ProgramSubject } = require('../models');
        
        // 1. Kiểm tra courses sử dụng subject này
        const coursesCount = await Course.count({
            where: { subject_id: subjectId },
            transaction
        });

        if (coursesCount > 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `Không thể xóa Subject vì còn ${coursesCount} course(s) đang sử dụng. Vui lòng xóa các course trước.`
            });
        }

        // 2. Kiểm tra chapters thuộc subject này
        const chaptersCount = await Chapter.count({
            where: { subject_id: subjectId },
            transaction
        });

        if (chaptersCount > 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `Không thể xóa Subject vì còn ${chaptersCount} chapter(s) thuộc subject này. Vui lòng xóa các chapter trước.`
            });
        }

        // 3. Kiểm tra Learning Outcomes
        const losCount = await LO.count({
            where: { subject_id: subjectId },
            transaction
        });

        if (losCount > 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `Không thể xóa Subject vì còn ${losCount} Learning Outcome(s). Vui lòng xóa các LO trước.`
            });
        }

        // 4. Kiểm tra Program Subjects (môn trong chương trình đào tạo)
        const programSubjectsCount = await ProgramSubject.count({
            where: { subject_id: subjectId },
            transaction
        });

        if (programSubjectsCount > 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `Không thể xóa Subject vì còn ${programSubjectsCount} chương trình đào tạo đang sử dụng. Vui lòng gỡ bỏ subject khỏi các chương trình trước.`
            });
        }

        // 5. Kiểm tra SubjectPLOs (quan hệ với PLO)
        const subjectPLOsCount = await SubjectPLO.count({
            where: { subject_id: subjectId },
            transaction
        });

        if (subjectPLOsCount > 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `Không thể xóa Subject vì còn ${subjectPLOsCount} PLO mapping(s). Vui lòng gỡ bỏ các PLO khỏi subject trước.`
            });
        }

        // Nếu pass hết tất cả kiểm tra → Xóa subject
        await subject.destroy({ transaction });
        await transaction.commit();
        
        res.status(200).json({ 
            success: true,
            message: 'Xóa Subject thành công' 
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error deleting subject:', error);
        res.status(500).json({ 
            success: false,
            message: 'Lỗi khi xóa Subject', 
            error: error.message 
        });
    }
};

// Lấy subject theo course - cập nhật để sử dụng quan hệ mới
exports.getSubjectsByCourse = async (req, res) => {
    try {
        const { course_id } = req.params;

        const course = await Course.findByPk(course_id, {
            include: [{
                model: Subject,
                as: 'Subject',
                include: [
                    { model: TypeSubject, attributes: ['type_id', 'description'] },
                    { model: TypeOfKnowledge, attributes: ['noidung_id', 'description'] },
                    { 
                        model: PLO, 
                        as: 'PLOs',
                        attributes: ['plo_id', 'name', 'description'],
                        through: { attributes: [] }
                    },
                    {
                        model: Chapter,
                        as: 'Chapters',
                        attributes: ['chapter_id', 'name', 'description'],
                        include: [
                            {
                                model: LO,
                                as: 'LOs',
                                attributes: ['lo_id', 'name', 'description']
                            }
                        ]
                    },
                ]
            }]
        });

        if (!course) {
            return res.status(404).json({ 
                success: false,
                message: 'Khóa học không tồn tại' 
            });
        }

        if (!course.Subject) {
            return res.status(404).json({ 
                success: false,
                message: 'Khóa học này chưa được gán vào subject nào' 
            });
        }

        res.status(200).json({
            success: true,
            data: {
                course: {
                    course_id: course.course_id,
                    name: course.name,
                    description: course.description
                },
                subjects: [course.Subject],
                total_subjects: 1,
                primary_subject: course.Subject
            }
        });
    } catch (error) {
        console.error('Error in getSubjectsByCourse:', error);
        res.status(500).json({ 
            success: false,
            message: 'Lỗi khi lấy thông tin subject theo course', 
            error: error.message 
        });
    }
};

// Lấy danh sách chapters theo subject
exports.getChaptersBySubject = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const subject = await Subject.findByPk(id);
        if (!subject) {
            return res.status(404).json({ message: 'Subject không tồn tại' });
        }

        const chapters = await Chapter.findAndCountAll({
            where: { subject_id: id },
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                {
                    model: LO,
                    as: 'LOs',
                    attributes: ['lo_id', 'name', 'description'],
                    through: { attributes: [] }
                },
                {
                    model: ChapterSection,
                    as: 'Sections',
                    attributes: ['section_id', 'title', 'content']
                }
            ],
            order: [['chapter_id', 'ASC']]
        });

        res.status(200).json({
            subject: {
                subject_id: subject.subject_id,
                name: subject.name,
                description: subject.description
            },
            totalItems: chapters.count,
            totalPages: Math.ceil(chapters.count / limit),
            currentPage: parseInt(page),
            chapters: chapters.rows,
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi lấy danh sách chapters theo subject', error: error.message });
    }
};
