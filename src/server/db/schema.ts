import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const jobQueue = sqliteTable(
  'job_queue',
  {
    id: text('id').primaryKey().notNull(),
    batchId: text('batch_id'),
    jobType: text('job_type', { enum: ['generate', 'fix', 'audit-fix'] }).notNull(),
    priority: text('priority', { enum: ['normal', 'high'] })
      .notNull()
      .default('normal'),
    status: text('status').notNull().default('queued'),
    word: text('word'),
    language: text('language'),
    context: text('context'),
    notes: text('notes'),
    targetJobId: text('target_job_id'),
    targetWordId: text('target_word_id'),
    providerId: text('provider_id'),
    resultYaml: text('result_yaml'),
    resultScores: text('result_scores'),
    error: text('error'),
    retryCount: integer('retry_count').default(0),
    maxRetries: integer('max_retries').default(2),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  table => [
    index('idx_job_queue_batch_id').on(table.batchId),
    index('idx_job_queue_status').on(table.status),
    index('idx_job_queue_priority_created').on(table.priority, table.createdAt),
  ]
);

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
