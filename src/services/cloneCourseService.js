const {
  Course,
  Quiz,
  Question,
  QuizQuestion,
  User,
  Subject,
  Semester,
  TeacherSubjectAssignment,
} = require("../models");
const { Op } = require("sequelize");

class CloneCourseService {
  /**
   * Clone course với tất cả quizzes và questions
   * @param {number} originalCourseId - ID của course gốc
   * @param {object} newCourseData - Dữ liệu cho course mới
   * @param {number} teacherId - ID của teacher tạo course mới
   * @returns {object} Course đã được clone
   */
  async cloneCourse(originalCourseId, newCourseData, teacherId) {
    const transaction = await Course.sequelize.transaction();

    try {
      // 1. Lấy course gốc với tất cả dữ liệu liên quan
      const originalCourse = await Course.findByPk(originalCourseId, {
        include: [
          {
            model: Quiz,
            as: "Quizzes",
            include: [
              {
                model: Question,
                through: QuizQuestion,
                include: [{ model: require("../models").Answer }],
              },
            ],
          },
          { model: Subject, as: "Subject" },
          { model: Semester, as: "Semester" },
        ],
        transaction,
      });

      if (!originalCourse) {
        throw new Error("Course gốc không tồn tại");
      }

      // 2. Kiểm tra quyền clone
      const canClone =
        originalCourse.is_template || originalCourse.user_id === teacherId;
      if (!canClone) {
        throw new Error("Bạn không có quyền clone course này");
      }

      // 3. Tạo course mới
      const clonedCourse = await Course.create(
        {
          name: newCourseData.name,
          description:
            newCourseData.description || `Clone của: ${originalCourse.name}`,
          user_id: teacherId,
          subject_id: newCourseData.subject_id || originalCourse.subject_id,
          semester_id: newCourseData.semester_id,
          program_id: newCourseData.program_id || originalCourse.program_id,
          assignment_id: newCourseData.assignment_id || null,
          original_course_id: originalCourseId,
          grade_config: originalCourse.grade_config,
          is_template: false, // Course clone không phải template
        },
        { transaction }
      );

      // 4. Clone tất cả quizzes
      const quizMapping = new Map(); // Map quiz gốc -> quiz clone

      for (const originalQuiz of originalCourse.Quizzes) {
        const clonedQuiz = await Quiz.create(
          {
            name: originalQuiz.name,
            description: originalQuiz.description,
            course_id: clonedCourse.course_id,
            time_limit: originalQuiz.time_limit,
            max_attempts: originalQuiz.max_attempts,
            is_random: originalQuiz.is_random,
            show_results: originalQuiz.show_results,
            start_time: originalQuiz.start_time,
            end_time: originalQuiz.end_time,
            quiz_mode: originalQuiz.quiz_mode || "normal",
            is_active: false, // Quiz clone bắt đầu ở trạng thái inactive
          },
          { transaction }
        );

        quizMapping.set(originalQuiz.quiz_id, clonedQuiz.quiz_id);

        // 5. Clone quiz-question relationships
        const quizQuestions = await QuizQuestion.findAll({
          where: { quiz_id: originalQuiz.quiz_id },
          transaction,
        });

        for (const quizQuestion of quizQuestions) {
          await QuizQuestion.create(
            {
              quiz_id: clonedQuiz.quiz_id,
              question_id: quizQuestion.question_id,
              order_index: quizQuestion.order_index,
              points: quizQuestion.points,
            },
            { transaction }
          );
        }
      }

      await transaction.commit();

      // 6. Lấy course đã clone với đầy đủ thông tin
      const result = await Course.findByPk(clonedCourse.course_id, {
        include: [
          { model: User, as: "Teacher", attributes: ["user_id", "name"] },
          { model: Subject, as: "Subject", attributes: ["subject_id", "name"] },
          {
            model: Semester,
            as: "Semester",
            attributes: ["semester_id", "name"],
          },
          {
            model: Course,
            as: "OriginalCourse",
            attributes: ["course_id", "name"],
          },
          {
            model: Quiz,
            as: "Quizzes",
            attributes: ["quiz_id", "name", "description", "is_active"],
          },
        ],
      });

      return {
        cloned_course: result,
        cloning_summary: {
          original_course_id: originalCourseId,
          original_course_name: originalCourse.name,
          cloned_quizzes: quizMapping.size,
          total_questions: originalCourse.Quizzes.reduce(
            (sum, quiz) => sum + quiz.Questions.length,
            0
          ),
        },
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Lấy danh sách courses có thể clone
   * @param {number} teacherId - ID của teacher
   * @param {object} filters - Bộ lọc
   * @returns {array} Danh sách courses có thể clone
   */
  async getClonableCourses(teacherId, filters = {}) {
    const where = {
      [Op.or]: [{ is_template: true }, { user_id: teacherId }],
    };

    // Apply filters
    if (filters.subject_id) {
      where.subject_id = filters.subject_id;
    }

    if (filters.semester_id) {
      where.semester_id = filters.semester_id;
    }

    if (filters.search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${filters.search}%` } },
        { description: { [Op.iLike]: `%${filters.search}%` } },
      ];
    }

    const courses = await Course.findAll({
      where,
      include: [
        { model: User, as: "Teacher", attributes: ["user_id", "name"] },
        { model: Subject, as: "Subject", attributes: ["subject_id", "name"] },
        {
          model: Semester,
          as: "Semester",
          attributes: ["semester_id", "name"],
        },
        {
          model: Quiz,
          as: "Quizzes",
          attributes: ["quiz_id", "name"],
          include: [
            {
              model: Question,
              attributes: ["question_id"],
              through: { attributes: [] },
            },
          ],
        },
      ],
      order: [["course_id", "DESC"]],
    });

    return courses.map((course) => ({
      ...course.toJSON(),
      quiz_count: course.Quizzes.length,
      question_count: course.Quizzes.reduce(
        (sum, quiz) => sum + quiz.Questions.length,
        0
      ),
      can_clone: course.is_template || course.user_id === teacherId,
      clone_type: course.is_template ? "template" : "own",
    }));
  }

  /**
   * Tạo course từ assignment và có thể clone từ course khác
   * @param {number} assignmentId - ID của assignment
   * @param {object} courseData - Dữ liệu course
   * @param {number} teacherId - ID của teacher
   * @param {number} cloneFromCourseId - ID của course để clone (optional)
   */
  async createCourseFromAssignment(
    assignmentId,
    courseData,
    teacherId,
    cloneFromCourseId = null
  ) {
    const transaction = await Course.sequelize.transaction();

    try {
      // 1. Validate assignment
      const assignment = await TeacherSubjectAssignment.findByPk(assignmentId, {
        include: [
          { model: Subject, as: "Subject" },
          { model: Semester, as: "Semester" },
        ],
        transaction,
      });

      if (!assignment) {
        throw new Error("Phân công không tồn tại");
      }

      if (assignment.teacher_id !== teacherId) {
        throw new Error("Bạn không có quyền tạo course từ phân công này");
      }

      if (!assignment.is_active) {
        throw new Error("Phân công không còn hoạt động");
      }

      // 2. Prepare course data from assignment
      const newCourseData = {
        ...courseData, // Sao chép tất cả các trường từ courseData (bao gồm name, description, batch_id, program_id)
        user_id: teacherId,
        subject_id: assignment.subject_id,
        semester_id: assignment.semester_id,
        assignment_id: assignmentId,
        // program_id đã có sẵn trong courseData nên không cần thêm lại
      };

      let result;

      // 3. Clone from existing course if specified
      if (cloneFromCourseId) {
        await transaction.commit(); // Commit transaction trước khi gọi cloneCourse
        result = await this.cloneCourse(
          cloneFromCourseId,
          newCourseData,
          teacherId
        );
      } else {
        // 4. Create new course without cloning
        const course = await Course.create(newCourseData, { transaction });
        await transaction.commit();

        result = {
          cloned_course: await Course.findByPk(course.course_id, {
            include: [
              { model: User, as: "Teacher", attributes: ["user_id", "name"] },
              {
                model: Subject,
                as: "Subject",
                attributes: ["subject_id", "name"],
              },
              {
                model: Semester,
                as: "Semester",
                attributes: ["semester_id", "name"],
              },
              { model: TeacherSubjectAssignment, as: "Assignment" },
            ],
          }),
          cloning_summary: {
            created_from_assignment: true,
            assignment_id: assignmentId,
          },
        };
      }

      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Đánh dấu course có thể được dùng làm template
   * @param {number} courseId - ID của course
   * @param {number} teacherId - ID của teacher
   * @param {boolean} isTemplate - Trạng thái template
   */
  async setAsTemplate(courseId, teacherId, isTemplate = true) {
    const course = await Course.findByPk(courseId);

    if (!course) {
      throw new Error("Course không tồn tại");
    }

    if (course.user_id !== teacherId) {
      throw new Error("Bạn không có quyền thay đổi course này");
    }

    await course.update({ is_template: isTemplate });

    return course;
  }

  /**
   * Lấy thống kê clone
   * @param {number} courseId - ID của course gốc
   */
  async getCloneStatistics(courseId) {
    const course = await Course.findByPk(courseId);
    if (!course) {
      throw new Error("Course không tồn tại");
    }

    const cloneCount = await Course.count({
      where: { original_course_id: courseId },
    });

    const clones = await Course.findAll({
      where: { original_course_id: courseId },
      include: [
        { model: User, as: "Teacher", attributes: ["user_id", "name"] },
        {
          model: Semester,
          as: "Semester",
          attributes: ["semester_id", "name"],
        },
      ],
      order: [["course_id", "DESC"]],
    });

    return {
      original_course: {
        course_id: course.course_id,
        name: course.name,
        is_template: course.is_template,
      },
      clone_count: cloneCount,
      clones: clones.map((clone) => ({
        course_id: clone.course_id,
        name: clone.name,
        teacher_name: clone.Teacher?.name,
        semester_name: clone.Semester?.name,
        course_id_created: clone.course_id,
      })),
    };
  }

  // Gán khóa học đã có vào phân công
  async assignCourseToAssignment(assignmentId, courseId, userId, userRole) {
    const transaction = await Course.sequelize.transaction();

    try {
      // 1. Validate assignment
      const assignment = await TeacherSubjectAssignment.findByPk(assignmentId, {
        include: [
          { model: User, as: "Teacher", attributes: ["user_id", "name"] },
          { model: Subject, as: "Subject", attributes: ["subject_id", "name"] },
          {
            model: Semester,
            as: "Semester",
            attributes: ["semester_id", "name"],
          },
        ],
        transaction,
      });

      if (!assignment) {
        throw new Error("Phân công không tồn tại");
      }

      // 2. Check permissions
      if (userRole !== "admin" && assignment.teacher_id !== userId) {
        throw new Error("Bạn không có quyền gán khóa học vào phân công này");
      }

      if (!assignment.is_active) {
        throw new Error("Phân công không còn hoạt động");
      }

      // 3. Validate course
      const course = await Course.findByPk(courseId, {
        include: [
          { model: User, as: "Teacher", attributes: ["user_id", "name"] },
          { model: Subject, as: "Subject", attributes: ["subject_id", "name"] },
          {
            model: Semester,
            as: "Semester",
            attributes: ["semester_id", "name"],
          },
        ],
        transaction,
      });

      if (!course) {
        throw new Error("Khóa học không tồn tại");
      }

      // 4. Check if course is compatible with assignment
      if (course.subject_id !== assignment.subject_id) {
        throw new Error(
          `Khóa học thuộc môn "${course.Subject?.name}" không khớp với phân công môn "${assignment.Subject?.name}"`
        );
      }

      // 5. Check if course already assigned to this assignment
      if (course.assignment_id === parseInt(assignmentId)) {
        throw new Error("Khóa học đã được gán vào phân công này");
      }

      // 6. Update course to link with assignment
      await course.update(
        {
          assignment_id: assignmentId,
          semester_id: assignment.semester_id, // Update semester if needed
          user_id: assignment.teacher_id, // Update teacher if needed
        },
        { transaction }
      );

      await transaction.commit();

      // 7. Return updated course with full details
      const updatedCourse = await Course.findByPk(courseId, {
        include: [
          { model: User, as: "Teacher", attributes: ["user_id", "name"] },
          { model: Subject, as: "Subject", attributes: ["subject_id", "name"] },
          {
            model: Semester,
            as: "Semester",
            attributes: ["semester_id", "name"],
          },
          {
            model: TeacherSubjectAssignment,
            as: "Assignment",
            include: [
              { model: User, as: "Teacher", attributes: ["user_id", "name"] },
              {
                model: Subject,
                as: "Subject",
                attributes: ["subject_id", "name"],
              },
            ],
          },
        ],
      });

      return {
        course: updatedCourse,
        assignment: assignment,
        message: `Đã gán khóa học "${course.name}" vào phân công "${assignment.Subject?.name}" cho giáo viên "${assignment.Teacher?.name}"`,
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

module.exports = new CloneCourseService();
