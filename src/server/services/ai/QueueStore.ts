import type { PipelineProgressEvent, StepResult } from './types';

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
    error?: string;
  }> {
    const rows = this.getDb().all(
      `SELECT id, job_type, status, word, language, priority, created_at, error
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
      })),
      total: (totalRow?.total as number) || 0,
      page,
      pageSize,
    };
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
