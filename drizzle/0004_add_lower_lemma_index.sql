CREATE INDEX IF NOT EXISTS idx_words_v2_lower_lemma_lang ON words_v2 (LOWER(lemma), language);
