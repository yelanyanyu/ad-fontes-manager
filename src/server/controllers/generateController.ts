import type { Request, Response } from 'express';

const { z } = require('zod') as typeof import('zod');
const { sequentialRunner } = require('../services/ai/pipe') as {
  sequentialRunner: import('../services/ai/types').PipelineRunner;
};
const { englishPipeline } = require('../services/ai/definitions/english') as {
  englishPipeline: import('../services/ai/types').PipelineDefinition;
};
const { germanPipeline } = require('../services/ai/definitions/german') as {
  germanPipeline: import('../services/ai/types').PipelineDefinition;
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
const ResumeRequestSchema = z.object({
  fromStage: z.enum(['searching', 'pondering', 'auditing']).optional(),
});

const jobs = new Map<string, PipelineJob>();
const sseClients = new Map<string, Set<Response>>();
const cancelControllers = new Map<string, InstanceType<typeof globalThis.AbortController>>();
const queuedJobIds: string[] = [];
let runningJobId: string | null = null;

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

function selectPipeline(language: string) {
  return language === 'de' ? germanPipeline : englishPipeline;
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function updateJobFromEvent(job: PipelineJob, event: PipelineProgressEvent): void {
  if (event.type === 'job:queued') {
    job.status = 'queued';
    job.queuePosition = event.position;
    return;
  }

  if (event.type === 'job:started') {
    job.status = 'running';
    job.queuePosition = undefined;
    return;
  }

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
      step.rawText = event.rawText;
      if (event.reasoningText) step.reasoningText = event.reasoningText;
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

  if (event.type === 'step:reasoning') {
    const step = job.steps.find(item => item.step === event.step && item.status === 'running');
    if (step) {
      step.reasoningText = (step.reasoningText || '') + event.chunk;
    }
    return;
  }

  if (event.type === 'step:tool-call') {
    const step = job.steps.find(item => item.step === event.step && item.status === 'running');
    if (step) {
      step.toolCalls = step.toolCalls || [];
      step.toolCalls.push({
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        status: 'running',
        input: event.input,
        startTime: event.startTime,
      });
    }
    return;
  }

  if (event.type === 'step:tool-result') {
    const step = job.steps.find(item => item.step === event.step && item.status === 'running');
    const toolCall = step?.toolCalls?.find(item => item.toolCallId === event.toolCallId);
    if (toolCall) {
      toolCall.status = event.error ? 'error' : 'complete';
      toolCall.output = event.output;
      toolCall.error = event.error;
      toolCall.warning = event.warning;
      toolCall.endTime = Date.now();
      toolCall.durationMs = event.duration;
    }
    return;
  }

  if (event.type === 'pipeline:complete') {
    job.status = 'complete';
    job.completedAt = Date.now();
    job.currentStep = undefined;
    job.result = { yaml: event.yaml, scores: event.scores };
  }

  if (event.type === 'pipeline:stopped') {
    job.status = 'partial';
    job.completedAt = Date.now();
    job.currentStep = undefined;
    job.result = { yaml: event.yaml, scores: {} };
  }
}

function updateQueuePositions(): void {
  queuedJobIds.forEach((jobId, index) => {
    const job = jobs.get(jobId);
    if (!job) return;
    job.queuePosition = index + 1;
    broadcast(jobId, 'job:queued', { type: 'job:queued', position: job.queuePosition });
  });
}

function buildResumeState(job: PipelineJob, fromStage: string) {
  const pipeline = selectPipeline(job.language);
  const stageOrder = pipeline.stages.map(stage => stage.id);
  const resumeIndex = stageOrder.indexOf(fromStage);
  const previousContext: Record<string, unknown> = {};
  const previousSteps = job.steps
    .filter(step => step.status === 'complete' && stageOrder.indexOf(step.step) < resumeIndex)
    .map(step => {
      if (step.result && typeof step.result === 'object' && !Array.isArray(step.result)) {
        Object.assign(previousContext, step.result);
      }
      return {
        step: step.step,
        summary: step.summary,
        duration: step.durationMs,
        result: step.result,
      };
    });

  return { previousContext, previousSteps };
}

function finishRunningJob(jobId: string): void {
  if (runningJobId === jobId) runningJobId = null;
  startNextQueuedJob();
}

function startPipelineJob(
  jobId: string,
  resumeFromStage?: string,
  previousJob?: PipelineJob
): void {
  const job = jobs.get(jobId);
  if (!job) return;

  runningJobId = jobId;
  const abortController = new globalThis.AbortController();
  cancelControllers.set(jobId, abortController);
  updateJobFromEvent(job, { type: 'job:started' });
  broadcast(jobId, 'job:started', { type: 'job:started' });

  const runLogger = loggers.ai.child({ jobId, word: job.word, language: job.language });
  const resumeState =
    resumeFromStage && previousJob ? buildResumeState(previousJob, resumeFromStage) : undefined;

  void sequentialRunner
    .run({
      definition: selectPipeline(job.language),
      input: {
        word: job.word,
        context: job.context,
        language: job.language,
        notes: job.notes,
      },
      onProgress: event => {
        updateJobFromEvent(job, event);
        broadcast(jobId, event.type, event);
      },
      abortSignal: abortController.signal,
      resumeFromStage,
      previousContext: resumeState?.previousContext,
      previousSteps: resumeState?.previousSteps,
    })
    .catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      const isUserCancelled = abortController.signal.aborted;
      job.status = 'error';
      job.error = isUserCancelled ? 'User cancelled' : message;
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
      finishRunningJob(jobId);
    });
}

function startNextQueuedJob(): void {
  const nextJobId = queuedJobIds.shift();
  if (!nextJobId) return;
  updateQueuePositions();
  startPipelineJob(nextJobId);
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
    status: runningJobId ? 'queued' : 'running',
    steps: [],
    startedAt: Date.now(),
  };
  jobs.set(jobId, job);
  scheduleJobCleanup(jobId);

  if (runningJobId) {
    queuedJobIds.push(jobId);
    updateQueuePositions();
    runLogger.info(
      { event: 'job:queued', position: job.queuePosition },
      'AI generation job queued'
    );
    res.status(202).json({ jobId, queued: true, position: job.queuePosition });
    return;
  }

  startPipelineJob(jobId);
  runLogger.info({ event: 'job:accepted' }, 'AI generation job accepted');
  res.status(202).json({ jobId, queued: false });
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
    for (const toolCall of step.toolCalls || []) {
      sendSSE(res, 'step:tool-call', {
        type: 'step:tool-call',
        step: step.step,
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        input: toolCall.input,
        startTime: toolCall.startTime,
      });
      if (toolCall.status !== 'running') {
        sendSSE(res, 'step:tool-result', {
          type: 'step:tool-result',
          step: step.step,
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          output: toolCall.output,
          error: toolCall.error,
          warning: toolCall.warning,
          duration: toolCall.durationMs || 0,
        });
      }
    }

    if (step.status === 'running') {
      sendSSE(res, 'step:start', {
        type: 'step:start',
        step: step.step,
        message: step.summary || step.step,
      });
      if (step.reasoningText) {
        sendSSE(res, 'step:reasoning', {
          type: 'step:reasoning',
          step: step.step,
          chunk: step.reasoningText,
        });
      }
    } else if (step.status === 'complete') {
      sendSSE(res, 'step:complete', {
        type: 'step:complete',
        step: step.step,
        duration: step.durationMs || 0,
        summary: step.summary || '',
        result: step.result,
        rawText: step.rawText,
        reasoningText: step.reasoningText,
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
  } else if (job.status === 'partial' && job.result) {
    const stoppedStep = job.steps.find(s => s.status === 'complete' || s.status === 'error');
    sendSSE(res, 'pipeline:stopped', {
      type: 'pipeline:stopped',
      yaml: job.result.yaml,
      stoppedAtStage: stoppedStep?.step || 'unknown',
      reason: stoppedStep?.summary || 'Pipeline stopped early',
    });
  } else if (job.status === 'error') {
    sendSSE(res, 'step:error', {
      type: 'step:error',
      step: 'pipeline',
      error: job.error || 'Unknown error',
      willRetry: false,
    });
  } else if (job.status === 'queued') {
    sendSSE(res, 'job:queued', {
      type: 'job:queued',
      position: job.queuePosition || 1,
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
  if (job.status === 'queued') {
    const index = queuedJobIds.indexOf(jobId);
    if (index >= 0) queuedJobIds.splice(index, 1);
    job.status = 'error';
    job.error = 'User cancelled';
    job.completedAt = Date.now();
    updateQueuePositions();
    broadcast(jobId, 'step:error', {
      type: 'step:error',
      step: 'pipeline',
      error: 'User cancelled',
      willRetry: false,
    });
    res.json({ ok: true, jobId });
    return;
  }

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
  if (oldJob.status === 'running' || oldJob.status === 'queued') {
    res.status(400).json({ code: 400, message: 'Only finished jobs can be resumed' });
    return;
  }

  const parsed = ResumeRequestSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ code: 400, message: 'Invalid request', errors: parsed.error.issues });
    return;
  }

  const failedStep = oldJob.steps.find(step => step.status === 'error');
  const resumeFromStage = parsed.data.fromStage || failedStep?.step || 'searching';
  const resumeState = buildResumeState(oldJob, resumeFromStage);

  oldJob.status = 'running';
  oldJob.error = undefined;
  oldJob.completedAt = undefined;
  oldJob.currentStep = resumeFromStage;

  const newSteps = resumeState.previousSteps.map(s => ({
    step: s.step,
    status: 'complete' as const,
    startTime: Date.now(),
    endTime: Date.now(),
    durationMs: s.duration,
    summary: s.summary,
    result: s.result,
  }));
  oldJob.steps = newSteps;

  startPipelineJob(jobId, resumeFromStage, oldJob);
  const runLogger = loggers.ai.child({ jobId, word: oldJob.word, language: oldJob.language });
  runLogger.info({ event: 'job:resumed', fromStage: resumeFromStage }, 'AI generation job resumed');
  res.status(202).json({ jobId });
}

module.exports = {
  handleGenerateSingle,
  handleStream,
  handleCancelJob,
  handleResumeJob,
  _internal: { selectPipeline, buildResumeState, updateJobFromEvent },
};
