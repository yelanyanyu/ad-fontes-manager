import type { JobQueue } from './JobQueue';
import type { PipelineRunner } from '../types';

// Queue module 的公开入口。
// 外部只需要知道怎么取得 Queue、注入测试 Queue、调整并发；内部文件可以继续按运行职责拆开。
const runtime = require('./queue') as {
  initQueue: (overrides?: {
    getDb?: () => {
      get: (sql: string, ...params: unknown[]) => Record<string, unknown> | undefined;
      run: (sql: string, ...params: unknown[]) => { changes: number };
      all: (sql: string, ...params: unknown[]) => Record<string, unknown>[];
    };
    maxConcurrency?: number;
    runner?: PipelineRunner;
  }) => void;
  getQueue: () => JobQueue;
  updateQueueConcurrency: (maxConcurrency: number) => void;
  _resetQueue: () => void;
};

module.exports = runtime;
export type { JobQueue };
