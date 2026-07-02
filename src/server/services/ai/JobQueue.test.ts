import { beforeEach, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import type { PipelineProgressEvent, PipelineRunner } from './types';

// ---- Fake Runner ----

const FAKE_YAML = 'yield:\n  lemma: test\n  language: en\n';
const FAKE_SCORES = { overall_score: 7 };

class FakeRunner implements PipelineRunner {
  async run({ onProgress }: Parameters<PipelineRunner['run']>[0]): Promise<{
    yaml: string;
    scores: Record<string, unknown>;
  }> {
    // job:started is now emitted by JobQueue.startJob() — not by the runner.
    onProgress({ type: 'step:start', step: 'searching', message: 'Searching' });
    onProgress({ type: 'step:complete', step: 'searching', duration: 100, summary: 'Done' });
    onProgress({
      type: 'pipeline:complete',
      yaml: FAKE_YAML,
      scores: FAKE_SCORES,
      totalDuration: 100,
    });
    return { yaml: FAKE_YAML, scores: FAKE_SCORES };
  }
}

// Runner whose Promise stays pending until release() is called.
// Supports multiple concurrent calls — each call gets its own pending Promise.
// Used to test cancel-when-running and queue-ordering behavior.
class BlockingFakeRunner implements PipelineRunner {
  private pending = new Map<
    string,
    {
      resolve: (value: { yaml: string; scores: Record<string, unknown> }) => void;
      reject: (err: Error) => void;
      signal: AbortSignal | undefined;
    }
  >();
  private callCount = 0;
  private _runOrder: string[] = [];

  async run({ input, abortSignal: _abortSignal }: Parameters<PipelineRunner['run']>[0]): Promise<{
    yaml: string;
    scores: Record<string, unknown>;
  }> {
    this._runOrder.push(input.word);
    const key = input.word + '_' + ++this.callCount;
    // job:started is now emitted by JobQueue.startJob() — not by the runner.
    const promise = new Promise<{ yaml: string; scores: Record<string, unknown> }>(
      (resolve, reject) => {
        this.pending.set(key, { resolve, reject, signal: _abortSignal as AbortSignal | undefined });
      }
    );
    return promise;
  }

  release(result?: { yaml: string; scores: Record<string, unknown> }): void {
    const [key] = this.pending.keys();
    if (key) {
      this.pending.get(key)!.resolve(result || { yaml: FAKE_YAML, scores: FAKE_SCORES });
      this.pending.delete(key);
    }
  }

  releaseAll(): void {
    for (const [key, pending] of this.pending) {
      pending.resolve({ yaml: FAKE_YAML, scores: FAKE_SCORES });
      this.pending.delete(key);
    }
  }

  fail(err: Error): void {
    const [key] = this.pending.keys();
    if (key) {
      this.pending.get(key)!.reject(err);
      this.pending.delete(key);
    }
  }

  get signal(): AbortSignal | undefined {
    const [key] = this.pending.keys();
    return key ? this.pending.get(key)!.signal : undefined;
  }

  get activeCount(): number {
    return this.pending.size;
  }

  get runOrder(): string[] {
    return this._runOrder;
  }

  resetRunOrder(): void {
    this._runOrder = [];
  }
}

// ---- In-memory DB factory ----

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
  CREATE INDEX IF NOT EXISTS idx_job_queue_batch_id ON job_queue(batch_id);
  CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status);
  CREATE INDEX IF NOT EXISTS idx_job_queue_priority_created ON job_queue(priority, created_at);
`;

// Thin wrapper around better-sqlite3 providing .get(), .run(), .all().
// Drizzle transaction clients expose the same methods, so this interface
// works for both test (raw SQLite) and production (Drizzle tx).
interface SqliteLike {
  get: (sql: string, ...params: unknown[]) => Record<string, unknown> | undefined;
  run: (sql: string, ...params: unknown[]) => { changes: number };
  all: (sql: string, ...params: unknown[]) => Record<string, unknown>[];
}

function createTestDb(): SqliteLike {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(JOB_QUEUE_DDL);
  return {
    get: (sql: string, ...params: unknown[]) =>
      sqlite.prepare(sql).get(...params) as Record<string, unknown> | undefined,
    run: (sql: string, ...params: unknown[]) => sqlite.prepare(sql).run(...params),
    all: (sql: string, ...params: unknown[]) =>
      sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
}

// ---- Tests ----

void describe('JobQueue', () => {
  let getDb: () => SqliteLike;
  let fakeRunner: FakeRunner;

  beforeEach(() => {
    const db = createTestDb();
    getDb = () => db;
    fakeRunner = new FakeRunner();
  });

  afterEach(() => {
    delete require.cache[require.resolve('./JobQueue')];
  });

  void it('enqueues a Generate Job, dequeues it, and runs it to completion', async () => {
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };

    const queue = new JobQueue({
      getDb,
      maxConcurrency: 1,
      runner: fakeRunner,
    });

    const jobId = queue.enqueue({
      type: 'generate',
      priority: 'normal',
      word: 'test',
      language: 'en',
    });

    assert.equal(typeof jobId, 'string');
    assert.ok(jobId.length > 0);

    // Yield to let the async runner.then() callback execute.
    // FakeRunner resolves synchronously; one microtask tick is sufficient.
    await new Promise(r => setTimeout(r, 0));

    const job = queue.getJob(jobId);
    assert.equal(job.status, 'complete');
    assert.equal(job.result.yaml, FAKE_YAML);
    assert.deepEqual(job.result.scores, FAKE_SCORES);
    assert.equal(job.word, 'test');
    assert.equal(job.language, 'en');
  });

  void it('persists stage events and parsed context for history and later resume', async () => {
    const partialRunner: PipelineRunner = {
      async run({ onProgress }) {
        const researchYaml = 'yield:\n  lemma: partial-word\n  language: en\n';
        onProgress({ type: 'step:start', step: 'searching', message: 'Searching' });
        onProgress({
          type: 'step:complete',
          step: 'searching',
          duration: 100,
          summary: 'Searched',
          result: { researchYaml },
          rawText: researchYaml,
        });
        onProgress({ type: 'step:start', step: 'pondering', message: 'Pondering' });
        onProgress({
          type: 'step:complete',
          step: 'pondering',
          duration: 50,
          summary: 'Stopped: pondering empty',
          result: {},
          rawText: '',
        });
        onProgress({
          type: 'pipeline:stopped',
          yaml: researchYaml,
          stoppedAtStage: 'pondering',
          reason: 'pondering: LLM returned empty text',
        });
        return { yaml: researchYaml, scores: {} };
      },
    };
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };
    const queue = new JobQueue({ getDb, maxConcurrency: 1, runner: partialRunner });

    const jobId = queue.enqueue({
      type: 'generate',
      priority: 'normal',
      word: 'partial-word',
      language: 'en',
    });
    await new Promise(r => setTimeout(r, 0));

    const reloadedQueue = new JobQueue({ getDb, maxConcurrency: 1, runner: partialRunner });
    const job = reloadedQueue.getJob(jobId);
    assert.equal(job.status, 'partial');
    assert.deepEqual(
      job.steps.map((step: { step: string; status: string; result?: unknown }) => ({
        step: step.step,
        status: step.status,
        result: step.result,
      })),
      [
        {
          step: 'searching',
          status: 'complete',
          result: { researchYaml: 'yield:\n  lemma: partial-word\n  language: en\n' },
        },
        { step: 'pondering', status: 'complete', result: {} },
      ]
    );
    assert.deepEqual(
      reloadedQueue
        .getCompletedSteps(jobId)
        .filter((event: PipelineProgressEvent) => event.type === 'step:complete')
        .map((event: Extract<PipelineProgressEvent, { type: 'step:complete' }>) => event.result),
      [{ researchYaml: 'yield:\n  lemma: partial-word\n  language: en\n' }, {}]
    );
  });

  void it('cancels a queued Job before it is dequeued', async () => {
    const blockingRunner = new BlockingFakeRunner();
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };

    const queue = new JobQueue({
      getDb,
      maxConcurrency: 1,
      runner: blockingRunner,
    });

    // First Job blocks the only slot.
    queue.enqueue({
      type: 'generate',
      priority: 'normal',
      word: 'blocker',
      language: 'en',
    });

    // Second Job is queued (concurrency=1, slot occupied).
    const job2Id = queue.enqueue({
      type: 'generate',
      priority: 'normal',
      word: 'queued-word',
      language: 'en',
    });

    assert.equal(queue.getJob(job2Id).status, 'queued');

    const cancelled = queue.cancel(job2Id);
    assert.equal(cancelled, true);

    const job = queue.getJob(job2Id);
    assert.equal(job.status, 'cancelled');

    // Release the blocker so the test can clean up.
    blockingRunner.release();
    await new Promise(r => setTimeout(r, 0));

    // Cancelled Job was never run — blocker completed, but job2 stayed cancelled.
    assert.equal(queue.getJob(job2Id).status, 'cancelled');
  });

  void it('cancels a running Job by aborting its AbortController', async () => {
    const blockingRunner = new BlockingFakeRunner();
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };

    const queue = new JobQueue({
      getDb,
      maxConcurrency: 1,
      runner: blockingRunner,
    });

    const jobId = queue.enqueue({
      type: 'generate',
      priority: 'normal',
      word: 'to-cancel',
      language: 'en',
    });

    // Job should now be running (blocked by BlockingFakeRunner).
    assert.equal(queue.getJob(jobId).status, 'running');

    // AbortController should have been registered.
    assert.ok(blockingRunner.signal, 'AbortSignal should be passed to runner');

    const cancelled = queue.cancel(jobId);
    assert.equal(cancelled, true);

    // AbortController was triggered.
    assert.equal(blockingRunner.signal?.aborted, true);

    // Runner now rejects; yield for the catch handler.
    blockingRunner.fail(new Error('Aborted'));
    await new Promise(r => setTimeout(r, 0));

    const job = queue.getJob(jobId);
    assert.ok(job.status === 'error' || job.status === 'cancelled');
    assert.ok(job.error?.includes('cancelled') || job.error?.includes('Aborted'));
  });

  void it('replays completed steps to a late SSE subscriber', async () => {
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };

    const queue = new JobQueue({
      getDb,
      maxConcurrency: 1,
      runner: fakeRunner,
    });

    const jobId = queue.enqueue({
      type: 'generate',
      priority: 'normal',
      word: 'stream-test',
      language: 'en',
    });

    await new Promise(r => setTimeout(r, 0));
    assert.equal(queue.getJob(jobId).status, 'complete');

    // Late subscriber — should receive replayed events.
    const written: string[] = [];
    const mockRes = {
      write: (chunk: string) => {
        written.push(chunk);
      },
    };

    queue.subscribe(jobId, mockRes);

    // Find replayed step:complete event.
    const completeEvent = written.find(line => line.includes('step:complete'));
    assert.ok(completeEvent, 'should replay step:complete to late subscriber');
    assert.ok(completeEvent.includes('searching'));
  });

  void it('resets running Jobs to queued on construction (restart recovery)', async () => {
    // Simulate a crash: insert a 'running' Job into the DB directly.
    const db = getDb();
    db.run(
      `INSERT INTO job_queue (id, job_type, priority, status, word, language)
       VALUES (?, 'generate', 'normal', 'running', 'orphan', 'en')`,
      'orphan-job'
    );
    db.run(
      `INSERT INTO job_queue (id, job_type, priority, status, word, language)
       VALUES (?, 'generate', 'normal', 'paused', 'paused-word', 'en')`,
      'paused-job'
    );

    // Creating a new JobQueue triggers restart recovery (running → queued).
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };
    const queue = new JobQueue({
      getDb,
      maxConcurrency: 1,
      runner: fakeRunner,
    });

    // Let the recovered orphan run to completion.
    await new Promise(r => setTimeout(r, 0));

    const orphan = queue.getJob('orphan-job');
    assert.equal(orphan.status, 'complete');

    // Paused Job stays paused — user intent preserved.
    const paused = queue.getJob('paused-job');
    assert.equal(paused.status, 'paused');
  });

  void it('passes resumeFromStage and previousContext to the runner', async () => {
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };

    let capturedParams: Parameters<PipelineRunner['run']>[0] | null = null;
    const recordRunner: PipelineRunner = {
      async run(params) {
        capturedParams = params;
        return { yaml: FAKE_YAML, scores: FAKE_SCORES };
      },
    };

    const queue = new JobQueue({
      getDb,
      maxConcurrency: 1,
      runner: recordRunner,
    });

    queue.enqueue({
      type: 'generate',
      priority: 'normal',
      word: 'resume-word',
      language: 'en',
      resumeFromStage: 'pondering',
      previousContext: { researchYaml: 'yield:\n  lemma: prior\n' },
      previousSteps: [
        {
          step: 'searching',
          summary: 'done',
          duration: 100,
          result: { researchYaml: 'yield:\n  lemma: prior\n' },
        },
      ],
    });

    await new Promise(r => setTimeout(r, 0));

    assert.ok(capturedParams, 'runner should have been called');

    const params = capturedParams as any;
    assert.equal(params.resumeFromStage, 'pondering');
    assert.deepEqual(params.previousContext, { researchYaml: 'yield:\n  lemma: prior\n' });
    assert.equal(params.previousSteps?.length, 1);
    assert.equal(params.previousSteps?.[0].step, 'searching');
  });
});

// ---- Concurrency + priority tests ----

void describe('JobQueue concurrency', () => {
  let getDb: () => SqliteLike;
  let blockingRunner: BlockingFakeRunner;

  beforeEach(() => {
    const db = createTestDb();
    getDb = () => db;
    blockingRunner = new BlockingFakeRunner();
    delete require.cache[require.resolve('./JobQueue')];
  });

  void it('runs up to maxConcurrency Jobs simultaneously', async () => {
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };

    const queue = new JobQueue({
      getDb,
      maxConcurrency: 3,
      runner: blockingRunner,
    });

    queue.enqueue({ type: 'generate', priority: 'normal', word: 'a', language: 'en' });
    queue.enqueue({ type: 'generate', priority: 'normal', word: 'b', language: 'en' });
    queue.enqueue({ type: 'generate', priority: 'normal', word: 'c', language: 'en' });

    assert.equal(blockingRunner.activeCount, 3, 'all 3 jobs should be running concurrently');

    blockingRunner.releaseAll();
    await new Promise(r => setTimeout(r, 0));
  });

  void it('with maxConcurrency=1 runs Jobs one at a time', async () => {
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };

    const queue = new JobQueue({
      getDb,
      maxConcurrency: 1,
      runner: blockingRunner,
    });

    queue.enqueue({ type: 'generate', priority: 'normal', word: 'a', language: 'en' });
    queue.enqueue({ type: 'generate', priority: 'normal', word: 'b', language: 'en' });

    assert.equal(blockingRunner.activeCount, 1, 'only first job should be running');

    blockingRunner.release();
    await new Promise(r => setTimeout(r, 0));

    assert.equal(blockingRunner.activeCount, 1, 'second job should now be running');

    blockingRunner.releaseAll();
    await new Promise(r => setTimeout(r, 0));
  });

  void it('dequeues high-priority Jobs before normal-priority ones', async () => {
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };

    const queue = new JobQueue({
      getDb,
      maxConcurrency: 1,
      runner: blockingRunner,
    });

    // Enqueue normal Job — runs immediately (blocked by blocking runner).
    queue.enqueue({ type: 'generate', priority: 'normal', word: 'normal-first', language: 'en' });
    assert.equal(blockingRunner.activeCount, 1);

    // Enqueue high-priority Job — queued (slot full).
    queue.enqueue({ type: 'fix', priority: 'high', word: 'high-second', language: 'en' });

    // Release the running normal Job.
    blockingRunner.release();
    await new Promise(r => setTimeout(r, 0));

    // After the slot freed, the high-priority Job should have been dequeued
    // before any other queued Jobs.
    const order = blockingRunner.runOrder;
    assert.equal(order.length, 2);
    assert.equal(order[0], 'normal-first');
    assert.equal(order[1], 'high-second');

    blockingRunner.releaseAll();
    await new Promise(r => setTimeout(r, 0));
  });

  void it('dequeues queued high-priority Jobs ahead of queued normal-priority Jobs', async () => {
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };

    const queue = new JobQueue({
      getDb,
      maxConcurrency: 1,
      runner: blockingRunner,
    });

    queue.enqueue({ type: 'generate', priority: 'normal', word: 'blocker', language: 'en' });
    queue.enqueue({ type: 'generate', priority: 'normal', word: 'normal-queued', language: 'en' });
    queue.enqueue({ type: 'fix', priority: 'high', word: 'high-queued', language: 'en' });

    blockingRunner.release();
    await new Promise(r => setTimeout(r, 0));

    assert.deepEqual(blockingRunner.runOrder.slice(0, 2), ['blocker', 'high-queued']);

    blockingRunner.releaseAll();
    await new Promise(r => setTimeout(r, 0));
  });
});

// ---- Fix Job tests ----

void describe('JobQueue Fix Job', () => {
  let getDb: () => SqliteLike;

  beforeEach(() => {
    const db = createTestDb();
    getDb = () => db;
    delete require.cache[require.resolve('./JobQueue')];
  });

  void it('runs a Fix Job with the fix pipeline and target YAML as context', async () => {
    // Insert a completed Generate Job with a known YAML.
    const targetYaml = 'yield:\n  lemma: conduct\netymology:\n  root: duct\n';
    const db = getDb();
    db.run(
      `INSERT INTO job_queue (id, job_type, priority, status, word, language, result_yaml, result_scores)
       VALUES (?, 'generate', 'normal', 'complete', 'conduct', 'en', ?, ?)`,
      'target-job',
      targetYaml,
      '{"overall_score":4}'
    );

    let capturedDef: { id: string } | null = null;
    let capturedYaml: string | undefined;

    const recordRunner: PipelineRunner = {
      async run(params) {
        capturedDef = params.definition;
        capturedYaml = (params.previousContext as any)?.researchYaml as string | undefined;
        return {
          yaml: 'yield:\n  lemma: conduct\netymology:\n  root: duct\n  fixed: true\n',
          scores: {},
        };
      },
    };

    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };

    const queue = new JobQueue({
      getDb,
      maxConcurrency: 1,
      runner: recordRunner,
    });

    const jobId = queue.enqueue({
      type: 'fix',
      priority: 'high',
      word: 'conduct',
      language: 'en',
      targetJobId: 'target-job',
    });

    await new Promise(r => setTimeout(r, 0));

    assert.ok(capturedDef, 'runner should have been called');
    assert.equal((capturedDef as any).id, 'fix');
    assert.ok(capturedYaml?.includes(targetYaml), 'fix context should include target YAML');

    const job = queue.getJob(jobId);
    assert.equal(job.status, 'complete');
  });

  void it('runs an Audit-Fix Job using target_word_id from words_v2', async () => {
    // Create words_v2 table and insert a saved word.
    const db = getDb();
    db.run(`CREATE TABLE IF NOT EXISTS words_v2 (
      id TEXT PRIMARY KEY NOT NULL,
      lemma TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en',
      content TEXT NOT NULL
    )`);
    const wordYaml = 'yield:\n  lemma: saved-word\n  language: en\n';
    db.run(
      `INSERT INTO words_v2 (id, lemma, language, content) VALUES (?, ?, ?, ?)`,
      'word-1',
      'saved-word',
      'en',
      wordYaml
    );

    let capturedDef: { id: string } | null = null;
    let capturedYaml: string | undefined;

    const recordRunner: PipelineRunner = {
      async run(params) {
        capturedDef = params.definition;
        capturedYaml = (params.previousContext as any)?.researchYaml as string | undefined;
        return { yaml: wordYaml, scores: { overall_score: 8 } };
      },
    };

    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };

    const queue = new JobQueue({
      getDb,
      maxConcurrency: 1,
      runner: recordRunner,
    });

    const jobId = queue.enqueue({
      type: 'audit-fix',
      priority: 'high',
      word: 'saved-word',
      language: 'en',
      targetWordId: 'word-1',
    });

    await new Promise(r => setTimeout(r, 0));

    assert.ok(capturedDef, 'runner should have been called');
    assert.equal((capturedDef as any).id, 'audit-fix');
    assert.ok(capturedYaml?.includes('saved-word'), 'audit-fix context should include word YAML');

    const job = queue.getJob(jobId);
    assert.equal(job.status, 'complete');
  });
});

// ---- Circuit breaker tests ----

void describe('JobQueue circuit breaker', () => {
  let getDb: () => SqliteLike;

  beforeEach(() => {
    const db = createTestDb();
    getDb = () => db;
    delete require.cache[require.resolve('./JobQueue')];
  });

  void it('pauses provider after 3 consecutive failures', async () => {
    let callCount = 0;
    const failingRunner: PipelineRunner = {
      async run() {
        callCount++;
        throw new Error('Provider 500 error');
      },
    };

    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };

    const queue = new JobQueue({
      getDb,
      maxConcurrency: 1,
      runner: failingRunner,
    });

    // 3 failing Jobs for the same provider.
    const failedIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const id = queue.enqueue({
        type: 'generate',
        priority: 'normal',
        word: `fail-${i}`,
        language: 'en',
        providerId: 'bad-provider',
      });
      failedIds.push(id);
      await new Promise(r => setTimeout(r, 10));
    }
    assert.equal(callCount, 3, 'all 3 jobs should have been attempted');

    // 4th Job for same provider — should stay queued (circuit breaker blocks).
    const blockedId = queue.enqueue({
      type: 'generate',
      priority: 'normal',
      word: 'blocked',
      language: 'en',
      providerId: 'bad-provider',
    });
    await new Promise(r => setTimeout(r, 10));
    assert.equal(queue.getJob(blockedId).status, 'queued');
    assert.equal(callCount, 3, 'circuit breaker should block dispatch');

    // Job for a different provider should still dequeue.
    queue.enqueue({
      type: 'generate',
      priority: 'normal',
      word: 'other',
      language: 'en',
      providerId: 'good-provider',
    });
    await new Promise(r => setTimeout(r, 10));
    assert.equal(callCount, 4, 'different provider should not be blocked');

    // After resetCircuitBreaker, blocked provider works again.
    // Note: the previously-blocked "blocked" job is still queued and will
    // also run before the new "recovered" job (FIFO by created_at).
    queue.resetCircuitBreaker('bad-provider');
    queue.enqueue({
      type: 'generate',
      priority: 'normal',
      word: 'recovered',
      language: 'en',
      providerId: 'bad-provider',
    });
    await new Promise(r => setTimeout(r, 20));
    // Two jobs run: the old blocked job + the new recovered job.
    assert.equal(callCount, 6, 'after reset, both blocked and new jobs should run');
  });
});

// ---- Batch tests ----

void describe('JobQueue batch', () => {
  let getDb: () => SqliteLike;
  let blockingRunner: BlockingFakeRunner;
  let _batchJobSeq = 0;

  beforeEach(() => {
    const db = createTestDb();
    getDb = () => db;
    blockingRunner = new BlockingFakeRunner();
    _batchJobSeq = 0;
    delete require.cache[require.resolve('./JobQueue')];
  });

  function enqueueBatchJobs(
    _queue: unknown,
    batchId: string,
    words: string[],
    status = 'queued'
  ): string[] {
    const db = getDb();
    return words.map(word => {
      const jobId = `batch-job-${batchId}-${++_batchJobSeq}`;
      db.run(
        `INSERT INTO job_queue (id, batch_id, job_type, priority, status, word, language)
         VALUES (?, ?, 'generate', 'normal', ?, ?, 'en')`,
        jobId,
        batchId,
        status,
        word
      );
      return jobId;
    });
  }

  void it('returns aggregate batch status', async () => {
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };

    const queue = new JobQueue({
      getDb,
      maxConcurrency: 1,
      runner: blockingRunner,
    });

    const batchId = 'batch-test-1';
    // Create 5 jobs: 1 running, 2 queued, 1 error, 1 complete.
    enqueueBatchJobs(queue, batchId, ['running-word'], 'running');
    enqueueBatchJobs(queue, batchId, ['queued-a', 'queued-b'], 'queued');
    enqueueBatchJobs(queue, batchId, ['error-word'], 'error');
    enqueueBatchJobs(queue, batchId, ['done-word'], 'complete');

    const status = queue.getBatchStatus(batchId);
    assert.equal(status.total, 5);
    assert.equal(status.running, 1);
    assert.equal(status.queued, 2);
    assert.equal(status.error, 1);
    assert.equal(status.complete, 1);
    assert.equal(status.done, 1); // complete counts as done
    assert.equal(status.failed, 1); // error counts as failed
  });

  void it('pauses all queued Jobs in a batch without affecting running ones', async () => {
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };

    const queue = new JobQueue({
      getDb,
      maxConcurrency: 1,
      runner: blockingRunner,
    });

    const batchId = 'batch-pause-1';
    enqueueBatchJobs(queue, batchId, ['running-word'], 'running');
    enqueueBatchJobs(queue, batchId, ['queued-word'], 'queued');

    queue.pauseBatch(batchId);

    const status = queue.getBatchStatus(batchId);
    assert.equal(status.paused, 1, 'queued job should become paused');
    assert.equal(status.running, 1, 'running job should stay running');
  });

  void it('resumes paused Jobs in a batch', async () => {
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };

    const queue = new JobQueue({
      getDb,
      maxConcurrency: 1,
      runner: blockingRunner,
    });

    const batchId = 'batch-resume-1';
    enqueueBatchJobs(queue, batchId, ['paused-word'], 'paused');

    queue.resumeBatch(batchId);

    // tryDequeue() runs after resume, so the job is now running.
    const status = queue.getBatchStatus(batchId);
    assert.equal(status.running, 1);
    assert.equal(status.paused, 0);
  });

  void it('cancels queued and paused Jobs but not running ones', async () => {
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };

    const queue = new JobQueue({
      getDb,
      maxConcurrency: 1,
      runner: blockingRunner,
    });

    const batchId = 'batch-cancel-1';
    enqueueBatchJobs(queue, batchId, ['running-word'], 'running');
    enqueueBatchJobs(queue, batchId, ['q-word'], 'queued');
    enqueueBatchJobs(queue, batchId, ['p-word'], 'paused');

    queue.cancelBatch(batchId);

    const status = queue.getBatchStatus(batchId);
    assert.equal(status.cancelled, 2, 'queued + paused should become cancelled');
    assert.equal(status.running, 1, 'running should stay running');
  });

  void it('retries errored Jobs in a batch', async () => {
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };

    const queue = new JobQueue({
      getDb,
      maxConcurrency: 1,
      runner: blockingRunner,
    });

    const batchId = 'batch-retry-1';
    enqueueBatchJobs(queue, batchId, ['err-word'], 'error');
    enqueueBatchJobs(queue, batchId, ['done-word'], 'complete');

    queue.retryBatch(batchId);

    // tryDequeue() runs after retry, so the job is now running.
    const status = queue.getBatchStatus(batchId);
    assert.equal(status.running, 1, 'error should be retried and now running');
    assert.equal(status.error, 0);
    assert.equal(status.complete, 1, 'complete should stay complete');
  });
});

// ---- Lifecycle events + getCompletedSteps tests ----

void describe('JobQueue lifecycle events and extended state', () => {
  let getDb: () => SqliteLike;
  let fakeRunner: FakeRunner;

  beforeEach(() => {
    const db = createTestDb();
    getDb = () => db;
    fakeRunner = new FakeRunner();
    delete require.cache[require.resolve('./JobQueue')];
  });

  void it('getCompletedSteps returns stored non-token events for a completed job', async () => {
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };
    const queue = new JobQueue({ getDb, maxConcurrency: 1, runner: fakeRunner });

    const jobId = queue.enqueue({
      type: 'generate',
      priority: 'normal',
      word: 'steps-test',
      language: 'en',
    });
    await new Promise(r => setTimeout(r, 0));
    assert.equal(queue.getJob(jobId).status, 'complete');

    const steps = queue.getCompletedSteps(jobId);
    assert.ok(steps.length > 0, 'should have stored steps');

    const stepStart = steps.find((e: any) => e.type === 'step:start');
    assert.ok(stepStart, 'should include step:start');
    assert.equal(stepStart.step, 'searching');

    const stepComplete = steps.find((e: any) => e.type === 'step:complete');
    assert.ok(stepComplete, 'should include step:complete');
  });

  void it('getCompletedSteps returns empty array for unknown jobId', () => {
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };
    const queue = new JobQueue({ getDb, maxConcurrency: 1, runner: fakeRunner });

    assert.deepEqual(queue.getCompletedSteps('nonexistent'), []);
  });

  void it('getJob returns context and notes fields', async () => {
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };
    const queue = new JobQueue({ getDb, maxConcurrency: 1, runner: fakeRunner });

    const jobId = queue.enqueue({
      type: 'generate',
      priority: 'normal',
      word: 'context-test',
      language: 'en',
      context: 'He conducted the orchestra.',
      notes: 'Focus on musical usage',
    });
    await new Promise(r => setTimeout(r, 0));

    const job = queue.getJob(jobId);
    assert.equal(job.context, 'He conducted the orchestra.');
    assert.equal(job.notes, 'Focus on musical usage');
  });

  void it('prefers the fixing fullYaml over reconstructed search and pondering YAML', () => {
    const db = getDb();
    const fixedYaml = 'yield:\n  lemma: repair\n  language: en\nfixed: true\n';
    db.run(
      `INSERT INTO job_queue (
        id, job_type, priority, status, word, language, result_yaml, result_scores, progress_events
      )
       VALUES (?, 'fix', 'high', 'complete', 'repair', 'en', ?, '{}', ?)`,
      'fix-result-job',
      'yield:\n  lemma: repair\n  language: en\n',
      JSON.stringify([
        {
          type: 'step:complete',
          step: 'searching',
          duration: 10,
          summary: 'Searched',
          result: { researchYaml: 'yield:\n  lemma: repair\n  language: en\n' },
        },
        {
          type: 'step:complete',
          step: 'pondering',
          duration: 20,
          summary: 'Pondered',
          result: {
            creativeYaml:
              'etymology:\n  visual_imagery_zh: old\n  meaning_evolution_zh: old\nnuance:\n  image_differentiation_zh: old\n',
          },
        },
        {
          type: 'step:complete',
          step: 'fixing',
          duration: 30,
          summary: 'Fixed',
          result: { fullYaml: fixedYaml },
        },
      ])
    );

    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };
    const queue = new JobQueue({ getDb, maxConcurrency: 1, runner: fakeRunner });

    assert.equal(queue.getJob('fix-result-job').result.yaml, fixedYaml);
  });

  void it('subscribe writes job:queued event with position for a queued Job', async () => {
    const blockingRunner = new BlockingFakeRunner();
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };
    const queue = new JobQueue({ getDb, maxConcurrency: 1, runner: blockingRunner });

    // First Job blocks the only slot.
    queue.enqueue({
      type: 'generate',
      priority: 'normal',
      word: 'blocker',
      language: 'en',
    });

    // Second Job is queued (concurrency=1, slot occupied).
    const job2Id = queue.enqueue({
      type: 'generate',
      priority: 'normal',
      word: 'queued-word',
      language: 'en',
    });
    assert.equal(queue.getJob(job2Id).status, 'queued');

    const written: string[] = [];
    const mockRes = {
      write: (chunk: string) => {
        written.push(chunk);
      },
    };

    queue.subscribe(job2Id, mockRes);

    const queuedEvent = written.find(line => line.includes('job:queued'));
    assert.ok(queuedEvent, 'should emit job:queued for a queued Job');
    assert.ok(queuedEvent.includes('"position"'), 'should include position field');

    blockingRunner.releaseAll();
    await new Promise(r => setTimeout(r, 0));
  });

  void it('subscribe replays job:started for a running Job', async () => {
    const blockingRunner = new BlockingFakeRunner();
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };
    const queue = new JobQueue({ getDb, maxConcurrency: 1, runner: blockingRunner });

    const jobId = queue.enqueue({
      type: 'generate',
      priority: 'normal',
      word: 'running-word',
      language: 'en',
    });
    assert.equal(queue.getJob(jobId).status, 'running');

    const written: string[] = [];
    const mockRes = {
      write: (chunk: string) => {
        written.push(chunk);
      },
    };

    queue.subscribe(jobId, mockRes);

    // job:started should be in replayed steps (emitted by JobQueue.startJob).
    const startedEvent = written.find(line => line.includes('job:started'));
    assert.ok(startedEvent, 'should replay job:started for a running Job');

    blockingRunner.releaseAll();
    await new Promise(r => setTimeout(r, 0));
  });

  void it('subscribe replays completed steps for a late subscriber even after job is done', async () => {
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };
    const queue = new JobQueue({ getDb, maxConcurrency: 1, runner: fakeRunner });

    const jobId = queue.enqueue({
      type: 'generate',
      priority: 'normal',
      word: 'late-sub',
      language: 'en',
    });
    await new Promise(r => setTimeout(r, 0));
    assert.equal(queue.getJob(jobId).status, 'complete');

    const written: string[] = [];
    const mockRes = {
      write: (chunk: string) => {
        written.push(chunk);
      },
    };

    queue.subscribe(jobId, mockRes);

    // Late subscriber should get job:started and pipeline:complete.
    assert.ok(
      written.some(l => l.includes('job:started')),
      'should replay job:started'
    );
    assert.ok(
      written.some(l => l.includes('pipeline:complete')),
      'should replay pipeline:complete'
    );
  });

  void it('cancel cleans up emitter so late subscriber gets no events', async () => {
    const blockingRunner = new BlockingFakeRunner();
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };
    const queue = new JobQueue({ getDb, maxConcurrency: 1, runner: blockingRunner });

    // Block the slot.
    queue.enqueue({ type: 'generate', priority: 'normal', word: 'blocker', language: 'en' });

    // Second job stays queued.
    const job2Id = queue.enqueue({
      type: 'generate',
      priority: 'normal',
      word: 'to-cancel',
      language: 'en',
    });
    assert.equal(queue.getJob(job2Id).status, 'queued');

    // Subscribe to the queued job.
    const written: string[] = [];
    queue.subscribe(job2Id, {
      write: (chunk: string) => {
        written.push(chunk);
      },
    });
    assert.ok(
      written.some(l => l.includes('job:queued')),
      'should emit job:queued'
    );

    // Cancel the queued job.
    assert.equal(queue.cancel(job2Id), true);
    assert.equal(queue.getJob(job2Id).status, 'cancelled');

    // Late subscriber should get nothing — emitter was cleaned up.
    const lateWritten: string[] = [];
    queue.subscribe(job2Id, {
      write: (chunk: string) => {
        lateWritten.push(chunk);
      },
    });
    assert.equal(lateWritten.length, 0, 'late subscriber after cancel should receive no events');

    blockingRunner.releaseAll();
    await new Promise(r => setTimeout(r, 0));
  });
});

// ---- Queue-wide operation stress tests ----

void describe('JobQueue queue-wide operations', () => {
  let getDb: () => SqliteLike;
  let blockingRunner: BlockingFakeRunner;

  beforeEach(() => {
    const db = createTestDb();
    getDb = () => db;
    blockingRunner = new BlockingFakeRunner();
    delete require.cache[require.resolve('./JobQueue')];
  });

  void it('does not exceed maxConcurrency after cancelAll while aborted jobs are still settling', () => {
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };
    const queue = new JobQueue({ getDb, maxConcurrency: 1, runner: blockingRunner });

    const oldJobId = queue.enqueue({
      type: 'generate',
      priority: 'normal',
      word: 'old-running',
      language: 'en',
    });
    assert.equal(blockingRunner.activeCount, 1);

    queue.cancelAll();
    assert.equal(queue.getJob(oldJobId).status, 'cancelled');

    const newJobId = queue.enqueue({
      type: 'generate',
      priority: 'normal',
      word: 'new-job',
      language: 'en',
    });

    assert.equal(
      queue.getJob(newJobId).status,
      'queued',
      'new jobs should wait until the cancelled runner promise settles'
    );
    assert.equal(blockingRunner.activeCount, 1, 'only the old settling job should still be active');
  });

  void it('computes queue positions using priority and stable FIFO tie-breaks', () => {
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };
    const queue = new JobQueue({ getDb, maxConcurrency: 1, runner: blockingRunner });

    queue.enqueue({ type: 'generate', priority: 'normal', word: 'blocker', language: 'en' });
    const normalFirst = queue.enqueue({
      type: 'generate',
      priority: 'normal',
      word: 'normal-first',
      language: 'en',
    });
    const normalSecond = queue.enqueue({
      type: 'generate',
      priority: 'normal',
      word: 'normal-second',
      language: 'en',
    });
    const highFirst = queue.enqueue({
      type: 'fix',
      priority: 'high',
      word: 'high-first',
      language: 'en',
    });

    assert.equal(queue.getQueuePosition(highFirst), 1);
    assert.equal(queue.getQueuePosition(normalFirst), 2);
    assert.equal(queue.getQueuePosition(normalSecond), 3);
  });

  void it('resumes a paused running job from the interrupted stage', async () => {
    const calls: Array<Parameters<PipelineRunner['run']>[0]> = [];
    const resumableRunner: PipelineRunner = {
      async run(params) {
        calls.push(params);
        if (calls.length === 1) {
          params.onProgress({ type: 'step:start', step: 'searching', message: 'Searching' });
          params.onProgress({
            type: 'step:complete',
            step: 'searching',
            duration: 100,
            summary: 'Searched',
            result: { researchYaml: 'yield:\n  lemma: pause-word\n' },
          });
          params.onProgress({ type: 'step:start', step: 'pondering', message: 'Pondering' });
          params.onProgress({
            type: 'step:complete',
            step: 'pondering',
            duration: 100,
            summary: 'Pondered',
            result: { creativeYaml: 'creative: true\n' },
          });
          params.onProgress({ type: 'step:start', step: 'auditing', message: 'Auditing' });
          return await new Promise<{ yaml: string; scores: Record<string, unknown> }>(
            (_resolve, reject) => {
              params.abortSignal?.addEventListener('abort', () => reject(new Error('Aborted')));
            }
          );
        }

        return { yaml: FAKE_YAML, scores: FAKE_SCORES };
      },
    };

    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };
    const queue = new JobQueue({ getDb, maxConcurrency: 1, runner: resumableRunner });

    const jobId = queue.enqueue({
      type: 'generate',
      priority: 'normal',
      word: 'pause-word',
      language: 'en',
    });

    assert.equal(queue.getJob(jobId).status, 'running');

    queue.pauseAll();
    await new Promise(r => setTimeout(r, 0));

    assert.equal(queue.getJob(jobId).status, 'paused');
    assert.equal(
      queue
        .getCompletedSteps(jobId)
        .some((event: PipelineProgressEvent) => event.type === 'job:paused'),
      true,
      'paused jobs should emit and replay an explicit paused event'
    );

    queue.resumeAll();
    await new Promise(r => setTimeout(r, 0));

    assert.equal(calls.length, 2);
    assert.equal(calls[1].resumeFromStage, 'auditing');
    assert.deepEqual(
      calls[1].previousSteps?.map(step => step.step),
      ['searching', 'pondering']
    );
    assert.deepEqual(calls[1].previousContext, {
      researchYaml: 'yield:\n  lemma: pause-word\n',
      creativeYaml: 'creative: true\n',
    });
    assert.equal(queue.getJob(jobId).status, 'complete');
  });

  void it('resumes a persisted paused job with prior stage context after restart', async () => {
    const calls: Array<Parameters<PipelineRunner['run']>[0]> = [];
    const resumableRunner: PipelineRunner = {
      async run(params) {
        calls.push(params);
        return { yaml: FAKE_YAML, scores: FAKE_SCORES };
      },
    };
    const db = getDb();
    db.run(
      `INSERT INTO job_queue (id, job_type, priority, status, word, language, progress_events)
       VALUES (?, 'generate', 'normal', 'paused', 'crate', 'en', ?)`,
      'persisted-paused',
      JSON.stringify([
        { type: 'job:started' },
        { type: 'step:start', step: 'searching', message: 'Searching' },
        {
          type: 'step:complete',
          step: 'searching',
          duration: 100,
          summary: 'Searched',
          result: { researchYaml: 'yield:\n  lemma: crate\n  language: en\n' },
          rawText: 'yield:\n  lemma: crate\n  language: en\n',
          reasoningText: 'search thinking',
        },
        { type: 'step:start', step: 'pondering', message: 'Pondering' },
        { type: 'job:paused', step: 'pondering' },
      ])
    );

    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };
    const queue = new JobQueue({ getDb, maxConcurrency: 1, runner: resumableRunner });

    queue.resumeAll();
    await new Promise(r => setTimeout(r, 0));

    assert.equal(calls.length, 1);
    assert.equal(calls[0].resumeFromStage, 'pondering');
    assert.deepEqual(calls[0].previousContext, {
      researchYaml: 'yield:\n  lemma: crate\n  language: en\n',
    });
    assert.deepEqual(
      calls[0].previousSteps?.map(step => step.step),
      ['searching']
    );
    assert.equal(calls[0].previousSteps?.[0].rawText, 'yield:\n  lemma: crate\n  language: en\n');
    assert.equal(calls[0].previousSteps?.[0].reasoningText, 'search thinking');
  });

  void it('resumes a Fix Job using the fix Pipeline Definition order', () => {
    const db = getDb();
    db.run(
      `INSERT INTO job_queue (id, job_type, priority, status, word, language, progress_events)
       VALUES (?, 'fix', 'high', 'paused', 'repair', 'en', ?)`,
      'paused-fix',
      JSON.stringify([
        { type: 'job:started' },
        { type: 'step:start', step: 'fixing', message: 'Fixing' },
        {
          type: 'step:complete',
          step: 'fixing',
          duration: 100,
          summary: 'Fixed',
          result: { fullYaml: 'yield:\n  lemma: repair\nfixed: true\n' },
        },
        { type: 'job:paused' },
      ])
    );

    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };
    const queue = new JobQueue({ getDb, maxConcurrency: 1, runner: blockingRunner });

    const snapshot = queue.buildResumeSnapshot('paused-fix');

    assert.equal(snapshot.resumeFromStage, 'auditing');
    assert.deepEqual(
      snapshot.previousSteps?.map((step: { step: string }) => step.step),
      ['fixing']
    );
    assert.deepEqual(snapshot.previousContext, {
      fullYaml: 'yield:\n  lemma: repair\nfixed: true\n',
    });
  });

  void it('resumes a Generate Job using a non-standard Pipeline Definition stage order', async () => {
    const englishModule =
      require('./definitions/english') as typeof import('./definitions/english');
    const originalStages = englishModule.englishPipeline.stages;
    englishModule.englishPipeline.stages = [
      { id: 'drafting' },
      { id: 'source-check' },
      { id: 'publishing' },
    ] as typeof englishModule.englishPipeline.stages;
    delete require.cache[require.resolve('./JobQueue')];

    try {
      const calls: Array<Parameters<PipelineRunner['run']>[0]> = [];
      const resumableRunner: PipelineRunner = {
        async run(params) {
          calls.push(params);
          return { yaml: FAKE_YAML, scores: FAKE_SCORES };
        },
      };
      const db = getDb();
      db.run(
        `INSERT INTO job_queue (id, job_type, priority, status, word, language, progress_events)
         VALUES (?, 'generate', 'normal', 'paused', 'custom-stage-word', 'en', ?)`,
        'custom-stage-paused',
        JSON.stringify([
          { type: 'job:started' },
          { type: 'step:start', step: 'drafting', message: 'Drafting' },
          {
            type: 'step:complete',
            step: 'drafting',
            duration: 100,
            summary: 'Drafted',
            result: { draftYaml: 'yield:\n  lemma: custom-stage-word\n' },
          },
          { type: 'step:start', step: 'source-check', message: 'Checking sources' },
          { type: 'job:paused', step: 'source-check' },
        ])
      );

      const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };
      const queue = new JobQueue({ getDb, maxConcurrency: 1, runner: resumableRunner });

      queue.resumeAll();
      await new Promise(r => setTimeout(r, 0));

      assert.equal(calls.length, 1);
      assert.deepEqual(
        calls[0].definition.stages.map(stage => stage.id),
        ['drafting', 'source-check', 'publishing']
      );
      assert.equal(calls[0].resumeFromStage, 'source-check');
      assert.deepEqual(
        calls[0].previousSteps?.map(step => step.step),
        ['drafting']
      );
      assert.deepEqual(calls[0].previousContext, {
        draftYaml: 'yield:\n  lemma: custom-stage-word\n',
      });
    } finally {
      englishModule.englishPipeline.stages = originalStages;
      delete require.cache[require.resolve('./JobQueue')];
    }
  });

  void it('keeps only upstream stage context when regenerating from pondering', () => {
    const db = getDb();
    db.run(
      `INSERT INTO job_queue (id, job_type, priority, status, word, language, progress_events)
       VALUES (?, 'generate', 'normal', 'complete', 'crate', 'en', ?)`,
      'completed-for-pondering-regenerate',
      JSON.stringify([
        { type: 'job:started' },
        { type: 'step:start', step: 'searching', message: 'Searching' },
        {
          type: 'step:complete',
          step: 'searching',
          duration: 100,
          summary: 'Searched',
          result: { researchYaml: 'research-only-yaml' },
        },
        { type: 'step:start', step: 'pondering', message: 'Pondering' },
        {
          type: 'step:complete',
          step: 'pondering',
          duration: 100,
          summary: 'Pondered',
          result: { creativeYaml: 'old-creative-yaml' },
        },
        { type: 'step:start', step: 'auditing', message: 'Auditing' },
        {
          type: 'step:complete',
          step: 'auditing',
          duration: 100,
          summary: 'Audited',
          result: { scores: { revision_notes: 'old fix notes' } },
        },
      ])
    );

    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };
    const queue = new JobQueue({ getDb, maxConcurrency: 1, runner: blockingRunner });

    const snapshot = queue.buildResumeSnapshot('completed-for-pondering-regenerate', 'pondering');

    assert.equal(snapshot.resumeFromStage, 'pondering');
    assert.deepEqual(
      snapshot.previousSteps?.map((step: { step: string }) => step.step),
      ['searching']
    );
    assert.deepEqual(snapshot.previousContext, {
      researchYaml: 'research-only-yaml',
    });
  });

  void it('ignores late terminal progress after pausing a running job', async () => {
    let capturedProgress: ((event: any) => void) | undefined;
    let release: ((value: { yaml: string; scores: Record<string, unknown> }) => void) | undefined;
    const lateProgressRunner: PipelineRunner = {
      async run(params) {
        capturedProgress = params.onProgress;
        params.onProgress({ type: 'step:start', step: 'auditing', message: 'Auditing' });
        return await new Promise<{ yaml: string; scores: Record<string, unknown> }>(resolve => {
          release = resolve;
        });
      },
    };

    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };
    const queue = new JobQueue({ getDb, maxConcurrency: 1, runner: lateProgressRunner });
    const jobId = queue.enqueue({
      type: 'generate',
      priority: 'normal',
      word: 'late-finish',
      language: 'en',
    });

    queue.pauseAll();
    capturedProgress?.({
      type: 'pipeline:complete',
      yaml: FAKE_YAML,
      scores: FAKE_SCORES,
      totalDuration: 100,
    });
    release?.({ yaml: FAKE_YAML, scores: FAKE_SCORES });
    await new Promise(r => setTimeout(r, 0));

    assert.equal(queue.getJob(jobId).status, 'paused');
    assert.equal(
      queue
        .getCompletedSteps(jobId)
        .some((event: PipelineProgressEvent) => event.type === 'pipeline:complete'),
      false,
      'late completion events should not make a paused job look finished'
    );
  });

  void it('paginates history by error, partial, then complete without cancelled jobs', () => {
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };
    const queue = new JobQueue({ getDb, maxConcurrency: 1, runner: blockingRunner });
    const db = getDb();

    db.run(
      `INSERT INTO job_queue (id, job_type, priority, status, word, language, completed_at)
       VALUES
       ('hist-complete', 'generate', 'normal', 'complete', 'alpha', 'en', '2026-05-01 10:00:00'),
       ('hist-error', 'generate', 'normal', 'error', 'beta', 'en', '2026-05-01 09:00:00'),
       ('hist-partial', 'generate', 'normal', 'partial', 'gamma', 'en', '2026-05-01 11:00:00'),
       ('hist-cancelled', 'generate', 'normal', 'cancelled', 'delta', 'en', '2026-05-01 12:00:00')`
    );

    const history = queue.getQueueHistory({ page: 1, pageSize: 20 });

    assert.equal(history.total, 3);
    assert.deepEqual(
      history.jobs.map((job: { jobId: string }) => job.jobId),
      ['hist-error', 'hist-partial', 'hist-complete']
    );
  });

  void it('keeps errored jobs in history rather than active overview', () => {
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };
    const queue = new JobQueue({ getDb, maxConcurrency: 1, runner: blockingRunner });
    const db = getDb();

    db.run(
      `INSERT INTO job_queue (id, job_type, priority, status, word, language)
       VALUES ('errored-overview', 'generate', 'normal', 'error', 'bad', 'en')`
    );

    assert.equal(
      queue.getQueueOverview().some((job: { jobId: string }) => job.jobId === 'errored-overview'),
      false
    );
    assert.equal(
      queue
        .getQueueHistory({ page: 1, pageSize: 20 })
        .jobs.some((job: { jobId: string }) => job.jobId === 'errored-overview'),
      true
    );
  });

  void it('hard-deletes history jobs but refuses active jobs', () => {
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };
    const queue = new JobQueue({ getDb, maxConcurrency: 1, runner: blockingRunner });
    const db = getDb();

    db.run(
      `INSERT INTO job_queue (id, job_type, priority, status, word, language)
       VALUES
       ('done-delete', 'generate', 'normal', 'complete', 'done', 'en'),
       ('active-delete', 'generate', 'normal', 'paused', 'active', 'en')`
    );

    assert.equal(queue.deleteHistoryJob('active-delete'), 'active');
    assert.equal(queue.getJob('active-delete').status, 'paused');
    assert.equal(queue.deleteHistoryJob('done-delete'), 'deleted');
    assert.equal(queue.getJob('done-delete'), undefined);
  });

  void it('clears the current filtered history set only', () => {
    const { JobQueue } = require('./JobQueue') as { JobQueue: new (...args: any[]) => any };
    const queue = new JobQueue({ getDb, maxConcurrency: 1, runner: blockingRunner });
    const db = getDb();

    db.run(
      `INSERT INTO job_queue (id, job_type, priority, status, word, language)
       VALUES
       ('error-a', 'generate', 'normal', 'error', 'alpha', 'en'),
       ('error-b', 'generate', 'normal', 'error', 'beta', 'en'),
       ('partial-a', 'generate', 'normal', 'partial', 'alpha', 'en'),
       ('complete-a', 'generate', 'normal', 'complete', 'alpha', 'en')`
    );

    const deleted = queue.clearHistory({ status: 'error' });

    assert.equal(deleted, 2);
    assert.equal(queue.getJob('error-a'), undefined);
    assert.equal(queue.getJob('error-b'), undefined);
    assert.equal(queue.getJob('partial-a').status, 'partial');
    assert.equal(queue.getJob('complete-a').status, 'complete');
  });
});
