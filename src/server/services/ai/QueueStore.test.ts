import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
});
