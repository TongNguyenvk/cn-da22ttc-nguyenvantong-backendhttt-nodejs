-- =============================================
-- Script tạo các bảng mới cho hệ thống quản lý học kỳ và phân công giáo viên
-- Date: 2025-08-30
-- =============================================

-- 1. Tạo bảng Semesters (Học kỳ)
CREATE TABLE IF NOT EXISTS "Semesters" (
    "semester_id" SERIAL PRIMARY KEY,
    "name" VARCHAR(100) NOT NULL,
    "academic_year" VARCHAR(20) NOT NULL,
    "semester_number" INTEGER NOT NULL CHECK ("semester_number" IN (1, 2, 3)),
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_active" BOOLEAN DEFAULT FALSE,
    "description" TEXT,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tạo indexes cho bảng Semesters
CREATE INDEX IF NOT EXISTS "idx_semesters_academic_year" ON "Semesters" ("academic_year");
CREATE INDEX IF NOT EXISTS "idx_semesters_is_active" ON "Semesters" ("is_active");
CREATE INDEX IF NOT EXISTS "idx_semesters_dates" ON "Semesters" ("start_date", "end_date");

-- Tạo unique constraint để đảm bảo chỉ có 1 học kỳ active
CREATE UNIQUE INDEX IF NOT EXISTS "unique_active_semester" ON "Semesters" ("is_active") 
WHERE "is_active" = true;

-- Thêm constraint kiểm tra ngày
ALTER TABLE "Semesters" 
ADD CONSTRAINT "check_semester_dates" 
CHECK ("start_date" < "end_date");

-- Thêm comment cho bảng và columns
COMMENT ON TABLE "Semesters" IS 'Bảng quản lý học kỳ';
COMMENT ON COLUMN "Semesters"."name" IS 'Tên học kỳ: HK1 2024-2025, HK2 2024-2025';
COMMENT ON COLUMN "Semesters"."academic_year" IS 'Năm học: 2024-2025';
COMMENT ON COLUMN "Semesters"."semester_number" IS 'Học kỳ trong năm: 1, 2, 3 (hè)';
COMMENT ON COLUMN "Semesters"."is_active" IS 'Học kỳ hiện tại đang hoạt động';

-- =============================================

-- 2. Tạo bảng TeacherSubjectAssignments (Phân công giáo viên)
CREATE TABLE IF NOT EXISTS "TeacherSubjectAssignments" (
    "assignment_id" SERIAL PRIMARY KEY,
    "teacher_id" INTEGER NOT NULL,
    "subject_id" INTEGER NOT NULL,
    "semester_id" INTEGER NOT NULL,
    "assigned_by" INTEGER NOT NULL,
    "assigned_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "is_active" BOOLEAN DEFAULT TRUE,
    "note" TEXT,
    "workload_hours" INTEGER DEFAULT NULL CHECK ("workload_hours" IS NULL OR ("workload_hours" >= 0 AND "workload_hours" <= 1000)),
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Foreign keys
    CONSTRAINT "fk_teacher_assignment_teacher" 
        FOREIGN KEY ("teacher_id") REFERENCES "Users"("user_id") 
        ON UPDATE CASCADE ON DELETE CASCADE,
    
    CONSTRAINT "fk_teacher_assignment_subject" 
        FOREIGN KEY ("subject_id") REFERENCES "Subjects"("subject_id") 
        ON UPDATE CASCADE ON DELETE CASCADE,
    
    CONSTRAINT "fk_teacher_assignment_semester" 
        FOREIGN KEY ("semester_id") REFERENCES "Semesters"("semester_id") 
        ON UPDATE CASCADE ON DELETE CASCADE,
    
    CONSTRAINT "fk_teacher_assignment_assigned_by" 
        FOREIGN KEY ("assigned_by") REFERENCES "Users"("user_id") 
        ON UPDATE CASCADE ON DELETE SET NULL
);

-- Tạo indexes cho bảng TeacherSubjectAssignments
CREATE INDEX IF NOT EXISTS "idx_assignments_teacher" ON "TeacherSubjectAssignments" ("teacher_id");
CREATE INDEX IF NOT EXISTS "idx_assignments_subject" ON "TeacherSubjectAssignments" ("subject_id");
CREATE INDEX IF NOT EXISTS "idx_assignments_semester" ON "TeacherSubjectAssignments" ("semester_id");
CREATE INDEX IF NOT EXISTS "idx_assignments_assigned_by" ON "TeacherSubjectAssignments" ("assigned_by");
CREATE INDEX IF NOT EXISTS "idx_assignments_is_active" ON "TeacherSubjectAssignments" ("is_active");
CREATE INDEX IF NOT EXISTS "idx_assignments_assigned_at" ON "TeacherSubjectAssignments" ("assigned_at");

-- Unique constraint để đảm bảo không trùng lặp phân công
CREATE UNIQUE INDEX IF NOT EXISTS "unique_teacher_subject_semester" 
ON "TeacherSubjectAssignments" ("teacher_id", "subject_id", "semester_id");

-- Thêm comment cho bảng và columns
COMMENT ON TABLE "TeacherSubjectAssignments" IS 'Bảng phân công giáo viên dạy môn học trong học kỳ';
COMMENT ON COLUMN "TeacherSubjectAssignments"."teacher_id" IS 'ID của giáo viên được phân công';
COMMENT ON COLUMN "TeacherSubjectAssignments"."subject_id" IS 'ID của môn học';
COMMENT ON COLUMN "TeacherSubjectAssignments"."semester_id" IS 'ID của học kỳ';
COMMENT ON COLUMN "TeacherSubjectAssignments"."assigned_by" IS 'ID của admin thực hiện phân công';
COMMENT ON COLUMN "TeacherSubjectAssignments"."is_active" IS 'Trạng thái phân công';
COMMENT ON COLUMN "TeacherSubjectAssignments"."workload_hours" IS 'Số giờ giảng dạy dự kiến (tùy chọn)';

-- =============================================

-- 3. Thêm các cột mới vào bảng Courses
-- Kiểm tra và thêm cột semester_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Courses' AND column_name = 'semester_id'
    ) THEN
        ALTER TABLE "Courses" ADD COLUMN "semester_id" INTEGER;
        ALTER TABLE "Courses" ADD CONSTRAINT "fk_course_semester" 
            FOREIGN KEY ("semester_id") REFERENCES "Semesters"("semester_id") 
            ON UPDATE CASCADE ON DELETE SET NULL;
        CREATE INDEX "idx_courses_semester" ON "Courses" ("semester_id");
        COMMENT ON COLUMN "Courses"."semester_id" IS 'ID của học kỳ mà khóa học thuộc về';
    END IF;
END
$$;

-- Kiểm tra và thêm cột assignment_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Courses' AND column_name = 'assignment_id'
    ) THEN
        ALTER TABLE "Courses" ADD COLUMN "assignment_id" INTEGER;
        ALTER TABLE "Courses" ADD CONSTRAINT "fk_course_assignment" 
            FOREIGN KEY ("assignment_id") REFERENCES "TeacherSubjectAssignments"("assignment_id") 
            ON UPDATE CASCADE ON DELETE SET NULL;
        CREATE INDEX "idx_courses_assignment" ON "Courses" ("assignment_id");
        COMMENT ON COLUMN "Courses"."assignment_id" IS 'ID của phân công giáo viên mà khóa học được tạo từ đó';
    END IF;
END
$$;

-- Kiểm tra và thêm cột original_course_id cho tính năng clone
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Courses' AND column_name = 'original_course_id'
    ) THEN
        ALTER TABLE "Courses" ADD COLUMN "original_course_id" INTEGER;
        ALTER TABLE "Courses" ADD CONSTRAINT "fk_course_original" 
            FOREIGN KEY ("original_course_id") REFERENCES "Courses"("course_id") 
            ON UPDATE CASCADE ON DELETE SET NULL;
        CREATE INDEX "idx_courses_original" ON "Courses" ("original_course_id");
        COMMENT ON COLUMN "Courses"."original_course_id" IS 'ID của khóa học gốc nếu khóa học này được clone';
    END IF;
END
$$;

-- Kiểm tra và thêm cột is_template
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Courses' AND column_name = 'is_template'
    ) THEN
        ALTER TABLE "Courses" ADD COLUMN "is_template" BOOLEAN DEFAULT FALSE;
        CREATE INDEX "idx_courses_is_template" ON "Courses" ("is_template");
        COMMENT ON COLUMN "Courses"."is_template" IS 'Đánh dấu khóa học có thể được sử dụng làm mẫu để clone';
    END IF;
END
$$;

-- =============================================

-- 4. Thêm dữ liệu mẫu cho việc test

-- Thêm học kỳ mẫu
INSERT INTO "Semesters" ("name", "academic_year", "semester_number", "start_date", "end_date", "is_active", "description")
VALUES 
    ('Học kỳ 1 năm học 2024-2025', '2024-2025', 1, '2024-09-01', '2025-01-15', TRUE, 'Học kỳ 1 của năm học 2024-2025'),
    ('Học kỳ 2 năm học 2024-2025', '2024-2025', 2, '2025-02-01', '2025-06-15', FALSE, 'Học kỳ 2 của năm học 2024-2025'),
    ('Học kỳ hè năm học 2024-2025', '2024-2025', 3, '2025-07-01', '2025-08-31', FALSE, 'Học kỳ hè của năm học 2024-2025')
ON CONFLICT DO NOTHING;

-- =============================================

-- 5. Tạo function để update updated_at tự động
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Tạo trigger cho bảng Semesters
DROP TRIGGER IF EXISTS update_semesters_updated_at ON "Semesters";
CREATE TRIGGER update_semesters_updated_at 
    BEFORE UPDATE ON "Semesters" 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Tạo trigger cho bảng TeacherSubjectAssignments
DROP TRIGGER IF EXISTS update_assignments_updated_at ON "TeacherSubjectAssignments";
CREATE TRIGGER update_assignments_updated_at 
    BEFORE UPDATE ON "TeacherSubjectAssignments" 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================

-- 6. Tạo views hữu ích cho báo cáo

-- View: Thống kê phân công theo học kỳ
CREATE OR REPLACE VIEW "AssignmentSummaryBySemester" AS
SELECT 
    s."semester_id",
    s."name" as "semester_name",
    s."academic_year",
    COUNT(tsa."assignment_id") as "total_assignments",
    COUNT(DISTINCT tsa."teacher_id") as "teacher_count",
    COUNT(DISTINCT tsa."subject_id") as "subject_count",
    COUNT(CASE WHEN tsa."is_active" = true THEN 1 END) as "active_assignments"
FROM "Semesters" s
LEFT JOIN "TeacherSubjectAssignments" tsa ON s."semester_id" = tsa."semester_id"
GROUP BY s."semester_id", s."name", s."academic_year"
ORDER BY s."academic_year" DESC, s."semester_number" ASC;

-- View: Chi tiết phân công với thông tin giáo viên và môn học
CREATE OR REPLACE VIEW "AssignmentDetails" AS
SELECT 
    tsa."assignment_id",
    tsa."assigned_at",
    tsa."is_active",
    tsa."workload_hours",
    tsa."note",
    u."name" as "teacher_name",
    u."email" as "teacher_email",
    s."name" as "subject_name",
    s."description" as "subject_description",
    sem."name" as "semester_name",
    sem."academic_year",
    admin_u."name" as "assigned_by_name"
FROM "TeacherSubjectAssignments" tsa
JOIN "Users" u ON tsa."teacher_id" = u."user_id"
JOIN "Subjects" s ON tsa."subject_id" = s."subject_id"
JOIN "Semesters" sem ON tsa."semester_id" = sem."semester_id"
JOIN "Users" admin_u ON tsa."assigned_by" = admin_u."user_id"
ORDER BY tsa."assigned_at" DESC;

-- =============================================

PRINT 'Script hoàn thành! Các bảng và cấu trúc đã được tạo thành công.';

-- Kiểm tra kết quả
SELECT 'Semesters' as table_name, COUNT(*) as record_count FROM "Semesters"
UNION ALL
SELECT 'TeacherSubjectAssignments', COUNT(*) FROM "TeacherSubjectAssignments"
ORDER BY table_name;
