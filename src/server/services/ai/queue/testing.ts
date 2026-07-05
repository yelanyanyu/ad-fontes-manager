import type { PipelineRunner } from '../types';

interface SqliteLike {
  get: (sql: string, ...params: unknown[]) => Record<string, unknown> | undefined;
  run: (sql: string, ...params: unknown[]) => { changes: number };
  all: (sql: string, ...params: unknown[]) => Record<string, unknown>[];
}

// Queue module 的测试入口。
// 测试可以从这里注入数据库和 Runner；生产代码只走 queue/index.ts 的窄入口。
const runtime = require('./queue') as {
  initQueue: (overrides?: {
    getDb?: () => SqliteLike;
    maxConcurrency?: number;
    runner?: PipelineRunner;
  }) => void;
  _resetQueue: () => void;
};

module.exports = {
  initQueue: runtime.initQueue,
  _resetQueue: runtime._resetQueue,
};
