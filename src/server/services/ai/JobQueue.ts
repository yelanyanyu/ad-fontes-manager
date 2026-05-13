import type { PipelineRunner, PipelineProgressEvent, PipelineDefinition } from './types';
import { fixPipeline } from './definitions/fix';
import { auditFixPipeline } from './definitions/audit-fix';
import { englishPipeline } from './definitions/english';
import { germanPipeline } from './definitions/german';
import { QueueStore, type SqliteLike, type BatchStatus, type JobState } from './QueueStore';
import { JobLifecycle } from './JobLifecycle';
import { QueueGate } from './QueueGate';

const { loadYamlObjectWithRepairs, mergeYamlTexts } =
  require('./utils') as typeof import('./utils');

interface QueueConfig {
  getDb: () => SqliteLike;
  maxConcurrency: number;
  runner: PipelineRunner;
}

interface EnqueueParams {
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
    rawText?: string;
    reasoningText?: string;
  }>;
}

export class JobQueue {
  private store: QueueStore;
  private lifecycle: JobLifecycle;
  private gate: QueueGate;
  private runner: PipelineRunner;
  private resumeState = new Map<
    string,
    {
      resumeFromStage?: string;
      previousContext?: Record<string, unknown>;
      previousSteps?: Array<{
        step: string;
        summary?: string;
        duration?: number;
        result?: unknown;
        rawText?: string;
        reasoningText?: string;
      }>;
    }
  >();

  private readonly defaultStageOrder = ['searching', 'pondering', 'auditing', 'fixing'];

  constructor(config: QueueConfig) {
    this.store = new QueueStore(config.getDb);
    this.lifecycle = new JobLifecycle(this.store);
    this.gate = new QueueGate(config.maxConcurrency);
    this.runner = config.runner;

    // Clean up stale state from previous sessions.
    // 1. Cancel queued Jobs — they have no in-memory state and would inflate
    //    queue-position counts.
    // 2. Reset running Jobs to queued so they can be retried.
    // Paused Jobs stay paused (user intent preserved).
    this.store.recoverStaleJobs();

    // Kick off any recovered Jobs.
    this.tryDequeue();
  }

  enqueue(params: EnqueueParams): string {
    const jobId = this.store.insert(params);

    if (params.resumeFromStage || params.previousContext || params.previousSteps) {
      this.resumeState.set(jobId, {
        resumeFromStage: params.resumeFromStage,
        previousContext: params.previousContext,
        previousSteps: params.previousSteps,
      });
    }

    this.tryDequeue();

    // If job was not immediately dequeued, create an emitter so SSE subscribers
    // can attach and receive job:queued. startJob will reuse it when the job starts.
    if (this.store.getStatus(jobId) === 'queued') {
      this.lifecycle.ensureQueuedEmitter(jobId);
    }

    return jobId;
  }

  cancel(jobId: string): boolean {
    const status = this.store.getStatus(jobId);
    if (!status) return false;

    if (status === 'queued' || status === 'paused') {
      const result = this.store.cancelByStatus(jobId, status);
      if (result.changes > 0) {
        this.lifecycle.finishEmitter(jobId);
        this.lifecycle.cleanup(jobId);
        this.gate.deleteAbortController(jobId);
        this.resumeState.delete(jobId);
        return true;
      }
      return false;
    }

    if (status === 'running') {
      const controller = this.gate.getAbortController(jobId);
      if (controller && !controller.signal.aborted) {
        controller.abort();
        return true;
      }
      // Race: tryDequeue set status='running' but startJob hasn't set the controller.
      if (!controller) {
        const result = this.store.cancelRunning(jobId);
        if (result.changes > 0) {
          this.lifecycle.finishEmitter(jobId);
          this.lifecycle.cleanup(jobId);
          this.resumeState.delete(jobId);
          return true;
        }
      }
    }

    return false;
  }

  pauseJob(jobId: string): boolean {
    const status = this.store.getStatus(jobId);
    if (!status) return false;

    if (status === 'queued') {
      const result = this.store.pauseQueuedJob(jobId);
      if (result.changes > 0) {
        this.lifecycle.finishEmitter(jobId);
        this.lifecycle.cleanup(jobId);
        return true;
      }
      return false;
    }

    if (status === 'running') {
      const controller = this.gate.getAbortController(jobId);
      const snapshot = this.buildResumeSnapshot(jobId);
      this.gate.markPaused(jobId);
      this.resumeState.set(jobId, snapshot);
      this.store.pauseRunningJob(jobId);
      this.emitProgress(jobId, { type: 'job:paused', step: snapshot.resumeFromStage });
      if (controller && !controller.signal.aborted) {
        controller.abort();
      }
      return true;
    }

    return false;
  }

  resumeJob(jobId: string): boolean {
    const status = this.store.getStatus(jobId);
    if (status !== 'paused') return false;

    this.resumeState.set(jobId, this.buildResumeSnapshot(jobId));
    const result = this.store.resumePausedJob(jobId);
    if (result.changes <= 0) return false;
    this.tryDequeue();
    return true;
  }

  subscribe(jobId: string, res: { write: (chunk: string) => void }): void {
    // Emit initial lifecycle event based on DB status.
    const status = this.store.getStatus(jobId);
    if (status === 'queued') {
      const position = this.store.getQueuePosition(jobId);
      this.lifecycle.subscribe(jobId, res, { type: 'job:queued', position });
      return;
    } else if (status === 'paused') {
      const snapshot = this.resumeState.get(jobId) || this.buildResumeSnapshot(jobId);
      this.lifecycle.subscribe(jobId, res, {
        type: 'job:paused',
        step: snapshot.resumeFromStage,
      });
      return;
    }
    this.lifecycle.subscribe(jobId, res);
  }

  resetCircuitBreaker(providerId: string): void {
    this.gate.resetCircuitBreaker(providerId);
    // Try to dequeue any Jobs that were blocked by this provider's breaker.
    this.tryDequeue();
  }

  setMaxConcurrency(maxConcurrency: number): void {
    this.gate.setMaxConcurrency(maxConcurrency);
    this.tryDequeue();
  }

  getBatchStatus(batchId: string): BatchStatus {
    return this.store.getBatchStatus(batchId);
  }

  pauseBatch(batchId: string): void {
    const jobIds = this.store.pauseQueuedBatch(batchId);
    // Notify SSE subscribers that these jobs are now paused.
    for (const jobId of jobIds) {
      this.lifecycle.finishEmitter(jobId);
      this.lifecycle.cleanup(jobId);
    }
  }

  resumeBatch(batchId: string): void {
    this.store.resumePausedBatch(batchId);
    // Try to dequeue any newly queued Jobs.
    this.tryDequeue();
  }

  cancelBatch(batchId: string): void {
    const jobIds = this.store.cancelQueuedOrPausedBatch(batchId);
    for (const jobId of jobIds) {
      this.lifecycle.finishEmitter(jobId);
      this.lifecycle.cleanup(jobId);
      this.gate.deleteAbortController(jobId);
    }
  }

  retryBatch(batchId: string): void {
    this.store.retryErroredBatch(batchId);
    this.tryDequeue();
  }

  // ---- Queue-wide overview & batch operations ----

  /** Returns a snapshot of every job in the queue for UI display. */
  getQueueOverview(): Array<{
    jobId: string;
    jobType: string;
    status: string;
    word: string;
    language: string;
    priority: string;
    createdAt: string;
    error?: string;
  }> {
    return this.store.getQueueOverview();
  }

  /** Returns a paginated snapshot of persisted finished/failed jobs for review. */
  getQueueHistory(params: {
    page: number;
    pageSize: number;
    status?: 'complete' | 'partial' | 'error';
    query?: string;
  }): {
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
  } {
    return this.store.getQueueHistory(params);
  }

  getTodayWorkset(): {
    jobs: Array<{
      jobId: string;
      jobType: string;
      status: string;
      word: string;
      language: string;
      priority: string;
      batchId?: string;
      createdAt: string;
      completedAt?: string;
      hasResult: boolean;
    }>;
    total: number;
  } {
    return this.store.getTodayWorkset();
  }

  getWorksetYaml(jobIds: string[]): Array<{ jobId: string; yaml: string }> {
    return this.store.getWorksetYaml(jobIds);
  }

  deleteHistoryJob(jobId: string): 'deleted' | 'not-found' | 'active' {
    const result = this.store.deleteHistoryJob(jobId);
    if (result === 'deleted') {
      this.cleanupJobMemory(jobId);
    }
    return result;
  }

  clearHistory(params: { status?: 'complete' | 'partial' | 'error'; query?: string }): number {
    const result = this.store.clearHistory(params);
    for (const jobId of result.jobIds) {
      this.cleanupJobMemory(jobId);
    }
    return result.deleted;
  }

  /** Cancel every queued, paused, and running job.  Requires confirmation from caller. */
  cancelAll(): void {
    const rows = this.store.getCancelableRows();

    // Abort running jobs first.
    this.gate.abortAll();

    // Cancel all non-terminal jobs.
    this.store.cancelAllActiveRows();

    // Queued/paused/error jobs have no running promise that will emit done later.
    // Running jobs keep their in-memory state until their runner promise settles,
    // so activeCount cannot be released early.
    for (const row of rows) {
      if (row.status === 'running') continue;
      const jobId = row.id;
      this.lifecycle.finishEmitter(jobId);
      this.lifecycle.cleanup(jobId);
      this.gate.deleteAbortController(jobId);
      this.resumeState.delete(jobId);
    }
  }

  /** Pause all queued jobs and safely abort running jobs (they re-queue at tail on resume). */
  pauseAll(): void {
    // Set running jobs to 'paused' in DB BEFORE aborting.
    // This prevents a race where the runner completes (complete/partial/error)
    // before the abort signal propagates, which would make them disappear from
    // the overview.  The .then()/.catch() use WHERE status = 'running' guards
    // so they won't overwrite a paused status.
    for (const [jobId, ctrl] of this.gate.abortControllerEntries()) {
      if (!ctrl.signal.aborted) {
        this.gate.markPaused(jobId);
        const snapshot = this.buildResumeSnapshot(jobId);
        this.resumeState.set(jobId, snapshot);
        this.store.pauseRunningJob(jobId);
        this.emitProgress(jobId, { type: 'job:paused', step: snapshot.resumeFromStage });
        ctrl.abort();
      }
    }
    // Pause queued jobs.
    this.store.pauseQueuedJobs();
  }

  /** Resume all paused jobs. */
  resumeAll(): void {
    for (const jobId of this.store.getPausedJobIds()) {
      this.resumeState.set(jobId, this.buildResumeSnapshot(jobId));
    }
    this.store.resumePausedJobs();
    this.tryDequeue();
  }

  unsubscribe(jobId: string, res: unknown): void {
    this.lifecycle.unsubscribe(jobId, res);
  }

  private cleanupJobMemory(jobId: string): void {
    this.lifecycle.cleanup(jobId);
    this.gate.deleteAbortController(jobId);
    this.resumeState.delete(jobId);
  }

  getJob(jobId: string): JobState | undefined {
    const row = this.store.getRow(jobId);
    if (!row) return undefined;
    const events = this.store.getPersistedEvents(row);
    const steps = this.lifecycle.buildStepResults(events);
    const resultYaml =
      typeof row.result_yaml === 'string'
        ? this.reconstructMergedYamlIfNeeded(row.result_yaml, events)
        : undefined;

    return {
      jobId: row.id as string,
      jobType: row.job_type as string | undefined,
      status: row.status as string,
      word: row.word as string,
      language: row.language as string,
      context: row.context as string | undefined,
      notes: row.notes as string | undefined,
      error: row.error as string | undefined,
      steps,
      result: resultYaml
        ? {
            yaml: resultYaml,
            scores: (() => {
              try {
                return JSON.parse(row.result_scores as string);
              } catch {
                return {};
              }
            })(),
          }
        : undefined,
    };
  }

  private reconstructMergedYamlIfNeeded(
    storedYaml: string,
    events: PipelineProgressEvent[]
  ): string {
    const fixYaml = this.getLatestFixYaml(events);
    if (fixYaml) return fixYaml;

    if (!this.isMissingCreativeYaml(storedYaml)) return storedYaml;

    const completed = events.filter(
      (event): event is Extract<PipelineProgressEvent, { type: 'step:complete' }> =>
        event.type === 'step:complete'
    );
    const previousContext: Record<string, unknown> = {};
    for (const step of completed) {
      if (step.result && typeof step.result === 'object' && !Array.isArray(step.result)) {
        Object.assign(previousContext, step.result as Record<string, unknown>);
      }
    }

    const researchYaml =
      typeof previousContext.researchYaml === 'string' ? previousContext.researchYaml : storedYaml;
    const creativeYaml =
      typeof previousContext.creativeYaml === 'string' ? previousContext.creativeYaml : '';
    if (!researchYaml || !creativeYaml) return storedYaml;

    try {
      return mergeYamlTexts(researchYaml, creativeYaml);
    } catch {
      return storedYaml;
    }
  }

  private getLatestFixYaml(events: PipelineProgressEvent[]): string | undefined {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event.type !== 'step:complete' || event.step !== 'fixing') continue;
      const result = event.result;
      if (!result || typeof result !== 'object' || Array.isArray(result)) continue;
      const fullYaml = (result as Record<string, unknown>).fullYaml;
      if (typeof fullYaml === 'string' && fullYaml.trim()) return fullYaml;
    }
    return undefined;
  }

  private isMissingCreativeYaml(yamlText: string): boolean {
    try {
      const parsed = loadYamlObjectWithRepairs(yamlText);
      const etymology =
        parsed.etymology && typeof parsed.etymology === 'object'
          ? (parsed.etymology as Record<string, unknown>)
          : {};
      const nuance =
        parsed.nuance && typeof parsed.nuance === 'object'
          ? (parsed.nuance as Record<string, unknown>)
          : {};
      return (
        !etymology.visual_imagery_zh ||
        !etymology.meaning_evolution_zh ||
        !nuance.image_differentiation_zh
      );
    } catch {
      return true;
    }
  }

  getCompletedSteps(jobId: string): PipelineProgressEvent[] {
    return this.lifecycle.getCompletedSteps(jobId);
  }

  /** Returns true if a queued or running job with this word+language already exists. */
  isDuplicate(word: string, language: string): boolean {
    return this.store.isDuplicate(word, language);
  }

  getQueuePosition(jobId: string): number {
    return this.store.getQueuePosition(jobId);
  }

  /** Emit a progress event to all SSE subscribers of this job. */
  emitProgress(jobId: string, event: PipelineProgressEvent): void {
    this.lifecycle.emitProgress(jobId, event);
  }

  buildResumeSnapshot(
    jobId: string,
    resumeFromStageOverride?: string
  ): {
    resumeFromStage?: string;
    previousContext?: Record<string, unknown>;
    previousSteps?: Array<{
      step: string;
      summary?: string;
      duration?: number;
      result?: unknown;
      rawText?: string;
      reasoningText?: string;
    }>;
  } {
    const steps = this.getCompletedSteps(jobId);
    const completedStepResults = steps
      .filter(event => event.type === 'step:complete')
      .map(event => ({
        step: event.step,
        summary: event.summary,
        duration: event.duration,
        result: event.result,
        rawText: event.rawText,
        reasoningText: event.reasoningText,
      }));

    const previousContext: Record<string, unknown> = {};
    for (const step of completedStepResults) {
      if (step.result && typeof step.result === 'object' && !Array.isArray(step.result)) {
        Object.assign(previousContext, step.result as Record<string, unknown>);
      }
    }

    const lastStarted = [...steps].reverse().find(event => event.type === 'step:start');
    const currentStage = lastStarted?.type === 'step:start' ? lastStarted.step : undefined;
    const completedStages = new Set(completedStepResults.map(step => step.step));
    const resumeFromStage =
      currentStage && !completedStages.has(currentStage)
        ? currentStage
        : this.defaultStageOrder.find(stage => !completedStages.has(stage));
    const effectiveResumeFromStage = resumeFromStageOverride || resumeFromStage;
    const resumeIndex = effectiveResumeFromStage
      ? this.defaultStageOrder.indexOf(effectiveResumeFromStage)
      : -1;
    const previousSteps =
      resumeIndex >= 0
        ? completedStepResults.filter(step => {
            const stepIndex = this.defaultStageOrder.indexOf(step.step);
            return stepIndex >= 0 && stepIndex < resumeIndex;
          })
        : completedStepResults;

    return {
      resumeFromStage: effectiveResumeFromStage,
      previousContext,
      previousSteps,
    };
  }

  private tryDequeue(): void {
    while (this.gate.hasCapacity()) {
      const row = this.store.dequeue(this.gate.getExcludedProviders());

      if (!row) break;

      const jobId = row.id as string;

      this.gate.reserveSlot();
      try {
        if (!this.startJob(jobId)) {
          // Setup failed — release the reserved slot and try the next Job.
          this.gate.releaseSlot();
        }
      } catch {
        // Synchronous exception in startJob — release the reserved slot.
        this.gate.releaseSlot();
      }
    }
  }

  // Returns true if the job was started successfully, false if setup failed.
  private startJob(jobId: string): boolean {
    const row = this.store.getRow(jobId);
    if (!row) return false;

    // Guard against cancel() racing between tryDequeue's status='running' update
    // and the abortController being set. If cancel already updated the DB, abort.
    if (row.status !== 'running') {
      this.lifecycle.finishEmitter(jobId);
      this.lifecycle.cleanup(jobId);
      return false;
    }

    const abortController = new globalThis.AbortController();
    this.gate.setAbortController(jobId, abortController);

    // Reuse emitter if already created in enqueue() for a queued Job.
    // Always start with a fresh steps array — previous run's events must not leak
    // into a retry (retryBatch reuses the same jobId).
    const { steps } = this.lifecycle.prepareStartedJob(jobId);

    const resume = this.resumeState.get(jobId);
    this.resumeState.delete(jobId);

    let definition: PipelineDefinition;
    const language = row.language as string;
    if (row.job_type === 'fix') {
      definition = fixPipeline;
    } else if (row.job_type === 'audit-fix') {
      definition = auditFixPipeline;
    } else {
      definition = language === 'de' ? germanPipeline : englishPipeline;
    }
    const notes = (row.notes as string) || undefined;
    let targetYaml: string | undefined;

    // For Fix Jobs: load the target Job's YAML.
    if (row.job_type === 'fix' && row.target_job_id) {
      targetYaml = this.store.getTargetJobYaml(row.target_job_id);
    }

    // For Audit-Fix Jobs: load the Word's YAML from words_v2.
    if (row.job_type === 'audit-fix' && row.target_word_id) {
      targetYaml = this.store.getWordContent(row.target_word_id);
    }

    // Pass target YAML via previousContext so the runner's buildPrompt
    // maps it to {{yaml}} (via ctx.fullYaml || ctx.researchYaml).
    const effectivePreviousContext = targetYaml
      ? { ...(resume?.previousContext || {}), researchYaml: targetYaml }
      : resume?.previousContext;

    void this.runner
      .run({
        definition,
        input: {
          word: row.word as string,
          context: (row.context as string) || undefined,
          language: row.language as string,
          notes: notes || (row.notes as string) || undefined,
        },
        resumeFromStage: resume?.resumeFromStage,
        previousContext: effectivePreviousContext,
        previousSteps: resume?.previousSteps,
        onProgress: event => {
          if (this.gate.isPaused(jobId) && event.type !== 'job:paused') {
            return;
          }
          this.lifecycle.recordProgress(jobId, event, steps);
        },
        abortSignal: abortController.signal,
      })
      .then(result => {
        const isPaused = this.gate.isPaused(jobId);
        if (isPaused) {
          return;
        }
        const yamlText = result.yaml || '';
        const scores = result.scores || {};
        // If the pipeline stopped early (stop-loss), mark as partial.
        const stoppedEvent = steps.find(e => e.type === 'pipeline:stopped');
        const status = stoppedEvent ? 'partial' : 'complete';
        this.store.completeRunningJob({
          jobId,
          status,
          yamlText,
          scores,
        });

        // Reset failure count on success.
        const providerId = row.provider_id as string | undefined;
        this.gate.recordProviderSuccess(providerId);
      })
      .catch((err: unknown) => {
        const isPaused = this.gate.isPaused(jobId);
        this.gate.clearPause(jobId);
        const wasAborted = abortController.signal.aborted;
        if (isPaused) {
          // Pause-all: keep completed steps so resume can continue from breakpoint.
          this.store.markRunningJobPaused(jobId);
        } else {
          const message = err instanceof Error ? err.message : String(err);
          this.store.errorRunningJob(jobId, wasAborted ? 'User cancelled' : message);

          // Circuit breaker: track consecutive failures per provider.
          const providerId = row.provider_id as string | undefined;
          this.gate.recordProviderFailure(providerId, { wasAborted });
        }
      })
      .finally(() => {
        this.lifecycle.finishEmitter(jobId);
        this.gate.clearPause(jobId);
        this.gate.deleteAbortController(jobId);
        this.gate.releaseSlot();
        this.tryDequeue();

        // Keep emitter + completedSteps alive for 30 min so fix progress can be
        // broadcast to still-connected SSE subscribers.
        setTimeout(
          () => {
            this.lifecycle.cleanup(jobId);
          },
          30 * 60 * 1000
        ).unref();
      });

    return true;
  }
}
