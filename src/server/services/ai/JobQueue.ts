import { EventEmitter } from 'node:events';
import type { PipelineRunner, PipelineProgressEvent, PipelineDefinition } from './types';
import { fixPipeline } from './definitions/fix';
import { auditFixPipeline } from './definitions/audit-fix';
import { englishPipeline } from './definitions/english';
import { germanPipeline } from './definitions/german';

interface SqliteLike {
  get: (sql: string, ...params: unknown[]) => Record<string, unknown> | undefined;
  run: (sql: string, ...params: unknown[]) => { changes: number };
  all: (sql: string, ...params: unknown[]) => Record<string, unknown>[];
}

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
  }>;
}

interface JobState {
  jobId: string;
  status: string;
  word: string;
  language: string;
  context?: string;
  notes?: string;
  error?: string;
  result?: { yaml: string; scores: Record<string, unknown> };
}

interface BatchStatus {
  total: number;
  queued: number;
  running: number;
  complete: number;
  error: number;
  partial: number;
  cancelled: number;
  paused: number;
  done: number;
  failed: number;
}

export class JobQueue {
  private getDb: () => SqliteLike;
  private maxConcurrency: number;
  private runner: PipelineRunner;
  private activeCount = 0;
  private abortControllers = new Map<string, AbortController>();
  private emitters = new Map<string, EventEmitter>();
  private completedSteps = new Map<string, PipelineProgressEvent[]>();
  private subscribers = new Map<
    string,
    Array<{ res: unknown; listener: (event: PipelineProgressEvent) => void }>
  >();
  private brokenProviders = new Set<string>();
  private providerFailures = new Map<string, number>();
  private pauseFlags = new Set<string>();
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
      }>;
    }
  >();

  private readonly defaultStageOrder = ['searching', 'pondering', 'auditing', 'fixing'];

  constructor(config: QueueConfig) {
    if (config.maxConcurrency < 1) {
      throw new Error(`maxConcurrency must be >= 1, got ${config.maxConcurrency}`);
    }
    this.getDb = config.getDb;
    this.maxConcurrency = config.maxConcurrency;
    this.runner = config.runner;

    // Clean up stale state from previous sessions.
    // 1. Cancel queued Jobs — they have no in-memory state and would inflate
    //    queue-position counts.
    // 2. Reset running Jobs to queued so they can be retried.
    // Paused Jobs stay paused (user intent preserved).
    const db = this.getDb();
    db.run(
      `UPDATE job_queue SET status = 'cancelled', completed_at = datetime('now')
       WHERE status = 'queued'`
    );
    db.run(
      `UPDATE job_queue SET status = 'queued', started_at = NULL
       WHERE status = 'running'`
    );

    // Kick off any recovered Jobs.
    this.tryDequeue();
  }

  enqueue(params: EnqueueParams): string {
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const db = this.getDb();

    db.run(
      `INSERT INTO job_queue (id, job_type, priority, status, word, language, context, notes, batch_id, target_job_id, target_word_id, provider_id)
       VALUES (?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?)`,
      jobId,
      params.type,
      params.priority,
      params.word,
      params.language,
      params.context || null,
      params.notes || null,
      params.batchId || null,
      params.targetJobId || null,
      params.targetWordId || null,
      params.providerId || null
    );

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
    const row = db.get('SELECT status FROM job_queue WHERE id = ?', jobId);
    if (row && row.status === 'queued') {
      if (!this.emitters.has(jobId)) {
        this.emitters.set(jobId, new EventEmitter());
        this.completedSteps.set(jobId, []);
      }
    }

    return jobId;
  }

  cancel(jobId: string): boolean {
    const db = this.getDb();
    const row = db.get('SELECT status FROM job_queue WHERE id = ?', jobId);
    if (!row) return false;

    if (row.status === 'queued' || row.status === 'paused') {
      const result = db.run(
        `UPDATE job_queue SET status = 'cancelled', completed_at = datetime('now')
         WHERE id = ? AND status = ?`,
        jobId,
        row.status
      );
      if (result.changes > 0) {
        // Clean up emitter so SSE subscribers don't hang.
        const emitter = this.emitters.get(jobId);
        if (emitter) {
          emitter.emit('done');
          this.emitters.delete(jobId);
        }
        this.completedSteps.delete(jobId);
        this.abortControllers.delete(jobId);
        this.resumeState.delete(jobId);
        return true;
      }
      return false;
    }

    if (row.status === 'running') {
      const controller = this.abortControllers.get(jobId);
      if (controller && !controller.signal.aborted) {
        controller.abort();
        return true;
      }
      // Race: tryDequeue set status='running' but startJob hasn't set the controller.
      if (!controller) {
        const result = db.run(
          `UPDATE job_queue SET status = 'cancelled', completed_at = datetime('now')
           WHERE id = ? AND status = 'running'`,
          jobId
        );
        if (result.changes > 0) {
          const emitter = this.emitters.get(jobId);
          if (emitter) {
            emitter.emit('done');
            this.emitters.delete(jobId);
          }
          this.completedSteps.delete(jobId);
          this.resumeState.delete(jobId);
          return true;
        }
      }
    }

    return false;
  }

  subscribe(jobId: string, res: { write: (chunk: string) => void }): void {
    // Emit initial lifecycle event based on DB status.
    const db = this.getDb();
    const statusRow = db.get('SELECT status FROM job_queue WHERE id = ?', jobId);
    if (statusRow && statusRow.status === 'queued') {
      const position = this.computeQueuePosition(db, jobId);
      res.write(`event: job:queued\ndata: ${JSON.stringify({ type: 'job:queued', position })}\n\n`);
    } else if (statusRow && statusRow.status === 'paused') {
      const snapshot = this.resumeState.get(jobId) || this.buildResumeSnapshot(jobId);
      res.write(
        `event: job:paused\ndata: ${JSON.stringify({
          type: 'job:paused',
          step: snapshot.resumeFromStage,
        })}\n\n`
      );
    }

    // Replay already-completed steps from memory.
    const steps = this.completedSteps.get(jobId) || [];
    for (const event of steps) {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    }

    // Attach to live emitter for future events.
    // Create on demand if this is a completed job being re-subscribed
    // (e.g. after an app restart, or reconnecting for fix progress).
    let emitter = this.emitters.get(jobId);
    if (!emitter) {
      emitter = new EventEmitter();
      this.emitters.set(jobId, emitter);
      if (!this.completedSteps.has(jobId)) {
        this.completedSteps.set(jobId, []);
      }
    }

    const onProgress = (event: PipelineProgressEvent): void => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    emitter.on('progress', onProgress);
    this.trackSubscriber(jobId, res, onProgress);

    // Don't detach on 'done' — the emitter stays alive for 30 min
    // so that fix progress events can reach the same SSE connection.
    // Cleanup happens when the client disconnects (unsubscribe) or the
    // emitter is deleted by the 30-min timer.
  }

  resetCircuitBreaker(providerId: string): void {
    this.brokenProviders.delete(providerId);
    this.providerFailures.delete(providerId);
    // Try to dequeue any Jobs that were blocked by this provider's breaker.
    this.tryDequeue();
  }

  getBatchStatus(batchId: string): BatchStatus {
    const db = this.getDb();
    const rows = db.all(
      'SELECT status, COUNT(*) as cnt FROM job_queue WHERE batch_id = ? GROUP BY status',
      batchId
    );
    const counts: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      counts[row.status as string] = row.cnt as number;
      total += row.cnt as number;
    }
    return {
      total,
      queued: counts.queued || 0,
      running: counts.running || 0,
      complete: counts.complete || 0,
      error: counts.error || 0,
      partial: counts.partial || 0,
      cancelled: counts.cancelled || 0,
      paused: counts.paused || 0,
      done: (counts.complete || 0) + (counts.partial || 0),
      failed: counts.error || 0,
    };
  }

  pauseBatch(batchId: string): void {
    const db = this.getDb();
    // Collect jobIds before updating so we can clean up emitters.
    const rows = db.all(
      `SELECT id FROM job_queue WHERE batch_id = ? AND status = 'queued'`,
      batchId
    );
    db.run(
      `UPDATE job_queue SET status = 'paused' WHERE batch_id = ? AND status = 'queued'`,
      batchId
    );
    // Notify SSE subscribers that these jobs are now paused.
    for (const row of rows) {
      const jobId = row.id as string;
      const emitter = this.emitters.get(jobId);
      if (emitter) {
        emitter.emit('done');
        this.emitters.delete(jobId);
      }
      this.completedSteps.delete(jobId);
    }
  }

  resumeBatch(batchId: string): void {
    const db = this.getDb();
    db.run(
      `UPDATE job_queue SET status = 'queued' WHERE batch_id = ? AND status = 'paused'`,
      batchId
    );
    // Try to dequeue any newly queued Jobs.
    this.tryDequeue();
  }

  cancelBatch(batchId: string): void {
    const db = this.getDb();
    // Collect jobIds before updating so we can clean up emitters.
    const rows = db.all(
      `SELECT id FROM job_queue WHERE batch_id = ? AND status IN ('queued', 'paused')`,
      batchId
    );
    db.run(
      `UPDATE job_queue SET status = 'cancelled', completed_at = datetime('now')
       WHERE batch_id = ? AND status IN ('queued', 'paused')`,
      batchId
    );
    for (const row of rows) {
      const jobId = row.id as string;
      const emitter = this.emitters.get(jobId);
      if (emitter) {
        emitter.emit('done');
        this.emitters.delete(jobId);
      }
      this.completedSteps.delete(jobId);
      this.abortControllers.delete(jobId);
    }
  }

  retryBatch(batchId: string): void {
    const db = this.getDb();
    db.run(
      `UPDATE job_queue SET status = 'queued', error = NULL WHERE batch_id = ? AND status = 'error'`,
      batchId
    );
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
    const db = this.getDb();
    const rows = db.all(
      `SELECT id, job_type, status, word, language, priority, created_at, error
       FROM job_queue
       WHERE status IN ('queued', 'running', 'paused', 'error')
       ORDER BY CASE priority WHEN 'high' THEN 1 ELSE 0 END DESC, created_at ASC, rowid ASC`
    );
    return rows.map(row => ({
      jobId: row.id as string,
      jobType: row.job_type as string,
      status: row.status as string,
      word: row.word as string,
      language: row.language as string,
      priority: row.priority as string,
      createdAt: row.created_at as string,
      error: row.error as string | undefined,
    }));
  }

  /** Cancel every queued, paused, and running job.  Requires confirmation from caller. */
  cancelAll(): void {
    const db = this.getDb();
    const rows = db.all(
      `SELECT id, status FROM job_queue
       WHERE status IN ('queued', 'paused', 'running', 'error')`
    );

    // Abort running jobs first.
    for (const ctrl of this.abortControllers.values()) {
      if (!ctrl.signal.aborted) ctrl.abort();
    }

    // Cancel all non-terminal jobs.
    db.run(
      `UPDATE job_queue SET status = 'cancelled', completed_at = datetime('now')
       WHERE status IN ('queued', 'paused', 'running', 'error')`
    );

    // Queued/paused/error jobs have no running promise that will emit done later.
    // Running jobs keep their in-memory state until their runner promise settles,
    // so activeCount cannot be released early.
    for (const row of rows) {
      if (row.status === 'running') continue;
      const jobId = row.id as string;
      const emitter = this.emitters.get(jobId);
      if (emitter) {
        emitter.emit('done');
        this.emitters.delete(jobId);
      }
      this.completedSteps.delete(jobId);
      this.abortControllers.delete(jobId);
      this.resumeState.delete(jobId);
      this.subscribers.delete(jobId);
    }
  }

  /** Pause all queued jobs and safely abort running jobs (they re-queue at tail on resume). */
  pauseAll(): void {
    const db = this.getDb();
    // Set running jobs to 'paused' in DB BEFORE aborting.
    // This prevents a race where the runner completes (complete/partial/error)
    // before the abort signal propagates, which would make them disappear from
    // the overview.  The .then()/.catch() use WHERE status = 'running' guards
    // so they won't overwrite a paused status.
    for (const [jobId, ctrl] of this.abortControllers) {
      if (!ctrl.signal.aborted) {
        this.pauseFlags.add(jobId);
        const snapshot = this.buildResumeSnapshot(jobId);
        this.resumeState.set(jobId, snapshot);
        db.run(`UPDATE job_queue SET status = 'paused' WHERE id = ?`, jobId);
        this.emitProgress(jobId, { type: 'job:paused', step: snapshot.resumeFromStage });
        ctrl.abort();
      }
    }
    // Pause queued jobs.
    db.run(`UPDATE job_queue SET status = 'paused' WHERE status = 'queued'`);
  }

  /** Resume all paused jobs. */
  resumeAll(): void {
    const db = this.getDb();
    db.run(
      `UPDATE job_queue SET status = 'queued', created_at = datetime('now')
       WHERE status = 'paused'`
    );
    this.tryDequeue();
  }

  unsubscribe(jobId: string, res: unknown): void {
    const emitter = this.emitters.get(jobId);
    if (!emitter) return;
    // Find and remove the specific listener for this response object.
    const listeners = this.subscribers.get(jobId);
    if (!listeners) return;
    const idx = listeners.findIndex(l => l.res === res);
    if (idx >= 0) {
      emitter.off('progress', listeners[idx].listener);
      listeners.splice(idx, 1);
    }
    if (listeners.length === 0) {
      this.subscribers.delete(jobId);
    }
  }

  private trackSubscriber(
    jobId: string,
    res: unknown,
    listener: (event: PipelineProgressEvent) => void
  ): void {
    if (!this.subscribers.has(jobId)) {
      this.subscribers.set(jobId, []);
    }
    this.subscribers.get(jobId)!.push({ res, listener });
  }

  private untrackSubscriber(jobId: string, res: unknown): void {
    const listeners = this.subscribers.get(jobId);
    if (!listeners) return;
    const idx = listeners.findIndex(l => l.res === res);
    if (idx >= 0) {
      listeners.splice(idx, 1);
    }
    if (listeners.length === 0) {
      this.subscribers.delete(jobId);
    }
  }

  getJob(jobId: string): JobState | undefined {
    const db = this.getDb();
    const row = db.get('SELECT * FROM job_queue WHERE id = ?', jobId);
    if (!row) return undefined;

    return {
      jobId: row.id as string,
      status: row.status as string,
      word: row.word as string,
      language: row.language as string,
      context: row.context as string | undefined,
      notes: row.notes as string | undefined,
      error: row.error as string | undefined,
      result: row.result_yaml
        ? {
            yaml: row.result_yaml as string,
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

  getCompletedSteps(jobId: string): PipelineProgressEvent[] {
    return this.completedSteps.get(jobId) || [];
  }

  /** Returns true if a queued or running job with this word+language already exists. */
  isDuplicate(word: string, language: string): boolean {
    const db = this.getDb();
    const row = db.get(
      `SELECT 1 FROM job_queue
       WHERE word = ? AND language = ? AND status IN ('queued', 'running')
       LIMIT 1`,
      word,
      language
    );
    return !!row;
  }

  getQueuePosition(jobId: string): number {
    const db = this.getDb();
    return this.computeQueuePosition(db, jobId);
  }

  /** Emit a progress event to all SSE subscribers of this job. */
  emitProgress(jobId: string, event: PipelineProgressEvent): void {
    // Create emitter + steps on demand if they don't exist yet
    // (e.g. after an app restart for a previously-completed job).
    let emitter = this.emitters.get(jobId);
    if (!emitter) {
      emitter = new EventEmitter();
      this.emitters.set(jobId, emitter);
      this.completedSteps.set(jobId, []);
    }
    emitter.emit('progress', event);
    if (event.type !== 'step:tokens' && event.type !== 'step:reasoning') {
      const steps = this.completedSteps.get(jobId);
      if (steps) {
        steps.push(event);
      }
    }
  }

  private computeQueuePosition(db: SqliteLike, jobId: string): number {
    const posRow = db.get(
      `SELECT COUNT(*) as cnt FROM job_queue
       WHERE status = 'queued'
         AND (
           CASE priority WHEN 'high' THEN 1 ELSE 0 END >
             (SELECT CASE priority WHEN 'high' THEN 1 ELSE 0 END FROM job_queue WHERE id = ?)
           OR (
             CASE priority WHEN 'high' THEN 1 ELSE 0 END =
               (SELECT CASE priority WHEN 'high' THEN 1 ELSE 0 END FROM job_queue WHERE id = ?)
             AND (
               created_at < (SELECT created_at FROM job_queue WHERE id = ?)
               OR (
                 created_at = (SELECT created_at FROM job_queue WHERE id = ?)
                 AND rowid <= (SELECT rowid FROM job_queue WHERE id = ?)
               )
             )
           )
         )`,
      jobId,
      jobId,
      jobId,
      jobId,
      jobId
    );
    return (posRow?.cnt as number) || 1;
  }

  private buildResumeSnapshot(jobId: string): {
    resumeFromStage?: string;
    previousContext?: Record<string, unknown>;
    previousSteps?: Array<{
      step: string;
      summary?: string;
      duration?: number;
      result?: unknown;
    }>;
  } {
    const steps = this.completedSteps.get(jobId) || [];
    const completedStepResults = steps
      .filter(event => event.type === 'step:complete')
      .map(event => ({
        step: event.step,
        summary: event.summary,
        duration: event.duration,
        result: event.result,
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
    const resumeIndex = resumeFromStage ? this.defaultStageOrder.indexOf(resumeFromStage) : -1;
    const previousSteps =
      resumeIndex >= 0
        ? completedStepResults.filter(step => {
            const stepIndex = this.defaultStageOrder.indexOf(step.step);
            return stepIndex >= 0 && stepIndex < resumeIndex;
          })
        : completedStepResults;

    return {
      resumeFromStage,
      previousContext,
      previousSteps,
    };
  }

  private tryDequeue(): void {
    while (this.activeCount < this.maxConcurrency) {
      const db = this.getDb();

      // Skip Jobs whose provider is circuit-broken.
      const brokenList = [...this.brokenProviders].map(() => '?').join(',');
      const row = db.get(
        `SELECT * FROM job_queue
         WHERE status = 'queued'
         ${brokenList.length > 0 ? `AND (provider_id IS NULL OR provider_id NOT IN (${brokenList}))` : ''}
         ORDER BY CASE priority WHEN 'high' THEN 1 ELSE 0 END DESC, created_at ASC, rowid ASC
         LIMIT 1`,
        ...this.brokenProviders
      );

      if (!row) break;

      const jobId = row.id as string;
      db.run(
        `UPDATE job_queue SET status = 'running', started_at = datetime('now')
         WHERE id = ? AND status = 'queued'`,
        jobId
      );

      this.activeCount++;
      try {
        if (!this.startJob(jobId)) {
          // Setup failed — release the reserved slot and try the next Job.
          this.activeCount--;
          continue;
        }
      } catch {
        // Synchronous exception in startJob — release the reserved slot.
        this.activeCount--;
        continue;
      }
    }
  }

  // Returns true if the job was started successfully, false if setup failed.
  private startJob(jobId: string): boolean {
    const db = this.getDb();
    const row = db.get('SELECT * FROM job_queue WHERE id = ?', jobId);
    if (!row) return false;

    // Guard against cancel() racing between tryDequeue's status='running' update
    // and the abortController being set. If cancel already updated the DB, abort.
    if (row.status !== 'running') {
      const emitter = this.emitters.get(jobId);
      if (emitter) {
        emitter.emit('done');
        this.emitters.delete(jobId);
      }
      this.completedSteps.delete(jobId);
      return false;
    }

    const abortController = new globalThis.AbortController();
    this.abortControllers.set(jobId, abortController);

    // Reuse emitter if already created in enqueue() for a queued Job.
    // Always start with a fresh steps array — previous run's events must not leak
    // into a retry (retryBatch reuses the same jobId).
    const emitter = this.emitters.get(jobId) || new EventEmitter();
    this.emitters.set(jobId, emitter);
    const steps: PipelineProgressEvent[] = [];
    this.completedSteps.set(jobId, steps);

    // Emit job:started for both live and late SSE subscribers.
    const jobStartedEvent: PipelineProgressEvent = { type: 'job:started' };
    emitter.emit('progress', jobStartedEvent);
    steps.push(jobStartedEvent);

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
      const targetRow = db.get(
        'SELECT result_yaml FROM job_queue WHERE id = ?',
        row.target_job_id as string
      );
      targetYaml = targetRow?.result_yaml as string | undefined;
    }

    // For Audit-Fix Jobs: load the Word's YAML from words_v2.
    if (row.job_type === 'audit-fix' && row.target_word_id) {
      const wordRow = db.get(
        'SELECT content FROM words_v2 WHERE id = ?',
        row.target_word_id as string
      );
      targetYaml = wordRow?.content as string | undefined;
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
          if (this.pauseFlags.has(jobId) && event.type !== 'job:paused') {
            return;
          }
          emitter.emit('progress', event);
          // Store all non-token events for replay to late subscribers.
          if (event.type !== 'step:tokens' && event.type !== 'step:reasoning') {
            steps.push(event);
          }
        },
        abortSignal: abortController.signal,
      })
      .then(result => {
        const isPaused = this.pauseFlags.has(jobId);
        if (isPaused) {
          return;
        }
        const yamlText = result.yaml || '';
        const scores = result.scores || {};
        // If the pipeline stopped early (stop-loss), mark as partial.
        const stoppedEvent = steps.find(e => e.type === 'pipeline:stopped');
        const status = stoppedEvent ? 'partial' : 'complete';
        db.run(
          `UPDATE job_queue SET status = ?, result_yaml = ?, result_scores = ?, completed_at = datetime('now')
           WHERE id = ? AND status = 'running'`,
          status,
          yamlText,
          JSON.stringify(scores),
          jobId
        );

        // Reset failure count on success.
        const providerId = row.provider_id as string | undefined;
        if (providerId) {
          this.providerFailures.delete(providerId);
        }
      })
      .catch((err: unknown) => {
        const isPaused = this.pauseFlags.has(jobId);
        this.pauseFlags.delete(jobId);
        const wasAborted = abortController.signal.aborted;
        if (isPaused) {
          // Pause-all: keep completed steps so resume can continue from breakpoint.
          db.run(`UPDATE job_queue SET status = 'paused', error = NULL WHERE id = ?`, jobId);
        } else {
          const message = err instanceof Error ? err.message : String(err);
          db.run(
            `UPDATE job_queue SET status = 'error', error = ?, completed_at = datetime('now')
             WHERE id = ? AND status = 'running'`,
            wasAborted ? 'User cancelled' : message,
            jobId
          );

          // Circuit breaker: track consecutive failures per provider.
          const providerId = row.provider_id as string | undefined;
          if (!wasAborted && providerId) {
            const failures = (this.providerFailures.get(providerId) || 0) + 1;
            this.providerFailures.set(providerId, failures);
            if (failures >= 3) {
              this.brokenProviders.add(providerId);
            }
          }
        }
      })
      .finally(() => {
        emitter.emit('done');
        this.pauseFlags.delete(jobId);
        this.abortControllers.delete(jobId);
        this.activeCount--;
        this.tryDequeue();

        // Keep emitter + completedSteps alive for 30 min so fix progress can be
        // broadcast to still-connected SSE subscribers.
        setTimeout(
          () => {
            this.emitters.delete(jobId);
            this.completedSteps.delete(jobId);
          },
          30 * 60 * 1000
        ).unref();
      });

    return true;
  }
}
