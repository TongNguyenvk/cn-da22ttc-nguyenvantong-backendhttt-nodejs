-- Migration: Add original_filename to MediaFiles table
-- Date: 2025-01-19
-- Purpose: Support filename-based media mapping for Excel import

-- Add original_filename column
ALTER TABLE "MediaFiles" 
ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255);

-- Add comment
COMMENT ON COLUMN "MediaFiles".original_filename IS 'Tên file gốc khi upload (để map với Excel)';

-- Create index for fast lookup
CREATE INDEX IF NOT EXISTS idx_mediafiles_original_filename 
ON "MediaFiles"(original_filename) 
WHERE owner_type = 'pending';

-- Create index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_mediafiles_pending_created 
ON "MediaFiles"(owner_type, created_at) 
WHERE owner_type = 'pending';
