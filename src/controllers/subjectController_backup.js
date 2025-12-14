const { Subject, Course, Quiz, TypeSubject, TypeOfKnowledge, PLO, TienQuyet, Chapter, LO, ChapterSection } = require('../models');

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
                { model: PLO, attributes: ['plo_id', 'description'] },
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
                { model: PLO, attributes: ['plo_id', 'description'] }
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
        const { type_id, noidung_id, name, description, created_at, plo_id } = req.body;

        // Remove course_id requirement - Subject không có direct course relationship
        if (!type_id || !noidung_id || !name || !plo_id) {
            return res.status(400).json({ message: 'Thiếu các trường bắt buộc: type_id, noidung_id, name, plo_id' });
        }

        const typeSubject = await TypeSubject.findByPk(type_id);
        const typeOfKnowledge = await TypeOfKnowledge.findByPk(noidung_id);
        const plo = await PLO.findByPk(plo_id);

        if (!typeSubject) return res.status(400).json({ message: 'TypeSubject không tồn tại' });
        if (!typeOfKnowledge) return res.status(400).json({ message: 'TypeOfKnowledge không tồn tại' });
        if (!plo) return res.status(400).json({ message: 'PLO không tồn tại' });

        const newSubject = await Subject.create({
            type_id,
            noidung_id,
            name,
            description,
            created_at,
            plo_id,
        });

        res.status(201).json({
            success: true,
            data: newSubject,
            message: 'Subject created successfully'
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi tạo Subject', error: error.message });
    }
};

exports.updateSubject = async (req, res) => {
    try {
        const { type_id, noidung_id, name, description, created_at, plo_id } = req.body;

        const subject = await Subject.findByPk(req.params.id);
        if (!subject) return res.status(404).json({ message: 'Subject không tồn tại' });

        // Validate foreign keys if provided
        if (type_id) {
            const typeSubject = await TypeSubject.findByPk(type_id);
            if (!typeSubject) return res.status(400).json({ message: 'TypeSubject không tồn tại' });
        }
        if (noidung_id) {
            const typeOfKnowledge = await TypeOfKnowledge.findByPk(noidung_id);
            if (!typeOfKnowledge) return res.status(400).json({ message: 'TypeOfKnowledge không tồn tại' });
        }
        if (plo_id) {
            const plo = await PLO.findByPk(plo_id);
            if (!plo) return res.status(400).json({ message: 'PLO không tồn tại' });
        }

        await subject.update({
            type_id: type_id || subject.type_id,
            noidung_id: noidung_id || subject.noidung_id,
            name: name || subject.name,
            description: description || subject.description,
            created_at: created_at || subject.created_at,
            plo_id: plo_id || subject.plo_id,
        });

        res.status(200).json({
            success: true,
            data: subject,
            message: 'Subject updated successfully'
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi cập nhật Subject', error: error.message });
    }
};

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
        const { Course, Chapter, LO, Question } = require('../models');
        
        // Kiểm tra courses sử dụng subject này
        const coursesCount = await Course.count({
            where: { subject_id: subjectId },
            transaction
        });

        if (coursesCount > 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `Không thể xóa Subject vì còn ${coursesCount} course(s) đang sử dụng`
            });
        }

        // Kiểm tra chapters thuộc subject này
        const chaptersCount = await Chapter.count({
            where: { subject_id: subjectId },
            transaction
        });

        if (chaptersCount > 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `Không thể xóa Subject vì còn ${chaptersCount} chapter(s) thuộc subject này`
            });
        }

        // Xóa subject
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

// Lấy subject theo course - sử dụng quan hệ 1:Many đơn giản
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
                    { model: PLO, attributes: ['plo_id', 'description'] },
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