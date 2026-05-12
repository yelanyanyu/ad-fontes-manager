import type { PipelineRunner } from './types';
import type { JobQueue } from './JobQueue';

const { JobQueue: JobQueueCtor } = require('./JobQueue') as typeof import('./JobQueue');

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

let _queue: JobQueue | null = null;

function initQueue(overrides?: {
  getDb?: () => SqliteLike;
  maxConcurrency?: number;
  runner?: PipelineRunner;
}): void {
  const maxConcurrency =
    overrides?.maxConcurrency ?? Math.max(1, Number(config.get<number>('ai.queue_concurrency', 1)));
  _queue = new JobQueueCtor({
    getDb: overrides?.getDb ?? createSqliteAdapter,
    maxConcurrency,
    runner: overrides?.runner ?? sequentialRunner,
  });
}

function getQueue(): JobQueue {
  if (!_queue) initQueue();
  return _queue!;
}

function updateQueueConcurrency(maxConcurrency: number): void {
  if (_queue) {
    _queue.setMaxConcurrency(maxConcurrency);
  }
}

// For testing only — reset the singleton so tests can inject their own config.
function _resetQueue(): void {
  _queue = null;
}

module.exports = { initQueue, getQueue, updateQueueConcurrency, _resetQueue };
