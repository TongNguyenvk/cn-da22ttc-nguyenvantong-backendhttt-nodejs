-- Postgres DDL for audit history of course grade results
-- Idempotent (safe to run multiple times)

BEGIN;

-- 1. Create table if not exists
CREATE TABLE IF NOT EXISTS "CourseGradeResultHistories" (
  history_id SERIAL PRIMARY KEY,
  result_id INT NOT NULL REFERENCES "CourseGradeResults"(result_id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. Ensure index on foreign key for faster lookups
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i'
      AND c.relname = 'idx_cgrh_result_id'
      AND n.nspname = current_schema()
  ) THEN
    CREATE INDEX idx_cgrh_result_id ON "CourseGradeResultHistories"(result_id);
  END IF;
END$$;

-- 3. (Optional) Comment metadata
COMMENT ON TABLE "CourseGradeResultHistories" IS 'Snapshot history of CourseGradeResults for audit trail';
COMMENT ON COLUMN "CourseGradeResultHistories".snapshot IS 'Full JSON snapshot of the CourseGradeResult row before/after change';

COMMIT;

-- Rollback helper (run manually if needed)
-- BEGIN; DROP TABLE IF EXISTS "CourseGradeResultHistories"; COMMIT;
