import type { PipelineProgressEvent, StepResult } from '../types';

const crypto = require('node:crypto') as typeof import('node:crypto');

export interface SqliteLike {
  get: (sql: string, ...params: unknown[]) => Record<string, unknown> | undefined;
  run: (sql: string, ...params: unknown[]) => { changes: number };
  all: (sql: string, ...params: unknown[]) => Record<string, unknown>[];
}

export interface EnqueueParams {
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
}

export interface JobQueueRow extends Record<string, unknown> {
  id: string;
  job_type: 'generate' | 'fix' | 'audit-fix';
  priority: 'normal' | 'high';
  status: string;
  word: string;
  language: string;
  context?: string | null;
  notes?: string | null;
  batch_id?: string | null;
  target_job_id?: string | null;
  target_word_id?: string | null;
  synced_word_id?: string | null;
  synced_content_hash?: string | null;
  synced_at?: string | null;
  provider_id?: string | null;
  result_yaml?: string | null;
  result_scores?: string | null;
  progress_events?: string | null;
  error?: string | null;
  created_at?: string;
  completed_at?: string | null;
}

export interface JobState {
  jobId: string;
  status: string;
  jobType?: string;
  word: string;
  language: string;
  context?: string;
  notes?: string;
  error?: string;
  steps: StepResult[];
  result?: { yaml: string; scores: Record<string, unknown> };
  runMetrics?: RunMetrics;
}

export interface BatchStatus {
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

export interface QueueHistoryParams {
  page: number;
  pageSize: number;
  status?: 'complete' | 'partial' | 'error';
  query?: string;
}

export interface WorksetJob {
  jobId: string;
  jobType: string;
  status: string;
  word: string;
  language: string;
  syncStatus: 'synced' | 'unsynced' | 'not-saved' | 'blocked';
  priority: string;
  batchId?: string;
  createdAt: string;
  completedAt?: string;
  hasResult: boolean;
  finalScore: number | null;
  aiReviewScore: number | null;
  userReviewScore: number | null;
  effectiveReviewScore: number | null;
  auditState: 'complete' | 'incomplete' | 'missing';
  improveCount: number;
  runMetrics: RunMetrics;
  improveEligible: boolean;
  improveBlockedReason?:
    | 'score-not-low'
    | 'partial-result'
    | 'audit-incomplete'
    | 'missing-revision-notes';
}

export interface RunMetricsStage {
  stage: string;
  durationMs: number | null;
  totalTokens: number | null;
}

export interface RunMetrics {
  totalDurationMs: number | null;
  totalTokens: number | null;
  stages: RunMetricsStage[];
}

export interface WorksetImproveSubmission {
  jobs: Array<{ sourceJobId: string; jobId: string; queued: boolean; position?: number }>;
  blocked: Array<{
    jobId: string;
    reason: NonNullable<WorksetJob['improveBlockedReason']>;
  }>;
  missing: string[];
}

interface ParsedWorksetScores {
  aiReviewScore: number | null;
  userReviewScore: number | null;
  effectiveReviewScore: number | null;
  auditState: 'complete' | 'incomplete' | 'missing';
  improveCount: number;
  hasRevisionNotes: boolean;
}

const DEFAULT_WORKSET_IMPROVE_THRESHOLD = 6;

const EMPTY_RUN_METRICS: RunMetrics = {
  totalDurationMs: null,
  totalTokens: null,
  stages: [],
};

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashContent(value: unknown): string | null {
  const content = typeof value === 'string' ? parseJsonObject(value) : asRecord(value);
  if (!content) return null;
  return crypto.createHash('sha256').update(stableStringify(content)).digest('hex');
}

function parseJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function resolveWorksetSyncStatus(row: Record<string, unknown>): WorksetJob['syncStatus'] {
  if (row.status !== 'complete') return 'blocked';
  const syncedWordId = typeof row.synced_word_id === 'string' ? row.synced_word_id : '';
  const syncedContentHash =
    typeof row.synced_content_hash === 'string' ? row.synced_content_hash : '';
  if (syncedWordId && syncedContentHash && row.synced_word_content) {
    const currentSyncedHash = hashContent(row.synced_word_content);
    if (currentSyncedHash === syncedContentHash) return 'synced';
  }

  return row.word_content ? 'unsynced' : 'not-saved';
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readNumber(record: Record<string, unknown> | undefined, key: string): number | null {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function extractUsageTotalTokens(value: unknown): number | null {
  const usage = asRecord(value);
  if (!usage) return null;

  const directTotal =
    readNumber(usage, 'totalTokens') ??
    readNumber(usage, 'total_tokens') ??
    readNumber(usage, 'totalUsageTokens');
  if (directTotal !== null) return directTotal;

  const inputTokens =
    readNumber(usage, 'inputTokens') ??
    readNumber(usage, 'promptTokens') ??
    readNumber(usage, 'input_tokens') ??
    readNumber(usage, 'prompt_tokens');
  const outputTokens =
    readNumber(usage, 'outputTokens') ??
    readNumber(usage, 'completionTokens') ??
    readNumber(usage, 'output_tokens') ??
    readNumber(usage, 'completion_tokens');

  if (inputTokens !== null || outputTokens !== null) {
    return (inputTokens || 0) + (outputTokens || 0);
  }

  return null;
}

function extractEventTotalTokens(event: Extract<PipelineProgressEvent, { type: 'step:complete' }>) {
  const diagnostics = asRecord(event.diagnostics);
  return extractUsageTotalTokens(diagnostics?.usage);
}

export function buildRunMetrics(events: PipelineProgressEvent[]): RunMetrics {
  if (!events.length) return EMPTY_RUN_METRICS;

  const stages = events
    .filter(
      (event): event is Extract<PipelineProgressEvent, { type: 'step:complete' }> =>
        event.type === 'step:complete'
    )
    .map(event => ({
      stage: event.step,
      durationMs: event.duration,
      totalTokens: extractEventTotalTokens(event),
    }));

  const completed = [...events]
    .reverse()
    .find(
      (event): event is Extract<PipelineProgressEvent, { type: 'pipeline:complete' }> =>
        event.type === 'pipeline:complete'
    );
  const totalDurationMs =
    completed?.totalDuration ??
    (stages.length ? stages.reduce((sum, stage) => sum + (stage.durationMs || 0), 0) : null);
  const tokenValues = stages
    .map(stage => stage.totalTokens)
    .filter((value): value is number => value !== null);
  const totalTokens = tokenValues.length
    ? tokenValues.reduce((sum, value) => sum + value, 0)
    : null;

  return {
    totalDurationMs,
    totalTokens,
    stages,
  };
}

function parseNumericScore(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const numericScore = Number(value);
    return Number.isFinite(numericScore) ? numericScore : null;
  }
  return null;
}

function parseWorksetScores(rawScores: unknown): ParsedWorksetScores {
  const missing: ParsedWorksetScores = {
    aiReviewScore: null,
    userReviewScore: null,
    effectiveReviewScore: null,
    auditState: 'missing',
    improveCount: 0,
    hasRevisionNotes: false,
  };

  if (typeof rawScores !== 'string' || !rawScores.trim()) return missing;

  try {
    const scores = JSON.parse(rawScores) as Record<string, unknown>;
    const aiReviewScore = parseNumericScore(scores.overall_score);
    const userReviewScore = parseNumericScore(scores.user_review_score);
    const hasParseError = scores._parse_error === true;
    const effectiveReviewScore = hasParseError ? null : (userReviewScore ?? aiReviewScore);
    const improveCount = Math.max(0, Math.floor(parseNumericScore(scores.improve_count) ?? 0));
    const revisionNotes = scores.revision_notes;
    const hasRevisionNotes =
      typeof revisionNotes === 'string' &&
      revisionNotes.trim().length > 0 &&
      revisionNotes !== '无需修改。';
    const auditState = hasParseError || effectiveReviewScore === null ? 'incomplete' : 'complete';

    return {
      aiReviewScore,
      userReviewScore,
      effectiveReviewScore,
      auditState,
      improveCount,
      hasRevisionNotes,
    };
  } catch {
    return { ...missing, auditState: 'incomplete' };
  }
}

function resolveWorksetImproveEligibility(
  status: string,
  scores: ParsedWorksetScores
): Pick<WorksetJob, 'improveEligible' | 'improveBlockedReason'> {
  if (status !== 'complete') {
    return { improveEligible: false, improveBlockedReason: 'partial-result' };
  }
  if (scores.auditState !== 'complete' || scores.effectiveReviewScore === null) {
    return { improveEligible: false, improveBlockedReason: 'audit-incomplete' };
  }
  if (!scores.hasRevisionNotes) {
    return { improveEligible: false, improveBlockedReason: 'missing-revision-notes' };
  }
  if (scores.effectiveReviewScore >= DEFAULT_WORKSET_IMPROVE_THRESHOLD) {
    return { improveEligible: false, improveBlockedReason: 'score-not-low' };
  }
  return { improveEligible: true };
}

export class QueueStore {
  constructor(private readonly getDb: () => SqliteLike) {}

  query(sql: string, ...params: unknown[]): Record<string, unknown>[] {
    return this.getDb().all(sql, ...params);
  }

  getOne(sql: string, ...params: unknown[]): Record<string, unknown> | undefined {
    return this.getDb().get(sql, ...params);
  }

  run(sql: string, ...params: unknown[]): { changes: number } {
    return this.getDb().run(sql, ...params);
  }

  recoverStaleJobs(): void {
    const db = this.getDb();
    db.run(
      `UPDATE job_queue SET status = 'cancelled', completed_at = datetime('now')
       WHERE status = 'queued'`
    );
    db.run(
      `UPDATE job_queue SET status = 'queued', started_at = NULL
       WHERE status = 'running'`
    );
  }

  insert(params: EnqueueParams): string {
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.getDb().run(
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
    return jobId;
  }

  getRow(jobId: string): JobQueueRow | undefined {
    return this.getDb().get('SELECT * FROM job_queue WHERE id = ?', jobId) as
      | JobQueueRow
      | undefined;
  }

  getStatus(jobId: string): string | undefined {
    return this.getDb().get('SELECT status FROM job_queue WHERE id = ?', jobId)?.status as
      | string
      | undefined;
  }

  dequeue(excludedProviders: string[]): JobQueueRow | undefined {
    const brokenList = excludedProviders.map(() => '?').join(',');
    const row = this.getDb().get(
      `SELECT * FROM job_queue
       WHERE status = 'queued'
       ${brokenList.length > 0 ? `AND (provider_id IS NULL OR provider_id NOT IN (${brokenList}))` : ''}
       ORDER BY CASE priority WHEN 'high' THEN 1 ELSE 0 END DESC, created_at ASC, rowid ASC
       LIMIT 1`,
      ...excludedProviders
    ) as JobQueueRow | undefined;
    if (!row) return undefined;

    this.getDb().run(
      `UPDATE job_queue SET status = 'running', started_at = datetime('now')
       WHERE id = ? AND status = 'queued'`,
      row.id
    );
    return this.getRow(row.id);
  }

  setStatus(jobId: string, status: string): { changes: number } {
    return this.getDb().run(`UPDATE job_queue SET status = ? WHERE id = ?`, status, jobId);
  }

  cancelByStatus(jobId: string, status: string): { changes: number } {
    return this.getDb().run(
      `UPDATE job_queue SET status = 'cancelled', completed_at = datetime('now')
       WHERE id = ? AND status = ?`,
      jobId,
      status
    );
  }

  cancelRunning(jobId: string): { changes: number } {
    return this.getDb().run(
      `UPDATE job_queue SET status = 'cancelled', completed_at = datetime('now')
       WHERE id = ? AND status = 'running'`,
      jobId
    );
  }

  getQueuePosition(jobId: string): number {
    const posRow = this.getDb().get(
      `WITH target AS (
         SELECT CASE priority WHEN 'high' THEN 1 ELSE 0 END AS priority_rank,
                created_at,
                rowid
         FROM job_queue
         WHERE id = ?
       )
       SELECT COUNT(*) as cnt
       FROM job_queue, target
       WHERE status = 'queued'
         AND (
           CASE priority WHEN 'high' THEN 1 ELSE 0 END > target.priority_rank
           OR (
             CASE priority WHEN 'high' THEN 1 ELSE 0 END = target.priority_rank
             AND (
               job_queue.created_at < target.created_at
               OR (
                 job_queue.created_at = target.created_at
                 AND job_queue.rowid <= target.rowid
               )
             )
           )
         )`,
      jobId
    );
    return (posRow?.cnt as number) || 1;
  }

  getBatchStatus(batchId: string): BatchStatus {
    const rows = this.getDb().all(
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

  pauseQueuedBatch(batchId: string): string[] {
    const rows = this.getDb().all(
      `SELECT id FROM job_queue WHERE batch_id = ? AND status = 'queued'`,
      batchId
    );
    this.getDb().run(
      `UPDATE job_queue SET status = 'paused' WHERE batch_id = ? AND status = 'queued'`,
      batchId
    );
    return rows.map(row => row.id as string);
  }

  resumePausedBatch(batchId: string): void {
    this.getDb().run(
      `UPDATE job_queue SET status = 'queued' WHERE batch_id = ? AND status = 'paused'`,
      batchId
    );
  }

  cancelQueuedOrPausedBatch(batchId: string): string[] {
    const rows = this.getDb().all(
      `SELECT id FROM job_queue WHERE batch_id = ? AND status IN ('queued', 'paused')`,
      batchId
    );
    this.getDb().run(
      `UPDATE job_queue SET status = 'cancelled', completed_at = datetime('now')
       WHERE batch_id = ? AND status IN ('queued', 'paused')`,
      batchId
    );
    return rows.map(row => row.id as string);
  }

  retryErroredBatch(batchId: string): void {
    this.getDb().run(
      `UPDATE job_queue SET status = 'queued', error = NULL WHERE batch_id = ? AND status = 'error'`,
      batchId
    );
  }

  getCancelableRows(): Array<{ id: string; status: string }> {
    return this.getDb()
      .all(
        `SELECT id, status FROM job_queue
         WHERE status IN ('queued', 'paused', 'running', 'error')`
      )
      .map(row => ({ id: row.id as string, status: row.status as string }));
  }

  cancelAllActiveRows(): void {
    this.getDb().run(
      `UPDATE job_queue SET status = 'cancelled', completed_at = datetime('now')
       WHERE status IN ('queued', 'paused', 'running', 'error')`
    );
  }

  pauseRunningJob(jobId: string): void {
    this.getDb().run(`UPDATE job_queue SET status = 'paused' WHERE id = ?`, jobId);
  }

  pauseQueuedJob(jobId: string): { changes: number } {
    return this.getDb().run(
      `UPDATE job_queue SET status = 'paused' WHERE id = ? AND status = 'queued'`,
      jobId
    );
  }

  pauseQueuedJobs(): void {
    this.getDb().run(`UPDATE job_queue SET status = 'paused' WHERE status = 'queued'`);
  }

  getPausedJobIds(): string[] {
    return this.getDb()
      .all(`SELECT id FROM job_queue WHERE status = 'paused'`)
      .map(row => row.id as string);
  }

  resumePausedJobs(): void {
    this.getDb().run(
      `UPDATE job_queue SET status = 'queued', created_at = datetime('now')
       WHERE status = 'paused'`
    );
  }

  resumePausedJob(jobId: string): { changes: number } {
    return this.getDb().run(
      `UPDATE job_queue SET status = 'queued', created_at = datetime('now')
       WHERE id = ? AND status = 'paused'`,
      jobId
    );
  }

  isDuplicate(word: string, language: string): boolean {
    const row = this.getDb().get(
      `SELECT 1 FROM job_queue
       WHERE word = ? AND language = ? AND status IN ('queued', 'running')
       LIMIT 1`,
      word,
      language
    );
    return !!row;
  }

  findDuplicates(items: Array<{ word: string; language: string }>): Set<string> {
    if (items.length === 0) return new Set();
    const placeholders = items.map(() => '(?, ?)').join(', ');
    const params: unknown[] = [];
    for (const item of items) {
      params.push(item.word, item.language);
    }
    const rows = this.getDb().all(
      `SELECT DISTINCT word, language FROM job_queue
       WHERE (word, language) IN (${placeholders})
       AND status IN ('queued', 'running')`,
      ...params
    );
    const keys = new Set<string>();
    for (const row of rows) {
      keys.add(`${row.language}:${String(row.word).toLocaleLowerCase()}`);
    }
    return keys;
  }

  getQueuePositions(jobIds: string[]): Map<string, number> {
    if (jobIds.length === 0) return new Map();
    const idPlaceholders = jobIds.map(() => '?').join(', ');
    const rows = this.getDb().all(
      `WITH targets AS (
         SELECT id, CASE priority WHEN 'high' THEN 1 ELSE 0 END AS priority_rank,
                created_at, rowid
         FROM job_queue WHERE id IN (${idPlaceholders})
       )
       SELECT t.id, COUNT(*) as cnt
       FROM job_queue j, targets t
       WHERE j.status = 'queued'
         AND (
           CASE j.priority WHEN 'high' THEN 1 ELSE 0 END > t.priority_rank
           OR (
             CASE j.priority WHEN 'high' THEN 1 ELSE 0 END = t.priority_rank
             AND (j.created_at < t.created_at
               OR (j.created_at = t.created_at AND j.rowid <= t.rowid))
           )
         )
       GROUP BY t.id`,
      ...jobIds
    );
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.id as string, (row.cnt as number) || 1);
    }
    return map;
  }

  getTargetJobYaml(jobId: string): string | undefined {
    return this.getDb().get('SELECT result_yaml FROM job_queue WHERE id = ?', jobId)
      ?.result_yaml as string | undefined;
  }

  getWordContent(wordId: string): string | undefined {
    return this.getDb().get('SELECT content FROM words_v2 WHERE id = ?', wordId)?.content as
      | string
      | undefined;
  }

  completeRunningJob(params: {
    jobId: string;
    status: 'complete' | 'partial';
    yamlText: string;
    scores: Record<string, unknown>;
  }): void {
    this.getDb().run(
      `UPDATE job_queue SET status = ?, result_yaml = ?, result_scores = ?, completed_at = datetime('now')
       WHERE id = ? AND status = 'running'`,
      params.status,
      params.yamlText,
      JSON.stringify(params.scores),
      params.jobId
    );
  }

  markRunningJobPaused(jobId: string): void {
    this.getDb().run(`UPDATE job_queue SET status = 'paused', error = NULL WHERE id = ?`, jobId);
  }

  errorRunningJob(jobId: string, error: string): void {
    this.getDb().run(
      `UPDATE job_queue SET status = 'error', error = ?, completed_at = datetime('now')
       WHERE id = ? AND status = 'running'`,
      error,
      jobId
    );
  }

  getQueueOverview(): Array<{
    jobId: string;
    jobType: string;
    status: string;
    word: string;
    language: string;
    priority: string;
    createdAt: string;
    runMetrics: RunMetrics;
    error?: string;
  }> {
    const rows = this.getDb().all(
      `SELECT id, job_type, status, word, language, priority, created_at, error, progress_events
       FROM job_queue
       WHERE status IN ('queued', 'running', 'paused')
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
      runMetrics: buildRunMetrics(this.getPersistedEvents(row)),
      error: row.error as string | undefined,
    }));
  }

  getQueueHistory(params: QueueHistoryParams): {
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
      runMetrics: RunMetrics;
    }>;
    total: number;
    page: number;
    pageSize: number;
  } {
    const page = Math.max(1, Math.floor(params.page || 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize || 20)));
    const where: string[] = [`status IN ('complete', 'partial', 'error')`];
    const values: unknown[] = [];

    if (params.status) {
      where.push('status = ?');
      values.push(params.status);
    }
    if (params.query?.trim()) {
      where.push('word LIKE ?');
      values.push(`%${params.query.trim()}%`);
    }

    const whereSql = where.join(' AND ');
    const totalRow = this.getDb().get(
      `SELECT COUNT(*) as total FROM job_queue WHERE ${whereSql}`,
      ...values
    );
    const rows = this.getDb().all(
      `SELECT id, job_type, status, word, language, priority, created_at, completed_at, error,
              progress_events,
              CASE WHEN result_yaml IS NULL OR result_yaml = '' THEN 0 ELSE 1 END as has_result
       FROM job_queue
       WHERE ${whereSql}
       ORDER BY CASE status WHEN 'error' THEN 3 WHEN 'partial' THEN 2 ELSE 1 END DESC,
                COALESCE(completed_at, created_at) DESC,
                rowid DESC
       LIMIT ? OFFSET ?`,
      ...values,
      pageSize,
      (page - 1) * pageSize
    );

    return {
      jobs: rows.map(row => ({
        jobId: row.id as string,
        jobType: row.job_type as string,
        status: row.status as string,
        word: row.word as string,
        language: row.language as string,
        priority: row.priority as string,
        createdAt: row.created_at as string,
        completedAt: row.completed_at as string | undefined,
        error: row.error as string | undefined,
        hasResult: Boolean(row.has_result),
        runMetrics: buildRunMetrics(this.getPersistedEvents(row)),
      })),
      total: (totalRow?.total as number) || 0,
      page,
      pageSize,
    };
  }

  getTodayWorkset(): { jobs: WorksetJob[]; total: number } {
    const rows = this.getDb().all(
      `WITH ranked_jobs AS (
         SELECT
           id,
           job_type,
           status,
           word,
           language,
           priority,
           batch_id,
           created_at,
           completed_at,
           result_scores,
           progress_events,
           synced_word_id,
           synced_content_hash,
           synced_at,
           CASE WHEN result_yaml IS NULL OR result_yaml = '' THEN 0 ELSE 1 END AS has_result,
           ROW_NUMBER() OVER (
             PARTITION BY lower(word), language
             ORDER BY COALESCE(completed_at, created_at) DESC, rowid DESC
           ) AS workset_rank
         FROM job_queue
         WHERE status IN ('complete', 'partial')
           AND result_yaml IS NOT NULL
           AND result_yaml <> ''
           AND date(COALESCE(completed_at, created_at), 'localtime') = date('now', 'localtime')
       ),
       saved_words AS (
         SELECT lower(lemma) AS lemma_key, language, content
         FROM words_v2
       )
       SELECT
         r.id,
         r.job_type,
         r.status,
         r.word,
         r.language,
         r.priority,
         r.batch_id,
         r.created_at,
         r.completed_at,
         r.result_scores,
         r.progress_events,
         r.has_result,
         r.synced_word_id,
         r.synced_content_hash,
         r.synced_at,
         sw.content AS word_content,
         synced_word.content AS synced_word_content
       FROM ranked_jobs r
       LEFT JOIN saved_words sw
         ON sw.lemma_key = lower(r.word)
        AND sw.language = r.language
       LEFT JOIN words_v2 synced_word
         ON synced_word.id = r.synced_word_id
       WHERE r.workset_rank = 1
       ORDER BY COALESCE(r.completed_at, r.created_at) DESC`
    );

    const jobs: WorksetJob[] = rows.map(row => {
      const scores = parseWorksetScores(row.result_scores);
      const eligibility = resolveWorksetImproveEligibility(row.status as string, scores);
      return {
        jobId: row.id as string,
        jobType: row.job_type as string,
        status: row.status as string,
        word: row.word as string,
        language: row.language as string,
        syncStatus: resolveWorksetSyncStatus(row),
        priority: row.priority as string,
        batchId: row.batch_id as string | undefined,
        createdAt: row.created_at as string,
        completedAt: row.completed_at as string | undefined,
        hasResult: Boolean(row.has_result),
        finalScore: scores.effectiveReviewScore,
        aiReviewScore: scores.aiReviewScore,
        userReviewScore: scores.userReviewScore,
        effectiveReviewScore: scores.effectiveReviewScore,
        auditState: scores.auditState,
        improveCount: scores.improveCount,
        runMetrics: buildRunMetrics(this.getPersistedEvents(row)),
        ...eligibility,
      };
    });

    return { jobs, total: jobs.length };
  }

  setUserReviewScore(jobId: string, score: number): 'updated' | 'not-found' | 'not-reviewable' {
    const row = this.getDb().get(
      `SELECT status, result_yaml, result_scores
       FROM job_queue
       WHERE id = ?`,
      jobId
    );

    if (!row) return 'not-found';
    if (
      row.status !== 'complete' ||
      typeof row.result_yaml !== 'string' ||
      !row.result_yaml.trim()
    ) {
      return 'not-reviewable';
    }

    let scores: Record<string, unknown> = {};
    if (typeof row.result_scores === 'string' && row.result_scores.trim()) {
      try {
        scores = JSON.parse(row.result_scores) as Record<string, unknown>;
      } catch {
        scores = {};
      }
    }

    scores.user_review_score = score;

    const result = this.getDb().run(
      `UPDATE job_queue SET result_scores = ? WHERE id = ?`,
      JSON.stringify(scores),
      jobId
    );
    return result.changes > 0 ? 'updated' : 'not-found';
  }

  getNextImproveCount(jobId: string): number {
    const row = this.getDb().get('SELECT result_scores FROM job_queue WHERE id = ?', jobId);
    if (!row || typeof row.result_scores !== 'string') return 1;

    try {
      const scores = JSON.parse(row.result_scores) as Record<string, unknown>;
      const current = parseNumericScore(scores.improve_count) ?? 0;
      return Math.max(0, Math.floor(current)) + 1;
    } catch {
      return 1;
    }
  }

  getWorksetYaml(jobIds: string[]): Array<{ jobId: string; yaml: string }> {
    const uniqueIds = [...new Set(jobIds.map(id => id.trim()).filter(Boolean))];
    if (uniqueIds.length === 0) return [];

    const placeholders = uniqueIds.map(() => '?').join(', ');
    const rows = this.getDb().all(
      `SELECT id, result_yaml
       FROM job_queue
       WHERE id IN (${placeholders})
         AND status IN ('complete', 'partial')
         AND result_yaml IS NOT NULL
         AND result_yaml <> ''`,
      ...uniqueIds
    );

    return rows.map(row => ({
      jobId: row.id as string,
      yaml: row.result_yaml as string,
    }));
  }

  markWorksetJobSynced(jobId: string, wordId: string): 'updated' | 'not-found' | 'word-not-found' {
    const word = this.getDb().get('SELECT content FROM words_v2 WHERE id = ?', wordId);
    const contentHash = hashContent(word?.content);
    if (!word || !contentHash) return 'word-not-found';

    const result = this.getDb().run(
      `UPDATE job_queue
       SET synced_word_id = ?,
           synced_content_hash = ?,
           synced_at = datetime('now')
       WHERE id = ?
         AND status = 'complete'
         AND result_yaml IS NOT NULL
         AND result_yaml <> ''`,
      wordId,
      contentHash,
      jobId
    );

    return result.changes > 0 ? 'updated' : 'not-found';
  }

  deleteHistoryJob(jobId: string): 'deleted' | 'not-found' | 'active' {
    const row = this.getDb().get('SELECT status FROM job_queue WHERE id = ?', jobId);
    if (!row) return 'not-found';
    if (row.status === 'queued' || row.status === 'running' || row.status === 'paused') {
      return 'active';
    }
    const result = this.getDb().run(
      `DELETE FROM job_queue
       WHERE id = ? AND status NOT IN ('queued', 'running', 'paused')`,
      jobId
    );
    return result.changes > 0 ? 'deleted' : 'not-found';
  }

  clearHistory(params: { status?: 'complete' | 'partial' | 'error'; query?: string }): {
    deleted: number;
    jobIds: string[];
  } {
    const where: string[] = [`status IN ('complete', 'partial', 'error')`];
    const values: unknown[] = [];
    if (params.status) {
      where.push('status = ?');
      values.push(params.status);
    }
    if (params.query?.trim()) {
      where.push('word LIKE ?');
      values.push(`%${params.query.trim()}%`);
    }

    const rows = this.getDb().all(
      `SELECT id FROM job_queue WHERE ${where.join(' AND ')}`,
      ...values
    );
    const result = this.getDb().run(
      `DELETE FROM job_queue WHERE ${where.join(' AND ')}`,
      ...values
    );
    return { deleted: result.changes, jobIds: rows.map(row => row.id as string) };
  }

  persistProgressEvents(jobId: string, events: PipelineProgressEvent[]): void {
    this.getDb().run(
      'UPDATE job_queue SET progress_events = ? WHERE id = ?',
      JSON.stringify(events),
      jobId
    );
  }

  getPersistedEvents(row: Record<string, unknown>): PipelineProgressEvent[] {
    const raw = row.progress_events;
    if (typeof raw !== 'string' || !raw.trim()) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as PipelineProgressEvent[]) : [];
    } catch {
      return [];
    }
  }
}
