import type { JobQueue } from './JobQueue';

// Queue module 的公开入口。
// 外部只需要知道怎么取得 Queue、调整并发；测试注入能力放在 testing seam，避免生产入口变宽。
const runtime = require('./queue') as {
  getQueue: () => JobQueue;
  updateQueueConcurrency: (maxConcurrency: number) => void;
};

module.exports = {
  getQueue: runtime.getQueue,
  updateQueueConcurrency: runtime.updateQueueConcurrency,
};
export type { JobQueue };
