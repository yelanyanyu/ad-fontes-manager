import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { JobLifecycle } from './JobLifecycle';
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

void describe('JobLifecycle', () => {
  let db: SqliteLike;
  let store: QueueStore;
  let lifecycle: JobLifecycle;

  beforeEach(() => {
    db = createTestDb();
    store = new QueueStore(() => db);
    lifecycle = new JobLifecycle(store);
    db.run(
      `INSERT INTO job_queue (id, job_type, priority, status, word, language)
       VALUES ('job-1', 'generate', 'normal', 'running', 'crate', 'en')`
    );
  });

  void it('persists non-token progress and rebuilds step results', () => {
    lifecycle.emitProgress('job-1', { type: 'step:start', step: 'searching', message: 'Search' });
    lifecycle.emitProgress('job-1', { type: 'step:tokens', step: 'searching', chunk: 'ignored' });
    lifecycle.emitProgress('job-1', {
      type: 'step:complete',
      step: 'searching',
      duration: 12,
      summary: 'Searched',
      result: { researchYaml: 'yield:\n  lemma: crate\n' },
      rawText: 'yield:\n  lemma: crate\n',
      reasoningText: 'search thinking',
    });

    const reloaded = new JobLifecycle(store);
    const events = reloaded.getCompletedSteps('job-1');
    assert.deepEqual(
      events.map(event => event.type),
      ['step:start', 'step:complete']
    );
    const steps = reloaded.buildStepResults(events);
    assert.equal(steps.length, 1);
    assert.deepEqual(
      {
        step: steps[0].step,
        status: steps[0].status,
        summary: steps[0].summary,
        durationMs: steps[0].durationMs,
        result: steps[0].result,
        rawText: steps[0].rawText,
        reasoningText: steps[0].reasoningText,
      },
      {
        step: 'searching',
        status: 'complete',
        summary: 'Searched',
        durationMs: 12,
        result: { researchYaml: 'yield:\n  lemma: crate\n' },
        rawText: 'yield:\n  lemma: crate\n',
        reasoningText: 'search thinking',
      }
    );
  });

  void it('replays existing events to late subscribers and streams future events', () => {
    lifecycle.emitProgress('job-1', { type: 'job:started' });
    const written: string[] = [];
    lifecycle.subscribe('job-1', { write: chunk => written.push(chunk) });
    lifecycle.emitProgress('job-1', { type: 'step:start', step: 'auditing', message: 'Audit' });

    assert.ok(written.some(chunk => chunk.includes('event: job:started')));
    assert.ok(written.some(chunk => chunk.includes('event: step:start')));
  });
});
