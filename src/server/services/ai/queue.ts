import type { PipelineRunner } from './types';

const { JobQueue } = require('./JobQueue') as {
  JobQueue: new (config: {
    getDb: () => {
      get: (sql: string, ...params: unknown[]) => Record<string, unknown> | undefined;
      run: (sql: string, ...params: unknown[]) => { changes: number };
      all: (sql: string, ...params: unknown[]) => Record<string, unknown>[];
    };
    maxConcurrency: number;
    runner: PipelineRunner;
  }) => {
    enqueue: (params: {
      type: 'generate' | 'fix' | 'audit-fix';
      priority: 'normal' | 'high';
      word: string;
      language: string;
      context?: string;
      notes?: string;
      batchId?: string;
      targetJobId?: string;
      targetWordId?: string;
      providerId?: string;
      resumeFromStage?: string;
      previousContext?: Record<string, unknown>;
      previousSteps?: Array<{
        step: string;
        summary?: string;
        duration?: number;
        result?: unknown;
      }>;
    }) => string;
    cancel: (jobId: string) => boolean;
    subscribe: (jobId: string, res: { write: (chunk: string) => void }) => void;
    unsubscribe: (jobId: string, res: unknown) => void;
    getJob: (jobId: string) =>
      | {
          jobId: string;
          status: string;
          word: string;
          language: string;
          context?: string;
          notes?: string;
          error?: string;
          result?: { yaml: string; scores: Record<string, unknown> };
        }
      | undefined;
    getCompletedSteps: (jobId: string) => Array<{ type: string; [key: string]: unknown }>;
    getBatchStatus: (batchId: string) => {
      total: number;
      queued: number;
      running: number;
      complete: number;
      error: number;
      partial: number;
      cancelled: number;
      paused: number;
      done: number;
      failed: number;
    };
    pauseBatch: (batchId: string) => void;
    resumeBatch: (batchId: string) => void;
    cancelBatch: (batchId: string) => void;
    retryBatch: (batchId: string) => void;
    resetCircuitBreaker: (providerId: string) => void;
  };
};

const { sequentialRunner } = require('./pipe') as {
  sequentialRunner: PipelineRunner;
};

const { getSqlite } = require('../../db') as {
  getSqlite: () => {
    prepare: (sql: string) => {
      get: (...params: unknown[]) => Record<string, unknown> | undefined;
      run: (...params: unknown[]) => { changes: number };
      all: (...params: unknown[]) => Record<string, unknown>[];
    };
  };
};

const config = require('../../utils/config') as {
  get: <T = unknown>(path: string, defaultValue?: T) => T;
};

interface SqliteLike {
  get: (sql: string, ...params: unknown[]) => Record<string, unknown> | undefined;
  run: (sql: string, ...params: unknown[]) => { changes: number };
  all: (sql: string, ...params: unknown[]) => Record<string, unknown>[];
}

function createSqliteAdapter(): SqliteLike {
  const sqlite = getSqlite();
  return {
    get: (sql: string, ...params: unknown[]) =>
      sqlite.prepare(sql).get(...params) as Record<string, unknown> | undefined,
    run: (sql: string, ...params: unknown[]) => sqlite.prepare(sql).run(...params),
    all: (sql: string, ...params: unknown[]) =>
      sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
}

let _queue: any = null;

function initQueue(overrides?: {
  getDb?: () => SqliteLike;
  maxConcurrency?: number;
  runner?: PipelineRunner;
}): void {
  const maxConcurrency =
    overrides?.maxConcurrency ?? Math.max(1, Number(config.get<number>('ai.queue_concurrency', 1)));
  _queue = new JobQueue({
    getDb: overrides?.getDb ?? createSqliteAdapter,
    maxConcurrency,
    runner: overrides?.runner ?? sequentialRunner,
  });
}

function getQueue(): any {
  if (!_queue) initQueue();
  return _queue;
}

// For testing only — reset the singleton so tests can inject their own config.
function _resetQueue(): void {
  _queue = null;
}

module.exports = { initQueue, getQueue, _resetQueue };
