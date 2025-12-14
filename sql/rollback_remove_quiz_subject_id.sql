-- Rollback for migration_remove_quiz_subject_id.sql
-- Purpose: Restore quizzes.subject_id column and (optionally) integrity trigger after it was removed.
-- Safe / idempotent: guards on existence; can be re-run.
-- NOTE: Only run if column subject_id is currently missing.

BEGIN;

-- 1. Re-add column if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='Quizzes' AND column_name='subject_id'
    ) THEN
        ALTER TABLE "Quizzes" ADD COLUMN subject_id INTEGER NULL;
    END IF;
END$$;

-- 2. Populate subject_id using course -> subject relationship (only NULL rows)
UPDATE "Quizzes" q
SET subject_id = c.subject_id
FROM "Courses" c
WHERE c.course_id = q.course_id
  AND q.subject_id IS NULL;

-- 3. Add FK constraint if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name='Quizzes' AND constraint_name='fk_quizzes_subject'
    ) THEN
        ALTER TABLE "Quizzes" ADD CONSTRAINT fk_quizzes_subject
            FOREIGN KEY (subject_id) REFERENCES "Subjects"(subject_id)
            ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;
END$$;

-- 4. (Optional) Recreate integrity function + trigger enforcing course/subject consistency
--    Only if you still want the legacy double-link consistency. Skip if simplifying permanently.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='enforce_quiz_subject_course_consistency') THEN
        CREATE OR REPLACE FUNCTION enforce_quiz_subject_course_consistency()
        RETURNS TRIGGER AS $$
        DECLARE
            course_subject_id INTEGER;
        BEGIN
            IF NEW.course_id IS NULL THEN
                RAISE EXCEPTION 'course_id cannot be null';
            END IF;
            SELECT subject_id INTO course_subject_id FROM "Courses" WHERE course_id = NEW.course_id;
            IF NEW.subject_id IS NOT NULL AND NEW.subject_id <> course_subject_id THEN
                RAISE EXCEPTION 'quiz.subject_id (%) does not match course.subject_id (%)', NEW.subject_id, course_subject_id;
            END IF;
            -- Auto-fill subject_id if null
            IF NEW.subject_id IS NULL THEN
                NEW.subject_id := course_subject_id;
            END IF;
            RETURN NEW;
        END;$$ LANGUAGE plpgsql;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_quizzes_enforce_subject_course') THEN
        CREATE TRIGGER trg_quizzes_enforce_subject_course
            BEFORE INSERT OR UPDATE ON "Quizzes"
            FOR EACH ROW
            EXECUTE FUNCTION enforce_quiz_subject_course_consistency();
    END IF;
END$$;

COMMIT;

-- Verification suggestions:
-- SELECT quiz_id, course_id, subject_id FROM "Quizzes" LIMIT 20;
-- EXPLAIN ANALYZE SELECT * FROM v_quizzes_with_subject LIMIT 1; -- still works (view uses course->subject).

-- To remove again: re-run migration_remove_quiz_subject_id.sql
