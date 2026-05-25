import type { Request, Response } from 'express';
import type { JobQueue } from '../services/ai/JobQueue';

const { z } = require('zod') as typeof import('zod');
const crypto = require('node:crypto') as typeof import('node:crypto');
const { getQueue } = require('../services/ai/queue') as {
  getQueue: () => JobQueue;
};
const wordServiceV2 = require('../services/word/WordServiceV2') as {
  saveWord: (
    req: Request,
    yamlStr: string,
    forceUpdate?: boolean
  ) => Promise<Record<string, unknown>>;
};
const { getSqlite } = require('../db') as {
  getSqlite: () => import('better-sqlite3').Database;
};

const { loggers } = require('../utils/logger') as {
  loggers: {
    ai: {
      child: (payload: Record<string, unknown>) => {
        info: (payload: Record<string, unknown>, message?: string) => void;
        error: (payload: Record<string, unknown>, message?: string) => void;
      };
    };
  };
};

// ---- Schemas ----

const GenerateRequestSchema = z.object({
  word: z.string().trim().min(1),
  context: z.string().optional(),
  language: z.enum(['en', 'de']).default('en'),
  notes: z.string().optional(),
});
const BatchGenerateRequestSchema = z.object({
  language: z.enum(['en', 'de']).default('en'),
  items: z
    .array(
      z.object({
        word: z.string().trim().min(1),
        context: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .min(1)
    .max(200),
});
const ResumeRequestSchema = z.object({
  fromStage: z.enum(['searching', 'pondering', 'auditing']).optional(),
  notes: z.string().optional(),
  userScore: z.number().min(0).max(10).optional(),
});
const FixRequestSchema = z.object({
  notes: z.string().trim().optional(),
});
const HistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['complete', 'partial', 'error']).optional(),
  query: z.string().trim().optional(),
});
const WorksetSaveSchema = z.object({
  jobIds: z.array(z.string().trim().min(1)).min(1).max(200),
  forceUpdate: z.boolean().default(false),
});
const WorksetImproveSchema = z.object({
  jobIds: z.array(z.string().trim().min(1)).min(1).max(200),
});
const UserReviewScoreSchema = z.object({
  score: z.number().min(0).max(10),
});

// ---- Helpers ----

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

// ---- Handlers ----

async function handleGenerateSingle(req: Request, res: Response): Promise<void> {
  const parsed = GenerateRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ code: 400, message: 'Invalid request', errors: parsed.error.issues });
    return;
  }

  const { word, context, language, notes } = parsed.data;
  const queue = getQueue();

  // Reject if a job with the same word+language is already queued or running.
  if (queue.isDuplicate(word, language)) {
    res
      .status(409)
      .json({ code: 409, message: 'A job for this word is already queued or running.' });
    return;
  }

  const jobId = queue.enqueue({
    type: 'generate',
    priority: 'normal',
    word,
    language,
    context,
    notes,
  });

  const job = queue.getJob(jobId);
  const isQueued = job?.status === 'queued';
  const position = isQueued ? queue.getQueuePosition(jobId) : undefined;

  const runLogger = loggers.ai.child({ jobId, word, language });
  runLogger.info(
    { event: isQueued ? 'job:queued' : 'job:accepted' },
    isQueued ? 'AI generation job queued' : 'AI generation job accepted'
  );

  res.status(202).json({ jobId, queued: isQueued, position });
}

async function handleGenerateBatch(req: Request, res: Response): Promise<void> {
  const parsed = BatchGenerateRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ code: 400, message: 'Invalid request', errors: parsed.error.issues });
    return;
  }

  const { language, items } = parsed.data;
  const queue = getQueue();
  const batchId = `batch-${crypto.randomUUID()}`;
  const jobs: Array<{ jobId: string; word: string; queued: boolean; position?: number }> = [];
  const skipped: Array<{ word: string; reason: string }> = [];

  // Pass 1: dedup within the request and collect unique items for bulk duplicate check.
  const seen = new Set<string>();
  const uniqueItems: Array<{ word: string; context?: string; notes?: string }> = [];
  for (const item of items) {
    const word = item.word.trim();
    const key = `${language}:${word.toLocaleLowerCase()}`;
    if (seen.has(key)) {
      skipped.push({ word, reason: 'duplicate-in-request' });
      continue;
    }
    seen.add(key);
    uniqueItems.push({ word, context: item.context, notes: item.notes });
  }

  // Pass 2: bulk duplicate check (1 query instead of N).
  const dupKeys = queue.findDuplicates(uniqueItems.map(item => ({ word: item.word, language })));

  // Pass 3: enqueue non-duplicates.
  const newJobIds: string[] = [];
  for (const item of uniqueItems) {
    const key = `${language}:${item.word.toLocaleLowerCase()}`;
    if (dupKeys.has(key)) {
      skipped.push({ word: item.word, reason: 'already-queued-or-running' });
      continue;
    }
    const jobId = queue.enqueue({
      type: 'generate',
      priority: 'normal',
      word: item.word,
      language,
      context: item.context?.trim() || undefined,
      notes: item.notes?.trim() || undefined,
      batchId,
    });
    newJobIds.push(jobId);
    jobs.push({ jobId, word: item.word, queued: true, position: undefined });
  }

  // Pass 4: bulk position query (1 query instead of N).
  if (newJobIds.length > 0) {
    const positions = queue.getQueuePositions(newJobIds);
    for (const job of jobs) {
      const pos = positions.get(job.jobId);
      if (pos !== undefined) job.position = pos;
    }
  }

  if (jobs.length === 0) {
    res.status(409).json({
      code: 409,
      message: 'No jobs were created for this batch.',
      batchId,
      skipped,
    });
    return;
  }

  const runLogger = loggers.ai.child({ batchId, language, total: jobs.length });
  runLogger.info({ event: 'batch:accepted', skipped }, 'AI generation batch accepted');

  res.status(202).json({ batchId, jobs, skipped });
}

async function handleStream(req: Request, res: Response): Promise<void> {
  const jobId = firstParam(req.params.jobId);
  const queue = getQueue();
  const job = queue.getJob(jobId);

  if (!job) {
    res.status(404).json({ code: 404, message: 'Job not found' });
    return;
  }

  res.setTimeout(0);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Delegate SSE event replay + live forwarding to JobQueue.
  queue.subscribe(jobId, res);

  // Keepalive to prevent proxy/client timeouts.
  // unref() prevents this timer from blocking test runner / process exit.
  const keepaliveTimer = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepaliveTimer);
    }
  }, 15000);
  keepaliveTimer.unref();

  const cleanup = () => {
    clearInterval(keepaliveTimer);
    queue.unsubscribe(jobId, res);
  };

  req.on('close', cleanup);
  req.on('aborted', cleanup);
}

async function handleCancelJob(req: Request, res: Response): Promise<void> {
  const jobId = firstParam(req.params.jobId);
  const queue = getQueue();
  const job = queue.getJob(jobId);

  if (!job) {
    res.status(404).json({ code: 404, message: 'Job not found' });
    return;
  }

  const cancelled = queue.cancel(jobId);
  res.json({ ok: cancelled, jobId });
}

async function handlePauseJob(req: Request, res: Response): Promise<void> {
  const jobId = firstParam(req.params.jobId);
  const queue = getQueue();
  const job = queue.getJob(jobId);

  if (!job) {
    res.status(404).json({ code: 404, message: 'Job not found' });
    return;
  }
  if (job.status !== 'queued' && job.status !== 'running') {
    res.status(400).json({ code: 400, message: 'Only queued or running jobs can be paused' });
    return;
  }

  const paused = queue.pauseJob(jobId);
  res.json({ ok: paused, jobId });
}

async function handleResumeActiveJob(req: Request, res: Response): Promise<void> {
  const jobId = firstParam(req.params.jobId);
  const queue = getQueue();
  const job = queue.getJob(jobId);

  if (!job) {
    res.status(404).json({ code: 404, message: 'Job not found' });
    return;
  }
  if (job.status !== 'paused') {
    res.status(400).json({ code: 400, message: 'Only paused jobs can be resumed' });
    return;
  }

  const resumed = queue.resumeJob(jobId);
  res.json({ ok: resumed, jobId });
}

async function handleResumeJob(req: Request, res: Response): Promise<void> {
  const jobId = firstParam(req.params.jobId);
  const queue = getQueue();
  const oldJob = queue.getJob(jobId);

  if (!oldJob) {
    res.status(404).json({ code: 404, message: 'Job not found' });
    return;
  }
  if (oldJob.status === 'running' || oldJob.status === 'queued') {
    res.status(400).json({ code: 400, message: 'Only finished jobs can be resumed' });
    return;
  }

  const parsed = ResumeRequestSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ code: 400, message: 'Invalid request', errors: parsed.error.issues });
    return;
  }

  const snapshot = queue.buildResumeSnapshot(jobId, parsed.data.fromStage);
  const previousContext = { ...(snapshot.previousContext || {}) };
  if (parsed.data.userScore !== undefined) {
    previousContext.userScore = parsed.data.userScore;
  }
  const resumeFromStage = snapshot.resumeFromStage || 'searching';
  if (resumeFromStage !== 'searching' && !previousContext.researchYaml && oldJob.result?.yaml) {
    previousContext.researchYaml = oldJob.result.yaml;
  }

  const newJobId = queue.enqueue({
    type: 'generate',
    priority: 'high',
    word: oldJob.word,
    language: oldJob.language,
    context: oldJob.context,
    notes: parsed.data.notes,
    resumeFromStage,
    previousContext,
    previousSteps: snapshot.previousSteps,
  });

  const newJob = queue.getJob(newJobId);
  const isQueued = newJob?.status === 'queued';
  const position = isQueued ? queue.getQueuePosition(newJobId) : undefined;

  const runLogger = loggers.ai.child({
    jobId: newJobId,
    word: oldJob.word,
    language: oldJob.language,
  });
  runLogger.info({ event: 'job:resumed', fromStage: resumeFromStage }, 'AI generation job resumed');
  res.status(202).json({ jobId: newJobId, queued: isQueued, position });
}

async function handleFixJob(req: Request, res: Response): Promise<void> {
  const jobId = firstParam(req.params.jobId);
  const parsed = FixRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ code: 400, message: 'Invalid request', errors: parsed.error.issues });
    return;
  }
  const queue = getQueue();
  const job = queue.getJob(jobId);

  if (!job) {
    res.status(404).json({ code: 404, message: 'Job not found' });
    return;
  }

  const yamlText = job.result?.yaml;
  if (!yamlText) {
    res.status(400).json({ code: 400, message: 'No YAML to fix' });
    return;
  }

  const scores = job.result?.scores as Record<string, unknown> | undefined;
  const revisionNotes = scores?.revision_notes as string | undefined;
  const hasRevisionNotes = revisionNotes && revisionNotes !== '无需修改。';
  const overallScore = scores?.overall_score;
  const hasParseError = scores?._parse_error === true;
  const userNotes = parsed.data.notes?.trim();
  if ((hasParseError || typeof overallScore !== 'number') && !userNotes) {
    res.status(400).json({
      code: 400,
      message:
        'Auditing 结果不完整，无法自动判断需要修改的内容。请重新 Auditing，或在 Revision notes 中提供具体修改意见。',
    });
    return;
  }
  if (!hasRevisionNotes && !userNotes) {
    res.status(400).json({
      code: 400,
      message:
        overallScore === 10
          ? '已达满分（score=10），无需自动修复。如需继续修改，请在 Revision notes 中提供具体修改意见。'
          : '没有可用的 Revision notes，无法自动修复。如需继续修改，请在 Revision notes 中提供具体修改意见。',
    });
    return;
  }
  const fixNotes = userNotes
    ? hasRevisionNotes
      ? `${revisionNotes}\n\nUser feedback:\n${userNotes}`
      : userNotes
    : revisionNotes;

  const completedSteps = queue.getCompletedSteps(jobId);
  const previousSteps = completedSteps
    .filter(e => e.type === 'step:complete')
    .map(e => ({
      step: e.step as string,
      summary: e.summary as string | undefined,
      duration: e.duration as number | undefined,
      result: e.result,
      rawText: e.rawText as string | undefined,
      reasoningText: e.reasoningText as string | undefined,
    }));

  const fixJobId = queue.enqueue({
    type: 'fix',
    priority: 'high',
    word: job.word,
    language: job.language,
    context: job.context,
    notes: fixNotes,
    targetJobId: jobId,
    resumeFromStage: 'fixing',
    previousSteps,
  });

  const fixJob = queue.getJob(fixJobId);
  const isQueued = fixJob?.status === 'queued';
  const position = isQueued ? queue.getQueuePosition(fixJobId) : undefined;

  const runLogger = loggers.ai.child({ jobId: fixJobId, targetJobId: jobId, word: job.word });
  runLogger.info(
    { event: isQueued ? 'fix:queued' : 'fix:accepted' },
    isQueued ? 'AI fix job queued' : 'AI fix job accepted'
  );

  res.status(202).json({ jobId: fixJobId, queued: isQueued, position });
}

async function handleQueueOverview(_req: Request, res: Response): Promise<void> {
  const queue = getQueue();
  res.json({ jobs: queue.getQueueOverview() });
}

async function handleQueueHistory(req: Request, res: Response): Promise<void> {
  const parsed = HistoryQuerySchema.safeParse(req.query || {});
  if (!parsed.success) {
    res.status(400).json({ code: 400, message: 'Invalid request', errors: parsed.error.issues });
    return;
  }

  const queue = getQueue();
  res.json(queue.getQueueHistory(parsed.data));
}

async function handleQueueHistoryJob(req: Request, res: Response): Promise<void> {
  const jobId = firstParam(req.params.jobId);
  const queue = getQueue();
  const job = queue.getJob(jobId);

  if (!job) {
    res.status(404).json({ code: 404, message: 'Job not found' });
    return;
  }
  if (job.status === 'queued' || job.status === 'running' || job.status === 'paused') {
    res.status(409).json({ code: 409, message: 'Job is still active' });
    return;
  }

  res.json({ job });
}

async function handleTodayWorkset(_req: Request, res: Response): Promise<void> {
  const queue = getQueue();
  res.json(queue.getTodayWorkset());
}

async function handleSetUserReviewScore(req: Request, res: Response): Promise<void> {
  const jobId = firstParam(req.params.jobId);
  const parsed = UserReviewScoreSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ code: 400, message: 'Invalid request', errors: parsed.error.issues });
    return;
  }

  const queue = getQueue();
  const result = queue.setUserReviewScore(jobId, parsed.data.score);

  if (result === 'not-found') {
    res.status(404).json({ code: 404, message: 'Job not found' });
    return;
  }

  if (result === 'not-reviewable') {
    res.status(400).json({
      code: 400,
      message: 'Only completed jobs with YAML results can receive a user review score',
    });
    return;
  }

  res.json({ ok: true, jobId, userReviewScore: parsed.data.score });
}

async function handleImproveWorkset(req: Request, res: Response): Promise<void> {
  const parsed = WorksetImproveSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ code: 400, message: 'Invalid request', errors: parsed.error.issues });
    return;
  }

  const queue = getQueue();
  const result = queue.submitWorksetImprove(parsed.data.jobIds);
  res.status(202).json({ ok: true, ...result });
}

async function handleSaveWorkset(req: Request, res: Response): Promise<void> {
  const parsed = WorksetSaveSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ code: 400, message: 'Invalid request', errors: parsed.error.issues });
    return;
  }

  const queue = getQueue();
  const yamlRows = queue.getWorksetYaml(parsed.data.jobIds);
  const foundIds = new Set(yamlRows.map(row => row.jobId));
  const missing = parsed.data.jobIds.filter(jobId => !foundIds.has(jobId));
  const results: Array<{ jobId: string; result: Record<string, unknown> }> = [];

  const sqlite = getSqlite();
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    for (const row of yamlRows) {
      const result = await wordServiceV2.saveWord(req, row.yaml, parsed.data.forceUpdate);
      results.push({ jobId: row.jobId, result });
    }
    sqlite.exec('COMMIT');
  } catch (_err) {
    sqlite.exec('ROLLBACK');
    throw _err;
  }

  const saved = results.filter(item => item.result.success === true).length;
  const conflicts = results.filter(item => item.result.status === 'conflict').length;
  const failed = results.length - saved - conflicts;

  res.json({
    ok: failed === 0 && conflicts === 0 && missing.length === 0,
    saved,
    conflicts,
    failed,
    missing,
    results,
  });
}

async function handleDeleteHistoryJob(req: Request, res: Response): Promise<void> {
  const jobId = firstParam(req.params.jobId);
  const queue = getQueue();
  const result = queue.deleteHistoryJob(jobId);

  if (result === 'not-found') {
    res.status(404).json({ code: 404, message: 'Job not found' });
    return;
  }
  if (result === 'active') {
    res.status(409).json({ code: 409, message: 'Cannot delete an active job' });
    return;
  }

  res.json({ ok: true, jobId });
}

async function handleClearQueueHistory(req: Request, res: Response): Promise<void> {
  const parsed = HistoryQuerySchema.pick({ status: true, query: true }).safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ code: 400, message: 'Invalid request', errors: parsed.error.issues });
    return;
  }

  const queue = getQueue();
  const deleted = queue.clearHistory(parsed.data);
  res.json({ ok: true, deleted });
}

async function handleQueueCancelAll(_req: Request, res: Response): Promise<void> {
  const queue = getQueue();
  queue.cancelAll();
  res.json({ ok: true });
}

async function handleQueuePauseAll(_req: Request, res: Response): Promise<void> {
  const queue = getQueue();
  queue.pauseAll();
  res.json({ ok: true });
}

async function handleQueueResumeAll(_req: Request, res: Response): Promise<void> {
  const queue = getQueue();
  queue.resumeAll();
  res.json({ ok: true });
}

module.exports = {
  handleGenerateSingle,
  handleGenerateBatch,
  handleStream,
  handleCancelJob,
  handlePauseJob,
  handleResumeActiveJob,
  handleResumeJob,
  handleFixJob,
  handleQueueOverview,
  handleQueueHistory,
  handleQueueHistoryJob,
  handleTodayWorkset,
  handleSetUserReviewScore,
  handleImproveWorkset,
  handleSaveWorkset,
  handleDeleteHistoryJob,
  handleClearQueueHistory,
  handleQueueCancelAll,
  handleQueuePauseAll,
  handleQueueResumeAll,
};
