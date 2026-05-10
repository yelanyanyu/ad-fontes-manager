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
    getCompletedSteps: (jobId: string) => Array<{
      type: string;
      step?: string;
      summary?: string;
      result?: unknown;
      [key: string]: unknown;
    }>;
    getQueuePosition: (jobId: string) => number;
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

const { loadSystemPrompt } = require('../services/ai/prompts/loader') as {
  loadSystemPrompt: (filename: string, variables: Record<string, string>) => string;
};
const { stripMarkdownFences } = require('../services/ai/utils') as {
  stripMarkdownFences: (text: string) => string;
};
const { resolveModel } = require('../services/ai/modelResolver') as {
  resolveModel: (stageName: string) => {
    provider: string;
    modelId: string;
    apiKey: string;
    baseUrl: string;
    format: 'openai' | 'anthropic';
    isMock: boolean;
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

  const runLogger = loggers.ai.child({
    jobId: newJobId,
    word: oldJob.word,
    language: oldJob.language,
  });
  runLogger.info({ event: 'job:resumed', fromStage: resumeFromStage }, 'AI generation job resumed');
  res.status(202).json({ jobId: newJobId });
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

  res.setTimeout(0);

  const runLogger = loggers.ai.child({ jobId, word: job.word, language: job.language });
  runLogger.info({ event: 'fix:started' }, 'AI fix started');

  const fixController = new globalThis.AbortController();
  const fixTimeoutMs = 180_000;
  const fixTimeoutId = setTimeout(() => fixController.abort(), fixTimeoutMs);
  fixTimeoutId.unref();

  res.on('close', () => fixController.abort());
  req.on('aborted', () => fixController.abort());

  const fixStepStart = Date.now();

  // Emit step:start via JobQueue so SSE subscribers see the fix progress.
  queue.emitProgress(jobId, {
    type: 'step:start',
    step: 'fixing',
    message: 'Applying revision notes',
  });

  try {
    const prompt = loadSystemPrompt('content-fixer.md', {
      word: job.word,
      context: job.context || '',
      language: job.language,
      notes: job.notes || '',
      yaml: yamlText,
      revisionNotes,
    });

    const model = resolveModel('expert');
    const { createOpenAI } = require('@ai-sdk/openai') as typeof import('@ai-sdk/openai');
    const { createAnthropic } = require('@ai-sdk/anthropic') as typeof import('@ai-sdk/anthropic');
    const { streamText } = require('ai') as typeof import('ai');

    const provider =
      model.format === 'openai'
        ? createOpenAI({ apiKey: model.apiKey, baseURL: model.baseUrl })(model.modelId)
        : createAnthropic({ apiKey: model.apiKey, baseURL: model.baseUrl })(model.modelId);

    const result = streamText({
      model: provider,
      messages: [{ role: 'user', content: prompt }],
      abortSignal: fixController.signal,
    } as Parameters<typeof streamText>[0]);

    let fullText = '';
    let reasoningText = '';
    for await (const part of result.fullStream as AsyncIterable<Record<string, unknown>>) {
      if (part.type === 'text-delta') {
        const text =
          typeof part.delta === 'string'
            ? part.delta
            : typeof part.text === 'string'
              ? part.text
              : typeof part.textDelta === 'string'
                ? part.textDelta
                : '';
        fullText += text;
        queue.emitProgress(jobId, { type: 'step:tokens', step: 'fixing', chunk: text });
      } else if (part.type === 'reasoning-delta' || part.type === 'reasoning') {
        const chunk =
          typeof (part as Record<string, unknown>).delta === 'string'
            ? ((part as Record<string, unknown>).delta as string)
            : typeof (part as Record<string, unknown>).textDelta === 'string'
              ? ((part as Record<string, unknown>).textDelta as string)
              : '';
        if (chunk) {
          reasoningText += chunk;
          queue.emitProgress(jobId, { type: 'step:reasoning', step: 'fixing', chunk });
        }
      }
    }

    const fixedYaml = stripMarkdownFences(fullText);
    if (!fixedYaml) {
      const errMsg = 'Fix produced empty output';
      queue.emitProgress(jobId, {
        type: 'step:error',
        step: 'fixing',
        error: errMsg,
        willRetry: false,
      });
      runLogger.error({ error: errMsg, rawText: fullText }, 'AI fix produced empty output');
      res.status(500).json({ code: 500, message: errMsg });
      return;
    }

    const duration = Date.now() - fixStepStart;
    queue.emitProgress(jobId, {
      type: 'step:complete',
      step: 'fixing',
      duration,
      summary: 'Revision notes applied',
      result: { yaml: fixedYaml },
      rawText: fullText,
      reasoningText: reasoningText || undefined,
    });

    runLogger.info({ event: 'fix:complete', durationMs: duration }, 'AI fix complete');
    res.json({ yaml: fixedYaml, scores });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    queue.emitProgress(jobId, {
      type: 'step:error',
      step: 'fixing',
      error: fixController.signal.aborted ? 'User cancelled' : message,
      willRetry: false,
    });
    runLogger.error({ error: message }, 'AI fix failed');
    res.status(500).json({ code: 500, message });
  } finally {
    clearTimeout(fixTimeoutId);
  }
}

module.exports = {
  handleGenerateSingle,
  handleStream,
  handleCancelJob,
  handleResumeJob,
  handleFixJob,
};
