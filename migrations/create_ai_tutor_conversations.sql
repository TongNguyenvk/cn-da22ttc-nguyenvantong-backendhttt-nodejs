-- Migration: Create AI Tutor Conversations table
-- Lưu lịch sử chat giữa sinh viên và AI Tutor

-- Create enum type for role
DO $$ BEGIN
    CREATE TYPE ai_tutor_role AS ENUM ('user', 'model');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create table
CREATE TABLE IF NOT EXISTS "AITutorConversations" (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES "Users"(user_id) ON DELETE CASCADE,
    question_id INTEGER REFERENCES "Questions"(question_id) ON DELETE SET NULL,
    session_id VARCHAR(100) NOT NULL,
    role ai_tutor_role NOT NULL,
    message TEXT NOT NULL,
    context_snapshot JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ai_tutor_conv_user_id ON "AITutorConversations"(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_tutor_conv_session_id ON "AITutorConversations"(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_tutor_conv_user_question ON "AITutorConversations"(user_id, question_id);
CREATE INDEX IF NOT EXISTS idx_ai_tutor_conv_created_at ON "AITutorConversations"(created_at);

-- Add comment
COMMENT ON TABLE "AITutorConversations" IS 'Lịch sử chat giữa sinh viên và AI Tutor';
COMMENT ON COLUMN "AITutorConversations".session_id IS 'Format: user_{id}_q_{qid} hoặc user_{id}_general';
COMMENT ON COLUMN "AITutorConversations".role IS 'user = sinh viên, model = AI';
COMMENT ON COLUMN "AITutorConversations".context_snapshot IS 'Snapshot code, language tại thời điểm chat';
