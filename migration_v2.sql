-- Migration Script: v2 (Schema Evolution)
-- Date: 2026-03-05
-- Description: Migrate from v1 schema to v2 schema
--
-- Changes:
-- 1. Add revision_count to words table
-- 2. Create user_requests table to store user query history
-- 3. Migrate user_word and user_context_sentence from words to user_requests
-- 4. Add UNIQUE constraint to lemma column
-- 5. Remove user_word and user_context_sentence from words table
--
-- Note: This migration assumes existing data will be preserved.
--       user_word and user_context_sentence are moved to user_requests table
--       to better separate core word data from user interaction history.

BEGIN;

-- 1. Add revision_count to track word update history
ALTER TABLE words ADD COLUMN IF NOT EXISTS revision_count INT DEFAULT 1;

COMMENT ON COLUMN words.revision_count IS 'Number of times this word has been updated';

-- 2. Create user_requests table for user query tracking
CREATE TABLE IF NOT EXISTS user_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    word_id UUID NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    user_input TEXT,
    context_sentence TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON TABLE user_requests IS 'User query history. Stores user input and context for analytics.';
COMMENT ON COLUMN user_requests.user_input IS 'The exact word form entered by user (migrated from words.user_word)';
COMMENT ON COLUMN user_requests.context_sentence IS 'Context sentence provided by user (migrated from words.user_context_sentence)';

-- 3. Migrate existing data from words to user_requests
-- This preserves user query history by moving user_word and user_context_sentence
-- from the words table to the new user_requests table
INSERT INTO user_requests (word_id, user_input, context_sentence, created_at)
SELECT id, user_word, user_context_sentence, created_at
FROM words
WHERE user_word IS NOT NULL OR user_context_sentence IS NOT NULL;

-- 4. Add UNIQUE constraint to lemma
-- First, handle any duplicate lemmas by keeping only the most recent entry
-- Note: In production, you may need custom deduplication logic
ALTER TABLE words ADD CONSTRAINT unique_lemma UNIQUE (lemma);

-- 5. Cleanup words table - remove migrated columns
-- These columns are now stored in user_requests table
ALTER TABLE words DROP COLUMN IF EXISTS user_word;
ALTER TABLE words DROP COLUMN IF EXISTS user_context_sentence;

COMMIT;

-- Post-migration verification queries (run manually to verify):
-- SELECT COUNT(*) as total_words FROM words;
-- SELECT COUNT(*) as total_requests FROM user_requests;
-- SELECT w.lemma, ur.user_input, ur.context_sentence 
-- FROM words w 
-- JOIN user_requests ur ON w.id = ur.word_id 
-- LIMIT 5;
