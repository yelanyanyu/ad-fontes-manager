-- Migration Script: v2 (Schema Evolution)
-- 1. Add revision_count to words
-- 2. Create user_requests table
-- 3. Migrate existing data
-- 4. Add UNIQUE constraint to lemma
-- 5. Cleanup words table

BEGIN;

-- 1. Add revision_count
ALTER TABLE words ADD COLUMN IF NOT EXISTS revision_count INT DEFAULT 1;

-- 2. Create user_requests table
CREATE TABLE IF NOT EXISTS user_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    word_id UUID NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    user_input TEXT,
    context_sentence TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3. Migrate existing data (Move context from words to user_requests)
-- Note: We use the 'user_word' and 'user_context_sentence' from words table to create initial request logs
INSERT INTO user_requests (word_id, user_input, context_sentence, created_at)
SELECT id, user_word, user_context_sentence, created_at
FROM words
WHERE user_word IS NOT NULL OR user_context_sentence IS NOT NULL;

-- 4. Add UNIQUE constraint to lemma
-- First, handle duplicates if any (keep the most recent one)
-- This is a bit risky if duplicates exist. For this tool, we assume clean slate or we just warn.
-- In a real prod env, we'd need complex deduplication logic.
-- Here we just try to add the constraint. If it fails, user needs to clean up manually.
ALTER TABLE words ADD CONSTRAINT unique_lemma UNIQUE (lemma);

-- 5. Cleanup words table (Drop migrated columns)
ALTER TABLE words DROP COLUMN IF EXISTS user_word;
ALTER TABLE words DROP COLUMN IF EXISTS user_context_sentence;

COMMIT;
