import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import Database from 'better-sqlite3';

import { QueueStore, type SqliteLike } from './QueueStore';

const JOB_QUEUE_DDL = `
  CREATE TABLE IF NOT EXISTS job_queue (
    id TEXT PRIMARY KEY,
    batch_id TEXT,
    job_type TEXT NOT NULL CHECK(job_type IN ('generate','fix','audit-fix')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','high')),
    status TEXT NOT NULL DEFAULT 'queued',
    word TEXT,
    language TEXT,
    context TEXT,
    notes TEXT,
    target_job_id TEXT,
    target_word_id TEXT,
    synced_word_id TEXT,
    synced_content_hash TEXT,
    synced_at TEXT,
    result_yaml TEXT,
    result_scores TEXT,
    provider_id TEXT,
    error TEXT,
    progress_events TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 2,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status);
  CREATE INDEX IF NOT EXISTS idx_job_queue_priority_created ON job_queue(priority, created_at);
  CREATE INDEX IF NOT EXISTS idx_job_queue_status_priority_created
    ON job_queue(status, priority, created_at);
  CREATE INDEX IF NOT EXISTS idx_job_queue_history_status_completed
    ON job_queue(status, completed_at, created_at);
  CREATE INDEX IF NOT EXISTS idx_job_queue_word_language
    ON job_queue(word, language);
  CREATE INDEX IF NOT EXISTS idx_job_queue_workset_today
    ON job_queue(status, language, word, completed_at, created_at)
    WHERE result_yaml IS NOT NULL AND result_yaml <> '';

  CREATE TABLE IF NOT EXISTS words_v2 (
    id TEXT PRIMARY KEY NOT NULL,
    lemma TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'en',
    part_of_speech TEXT,
    content TEXT NOT NULL,
    word_schema_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    revision_count INTEGER NOT NULL DEFAULT 1
  );
  CREATE UNIQUE INDEX IF NOT EXISTS unique_lemma_lang_v2
    ON words_v2 (lemma, language);
  CREATE INDEX IF NOT EXISTS idx_words_v2_lower_lemma_lang
    ON words_v2 (LOWER(lemma), language);
`;

function createTestDb(): SqliteLike {
  const db = new Database(':memory:');
  db.exec(JOB_QUEUE_DDL);
  return {
    get: (sql: string, ...params: unknown[]) =>
      db.prepare(sql).get(...params) as Record<string, unknown> | undefined,
    run: (sql: string, ...params: unknown[]) => {
      const info = db.prepare(sql).run(...params);
      return { changes: info.changes };
    },
    all: (sql: string, ...params: unknown[]) =>
      db.prepare(sql).all(...params) as Record<string, unknown>[],
  };
}

void describe('QueueStore', () => {
  let db: SqliteLike;
  let store: QueueStore;

  beforeEach(() => {
    db = createTestDb();
    store = new QueueStore(() => db);
  });

  void it('inserts jobs and dequeues high priority jobs first with FIFO tie-breaks', () => {
    const normalA = store.insert({
      type: 'generate',
      priority: 'normal',
      word: 'alpha',
      language: 'en',
    });
    const high = store.insert({
      type: 'generate',
      priority: 'high',
      word: 'beta',
      language: 'en',
    });
    const normalB = store.insert({
      type: 'generate',
      priority: 'normal',
      word: 'gamma',
      language: 'en',
    });

    assert.equal(store.getQueuePosition(high), 1);
    assert.equal(store.getQueuePosition(normalA), 2);
    assert.equal(store.getQueuePosition(normalB), 3);

    assert.equal(store.dequeue([])?.id, high);
    assert.equal(store.dequeue([])?.id, normalA);
    assert.equal(store.dequeue([])?.id, normalB);
  });

  void it('paginates history by error, partial, then complete and excludes active jobs', () => {
    db.run(
      `INSERT INTO job_queue (id, job_type, priority, status, word, language, result_yaml)
       VALUES
       ('active', 'generate', 'normal', 'running', 'active', 'en', NULL),
       ('done', 'generate', 'normal', 'complete', 'done', 'en', 'yaml'),
       ('partial', 'generate', 'normal', 'partial', 'partial', 'en', 'yaml'),
       ('failed', 'generate', 'normal', 'error', 'failed', 'en', NULL)`
    );

    const history = store.getQueueHistory({ page: 1, pageSize: 20 });

    assert.deepEqual(
      history.jobs.map(job => [job.jobId, job.status, job.hasResult]),
      [
        ['failed', 'error', false],
        ['partial', 'partial', true],
        ['done', 'complete', true],
      ]
    );
    assert.equal(history.total, 3);
  });

  void it('exposes job-level run metrics in history and today workset rows', () => {
    const progressEvents = JSON.stringify([
      { type: 'step:complete', step: 'searching', duration: 12000, summary: 'searched' },
      { type: 'step:complete', step: 'pondering', duration: 34000, summary: 'pondered' },
      {
        type: 'pipeline:complete',
        yaml: 'yaml',
        scores: { overall_score: 8 },
        totalDuration: 46000,
      },
    ]);

    db.run(
      `INSERT INTO job_queue (
         id, job_type, priority, status, word, language, result_yaml, result_scores,
         progress_events, completed_at, created_at
       )
       VALUES (
         'metric-job',
         'generate',
         'normal',
         'complete',
         'metric',
         'en',
         'yaml',
         '{"overall_score":8}',
         ?,
         datetime('now'),
         datetime('now')
       )`,
      progressEvents
    );

    const [historyJob] = store.getQueueHistory({ page: 1, pageSize: 20 }).jobs;
    const [worksetJob] = store.getTodayWorkset().jobs;

    assert.deepEqual(historyJob.runMetrics, {
      totalDurationMs: 46000,
      totalTokens: null,
      stages: [
        { stage: 'searching', durationMs: 12000, totalTokens: null },
        { stage: 'pondering', durationMs: 34000, totalTokens: null },
      ],
    });
    assert.deepEqual(worksetJob.runMetrics, historyJob.runMetrics);
  });

  void it('refuses to delete active jobs but deletes history jobs', () => {
    db.run(
      `INSERT INTO job_queue (id, job_type, priority, status, word, language)
       VALUES
       ('running-job', 'generate', 'normal', 'running', 'run', 'en'),
       ('done-job', 'generate', 'normal', 'complete', 'done', 'en')`
    );

    assert.equal(store.deleteHistoryJob('running-job'), 'active');
    assert.equal(store.deleteHistoryJob('done-job'), 'deleted');
    assert.equal(store.getRow('done-job'), undefined);
  });

  void it('returns today workset with only the latest result per word and language', () => {
    db.run(
      `INSERT INTO job_queue (
         id, job_type, priority, status, word, language, result_yaml, result_scores, completed_at, created_at
       )
       VALUES
       ('old-crate', 'generate', 'normal', 'complete', 'crate', 'en', 'old yaml', '{"overall_score":4}', datetime('now', '-2 hours'), datetime('now', '-2 hours')),
       ('new-crate', 'fix', 'high', 'complete', 'crate', 'en', 'new yaml', '{"overall_score":8}', datetime('now', '-1 hours'), datetime('now', '-1 hours')),
       ('de-crate', 'generate', 'normal', 'complete', 'crate', 'de', 'de yaml', '{"overall_score":"7"}', datetime('now', '-30 minutes'), datetime('now', '-30 minutes')),
       ('yesterday-word', 'generate', 'normal', 'complete', 'old', 'en', 'yaml', '{"overall_score":9}', datetime('now', '-1 day'), datetime('now', '-1 day')),
       ('no-yaml', 'generate', 'normal', 'complete', 'blank', 'en', '', '{"overall_score":9}', datetime('now'), datetime('now')),
       ('failed', 'generate', 'normal', 'error', 'failed', 'en', 'yaml', '{"overall_score":1}', datetime('now'), datetime('now'))`
    );

    const workset = store.getTodayWorkset();

    assert.equal(workset.total, 2);
    assert.deepEqual(workset.jobs.map(job => job.jobId).sort(), ['de-crate', 'new-crate']);
    assert.equal(workset.jobs.find(job => job.jobId === 'new-crate')?.finalScore, 8);
    assert.equal(workset.jobs.find(job => job.jobId === 'de-crate')?.finalScore, 7);
  });

  void it('marks workset jobs by latest result sync state', () => {
    db.run(
      `INSERT INTO words_v2 (id, lemma, language, content)
       VALUES
       ('word-crate', 'Crate', 'en', '{"yield":{"lemma":"crate"}}'),
       ('word-agent', 'agent', 'en', '{"yield":{"lemma":"old-agent"}}')`
    );
    db.run(
      `INSERT INTO job_queue (
         id, job_type, priority, status, word, language, result_yaml, completed_at, created_at
       )
       VALUES
       ('synced-crate', 'generate', 'normal', 'complete', 'crate', 'en', 'yield:\n  lemma: crate', datetime('now'), datetime('now')),
       ('unsynced-agent', 'generate', 'normal', 'complete', 'agent', 'en', 'yield:\n  lemma: agent', datetime('now'), datetime('now')),
       ('unsaved-kiste', 'generate', 'normal', 'complete', 'Kiste', 'de', 'yield:\n  lemma: Kiste', datetime('now'), datetime('now')),
       ('blocked-partial', 'generate', 'normal', 'partial', 'partial', 'en', 'yield:\n  lemma: partial', datetime('now'), datetime('now'))`
    );
    assert.equal(store.markWorksetJobSynced('synced-crate', 'word-crate'), 'updated');

    const jobs = new Map(store.getTodayWorkset().jobs.map(job => [job.jobId, job]));

    assert.equal(jobs.get('synced-crate')?.syncStatus, 'synced');
    assert.equal(jobs.get('unsynced-agent')?.syncStatus, 'unsynced');
    assert.equal(jobs.get('unsaved-kiste')?.syncStatus, 'not-saved');
    assert.equal(jobs.get('blocked-partial')?.syncStatus, 'blocked');
  });

  void it('uses user review score as the effective workset score', () => {
    db.run(
      `INSERT INTO job_queue (
         id, job_type, priority, status, word, language, result_yaml, result_scores, completed_at, created_at
       )
       VALUES
       (
         'reviewed-crate',
         'generate',
         'normal',
         'complete',
         'crate',
         'en',
         'yaml',
         '{"overall_score":8,"user_review_score":4,"improve_count":2}',
         datetime('now'),
         datetime('now')
       )`
    );

    const [job] = store.getTodayWorkset().jobs;

    assert.equal(job.aiReviewScore, 8);
    assert.equal(job.userReviewScore, 4);
    assert.equal(job.effectiveReviewScore, 4);
    assert.equal(job.finalScore, 4);
    assert.equal(job.auditState, 'complete');
    assert.equal(job.improveCount, 2);
  });

  void it('marks only low-score complete workset jobs with revision notes as improve eligible', () => {
    db.run(
      `INSERT INTO job_queue (
         id, job_type, priority, status, word, language, result_yaml, result_scores, completed_at, created_at
       )
       VALUES
       ('eligible-low', 'generate', 'normal', 'complete', 'eligible', 'en', 'yaml', '{"overall_score":5,"revision_notes":"Fix weak imagery."}', datetime('now'), datetime('now')),
       ('high-score', 'generate', 'normal', 'complete', 'high', 'en', 'yaml', '{"overall_score":8,"revision_notes":"Minor."}', datetime('now'), datetime('now')),
       ('partial-low', 'generate', 'normal', 'partial', 'partial', 'en', 'yaml', '{"overall_score":4,"revision_notes":"Fix."}', datetime('now'), datetime('now')),
       ('missing-notes', 'generate', 'normal', 'complete', 'notes', 'en', 'yaml', '{"overall_score":4}', datetime('now'), datetime('now')),
       ('audit-incomplete', 'generate', 'normal', 'complete', 'audit', 'en', 'yaml', '{"_parse_error":true}', datetime('now'), datetime('now'))`
    );

    const jobs = new Map(store.getTodayWorkset().jobs.map(job => [job.jobId, job]));

    assert.equal(jobs.get('eligible-low')?.improveEligible, true);
    assert.equal(jobs.get('eligible-low')?.improveBlockedReason, undefined);
    assert.equal(jobs.get('high-score')?.improveEligible, false);
    assert.equal(jobs.get('high-score')?.improveBlockedReason, 'score-not-low');
    assert.equal(jobs.get('partial-low')?.improveEligible, false);
    assert.equal(jobs.get('partial-low')?.improveBlockedReason, 'partial-result');
    assert.equal(jobs.get('missing-notes')?.improveEligible, false);
    assert.equal(jobs.get('missing-notes')?.improveBlockedReason, 'missing-revision-notes');
    assert.equal(jobs.get('audit-incomplete')?.improveEligible, false);
    assert.equal(jobs.get('audit-incomplete')?.improveBlockedReason, 'audit-incomplete');
  });

  void it('does not expose malformed audit output as an effective perfect score', () => {
    db.run(
      `INSERT INTO job_queue (
         id, job_type, priority, status, word, language, result_yaml, result_scores, completed_at, created_at
       )
       VALUES
       (
         'bad-perfect',
         'generate',
         'normal',
         'complete',
         'perfect',
         'en',
         'yaml',
         '{"_parse_error":true,"overall_score":10,"revision_notes":"Truncated"}',
         datetime('now'),
         datetime('now')
       )`
    );

    const [job] = store.getTodayWorkset().jobs;

    assert.equal(job.aiReviewScore, 10);
    assert.equal(job.effectiveReviewScore, null);
    assert.equal(job.finalScore, null);
    assert.equal(job.auditState, 'incomplete');
    assert.equal(job.improveEligible, false);
    assert.equal(job.improveBlockedReason, 'audit-incomplete');
  });

  void it('returns today workset without correlated scans over repeated words', () => {
    const insert = `
      INSERT INTO job_queue (
        id, job_type, priority, status, word, language, result_yaml, completed_at, created_at
      )
      VALUES (?, 'generate', 'normal', 'complete', ?, 'en', 'yaml', datetime('now', ?), datetime('now', ?))
    `;

    for (let i = 0; i < 500; i += 1) {
      const word = `word-${i % 25}`;
      const offset = `-${500 - i} seconds`;
      db.run(insert, `job-${i}`, word, offset, offset);
    }

    const start = performance.now();
    const workset = store.getTodayWorkset();
    const elapsedMs = performance.now() - start;

    assert.equal(workset.total, 25);
    assert.ok(elapsedMs < 100, `expected workset refresh query to stay quick, got ${elapsedMs}ms`);
  });
});
