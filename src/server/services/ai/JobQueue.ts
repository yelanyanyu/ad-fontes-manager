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
  private brokenProviders = new Set<string>();
  private providerFailures = new Map<string, number>();
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

  constructor(config: QueueConfig) {
    if (config.maxConcurrency < 1) {
      throw new Error(`maxConcurrency must be >= 1, got ${config.maxConcurrency}`);
    }
    this.getDb = config.getDb;
    this.maxConcurrency = config.maxConcurrency;
    this.runner = config.runner;

    // Restart recovery: reset running Jobs to queued.
    // Paused Jobs stay paused (user intent preserved).
    const db = this.getDb();
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
      return result.changes > 0;
    }

    if (row.status === 'running') {
      const controller = this.abortControllers.get(jobId);
      if (controller && !controller.signal.aborted) {
        controller.abort();
        return true;
      }
    }

    return false;
  }

  subscribe(jobId: string, res: { write: (chunk: string) => void }): void {
    // Replay already-completed steps from memory.
    const steps = this.completedSteps.get(jobId) || [];
    for (const event of steps) {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    }

    // Attach to live emitter for future events.
    const emitter = this.emitters.get(jobId);
    if (!emitter) return;

    const onProgress = (event: PipelineProgressEvent): void => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    emitter.on('progress', onProgress);

    emitter.once('done', () => {
      emitter.off('progress', onProgress);
    });
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
    db.run(
      `UPDATE job_queue SET status = 'paused' WHERE batch_id = ? AND status = 'queued'`,
      batchId
    );
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
    db.run(
      `UPDATE job_queue SET status = 'cancelled', completed_at = datetime('now')
       WHERE batch_id = ? AND status IN ('queued', 'paused')`,
      batchId
    );
  }

  retryBatch(batchId: string): void {
    const db = this.getDb();
    db.run(
      `UPDATE job_queue SET status = 'queued', error = NULL WHERE batch_id = ? AND status = 'error'`,
      batchId
    );
    this.tryDequeue();
  }

  unsubscribe(_jobId: string, _res: unknown): void {
    // Cleanup happens when emitter fires 'done' and listeners are removed.
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
      error: row.error as string | undefined,
      result: row.result_yaml
        ? { yaml: row.result_yaml as string, scores: JSON.parse(row.result_scores as string) }
        : undefined,
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
         ORDER BY priority DESC, created_at ASC
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

    const abortController = new globalThis.AbortController();
    this.abortControllers.set(jobId, abortController);

    const emitter = new EventEmitter();
    this.emitters.set(jobId, emitter);
    const steps: PipelineProgressEvent[] = [];
    this.completedSteps.set(jobId, steps);

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
          emitter.emit('progress', event);
          // Store all non-token events for replay to late subscribers.
          if (event.type !== 'step:tokens' && event.type !== 'step:reasoning') {
            steps.push(event);
          }
        },
        abortSignal: abortController.signal,
      })
      .then(result => {
        const yamlText = result.yaml || '';
        const scores = result.scores || {};
        // If the pipeline stopped early (stop-loss), mark as partial.
        const stoppedEvent = steps.find(e => e.type === 'pipeline:stopped');
        const status = stoppedEvent ? 'partial' : 'complete';
        db.run(
          `UPDATE job_queue SET status = ?, result_yaml = ?, result_scores = ?, completed_at = datetime('now')
           WHERE id = ?`,
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
        const message = err instanceof Error ? err.message : String(err);
        const wasCancelled = abortController.signal.aborted;
        db.run(
          `UPDATE job_queue SET status = ?, error = ?, completed_at = datetime('now') WHERE id = ?`,
          wasCancelled ? 'error' : 'error',
          wasCancelled ? 'User cancelled' : message,
          jobId
        );

        // Circuit breaker: track consecutive failures per provider.
        const providerId = row.provider_id as string | undefined;
        if (!wasCancelled && providerId) {
          const failures = (this.providerFailures.get(providerId) || 0) + 1;
          this.providerFailures.set(providerId, failures);
          if (failures >= 3) {
            this.brokenProviders.add(providerId);
          }
        }
      })
      .finally(() => {
        emitter.emit('done');
        this.emitters.delete(jobId);
        this.abortControllers.delete(jobId);
        this.activeCount--;
        this.tryDequeue();

        // Keep completedSteps for late subscribers; schedule cleanup after 30 min.
        // unref() prevents this timer from blocking test runner / process exit.
        setTimeout(
          () => {
            this.completedSteps.delete(jobId);
          },
          30 * 60 * 1000
        ).unref();
      });

    return true;
  }
}
