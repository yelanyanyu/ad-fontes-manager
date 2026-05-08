import type { Request, Response } from 'express';

const { z } = require('zod') as typeof import('zod');
const { sequentialRunner } = require('../services/ai/pipe') as {
  sequentialRunner: import('../services/ai/types').PipelineRunner;
};
const { englishPipeline } = require('../services/ai/definitions/english') as {
  englishPipeline: import('../services/ai/types').PipelineDefinition;
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

import type { PipelineJob, PipelineProgressEvent } from '../services/ai/types';

const GenerateRequestSchema = z.object({
  word: z.string().trim().min(1),
  context: z.string().optional(),
  language: z.enum(['en', 'de']).default('en'),
  notes: z.string().optional(),
});

const jobs = new Map<string, PipelineJob>();
const sseClients = new Map<string, Set<Response>>();
const cancelControllers = new Map<string, InstanceType<typeof globalThis.AbortController>>();

function generateJobId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sendSSE(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(jobId: string, eventName: string, event: unknown): void {
  const clients = sseClients.get(jobId);
  if (!clients) return;
  for (const client of clients) {
    sendSSE(client, eventName, event);
  }
}

function selectPipeline(_language: string) {
  return englishPipeline;
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function updateJobFromEvent(job: PipelineJob, event: PipelineProgressEvent): void {
  if (event.type === 'step:start') {
    job.steps.push({
      step: event.step,
      status: 'running',
      startTime: Date.now(),
      summary: event.message,
    });
    job.currentStep = event.step;
    return;
  }

  if (event.type === 'step:complete') {
    const step = job.steps.find(item => item.step === event.step && item.status === 'running');
    if (step) {
      step.status = 'complete';
      step.endTime = Date.now();
      step.durationMs = event.duration;
      step.summary = event.summary;
      step.result = event.result;
    }
    return;
  }

  if (event.type === 'step:error') {
    const step = job.steps.find(item => item.step === event.step && item.status === 'running');
    if (step) {
      step.status = 'error';
      step.error = event.error;
      step.endTime = Date.now();
    }
    job.status = 'error';
    job.error = event.error;
    return;
  }

  if (event.type === 'step:tokens') {
    const step = job.steps.find(item => item.step === event.step && item.status === 'running');
    if (step) {
      step.tokens = (step.tokens || '') + event.chunk;
    }
    return;
  }

  if (event.type === 'pipeline:complete') {
    job.status = 'complete';
    job.completedAt = Date.now();
    job.currentStep = undefined;
    job.result = { yaml: event.yaml, scores: event.scores };
  }
}

function scheduleJobCleanup(jobId: string): void {
  setTimeout(
    () => {
      if (!sseClients.has(jobId)) {
        jobs.delete(jobId);
      }
    },
    30 * 60 * 1000
  );
}

async function handleGenerateSingle(req: Request, res: Response): Promise<void> {
  const parsed = GenerateRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ code: 400, message: 'Invalid request', errors: parsed.error.issues });
    return;
  }

  const { word, context, language, notes } = parsed.data;
  const jobId = generateJobId();
  const runLogger = loggers.ai.child({ jobId, word, language });
  const job: PipelineJob = {
    jobId,
    word,
    language,
    context,
    notes,
    status: 'running',
    steps: [],
    startedAt: Date.now(),
  };
  jobs.set(jobId, job);
  scheduleJobCleanup(jobId);

  const abortController = new globalThis.AbortController();
  cancelControllers.set(jobId, abortController);

  void sequentialRunner
    .run({
      definition: selectPipeline(language),
      input: { word, context, language, notes },
      onProgress: event => {
        updateJobFromEvent(job, event);
        broadcast(jobId, event.type, event);
      },
      abortSignal: abortController.signal,
    })
    .catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      const isUserCancelled = abortController.signal.aborted;
      if (isUserCancelled) {
        job.status = 'error';
        job.error = 'User cancelled';
      } else {
        job.status = 'error';
        job.error = message;
      }
      job.completedAt = Date.now();
      runLogger.error({ error: message, userCancelled: isUserCancelled }, 'AI pipeline failed');
      broadcast(jobId, 'step:error', {
        type: 'step:error',
        step: 'pipeline',
        error: job.error,
        willRetry: !isUserCancelled,
      });
    })
    .finally(() => {
      cancelControllers.delete(jobId);
    });

  runLogger.info({ event: 'job:accepted' }, 'AI generation job accepted');
  res.status(202).json({ jobId });
}

async function handleStream(req: Request, res: Response): Promise<void> {
  const jobId = firstParam(req.params.jobId);
  const job = jobs.get(jobId);
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

  if (!sseClients.has(jobId)) sseClients.set(jobId, new Set());
  sseClients.get(jobId)!.add(res);

  for (const step of job.steps) {
    if (step.status === 'running') {
      sendSSE(res, 'step:start', {
        type: 'step:start',
        step: step.step,
        message: step.summary || step.step,
      });
    } else if (step.status === 'complete') {
      sendSSE(res, 'step:complete', {
        type: 'step:complete',
        step: step.step,
        duration: step.durationMs || 0,
        summary: step.summary || '',
        result: step.result,
      });
    } else if (step.status === 'error') {
      sendSSE(res, 'step:error', {
        type: 'step:error',
        step: step.step,
        error: step.error || 'Unknown error',
        willRetry: false,
      });
    }
  }

  if (job.status === 'complete' && job.result) {
    sendSSE(res, 'pipeline:complete', {
      type: 'pipeline:complete',
      yaml: job.result.yaml,
      scores: job.result.scores,
      totalDuration: job.completedAt ? job.completedAt - job.startedAt : 0,
    });
  } else if (job.status === 'error') {
    sendSSE(res, 'step:error', {
      type: 'step:error',
      step: 'pipeline',
      error: job.error || 'Unknown error',
      willRetry: false,
    });
  }

  const keepaliveTimer = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepaliveTimer);
    }
  }, 15000);

  const cleanup = () => {
    clearInterval(keepaliveTimer);
    const clients = sseClients.get(jobId);
    if (!clients) return;
    clients.delete(res);
    if (clients.size === 0) sseClients.delete(jobId);
  };

  req.on('close', cleanup);
  req.on('aborted', cleanup);
}

async function handleCancelJob(req: Request, res: Response): Promise<void> {
  const jobId = firstParam(req.params.jobId);
  const job = jobs.get(jobId);
  if (!job) {
    res.status(404).json({ code: 404, message: 'Job not found' });
    return;
  }
  const controller = cancelControllers.get(jobId);
  if (controller && !controller.signal.aborted) {
    controller.abort();
    job.status = 'error';
    job.error = 'User cancelled';
    job.completedAt = Date.now();
    broadcast(jobId, 'step:error', {
      type: 'step:error',
      step: 'pipeline',
      error: 'User cancelled',
      willRetry: false,
    });
    res.json({ ok: true, jobId });
  } else {
    res.json({ ok: false, message: 'Job is no longer running' });
  }
}

async function handleResumeJob(req: Request, res: Response): Promise<void> {
  const jobId = firstParam(req.params.jobId);
  const oldJob = jobs.get(jobId);
  if (!oldJob) {
    res.status(404).json({ code: 404, message: 'Job not found' });
    return;
  }
  if (oldJob.status !== 'error') {
    res.status(400).json({ code: 400, message: 'Only failed jobs can be resumed' });
    return;
  }

  const failedStep = oldJob.steps.find(step => step.status === 'error');
  const resumeFromStage = failedStep?.step || oldJob.steps[0]?.step || 'research';

  const previousSteps = oldJob.steps
    .filter(step => step.status === 'complete')
    .map(step => ({
      step: step.step,
      summary: step.summary,
      duration: step.durationMs,
      result: step.result,
    }));

  const lastCompleteStep = oldJob.steps.filter(step => step.status === 'complete').at(-1);
  const previousContext = (lastCompleteStep?.result as Record<string, unknown> | undefined) || {};

  oldJob.status = 'running';
  oldJob.error = undefined;
  oldJob.completedAt = undefined;
  oldJob.currentStep = resumeFromStage;

  const newSteps = previousSteps.map(s => ({
    step: s.step,
    status: 'complete' as const,
    startTime: Date.now(),
    endTime: Date.now(),
    durationMs: s.duration,
    summary: s.summary,
    result: s.result,
  }));
  oldJob.steps = newSteps;

  const abortController = new globalThis.AbortController();
  cancelControllers.set(jobId, abortController);

  const runLogger = loggers.ai.child({ jobId, word: oldJob.word, language: oldJob.language });

  void sequentialRunner
    .run({
      definition: selectPipeline(oldJob.language),
      input: {
        word: oldJob.word,
        context: oldJob.context,
        language: oldJob.language,
        notes: oldJob.notes,
      },
      onProgress: event => {
        updateJobFromEvent(oldJob, event);
        broadcast(jobId, event.type, event);
      },
      abortSignal: abortController.signal,
      resumeFromStage,
      previousContext: previousContext as Record<string, unknown>,
      previousSteps,
    })
    .catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      const isUserCancelled = abortController.signal.aborted;
      if (isUserCancelled) {
        oldJob.status = 'error';
        oldJob.error = 'User cancelled';
      } else {
        oldJob.status = 'error';
        oldJob.error = message;
      }
      oldJob.completedAt = Date.now();
      runLogger.error(
        { error: message, userCancelled: isUserCancelled },
        'AI pipeline resume failed'
      );
      broadcast(jobId, 'step:error', {
        type: 'step:error',
        step: 'pipeline',
        error: oldJob.error,
        willRetry: !isUserCancelled,
      });
    })
    .finally(() => {
      cancelControllers.delete(jobId);
    });

  runLogger.info({ event: 'job:resumed', fromStage: resumeFromStage }, 'AI generation job resumed');
  res.status(202).json({ jobId });
}

module.exports = { handleGenerateSingle, handleStream, handleCancelJob, handleResumeJob };
