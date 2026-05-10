import type { Request, Response } from 'express';

const { z } = require('zod') as typeof import('zod');
const { getQueue } = require('../services/ai/queue') as {
  getQueue: () => {
    enqueue: (params: {
      type: 'generate' | 'fix' | 'audit-fix';
      priority: 'normal' | 'high';
      word: string;
      language: string;
      context?: string;
      notes?: string;
      targetJobId?: string;
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
          jobType?: string;
          word: string;
          language: string;
          context?: string;
          notes?: string;
          error?: string;
          result?: { yaml: string; scores: Record<string, unknown> };
        }
      | undefined;
    getCompletedSteps: (jobId: string) => Array<{
      type: string;
      step?: string;
      summary?: string;
      result?: unknown;
      [key: string]: unknown;
    }>;
    getQueuePosition: (jobId: string) => number;
    isDuplicate: (word: string, language: string) => boolean;
    getQueueOverview: () => Array<{
      jobId: string;
      jobType: string;
      status: string;
      word: string;
      language: string;
      priority: string;
      createdAt: string;
      error?: string;
    }>;
    getQueueHistory: (params: {
      page: number;
      pageSize: number;
      status?: 'complete' | 'partial' | 'error';
      query?: string;
    }) => {
      jobs: Array<{
        jobId: string;
        jobType: string;
        status: string;
        word: string;
        language: string;
        priority: string;
        createdAt: string;
        completedAt?: string;
        error?: string;
        hasResult: boolean;
      }>;
      total: number;
      page: number;
      pageSize: number;
    };
    deleteHistoryJob: (jobId: string) => 'deleted' | 'not-found' | 'active';
    clearHistory: (params: { status?: 'complete' | 'partial' | 'error'; query?: string }) => number;
    cancelAll: () => void;
    pauseAll: () => void;
    resumeAll: () => void;
    emitProgress: (
      jobId: string,
      event: {
        type: string;
        step?: string;
        message?: string;
        chunk?: string;
        duration?: number;
        summary?: string;
        result?: unknown;
        rawText?: string;
        reasoningText?: string;
        error?: string;
        [key: string]: unknown;
      }
    ) => void;
  };
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
const ResumeRequestSchema = z.object({
  fromStage: z.enum(['searching', 'pondering', 'auditing']).optional(),
  notes: z.string().optional(),
  userScore: z.number().min(0).max(10).optional(),
});
const HistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['complete', 'partial', 'error']).optional(),
  query: z.string().trim().optional(),
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

  // Reconstruct resume state from the old job's completed steps.
  const completedSteps = queue.getCompletedSteps(jobId);
  const completedStepResults = completedSteps
    .filter(e => e.type === 'step:complete')
    .map(e => ({
      step: e.step as string,
      summary: e.summary as string | undefined,
      duration: e.duration as number | undefined,
      result: e.result,
    }));

  // Merge context from completed step results.
  const previousContext: Record<string, unknown> = {};
  for (const step of completedStepResults) {
    if (step.result && typeof step.result === 'object' && !Array.isArray(step.result)) {
      Object.assign(previousContext, step.result as Record<string, unknown>);
    }
  }
  // Also include the old job's YAML as researchYaml.
  if (oldJob.result?.yaml) {
    previousContext.researchYaml = oldJob.result.yaml;
  }
  if (parsed.data.userScore !== undefined) {
    previousContext.userScore = parsed.data.userScore;
  }

  // Determine resume stage from request or last completed/errored step.
  const errorEvent = completedSteps.find(e => e.type === 'step:error');
  const resumeFromStage = parsed.data.fromStage || (errorEvent?.step as string) || 'searching';

  // Filter steps up to (but not including) the resume stage.
  const stageOrder = ['searching', 'pondering', 'auditing'];
  const resumeIndex = stageOrder.indexOf(resumeFromStage);
  const previousSteps = completedStepResults.filter(s => stageOrder.indexOf(s.step) < resumeIndex);

  const newJobId = queue.enqueue({
    type: 'generate',
    priority: 'high',
    word: oldJob.word,
    language: oldJob.language,
    context: oldJob.context,
    notes: parsed.data.notes ?? oldJob.notes,
    resumeFromStage,
    previousContext,
    previousSteps,
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
  if (!revisionNotes || revisionNotes === '无需修改。') {
    res.status(400).json({ code: 400, message: 'No revision notes to apply' });
    return;
  }

  const fixJobId = queue.enqueue({
    type: 'fix',
    priority: 'high',
    word: job.word,
    language: job.language,
    context: job.context,
    notes: revisionNotes,
    targetJobId: jobId,
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
  handleStream,
  handleCancelJob,
  handleResumeJob,
  handleFixJob,
  handleQueueOverview,
  handleQueueHistory,
  handleQueueHistoryJob,
  handleDeleteHistoryJob,
  handleClearQueueHistory,
  handleQueueCancelAll,
  handleQueuePauseAll,
  handleQueueResumeAll,
};
