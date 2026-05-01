import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const wordsV2 = sqliteTable(
  'words_v2',
  {
    id: text('id').primaryKey().notNull(),
    lemma: text('lemma').notNull(),
    language: text('language').notNull().default('en'),
    partOfSpeech: text('part_of_speech'),
    content: text('content', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    revisionCount: integer('revision_count').notNull().default(1),
  },
  table => [
    uniqueIndex('unique_lemma_lang_v2').on(table.lemma, table.language),
    index('idx_words_v2_language').on(table.language),
    index('idx_words_v2_lemma_lang').on(table.lemma, table.language),
    index('idx_words_v2_created_at').on(table.createdAt),
    index('idx_words_v2_updated_at').on(table.updatedAt),
  ]
);

export const localWords = sqliteTable('local_words', {
  id: text('id').primaryKey().notNull(),
  rawYaml: text('raw_yaml').notNull(),
  lemmaPreview: text('lemma_preview'),
  updatedAt: integer('updated_at').notNull(),
});

export const localConfig = sqliteTable('local_config', {
  key: text('key').primaryKey().notNull(),
  value: text('value').notNull(),
});
