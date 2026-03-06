-- PostgreSQL Schema for Ad Fontes Manager
-- Current Database Schema (Synchronized with production)
-- Generated: 2026-03-05

-- ==============================================================================
-- 1. EXTENSIONS
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- Required for gen_random_uuid()

-- ==============================================================================
-- 2. TABLES DEFINITION
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Table: words
-- Description: Core entity storing vocabulary lemma and contextual definitions.
-- Note: user_word and user_context_sentence were moved to user_requests table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS words (
    id                       UUID                     DEFAULT gen_random_uuid() NOT NULL
        PRIMARY KEY,
    lemma                    TEXT                                               NOT NULL
        CONSTRAINT unique_lemma
            UNIQUE,
    syllabification          TEXT,
    part_of_speech           TEXT,
    contextual_meaning_en    TEXT,
    contextual_meaning_zh    TEXT,
    other_common_meanings    TEXT[],
    image_differentiation_zh TEXT,
    original_yaml            JSONB,
    created_at               TIMESTAMP WITH TIME ZONE DEFAULT now()             NOT NULL,
    updated_at               TIMESTAMP WITH TIME ZONE DEFAULT now()             NOT NULL,
    revision_count           INTEGER                  DEFAULT 1
);

COMMENT ON TABLE words IS 'Core entity: Stores vocabulary lemma and contextual definitions. user_word moved to user_requests table.';
COMMENT ON COLUMN words.lemma IS 'The canonical form of the word (e.g., "run" for "running")';
COMMENT ON COLUMN words.syllabification IS 'Phonetic syllable division (e.g., "dig-ni-ty")';
COMMENT ON COLUMN words.part_of_speech IS 'Part of speech (e.g., "noun", "verb")';
COMMENT ON COLUMN words.contextual_meaning_en IS 'Contextual meaning in English';
COMMENT ON COLUMN words.contextual_meaning_zh IS 'Contextual meaning in Chinese';
COMMENT ON COLUMN words.other_common_meanings IS 'Array of other common definitions';
COMMENT ON COLUMN words.image_differentiation_zh IS 'Visual differentiation description in Chinese';
COMMENT ON COLUMN words.original_yaml IS 'Full backup of original YAML for debugging/reprocessing';
COMMENT ON COLUMN words.revision_count IS 'Number of times this word has been updated';

ALTER TABLE words
    OWNER TO postgres;

-- ------------------------------------------------------------------------------
-- Table: etymologies
-- Description: Deep etymological analysis. 1:1 relationship with words.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS etymologies (
    word_id              UUID NOT NULL
        PRIMARY KEY
        REFERENCES words
            ON DELETE CASCADE,
    prefix               TEXT,
    root                 TEXT,
    suffix               TEXT,
    structure_analysis   TEXT,
    history_myth         TEXT,
    source_word          TEXT,
    pie_root             TEXT,
    visual_imagery_zh    TEXT,
    meaning_evolution_zh TEXT
);

COMMENT ON TABLE etymologies IS 'Deep dive into word origins, roots, and cognitive imagery.';
COMMENT ON COLUMN etymologies.prefix IS 'Prefix analysis (e.g., "re-", "un-")';
COMMENT ON COLUMN etymologies.root IS 'Root word (e.g., "-dign-")';
COMMENT ON COLUMN etymologies.suffix IS 'Suffix analysis (e.g., "-ity", "-tion")';
COMMENT ON COLUMN etymologies.structure_analysis IS 'Explanation of word structure';
COMMENT ON COLUMN etymologies.history_myth IS 'Historical or mythological background';
COMMENT ON COLUMN etymologies.source_word IS 'Source word (e.g., Latin origin)';
COMMENT ON COLUMN etymologies.pie_root IS 'Proto-Indo-European root (e.g., "*dek-")';
COMMENT ON COLUMN etymologies.visual_imagery_zh IS 'Visual imagery narrative in Chinese';
COMMENT ON COLUMN etymologies.meaning_evolution_zh IS 'Meaning evolution description in Chinese';

ALTER TABLE etymologies
    OWNER TO postgres;

-- ------------------------------------------------------------------------------
-- Table: cognates
-- Description: Words sharing the same etymological root. 1:N relationship.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cognates (
    id           UUID DEFAULT gen_random_uuid() NOT NULL
        PRIMARY KEY,
    word_id      UUID                           NOT NULL
        REFERENCES words
            ON DELETE CASCADE,
    cognate_word TEXT                           NOT NULL,
    logic        TEXT                           NOT NULL,
    UNIQUE (word_id, cognate_word)
);

COMMENT ON TABLE cognates IS 'Cognate words sharing the same etymological root.';
COMMENT ON COLUMN cognates.cognate_word IS 'The related cognate word';
COMMENT ON COLUMN cognates.logic IS 'Explanation of etymological connection';

ALTER TABLE cognates
    OWNER TO postgres;

-- ------------------------------------------------------------------------------
-- Table: examples
-- Description: Usage examples categorized by type. 1:N relationship.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS examples (
    id             UUID DEFAULT gen_random_uuid() NOT NULL
        PRIMARY KEY,
    word_id        UUID                           NOT NULL
        REFERENCES words
            ON DELETE CASCADE,
    example_type   TEXT,
    sentence       TEXT                           NOT NULL,
    translation_zh TEXT
);

COMMENT ON TABLE examples IS 'Usage examples for the word.';
COMMENT ON COLUMN examples.example_type IS 'Type: Literal, Current Context, Abstract';
COMMENT ON COLUMN examples.sentence IS 'Example sentence in English';
COMMENT ON COLUMN examples.translation_zh IS 'Chinese translation';

ALTER TABLE examples
    OWNER TO postgres;

-- ------------------------------------------------------------------------------
-- Table: synonyms
-- Description: Synonyms with nuanced meaning comparisons. 1:N relationship.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS synonyms (
    id           UUID DEFAULT gen_random_uuid() NOT NULL
        PRIMARY KEY,
    word_id      UUID                           NOT NULL
        REFERENCES words
            ON DELETE CASCADE,
    synonym_word TEXT                           NOT NULL,
    meaning_zh   TEXT
);

COMMENT ON TABLE synonyms IS 'Synonyms with nuanced comparisons.';
COMMENT ON COLUMN synonyms.synonym_word IS 'The synonym word';
COMMENT ON COLUMN synonyms.meaning_zh IS 'Brief Chinese definition';

ALTER TABLE synonyms
    OWNER TO postgres;

-- ------------------------------------------------------------------------------
-- Table: user_requests
-- Description: User query history. Stores user_word and context_sentence.
-- Note: Moved from words table to separate tracking table.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_requests (
    id               UUID                     DEFAULT gen_random_uuid() NOT NULL
        PRIMARY KEY,
    word_id          UUID                                               NOT NULL
        REFERENCES words
            ON DELETE CASCADE,
    user_input       TEXT,
    context_sentence TEXT,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT now()             NOT NULL
);

COMMENT ON TABLE user_requests IS 'User query history. Stores user input and context for analytics.';
COMMENT ON COLUMN user_requests.user_input IS 'The exact word form entered by user (moved from words.user_word)';
COMMENT ON COLUMN user_requests.context_sentence IS 'Context sentence provided by user (moved from words.user_context_sentence)';

ALTER TABLE user_requests
    OWNER TO postgres;

-- ==============================================================================
-- 3. INDEXES (Performance)
-- ==============================================================================

-- Words table indexes
CREATE INDEX IF NOT EXISTS idx_words_lemma
    ON words (lemma);

CREATE INDEX IF NOT EXISTS idx_words_original_yaml
    ON words USING GIN (original_yaml);

-- Foreign key indexes
CREATE INDEX IF NOT EXISTS idx_cognates_word_id
    ON cognates (word_id);

CREATE INDEX IF NOT EXISTS idx_examples_word_id
    ON examples (word_id);

CREATE INDEX IF NOT EXISTS idx_synonyms_word_id
    ON synonyms (word_id);

-- Full text search for PIE roots
CREATE INDEX IF NOT EXISTS idx_etymologies_pie_root_search
    ON etymologies USING GIN (to_tsvector('english'::regconfig, pie_root));

-- ==============================================================================
-- 4. SECURITY (Row Level Security)
-- ==============================================================================

ALTER TABLE words ENABLE ROW LEVEL SECURITY;
ALTER TABLE etymologies ENABLE ROW LEVEL SECURITY;
ALTER TABLE cognates ENABLE ROW LEVEL SECURITY;
ALTER TABLE examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE synonyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_requests ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Allow public read access" ON words
    AS PERMISSIVE
    FOR SELECT
    USING true;

CREATE POLICY "Allow public read access" ON etymologies
    AS PERMISSIVE
    FOR SELECT
    USING true;

CREATE POLICY "Allow public read access" ON cognates
    AS PERMISSIVE
    FOR SELECT
    USING true;

CREATE POLICY "Allow public read access" ON examples
    AS PERMISSIVE
    FOR SELECT
    USING true;

CREATE POLICY "Allow public read access" ON synonyms
    AS PERMISSIVE
    FOR SELECT
    USING true;

CREATE POLICY "Allow public read access" ON user_requests
    AS PERMISSIVE
    FOR SELECT
    USING true;

-- Controlled write access for service role (Phase 0 baseline hardening)
-- NOTE: writes must go through trusted app/service DB credentials, not PUBLIC.
CREATE POLICY "Allow service write access" ON words
    AS PERMISSIVE
    FOR ALL
    TO postgres
    USING true
    WITH CHECK true;

CREATE POLICY "Allow service write access" ON etymologies
    AS PERMISSIVE
    FOR ALL
    TO postgres
    USING true
    WITH CHECK true;

CREATE POLICY "Allow service write access" ON cognates
    AS PERMISSIVE
    FOR ALL
    TO postgres
    USING true
    WITH CHECK true;

CREATE POLICY "Allow service write access" ON examples
    AS PERMISSIVE
    FOR ALL
    TO postgres
    USING true
    WITH CHECK true;

CREATE POLICY "Allow service write access" ON synonyms
    AS PERMISSIVE
    FOR ALL
    TO postgres
    USING true
    WITH CHECK true;

CREATE POLICY "Allow service write access" ON user_requests
    AS PERMISSIVE
    FOR ALL
    TO postgres
    USING true
    WITH CHECK true;
