-- Rollback: Language Decoupling
-- Drops words_v2 table. Old tables are unaffected.

DROP TABLE IF EXISTS words_v2 CASCADE;
