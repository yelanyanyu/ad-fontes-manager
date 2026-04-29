-- Migration: Language Decoupling
-- Creates words_v2 table with JSONB content column for multi-language support
-- Existing tables are preserved (not modified)

-- ==============================================================================
-- 1. CREATE words_v2 TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS words_v2 (
    id              UUID                     DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    lemma           TEXT                                               NOT NULL,
    language        TEXT                                               NOT NULL DEFAULT 'en',
    part_of_speech  TEXT,
    content         JSONB                                              NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT now()             NOT NULL,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT now()             NOT NULL,
    revision_count  INTEGER                  DEFAULT 1,

    CONSTRAINT unique_lemma_lang_v2 UNIQUE (lemma, language)
);

COMMENT ON TABLE words_v2 IS 'Multi-language word storage. Identity columns + content JSONB for language-agnostic document storage.';
COMMENT ON COLUMN words_v2.lemma IS 'Canonical form of the word';
COMMENT ON COLUMN words_v2.language IS 'Language code: en, de, etc.';
COMMENT ON COLUMN words_v2.part_of_speech IS 'Part of speech (e.g., noun, Verb)';
COMMENT ON COLUMN words_v2.content IS 'Full YAML document as JSONB — the single source of truth';

-- ==============================================================================
-- 2. INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_words_v2_language ON words_v2 (language);
CREATE INDEX IF NOT EXISTS idx_words_v2_lemma_lang ON words_v2 (lemma, language);
CREATE INDEX IF NOT EXISTS idx_words_v2_content ON words_v2 USING GIN (content);

-- ==============================================================================
-- 3. ROW LEVEL SECURITY
-- ==============================================================================
ALTER TABLE words_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON words_v2
    AS PERMISSIVE
    FOR SELECT
    USING (true);

CREATE POLICY "Allow service write access" ON words_v2
    AS PERMISSIVE
    FOR ALL
    TO postgres
    USING (true)
    WITH CHECK (true);

-- ==============================================================================
-- 4. DATA MIGRATION: copy original_yaml directly into content JSONB
--    original_yaml is the single source of truth (full YAML JSON).
--    Sub-table columns (etymologies, cognates, etc.) are redundant denormalized copies.
-- ==============================================================================
INSERT INTO words_v2 (lemma, language, part_of_speech, content, created_at, updated_at, revision_count)
SELECT
    lemma,
    'en' AS language,
    part_of_speech,
    original_yaml AS content,
    created_at,
    updated_at,
    revision_count
FROM words;
