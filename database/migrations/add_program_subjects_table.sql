-- Migration: Create ProgramSubjects table
CREATE TABLE IF NOT EXISTS "ProgramSubjects" (
    program_subject_id SERIAL PRIMARY KEY,
    program_id INTEGER NOT NULL REFERENCES "Programs"(program_id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES "Subjects"(subject_id) ON DELETE CASCADE,
    order_index INTEGER,
    recommended_semester INTEGER,
    is_mandatory BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(program_id, subject_id)
);

-- Index to help listing by program
CREATE INDEX IF NOT EXISTS idx_programsubjects_program ON "ProgramSubjects"(program_id);
CREATE INDEX IF NOT EXISTS idx_programsubjects_subject ON "ProgramSubjects"(subject_id);
