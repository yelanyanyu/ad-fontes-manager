-- PostgreSQL Schema for Ad Fontes Prompts (Enhanced)
-- Optimized based on 'postgres-performance' and 'postgresql-schema-expert' skills.

-- ==============================================================================
-- 1. EXTENSIONS
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- Required for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";     -- Alternative UUID functions

-- ==============================================================================
-- 2. TABLES DEFINITION
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Table: words
-- Description: The central entity representing a linguistic unit (word/phrase).
-- Design Decisions:
-- - UUID Primary Key: For distributed safety and migration ease.
-- - TEXT types: Postgres optimizes TEXT, no need for VARCHAR(n).
-- - JSONB Backup: Stores original YAML to allow reprocessing without data loss.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS words (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- [Basic Identity]
    user_word TEXT NOT NULL,                -- The exact word form entered by the user
    lemma TEXT NOT NULL,                    -- The canonical form (e.g., "bolstered" -> "bolster")
    syllabification TEXT,                   -- Phonetic division (e.g., "bol-ster")
    part_of_speech TEXT,                    -- e.g., "Noun", "Verb (Transitive)"
    
    -- [Contextual Usage]
    user_context_sentence TEXT,             -- The specific sentence provided by the user (Nullable)
    contextual_meaning_en TEXT,             -- Meaning in this specific context (English)
    contextual_meaning_zh TEXT,             -- Meaning in this specific context (Chinese)
    
    -- [Extended Data]
    other_common_meanings TEXT[],           -- Array of strings for other definitions (Fast retrieval)
    image_differentiation_zh TEXT,          -- Nuance comparison with synonyms (Visual focus)
    
    -- [Audit]
    original_yaml JSONB,                    -- Full copy of the source YAML for debugging/re-parsing
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ------------------------------------------------------------------------------
-- Table: etymologies
-- Description: Deep etymological analysis. 1:1 relationship with 'words'.
-- Design Decisions:
-- - Separated from 'words' to keep the main table lightweight.
-- - Contains heavy text fields for "visual imagery" storytelling.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS etymologies (
    word_id UUID PRIMARY KEY REFERENCES words(id) ON DELETE CASCADE,
    
    -- [Structural Breakdown]
    prefix TEXT,                            -- e.g., "re-", "sub-"
    root TEXT,                              -- The core root (e.g., "ject", "spec")
    suffix TEXT,                            -- e.g., "-tion", "-ing"
    structure_analysis TEXT,                -- Explanation of how parts combine
    
    -- [Historical Origins]
    history_myth TEXT,                      -- Myths or historical stories associated with the word
    source_word TEXT,                       -- Immediate origin (e.g., Latin/French)
    pie_root TEXT,                          -- Proto-Indo-European root (e.g., "*bhel-")
    
    -- [Cognitive Linguistics / Imagery]
    visual_imagery_zh TEXT,                 -- "Scene-Action-Feeling" narrative (Long Text)
    meaning_evolution_zh TEXT               -- Logic chain from physical action to abstract meaning
);

-- ------------------------------------------------------------------------------
-- Table: cognates
-- Description: Words sharing the same etymological root. 1:N relationship.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cognates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    word_id UUID NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    
    cognate_word TEXT NOT NULL,             -- The related word (e.g., "Ball" for "Bolster")
    logic TEXT NOT NULL,                    -- Explanation of the etymological link
    
    UNIQUE(word_id, cognate_word)           -- Prevent duplicates for the same word
);

-- ------------------------------------------------------------------------------
-- Table: examples
-- Description: Usage examples categorized by type. 1:N relationship.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS examples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    word_id UUID NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    
    example_type TEXT,                      -- Enum-like: 'Literal', 'Current Context', 'Abstract'
    sentence TEXT NOT NULL,                 -- The English sentence
    translation_zh TEXT                     -- Chinese translation
);

-- ------------------------------------------------------------------------------
-- Table: synonyms
-- Description: Synonyms with nuanced meaning comparisons. 1:N relationship.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS synonyms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    word_id UUID NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    
    synonym_word TEXT NOT NULL,             -- The synonym
    meaning_zh TEXT                         -- Brief Chinese definition
);

-- ==============================================================================
-- 3. INDEXES (Performance)
-- ==============================================================================

-- B-Tree Indexes for common equality/range lookups
CREATE INDEX IF NOT EXISTS idx_words_lemma ON words(lemma);
CREATE INDEX IF NOT EXISTS idx_words_user_word ON words(user_word);

-- Foreign Key Indexes (Crucial for JOIN performance)
CREATE INDEX IF NOT EXISTS idx_cognates_word_id ON cognates(word_id);
CREATE INDEX IF NOT EXISTS idx_examples_word_id ON examples(word_id);
CREATE INDEX IF NOT EXISTS idx_synonyms_word_id ON synonyms(word_id);

-- GIN Indexes for unstructured/searchable content
-- Allows querying inside the original JSON: SELECT * FROM words WHERE original_yaml @> '{"yield": {"lemma": "foo"}}'
CREATE INDEX IF NOT EXISTS idx_words_original_yaml ON words USING GIN (original_yaml);

-- Full Text Search support for PIE roots (e.g., finding all words from *bhel-)
CREATE INDEX IF NOT EXISTS idx_etymologies_pie_root_search ON etymologies USING GIN (to_tsvector('english', pie_root));

-- ==============================================================================
-- 4. SECURITY (Row Level Security)
-- ==============================================================================
-- Best Practice: Enable RLS on all tables to ensure secure access patterns in future multi-user scenarios.

ALTER TABLE words ENABLE ROW LEVEL SECURITY;
ALTER TABLE etymologies ENABLE ROW LEVEL SECURITY;
ALTER TABLE cognates ENABLE ROW LEVEL SECURITY;
ALTER TABLE examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE synonyms ENABLE ROW LEVEL SECURITY;

-- Default Policy: Public Read Access
CREATE POLICY "Allow public read access" ON words FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON etymologies FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON cognates FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON examples FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON synonyms FOR SELECT USING (true);

-- ==============================================================================
-- 5. DOCUMENTATION (Comments)
-- ==============================================================================
COMMENT ON TABLE words IS 'Core entity: Stores the user input, lemma, and contextual definitions.';
COMMENT ON COLUMN words.other_common_meanings IS 'Array of strings for secondary definitions.';
COMMENT ON COLUMN words.original_yaml IS 'Full backup of the original input YAML for debugging and reprocessing.';
COMMENT ON TABLE etymologies IS 'Deep dive into word origins, roots, and cognitive imagery.';
COMMENT ON COLUMN etymologies.visual_imagery_zh IS 'A narrative description constructing a mental image of the word''s origin action.';
