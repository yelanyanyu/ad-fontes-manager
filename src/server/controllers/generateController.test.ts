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
    result_yaml TEXT,
    result_scores TEXT,
    provider_id TEXT,
    error TEXT,
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
    const { initQueue, _resetQueue } = require('../services/ai/queue') as {
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
    const { _resetQueue } = require('../services/ai/queue') as { _resetQueue: () => void };
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
      const { initQueue, _resetQueue } = require('../services/ai/queue') as any;
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
      const { initQueue, _resetQueue } = require('../services/ai/queue') as any;
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
      const { initQueue, _resetQueue } = require('../services/ai/queue') as any;
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
      const { initQueue, _resetQueue } = require('../services/ai/queue') as any;
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
      const { initQueue, _resetQueue } = require('../services/ai/queue') as any;
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
  });
});
