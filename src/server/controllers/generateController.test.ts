import { beforeEach, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import type { PipelineRunner } from '../services/ai/types';

// ---- Fake Runner ----

const FAKE_YAML = 'yield:\n  lemma: test\n  language: en\n';
const FAKE_SCORES = { overall_score: 7, revision_notes: 'Fix the etymology section.' };

class FakeRunner implements PipelineRunner {
  async run({ onProgress }: Parameters<PipelineRunner['run']>[0]): Promise<{
    yaml: string;
    scores: Record<string, unknown>;
  }> {
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

class BlockingFakeRunner implements PipelineRunner {
  private pending = new Map<
    string,
    {
      resolve: (value: { yaml: string; scores: Record<string, unknown> }) => void;
      signal: AbortSignal | undefined;
    }
  >();
  private callCount = 0;

  async run({ input, abortSignal }: Parameters<PipelineRunner['run']>[0]): Promise<{
    yaml: string;
    scores: Record<string, unknown>;
  }> {
    const key = input.word + '_' + ++this.callCount;
    const promise = new Promise<{ yaml: string; scores: Record<string, unknown> }>(
      (resolve, _reject) => {
        this.pending.set(key, { resolve, signal: abortSignal as AbortSignal | undefined });
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

  get signal(): AbortSignal | undefined {
    const [key] = this.pending.keys();
    return key ? this.pending.get(key)!.signal : undefined;
  }

  get activeCount(): number {
    return this.pending.size;
  }
}

// ---- DB helpers ----

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
  CREATE INDEX IF NOT EXISTS idx_job_queue_batch_id ON job_queue(batch_id);
  CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status);
  CREATE INDEX IF NOT EXISTS idx_job_queue_priority_created ON job_queue(priority, created_at);

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

// ---- Fake req/res ----

function fakeReq(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    params: {},
    body: {},
    on: () => {},
    ...overrides,
  };
}

interface FakeRes {
  _status: number;
  _body: unknown;
  _headers: Record<string, string>;
  _writes: string[];
  _ended: boolean;
  status: (code: number) => FakeRes;
  json: (data: unknown) => FakeRes;
  write: (chunk: string) => boolean;
  writeHead: (code: number, headers: Record<string, string>) => void;
  setHeader: (key: string, value: string) => void;
  setTimeout: () => void;
  on: () => void;
}

function fakeRes(): FakeRes {
  const res: FakeRes = {
    _status: 200,
    _body: null,
    _headers: {} as Record<string, string>,
    _writes: [],
    _ended: false,
    status(code: number) {
      this._status = code;
      return this;
    },
    json(data: unknown) {
      this._body = data;
      this._ended = true;
      return this;
    },
    write(chunk: string) {
      this._writes.push(chunk);
      return true;
    },
    writeHead(code: number, headers: Record<string, string>) {
      this._status = code;
      Object.assign(this._headers, headers);
    },
    setHeader(key: string, value: string) {
      this._headers[key] = value;
    },
    setTimeout() {},
    on() {},
  };
  return res;
}

// ---- Tests ----

void describe('generateController with JobQueue', () => {
  let getDb: () => SqliteLike;
  let fakeRunner: FakeRunner;

  beforeEach(() => {
    const db = createTestDb();
    getDb = () => db;
    fakeRunner = new FakeRunner();
    // Reset queue singleton and inject test config.
    const { initQueue, _resetQueue } = require('../services/ai/queue/testing') as {
      initQueue: (overrides?: {
        getDb?: () => SqliteLike;
        maxConcurrency?: number;
        runner?: PipelineRunner;
      }) => void;
      _resetQueue: () => void;
    };
    _resetQueue();
    initQueue({ getDb, maxConcurrency: 1, runner: fakeRunner });
    delete require.cache[require.resolve('./generateController')];
  });

  afterEach(() => {
    const { _resetQueue } = require('../services/ai/queue/testing') as { _resetQueue: () => void };
    _resetQueue();
  });

  // ---- handleGenerateSingle ----

  void describe('handleGenerateSingle', () => {
    void it('enqueues a generate job and returns 202 with jobId', async () => {
      const { handleGenerateSingle } = require('./generateController') as {
        handleGenerateSingle: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const req = fakeReq({
        body: {
          word: 'test',
          context: 'A test sentence.',
          language: 'en',
          notes: 'Focus on noun.',
        },
      });
      const res = fakeRes();

      await handleGenerateSingle(req, res);

      assert.equal(res._status, 202);
      assert.ok(typeof (res._body as any).jobId === 'string');
      assert.equal(typeof (res._body as any).queued, 'boolean');
    });

    void it('returns 400 when word is missing', async () => {
      const { handleGenerateSingle } = require('./generateController') as {
        handleGenerateSingle: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const req = fakeReq({ body: { language: 'en' } });
      const res = fakeRes();

      await handleGenerateSingle(req, res);

      assert.equal(res._status, 400);
      assert.equal((res._body as any).code, 400);
    });

    void it('returns 400 with empty word string', async () => {
      const { handleGenerateSingle } = require('./generateController') as {
        handleGenerateSingle: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const req = fakeReq({ body: { word: '  ', language: 'en' } });
      const res = fakeRes();

      await handleGenerateSingle(req, res);

      assert.equal(res._status, 400);
    });

    void it('returns queued:true when a job is already running (concurrency=1)', async () => {
      const blockingRunner = new BlockingFakeRunner();
      const { initQueue, _resetQueue } = require('../services/ai/queue/testing') as any;
      _resetQueue();
      initQueue({ getDb, maxConcurrency: 1, runner: blockingRunner });
      delete require.cache[require.resolve('./generateController')];

      const { handleGenerateSingle } = require('./generateController') as {
        handleGenerateSingle: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      // First job takes the only slot.
      const req1 = fakeReq({ body: { word: 'first', language: 'en' } });
      const res1 = fakeRes();
      await handleGenerateSingle(req1, res1);
      assert.equal(res1._status, 202);
      assert.equal((res1._body as any).queued, false);

      // Second job should be queued.
      const req2 = fakeReq({ body: { word: 'second', language: 'en' } });
      const res2 = fakeRes();
      await handleGenerateSingle(req2, res2);
      assert.equal(res2._status, 202);
      assert.equal((res2._body as any).queued, true);
      assert.equal((res2._body as any).position, 1, 'single queued job should have position 1');

      blockingRunner.releaseAll();
      await new Promise(r => setTimeout(r, 0));
    });
  });

  // ---- handleGenerateBatch ----

  void describe('handleGenerateBatch', () => {
    void it('creates multiple generate jobs with the same batch id', async () => {
      const { handleGenerateBatch } = require('./generateController') as {
        handleGenerateBatch: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const req = fakeReq({
        body: {
          language: 'en',
          items: [
            { word: 'proliferate', context: 'The idea began to proliferate.' },
            { word: 'ameliorate' },
          ],
        },
      });
      const res = fakeRes();

      await handleGenerateBatch(req, res);

      assert.equal(res._status, 202);
      const body = res._body as any;
      assert.equal(body.jobs.length, 2);
      assert.ok(body.batchId.startsWith('batch-'));

      const rows = getDb().all('SELECT batch_id FROM job_queue ORDER BY word ASC');
      assert.equal(rows.length, 2);
      assert.equal(rows[0].batch_id, body.batchId);
      assert.equal(rows[1].batch_id, body.batchId);
    });

    void it('skips duplicate words inside the same batch request', async () => {
      const { handleGenerateBatch } = require('./generateController') as {
        handleGenerateBatch: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const res = fakeRes();
      await handleGenerateBatch(
        fakeReq({
          body: {
            language: 'en',
            items: [{ word: 'conduct' }, { word: 'conduct' }],
          },
        }),
        res
      );

      assert.equal(res._status, 202);
      assert.equal((res._body as any).jobs.length, 1);
      assert.equal((res._body as any).skipped[0].reason, 'duplicate-in-request');
    });
  });

  // ---- handleStream ----

  void describe('handleStream', () => {
    void it('returns 404 for unknown jobId', async () => {
      const { handleStream } = require('./generateController') as {
        handleStream: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const req = fakeReq({ params: { jobId: 'nonexistent' } });
      const res = fakeRes();

      await handleStream(req, res);

      assert.equal(res._status, 404);
    });

    void it('sets SSE headers and forwards events via subscribe', async () => {
      const { handleGenerateSingle } = require('./generateController') as {
        handleGenerateSingle: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };
      const { handleStream } = require('./generateController') as {
        handleStream: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      // Enqueue a job and wait for completion.
      const genReq = fakeReq({ body: { word: 'sse-test', language: 'en' } });
      const genRes = fakeRes();
      await handleGenerateSingle(genReq, genRes);
      const jobId = (genRes._body as any).jobId;
      await new Promise(r => setTimeout(r, 0));

      // Subscribe to SSE.
      const streamReq = fakeReq({ params: { jobId } });
      const streamRes = fakeRes();
      await handleStream(streamReq, streamRes);

      assert.equal(streamRes._status, 200);
      assert.equal(streamRes._headers['Content-Type'], 'text/event-stream');
      assert.equal(streamRes._headers['Cache-Control'], 'no-cache');

      // Should have replayed events including pipeline:complete.
      const writesText = streamRes._writes.join('\n');
      assert.ok(writesText.includes('job:started'), 'should include job:started');
      assert.ok(writesText.includes('step:complete'), 'should include step:complete');
      assert.ok(writesText.includes('pipeline:complete'), 'should include pipeline:complete');
    });

    void it('sends job:queued when subscribing to a queued job', async () => {
      const blockingRunner = new BlockingFakeRunner();
      const { initQueue, _resetQueue } = require('../services/ai/queue/testing') as any;
      _resetQueue();
      initQueue({ getDb, maxConcurrency: 1, runner: blockingRunner });
      delete require.cache[require.resolve('./generateController')];

      const { handleGenerateSingle, handleStream } = require('./generateController') as {
        handleGenerateSingle: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
        handleStream: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      // First job takes the slot.
      await handleGenerateSingle(fakeReq({ body: { word: 'blocker', language: 'en' } }), fakeRes());
      // Second job is queued.
      const res2 = fakeRes();
      await handleGenerateSingle(fakeReq({ body: { word: 'queued', language: 'en' } }), res2);
      const jobId = (res2._body as any).jobId;

      // Subscribe to the queued job.
      const streamReq = fakeReq({ params: { jobId } });
      const streamRes = fakeRes();
      await handleStream(streamReq, streamRes);

      assert.equal(streamRes._status, 200);
      assert.ok(
        streamRes._writes.some(w => w.includes('job:queued')),
        'should emit job:queued for a queued job'
      );

      blockingRunner.releaseAll();
      await new Promise(r => setTimeout(r, 0));
    });

    void it('sets up keepalive and cleans up on close', async () => {
      const closeHandlers: Array<() => void> = [];
      const { handleGenerateSingle } = require('./generateController') as {
        handleGenerateSingle: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };
      const { handleStream } = require('./generateController') as {
        handleStream: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const genReq = fakeReq({ body: { word: 'keepalive', language: 'en' } });
      const genRes = fakeRes();
      await handleGenerateSingle(genReq, genRes);
      const jobId = (genRes._body as any).jobId;
      await new Promise(r => setTimeout(r, 0));

      const streamReq = fakeReq({
        params: { jobId },
        on: (event: string, handler: () => void) => {
          if (event === 'close' || event === 'aborted') {
            closeHandlers.push(handler);
          }
        },
      });
      const streamRes = fakeRes();
      await handleStream(streamReq, streamRes);

      // Verify close handler was registered.
      assert.ok(closeHandlers.length >= 2, 'should register close and abort handlers');
    });
  });

  // ---- handleCancelJob ----

  void describe('handleCancelJob', () => {
    void it('returns 404 for unknown jobId', async () => {
      const { handleCancelJob } = require('./generateController') as {
        handleCancelJob: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const req = fakeReq({ params: { jobId: 'nonexistent' } });
      const res = fakeRes();

      await handleCancelJob(req, res);

      assert.equal(res._status, 404);
    });

    void it('cancels a queued job', async () => {
      const blockingRunner = new BlockingFakeRunner();
      const { initQueue, _resetQueue } = require('../services/ai/queue/testing') as any;
      _resetQueue();
      initQueue({ getDb, maxConcurrency: 1, runner: blockingRunner });
      delete require.cache[require.resolve('./generateController')];

      const { handleGenerateSingle, handleCancelJob } = require('./generateController') as {
        handleGenerateSingle: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
        handleCancelJob: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      // Block the slot.
      await handleGenerateSingle(fakeReq({ body: { word: 'blocker', language: 'en' } }), fakeRes());
      const res2 = fakeRes();
      await handleGenerateSingle(fakeReq({ body: { word: 'to-cancel', language: 'en' } }), res2);
      const jobId = (res2._body as any).jobId;

      const cancelReq = fakeReq({ params: { jobId } });
      const cancelRes = fakeRes();
      await handleCancelJob(cancelReq, cancelRes);

      assert.equal(cancelRes._status, 200);
      assert.equal((cancelRes._body as any).ok, true);

      blockingRunner.releaseAll();
      await new Promise(r => setTimeout(r, 0));
    });

    void it('cancels a running job', async () => {
      const blockingRunner = new BlockingFakeRunner();
      const { initQueue, _resetQueue } = require('../services/ai/queue/testing') as any;
      _resetQueue();
      initQueue({ getDb, maxConcurrency: 1, runner: blockingRunner });
      delete require.cache[require.resolve('./generateController')];

      const { handleGenerateSingle, handleCancelJob } = require('./generateController') as {
        handleGenerateSingle: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
        handleCancelJob: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const genRes = fakeRes();
      await handleGenerateSingle(fakeReq({ body: { word: 'to-cancel', language: 'en' } }), genRes);
      const jobId = (genRes._body as any).jobId;

      const cancelReq = fakeReq({ params: { jobId } });
      const cancelRes = fakeRes();
      await handleCancelJob(cancelReq, cancelRes);

      assert.equal(cancelRes._status, 200);
      assert.equal((cancelRes._body as any).ok, true);

      blockingRunner.releaseAll();
      await new Promise(r => setTimeout(r, 0));
    });
  });

  // ---- handlePauseJob / handleResumeActiveJob ----

  void describe('handlePauseJob and handleResumeActiveJob', () => {
    void it('pauses and resumes a queued job', async () => {
      const blockingRunner = new BlockingFakeRunner();
      const { initQueue, _resetQueue } = require('../services/ai/queue/testing') as any;
      _resetQueue();
      initQueue({ getDb, maxConcurrency: 1, runner: blockingRunner });
      delete require.cache[require.resolve('./generateController')];

      const { handleGenerateSingle, handlePauseJob, handleResumeActiveJob } =
        require('./generateController') as {
          handleGenerateSingle: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
          handlePauseJob: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
          handleResumeActiveJob: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
        };

      await handleGenerateSingle(fakeReq({ body: { word: 'blocker', language: 'en' } }), fakeRes());
      const queuedRes = fakeRes();
      await handleGenerateSingle(
        fakeReq({ body: { word: 'queued-pause', language: 'en' } }),
        queuedRes
      );
      const jobId = (queuedRes._body as any).jobId;

      const pauseRes = fakeRes();
      await handlePauseJob(fakeReq({ params: { jobId } }), pauseRes);
      assert.equal(pauseRes._status, 200);
      assert.equal((pauseRes._body as any).ok, true);
      assert.equal(
        getDb().get('SELECT status FROM job_queue WHERE id = ?', jobId)?.status,
        'paused'
      );

      const resumeRes = fakeRes();
      await handleResumeActiveJob(fakeReq({ params: { jobId } }), resumeRes);
      assert.equal(resumeRes._status, 200);
      assert.equal((resumeRes._body as any).ok, true);
      assert.equal(
        getDb().get('SELECT status FROM job_queue WHERE id = ?', jobId)?.status,
        'queued'
      );

      blockingRunner.releaseAll();
      await new Promise(r => setTimeout(r, 0));
    });
  });

  // ---- handleResumeJob ----

  void describe('handleResumeJob', () => {
    void it('returns 404 for unknown jobId', async () => {
      const { handleResumeJob } = require('./generateController') as {
        handleResumeJob: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const req = fakeReq({ params: { jobId: 'nonexistent' }, body: {} });
      const res = fakeRes();

      await handleResumeJob(req, res);

      assert.equal(res._status, 404);
    });

    void it('returns 400 when trying to resume a running job', async () => {
      const blockingRunner = new BlockingFakeRunner();
      const { initQueue, _resetQueue } = require('../services/ai/queue/testing') as any;
      _resetQueue();
      initQueue({ getDb, maxConcurrency: 1, runner: blockingRunner });
      delete require.cache[require.resolve('./generateController')];

      const { handleGenerateSingle, handleResumeJob } = require('./generateController') as {
        handleGenerateSingle: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
        handleResumeJob: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const genRes = fakeRes();
      await handleGenerateSingle(fakeReq({ body: { word: 'running', language: 'en' } }), genRes);
      const jobId = (genRes._body as any).jobId;

      const resumeReq = fakeReq({ params: { jobId }, body: { fromStage: 'searching' } });
      const resumeRes = fakeRes();
      await handleResumeJob(resumeReq, resumeRes);

      assert.equal(resumeRes._status, 400);

      blockingRunner.releaseAll();
      await new Promise(r => setTimeout(r, 0));
    });

    void it('creates a new job with resume state from completed steps', async () => {
      const { handleGenerateSingle } = require('./generateController') as {
        handleGenerateSingle: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };
      const { handleResumeJob } = require('./generateController') as {
        handleResumeJob: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      // Complete a job first.
      const genRes = fakeRes();
      await handleGenerateSingle(
        fakeReq({
          body: { word: 'conduct', language: 'en', context: 'He conducted.', notes: 'Verb' },
        }),
        genRes
      );
      const oldJobId = (genRes._body as any).jobId;
      await new Promise(r => setTimeout(r, 0));

      // Resume from a specific stage.
      const resumeReq = fakeReq({
        params: { jobId: oldJobId },
        body: { fromStage: 'pondering', userScore: 5 },
      });
      const resumeRes = fakeRes();
      await handleResumeJob(resumeReq, resumeRes);

      assert.equal(resumeRes._status, 202);
      const newJobId = (resumeRes._body as any).jobId;
      assert.ok(typeof newJobId === 'string');
      assert.notEqual(newJobId, oldJobId, 'resume should create a new jobId');

      await new Promise(r => setTimeout(r, 0));

      // Verify the new job completed.
      const { getQueue } = require('../services/ai/queue') as { getQueue: () => any };
      const newJob = getQueue().getJob(newJobId);
      assert.equal(newJob.status, 'complete');
      assert.equal(newJob.word, 'conduct');
      assert.equal(newJob.language, 'en');
    });

    void it('resumes from the next incomplete stage when no stage is specified', async () => {
      const calls: Array<Parameters<PipelineRunner['run']>[0]> = [];
      const capturingRunner: PipelineRunner = {
        async run(params) {
          calls.push(params);
          return { yaml: FAKE_YAML, scores: FAKE_SCORES };
        },
      };
      const { initQueue, _resetQueue } = require('../services/ai/queue/testing') as any;
      _resetQueue();
      initQueue({ getDb, maxConcurrency: 1, runner: capturingRunner });
      delete require.cache[require.resolve('./generateController')];

      const db = getDb();
      db.run(
        `INSERT INTO job_queue (
          id, job_type, priority, status, word, language, context, notes,
          result_yaml, result_scores, progress_events
        )
        VALUES (?, 'generate', 'normal', 'complete', 'resume-next', 'en', 'ctx', 'old notes', ?, ?, ?)`,
        'job-resume-next',
        'yield:\n  lemma: resume-next\n',
        JSON.stringify({ overall_score: 8 }),
        JSON.stringify([
          { type: 'job:started' },
          { type: 'step:start', step: 'searching', message: 'Searching' },
          {
            type: 'step:complete',
            step: 'searching',
            duration: 12,
            summary: 'Searched',
            result: { researchYaml: 'from-search' },
          },
        ])
      );

      const { handleResumeJob } = require('./generateController') as {
        handleResumeJob: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const res = fakeRes();
      await handleResumeJob(fakeReq({ params: { jobId: 'job-resume-next' }, body: {} }), res);
      await new Promise(r => setTimeout(r, 0));

      assert.equal(res._status, 202);
      assert.equal(calls[0].resumeFromStage, 'pondering');
      assert.deepEqual(
        calls[0].previousSteps?.map(step => step.step),
        ['searching']
      );
      assert.deepEqual(calls[0].previousContext, {
        researchYaml: 'from-search',
      });
    });

    void it('does not inherit old job notes when regenerating without explicit notes', async () => {
      const calls: Array<Parameters<PipelineRunner['run']>[0]> = [];
      const capturingRunner: PipelineRunner = {
        async run(params) {
          calls.push(params);
          return { yaml: FAKE_YAML, scores: FAKE_SCORES };
        },
      };
      const { initQueue, _resetQueue } = require('../services/ai/queue/testing') as any;
      _resetQueue();
      initQueue({ getDb, maxConcurrency: 1, runner: capturingRunner });
      delete require.cache[require.resolve('./generateController')];

      const db = getDb();
      db.run(
        `INSERT INTO job_queue (
          id, job_type, priority, status, word, language, context, notes,
          result_yaml, result_scores, progress_events
        )
        VALUES (?, 'fix', 'high', 'complete', 'resume-clean', 'en', 'ctx', ?, ?, ?, ?)`,
        'job-resume-clean',
        'old auditing revision notes',
        'yield:\n  lemma: resume-clean\n',
        JSON.stringify({ overall_score: 8, revision_notes: 'old auditing revision notes' }),
        JSON.stringify([
          { type: 'job:started' },
          { type: 'step:start', step: 'searching', message: 'Searching' },
          {
            type: 'step:complete',
            step: 'searching',
            duration: 12,
            summary: 'Searched',
            result: { researchYaml: 'from-search' },
          },
        ])
      );

      const { handleResumeJob } = require('./generateController') as {
        handleResumeJob: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const res = fakeRes();
      await handleResumeJob(
        fakeReq({ params: { jobId: 'job-resume-clean' }, body: { fromStage: 'pondering' } }),
        res
      );
      await new Promise(r => setTimeout(r, 0));

      assert.equal(res._status, 202);
      assert.equal(calls[0].resumeFromStage, 'pondering');
      assert.equal(calls[0].input.notes, undefined);
    });

    void it('returns 400 with invalid resume body', async () => {
      // Create a completed job in the DB first so the job lookup succeeds.
      const db = getDb();
      db.run(
        `INSERT INTO job_queue (id, job_type, priority, status, word, language)
         VALUES (?, 'generate', 'normal', 'error', 'bad-body', 'en')`,
        'job-bad-body'
      );

      const { handleResumeJob } = require('./generateController') as {
        handleResumeJob: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const req = fakeReq({
        params: { jobId: 'job-bad-body' },
        body: { fromStage: 'invalid-stage' },
      });
      const res = fakeRes();

      await handleResumeJob(req, res);

      assert.equal(res._status, 400);
    });
  });

  // ---- handleFixJob ----

  void describe('handleFixJob', () => {
    void it('returns 404 for unknown jobId', async () => {
      const { handleFixJob } = require('./generateController') as {
        handleFixJob: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const req = fakeReq({ params: { jobId: 'nonexistent' } });
      const res = fakeRes();

      await handleFixJob(req, res);

      assert.equal(res._status, 404);
    });

    void it('returns 400 when job has no YAML result', async () => {
      // Insert a job with no result_yaml directly.
      const db = getDb();
      db.run(
        `INSERT INTO job_queue (id, job_type, priority, status, word, language)
         VALUES (?, 'generate', 'normal', 'complete', 'no-yaml', 'en')`,
        'job-no-yaml'
      );

      const { handleFixJob } = require('./generateController') as {
        handleFixJob: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const req = fakeReq({ params: { jobId: 'job-no-yaml' } });
      const res = fakeRes();

      await handleFixJob(req, res);

      assert.equal(res._status, 400);
    });

    void it('returns 400 when job has no revision notes', async () => {
      const db = getDb();
      db.run(
        `INSERT INTO job_queue (id, job_type, priority, status, word, language, result_yaml, result_scores)
         VALUES (?, 'generate', 'normal', 'complete', 'no-notes', 'en', ?, ?)`,
        'job-no-notes',
        FAKE_YAML,
        JSON.stringify({ overall_score: 8, revision_notes: '无需修改。' })
      );

      const { handleFixJob } = require('./generateController') as {
        handleFixJob: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const req = fakeReq({ params: { jobId: 'job-no-notes' } });
      const res = fakeRes();

      await handleFixJob(req, res);

      assert.equal(res._status, 400);
    });

    void it('returns an audit-incomplete error when review scores failed to parse', async () => {
      const db = getDb();
      db.run(
        `INSERT INTO job_queue (id, job_type, priority, status, word, language, result_yaml, result_scores)
         VALUES (?, 'generate', 'normal', 'complete', 'bad-audit', 'en', ?, ?)`,
        'job-bad-audit',
        FAKE_YAML,
        JSON.stringify({ _raw: '', _parse_error: true })
      );

      const { handleFixJob } = require('./generateController') as {
        handleFixJob: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const req = fakeReq({ params: { jobId: 'job-bad-audit' } });
      const res = fakeRes();

      await handleFixJob(req, res);

      assert.equal(res._status, 400);
      assert.match(String((res._body as { message?: string }).message), /Auditing.*不完整/);
      assert.doesNotMatch(String((res._body as { message?: string }).message), /score=10/);
    });

    void it('enqueues a high-priority fix job so it appears in the queue overview', async () => {
      const blockingRunner = new BlockingFakeRunner();
      const { initQueue, _resetQueue } = require('../services/ai/queue/testing') as any;
      _resetQueue();
      initQueue({ getDb, maxConcurrency: 1, runner: blockingRunner });
      delete require.cache[require.resolve('./generateController')];

      const db = getDb();
      db.run(
        `INSERT INTO job_queue (id, job_type, priority, status, word, language, result_yaml, result_scores)
         VALUES (?, 'generate', 'normal', 'complete', 'needs-fix', 'en', ?, ?)`,
        'job-needs-fix',
        FAKE_YAML,
        JSON.stringify(FAKE_SCORES)
      );

      const { handleFixJob, handleQueueOverview } = require('./generateController') as {
        handleFixJob: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
        handleQueueOverview: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const fixReq = fakeReq({ params: { jobId: 'job-needs-fix' } });
      const fixRes = fakeRes();

      await handleFixJob(fixReq, fixRes);

      assert.equal(fixRes._status, 202);
      const fixJobId = (fixRes._body as any).jobId as string;
      assert.ok(fixJobId);

      const overviewRes = fakeRes();
      await handleQueueOverview(fakeReq(), overviewRes);

      const jobs = (overviewRes._body as any).jobs as Array<Record<string, unknown>>;
      const fixJob = jobs.find(job => job.jobId === fixJobId);
      assert.ok(fixJob, 'fix job should be visible in queue overview while running');
      assert.equal(fixJob.status, 'running');
      assert.equal(fixJob.jobType, 'fix');
      assert.equal(fixJob.priority, 'high');

      blockingRunner.releaseAll();
      await new Promise(r => setTimeout(r, 0));
    });

    void it('carries target job completed stages and user notes into the fix job detail', async () => {
      const calls: Array<Parameters<PipelineRunner['run']>[0]> = [];
      const captureRunner: PipelineRunner = {
        async run(params) {
          calls.push(params);
          return { yaml: FAKE_YAML, scores: FAKE_SCORES };
        },
      };
      const { initQueue, _resetQueue } = require('../services/ai/queue/testing') as any;
      _resetQueue();
      initQueue({ getDb, maxConcurrency: 1, runner: captureRunner });
      delete require.cache[require.resolve('./generateController')];

      const db = getDb();
      db.run(
        `INSERT INTO job_queue (
          id, job_type, priority, status, word, language, result_yaml, result_scores, progress_events
        )
         VALUES (?, 'generate', 'normal', 'complete', 'crate', 'en', ?, ?, ?)`,
        'job-fix-source',
        FAKE_YAML,
        JSON.stringify(FAKE_SCORES),
        JSON.stringify([
          {
            type: 'step:complete',
            step: 'searching',
            duration: 10,
            summary: 'Searched',
            result: { researchYaml: 'yield:\n  lemma: crate\n' },
            rawText: 'yield:\n  lemma: crate\n',
            reasoningText: 'search thinking',
          },
          {
            type: 'step:complete',
            step: 'auditing',
            duration: 20,
            summary: 'Audited',
            result: { overall_score: 5 },
            rawText: '{"overall_score":5}',
            reasoningText: 'audit thinking',
          },
        ])
      );

      const { handleFixJob } = require('./generateController') as {
        handleFixJob: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const res = fakeRes();
      await handleFixJob(
        fakeReq({
          params: { jobId: 'job-fix-source' },
          body: { notes: 'Make the examples less generic.' },
        }),
        res
      );
      await new Promise(r => setTimeout(r, 0));

      assert.equal(res._status, 202);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].resumeFromStage, 'fixing');
      assert.equal(
        calls[0].input.notes,
        'Fix the etymology section.\n\nUser feedback:\nMake the examples less generic.'
      );
      assert.deepEqual(
        calls[0].previousSteps?.map(step => step.step),
        ['searching', 'auditing']
      );
      assert.equal(calls[0].previousSteps?.[0].rawText, 'yield:\n  lemma: crate\n');
      assert.equal(calls[0].previousSteps?.[0].reasoningText, 'search thinking');
    });
  });

  // ---- queue history ----

  void describe('queue history', () => {
    void it('returns paginated persisted history jobs', async () => {
      const db = getDb();
      db.run(
        `INSERT INTO job_queue (id, job_type, priority, status, word, language, completed_at)
         VALUES
         ('hist-controller-error', 'generate', 'normal', 'error', 'error-word', 'en', '2026-05-01 09:00:00'),
         ('hist-controller-complete', 'generate', 'normal', 'complete', 'done-word', 'en', '2026-05-01 10:00:00')`
      );

      const { handleQueueHistory } = require('./generateController') as {
        handleQueueHistory: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const res = fakeRes();
      await handleQueueHistory(fakeReq({ query: { page: '1', pageSize: '20' } }), res);

      assert.equal(res._status, 200);
      const body = res._body as any;
      assert.equal(body.total, 2);
      assert.deepEqual(
        body.jobs.map((job: Record<string, unknown>) => job.status),
        ['error', 'complete']
      );
    });

    void it('returns a completed history job detail with YAML result', async () => {
      const db = getDb();
      db.run(
        `INSERT INTO job_queue (id, job_type, priority, status, word, language, result_yaml, result_scores)
         VALUES (?, 'generate', 'normal', 'complete', 'preview-word', 'en', ?, ?)`,
        'hist-detail',
        FAKE_YAML,
        JSON.stringify(FAKE_SCORES)
      );

      const { handleQueueHistoryJob } = require('./generateController') as {
        handleQueueHistoryJob: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const res = fakeRes();
      await handleQueueHistoryJob(fakeReq({ params: { jobId: 'hist-detail' } }), res);

      assert.equal(res._status, 200);
      assert.equal((res._body as any).job.result.yaml, FAKE_YAML);
    });

    void it('deletes individual history jobs and refuses active jobs', async () => {
      const db = getDb();
      db.run(
        `INSERT INTO job_queue (id, job_type, priority, status, word, language)
         VALUES
         ('hist-delete', 'generate', 'normal', 'complete', 'old', 'en'),
         ('hist-active', 'generate', 'normal', 'paused', 'active', 'en')`
      );

      const { handleDeleteHistoryJob } = require('./generateController') as {
        handleDeleteHistoryJob: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const activeRes = fakeRes();
      await handleDeleteHistoryJob(fakeReq({ params: { jobId: 'hist-active' } }), activeRes);
      assert.equal(activeRes._status, 409);

      const deleteRes = fakeRes();
      await handleDeleteHistoryJob(fakeReq({ params: { jobId: 'hist-delete' } }), deleteRes);
      assert.equal(deleteRes._status, 200);
    });

    void it('clears the filtered history set', async () => {
      const db = getDb();
      db.run(
        `INSERT INTO job_queue (id, job_type, priority, status, word, language)
         VALUES
         ('hist-clear-error', 'generate', 'normal', 'error', 'bad', 'en'),
         ('hist-clear-complete', 'generate', 'normal', 'complete', 'good', 'en')`
      );

      const { handleClearQueueHistory } = require('./generateController') as {
        handleClearQueueHistory: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const res = fakeRes();
      await handleClearQueueHistory(fakeReq({ body: { status: 'error' } }), res);

      assert.equal(res._status, 200);
      assert.equal((res._body as any).deleted, 1);
    });

    void it('returns today workset with deduplicated latest results', async () => {
      const db = getDb();
      db.run(
        `INSERT INTO job_queue (
          id, job_type, priority, status, word, language, result_yaml, result_scores, completed_at, created_at
        )
         VALUES
         ('workset-old', 'generate', 'normal', 'complete', 'agent', 'en', ?, '{"overall_score":4}', datetime('now', '-2 hours'), datetime('now', '-2 hours')),
         ('workset-new', 'fix', 'high', 'complete', 'agent', 'en', ?, '{"overall_score":8}', datetime('now', '-1 hours'), datetime('now', '-1 hours')),
         ('workset-other', 'generate', 'normal', 'partial', 'crate', 'en', ?, '{"overall_score":6}', datetime('now'), datetime('now'))`,
        FAKE_YAML,
        FAKE_YAML,
        FAKE_YAML
      );

      const { handleTodayWorkset } = require('./generateController') as {
        handleTodayWorkset: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const res = fakeRes();
      await handleTodayWorkset(fakeReq(), res);

      assert.equal(res._status, 200);
      const body = res._body as any;
      assert.equal(body.total, 2);
      assert.deepEqual(body.jobs.map((job: Record<string, unknown>) => job.jobId).sort(), [
        'workset-new',
        'workset-other',
      ]);
      assert.equal(
        body.jobs.find((job: Record<string, unknown>) => job.jobId === 'workset-new')?.finalScore,
        8
      );
      assert.equal(
        body.jobs.find((job: Record<string, unknown>) => job.jobId === 'workset-other')
          ?.improveBlockedReason,
        'partial-result'
      );
    });

    void it('persists a user review score for a completed history job', async () => {
      const db = getDb();
      db.run(
        `INSERT INTO job_queue (id, job_type, priority, status, word, language, result_yaml, result_scores)
         VALUES (?, 'generate', 'normal', 'complete', 'review-me', 'en', ?, ?)`,
        'review-score-job',
        FAKE_YAML,
        JSON.stringify({ overall_score: 8, revision_notes: 'Could be sharper.' })
      );

      const { handleSetUserReviewScore } = require('./generateController') as {
        handleSetUserReviewScore: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const res = fakeRes();
      await handleSetUserReviewScore(
        fakeReq({ params: { jobId: 'review-score-job' }, body: { score: 4 } }),
        res
      );

      assert.equal(res._status, 200);
      assert.deepEqual(res._body, { ok: true, jobId: 'review-score-job', userReviewScore: 4 });

      const row = db.get('SELECT result_scores FROM job_queue WHERE id = ?', 'review-score-job');
      assert.equal(JSON.parse(row?.result_scores as string).overall_score, 8);
      assert.equal(JSON.parse(row?.result_scores as string).user_review_score, 4);
    });

    void it('creates high-priority fix jobs for selected eligible workset jobs', async () => {
      const calls: Array<Parameters<PipelineRunner['run']>[0]> = [];
      const captureRunner: PipelineRunner = {
        async run(params) {
          calls.push(params);
          return {
            yaml: FAKE_YAML,
            scores: { overall_score: 9, revision_notes: '无需修改。' },
          };
        },
      };
      const { initQueue, _resetQueue } = require('../services/ai/queue/testing') as any;
      _resetQueue();
      initQueue({ getDb, maxConcurrency: 1, runner: captureRunner });
      delete require.cache[require.resolve('./generateController')];

      const db = getDb();
      db.run(
        `INSERT INTO job_queue (
          id, job_type, priority, status, word, language, result_yaml, result_scores, progress_events, completed_at, created_at
        )
         VALUES
         (
          'eligible-improve',
          'generate',
          'normal',
          'complete',
          'eligible',
          'en',
          ?,
          ?,
          ?,
          datetime('now'),
          datetime('now')
         ),
         (
          'blocked-improve',
          'generate',
          'normal',
          'complete',
          'blocked',
          'en',
          ?,
          '{"overall_score":9,"revision_notes":"Minor."}',
          '[]',
          datetime('now'),
          datetime('now')
         )`,
        FAKE_YAML,
        JSON.stringify({
          overall_score: 5,
          user_review_score: 4,
          revision_notes: 'Fix the weak imagery.',
          improve_count: 2,
        }),
        JSON.stringify([
          {
            type: 'step:complete',
            step: 'auditing',
            duration: 20,
            summary: 'Audited',
            result: { overall_score: 5 },
            rawText: '{"overall_score":5}',
          },
        ]),
        FAKE_YAML
      );

      const { handleImproveWorkset } = require('./generateController') as {
        handleImproveWorkset: (req: Record<string, unknown>, res: FakeRes) => Promise<void>;
      };

      const res = fakeRes();
      await handleImproveWorkset(
        fakeReq({ body: { jobIds: ['eligible-improve', 'blocked-improve', 'missing-job'] } }),
        res
      );
      await new Promise(r => setTimeout(r, 0));

      assert.equal(res._status, 202);
      const body = res._body as any;
      assert.equal(body.jobs.length, 1);
      assert.equal(body.jobs[0].sourceJobId, 'eligible-improve');
      assert.equal(body.blocked[0].jobId, 'blocked-improve');
      assert.equal(body.blocked[0].reason, 'score-not-low');
      assert.deepEqual(body.missing, ['missing-job']);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].resumeFromStage, 'fixing');
      assert.equal(calls[0].input.notes, 'Fix the weak imagery.');

      const fixRow = db.get(
        `SELECT job_type, priority, target_job_id, result_scores
         FROM job_queue
         WHERE target_job_id = ?`,
        'eligible-improve'
      );
      assert.equal(fixRow?.job_type, 'fix');
      assert.equal(fixRow?.priority, 'high');
      assert.equal(JSON.parse(fixRow?.result_scores as string).improve_count, 3);
    });
  });
});
