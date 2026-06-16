import { computed, onUnmounted, reactive, ref, type InjectionKey } from 'vue';
import request, { type RequestConfig } from '@/utils/request';

const LOCAL_QUEUE_REQUEST: RequestConfig = { skipRateLimit: true };
const WORKSET_SAVE_REQUEST: RequestConfig = { skipRateLimit: true, timeout: 30000 };
const WORKSET_SAVE_CHUNK_SIZE = 25;
const MAX_ACTIVE_EVENT_SOURCES = 6;

export interface StepState {
  step: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  message?: string;
  duration?: number;
  totalTokens?: number | null;
  summary?: string;
  tokens?: string;
  result?: unknown;
  rawText?: string;
  reasoningText?: string;
  toolCalls?: ToolCallState[];
  error?: string;
}

export interface ToolCallState {
  toolCallId: string;
  toolName: string;
  status: 'running' | 'complete' | 'error';
  input?: unknown;
  output?: unknown;
  error?: string;
  warning?: string;
  startTime: number;
  duration?: number;
}

export interface JobState {
  jobId: string;
  word: string;
  language: 'en' | 'de';
  context?: string;
  notes?: string;
  status: 'queued' | 'running' | 'paused' | 'complete' | 'partial' | 'error';
  queuePosition?: number;
  steps: StepState[];
  currentStep?: string;
  error?: string;
  yaml?: string;
  scores?: Record<string, unknown>;
  runMetrics?: RunMetrics;
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

export interface GenerateParams {
  word: string;
  context?: string;
  language: 'en' | 'de';
  notes?: string;
}

export interface BatchGenerateItem {
  word: string;
  context?: string;
  notes?: string;
}

interface GenerateResponse {
  jobId: string;
  queued?: boolean;
  position?: number;
}

export interface BatchGenerateResponse {
  batchId: string;
  jobs: Array<{
    jobId: string;
    word: string;
    queued?: boolean;
    position?: number;
  }>;
  skipped: Array<{ word: string; reason: string }>;
}

export type ResumeStage = 'searching' | 'pondering' | 'auditing';

export interface QueueJobOverview {
  jobId: string;
  jobType: string;
  status: string;
  word: string;
  language: string;
  priority: string;
  createdAt: string;
  runMetrics?: RunMetrics;
  error?: string;
}

export type QueueHistoryStatus = 'complete' | 'partial' | 'error';

export interface QueueHistoryJob extends QueueJobOverview {
  completedAt?: string;
  hasResult: boolean;
}

export interface WorksetJob extends QueueHistoryJob {
  batchId?: string;
  syncStatus: 'synced' | 'unsynced' | 'not-saved' | 'blocked';
  finalScore: number | null;
  aiReviewScore: number | null;
  userReviewScore: number | null;
  effectiveReviewScore: number | null;
  auditState: 'complete' | 'incomplete' | 'missing';
  improveCount: number;
  improveEligible: boolean;
  improveBlockedReason?:
    | 'score-not-low'
    | 'partial-result'
    | 'audit-incomplete'
    | 'missing-revision-notes';
}

interface QueueHistoryResponse {
  jobs: QueueHistoryJob[];
  total: number;
  page: number;
  pageSize: number;
}

interface WorksetResponse {
  jobs: WorksetJob[];
  total: number;
}

export interface WorksetSaveResponse {
  ok: boolean;
  saved: number;
  conflicts: number;
  failed: number;
  missing: string[];
  results: Array<{ jobId: string; result: Record<string, unknown> }>;
}

export interface UserReviewScoreResponse {
  ok: boolean;
  jobId: string;
  userReviewScore: number;
}

export interface WorksetImproveResponse {
  ok: boolean;
  jobs: Array<{ sourceJobId: string; jobId: string; queued: boolean; position?: number }>;
  blocked: Array<{ jobId: string; reason: NonNullable<WorksetJob['improveBlockedReason']> }>;
  missing: string[];
}

export type AiGenerateState = ReturnType<typeof useAiGenerate>;

export const AI_STATE_KEY: InjectionKey<AiGenerateState> = Symbol('ai-state');

const mergeWorksetSaveResponses = (responses: WorksetSaveResponse[]): WorksetSaveResponse => {
  const saved = responses.reduce((total, item) => total + item.saved, 0);
  const conflicts = responses.reduce((total, item) => total + item.conflicts, 0);
  const failed = responses.reduce((total, item) => total + item.failed, 0);
  const missing = responses.flatMap(item => item.missing);
  const results = responses.flatMap(item => item.results);

  return {
    ok: responses.every(item => item.ok) && missing.length === 0,
    saved,
    conflicts,
    failed,
    missing,
    results,
  };
};

export function useAiGenerate() {
  const jobs = reactive<Record<string, JobState>>({});
  const selectedJobId = ref<string | null>(null);
  const eventSources = new Map<string, EventSource>();
  const queueOverview = ref<QueueJobOverview[]>([]);
  const queueHistory = ref<QueueHistoryJob[]>([]);
  const queueHistoryTotal = ref(0);
  const queueHistoryPage = ref(1);
  const queueHistoryPageSize = ref(20);
  const queueHistoryStatus = ref<QueueHistoryStatus | undefined>();
  const queueHistoryQuery = ref('');
  const queueHistoryLoading = ref(false);
  let queueHistoryRequestId = 0;
  const todayWorkset = ref<WorksetJob[]>([]);
  const todayWorksetTotal = ref(0);

  const currentJob = computed(() => {
    if (!selectedJobId.value) return null;
    return jobs[selectedJobId.value] || null;
  });
  const isRunning = computed(
    () => currentJob.value?.status === 'running' || currentJob.value?.status === 'queued'
  );
  const isComplete = computed(
    () => currentJob.value?.status === 'complete' || currentJob.value?.status === 'partial'
  );

  function registerJob(jobId: string, params: GenerateParams, response: GenerateResponse): void {
    jobs[jobId] = {
      jobId,
      word: params.word,
      language: params.language,
      context: params.context,
      notes: params.notes,
      status: response.queued ? 'queued' : 'running',
      queuePosition: response.position,
      steps: [],
    };
    selectedJobId.value = jobId;
  }

  async function startGeneration(params: GenerateParams): Promise<string> {
    const response = await request.post<GenerateResponse>(
      '/v2/generate/single',
      params,
      LOCAL_QUEUE_REQUEST
    );
    registerJob(response.jobId, params, response);
    const overviewLoaded = await fetchQueueOverview();
    if (!overviewLoaded) syncRunningEventSourcesFromJobs();
    return response.jobId;
  }

  async function startBatchGeneration(
    language: 'en' | 'de',
    items: BatchGenerateItem[]
  ): Promise<BatchGenerateResponse> {
    const response = await request.post<BatchGenerateResponse>(
      '/v2/generate/batch',
      {
        language,
        items,
      },
      LOCAL_QUEUE_REQUEST
    );
    for (const job of response.jobs) {
      const item = items.find(candidate => candidate.word === job.word);
      registerJob(
        job.jobId,
        {
          word: job.word,
          language,
          context: item?.context,
          notes: item?.notes,
        },
        job
      );
    }
    if (response.jobs[0]) selectedJobId.value = response.jobs[0].jobId;
    const overviewLoaded = await fetchQueueOverview();
    if (!overviewLoaded) syncRunningEventSourcesFromJobs();
    return response;
  }

  function ensureJobFromOverview(item: QueueJobOverview): JobState {
    const existing = jobs[item.jobId];
    const language = item.language === 'de' ? 'de' : 'en';
    const status = normalizeOverviewStatus(item.status);
    if (existing) {
      existing.status = status;
      existing.error = item.error;
      if (status !== 'queued') existing.queuePosition = undefined;
      return existing;
    }

    const job: JobState = {
      jobId: item.jobId,
      word: item.word,
      language,
      status,
      steps: [],
      error: item.error,
    };
    jobs[item.jobId] = job;
    return job;
  }

  function normalizeOverviewStatus(status: string): JobState['status'] {
    if (status === 'queued') return 'queued';
    if (status === 'paused') return 'paused';
    if (status === 'complete') return 'complete';
    if (status === 'partial') return 'partial';
    if (status === 'error') return 'error';
    return 'running';
  }

  function upsertJobFromServer(
    job: JobState & {
      jobType?: string;
      result?: { yaml: string; scores: Record<string, unknown> };
    }
  ): JobState {
    const language = job.language === 'de' ? 'de' : 'en';
    const existing = jobs[job.jobId];
    const serverSteps = job.steps?.length ? job.steps : existing?.steps || [];
    const runMetrics = job.runMetrics || existing?.runMetrics;
    const next: JobState = {
      ...(existing || {
        steps: [],
      }),
      steps: mergeStepRunMetrics(serverSteps, runMetrics),
      jobId: job.jobId,
      word: job.word,
      language,
      context: job.context,
      notes: job.notes,
      status: job.status,
      error: job.error,
      yaml: job.yaml || job.result?.yaml,
      scores: job.scores || job.result?.scores,
      runMetrics,
    };
    jobs[job.jobId] = next;

    return next;
  }

  function mergeStepRunMetrics(steps: StepState[], runMetrics?: RunMetrics): StepState[] {
    const metricsByStage = new Map((runMetrics?.stages || []).map(stage => [stage.stage, stage]));
    return steps.map(step => {
      const serverDurationMs =
        typeof (step as StepState & { durationMs?: unknown }).durationMs === 'number'
          ? (step as StepState & { durationMs: number }).durationMs
          : undefined;
      const metrics = metricsByStage.get(step.step);
      if (!metrics) {
        return {
          ...step,
          duration: step.duration ?? serverDurationMs,
        };
      }
      return {
        ...step,
        duration: step.duration ?? serverDurationMs ?? metrics.durationMs ?? undefined,
        totalTokens: step.totalTokens ?? metrics.totalTokens,
      };
    });
  }

  function subscribeToJob(jobId: string): void {
    eventSources.get(jobId)?.close();
    const es = new EventSource(`/api/v2/generate/${jobId}/stream`);
    eventSources.set(jobId, es);

    es.addEventListener('job:queued', event => {
      const data = JSON.parse(event.data) as { position: number };
      const job = jobs[jobId];
      if (!job) return;
      job.status = 'queued';
      job.queuePosition = data.position;

      scheduleQueueOverviewRefresh();
    });

    es.addEventListener('job:started', () => {
      const job = jobs[jobId];
      if (!job) return;
      job.status = 'running';
      job.queuePosition = undefined;

      scheduleQueueOverviewRefresh();
    });

    es.addEventListener('job:paused', event => {
      const data = JSON.parse(event.data) as { step?: string };
      const job = jobs[jobId];
      if (!job) return;
      job.status = 'paused';
      job.queuePosition = undefined;
      job.currentStep = data.step;
      const runningStep = job.steps.find(step => step.status === 'running');
      if (runningStep) {
        runningStep.status = 'pending';
        runningStep.summary = 'Paused';
      }

      scheduleQueueOverviewRefresh();
    });

    es.addEventListener('step:start', event => {
      const data = JSON.parse(event.data) as { step: string; message: string };
      const job = jobs[jobId];
      if (!job) return;
      const existingIdx = job.steps.findIndex(
        step => step.step === data.step && step.status === 'running'
      );
      if (existingIdx >= 0) {
        job.steps[existingIdx] = { step: data.step, status: 'running', message: data.message };
      } else {
        const oldIdx = job.steps.findIndex(step => step.step === data.step);
        if (oldIdx >= 0) {
          job.steps[oldIdx] = { step: data.step, status: 'running', message: data.message };
        } else {
          job.steps.push({ step: data.step, status: 'running', message: data.message });
        }
      }
      job.currentStep = data.step;
      if (data.step !== 'fixing') {
        job.status = 'running';
      }
    });

    es.addEventListener('step:tokens', event => {
      const data = JSON.parse(event.data) as { step: string; chunk: string };
      const job = jobs[jobId];
      if (!job) return;
      const step = job.steps.find(item => item.step === data.step && item.status === 'running');
      if (step) {
        step.tokens = (step.tokens || '') + data.chunk;
      }
    });

    es.addEventListener('step:reasoning', event => {
      const data = JSON.parse(event.data) as { step: string; chunk: string };
      const job = jobs[jobId];
      if (!job) return;
      const step = job.steps.find(item => item.step === data.step && item.status === 'running');
      if (step) {
        step.reasoningText = (step.reasoningText || '') + data.chunk;
      }
    });

    es.addEventListener('step:complete', event => {
      const data = JSON.parse(event.data) as {
        step: string;
        duration: number;
        summary: string;
        result?: unknown;
        rawText?: string;
        reasoningText?: string;
      };
      const job = jobs[jobId];
      if (!job) return;
      let step = job.steps.find(item => item.step === data.step && item.status === 'running');
      if (!step) {
        step = job.steps.find(item => item.step === data.step);
      }
      if (!step) {
        step = { step: data.step, status: 'pending' };
        job.steps.push(step);
      }
      if (step) {
        step.status = 'complete';
        step.duration = data.duration;
        step.summary = data.summary;
        step.result = data.result;
        step.rawText = data.rawText;
        if (data.reasoningText) step.reasoningText = data.reasoningText;
      }
    });

    es.addEventListener('step:tool-call', event => {
      const data = JSON.parse(event.data) as {
        step: string;
        toolCallId: string;
        toolName: string;
        input?: unknown;
        startTime: number;
      };
      const job = jobs[jobId];
      if (!job) return;
      const step = job.steps.find(item => item.step === data.step && item.status === 'running');
      if (!step) return;
      step.toolCalls = step.toolCalls || [];
      if (!step.toolCalls.some(item => item.toolCallId === data.toolCallId)) {
        step.toolCalls.push({
          toolCallId: data.toolCallId,
          toolName: data.toolName,
          status: 'running',
          input: data.input,
          startTime: data.startTime,
        });
      }
    });

    es.addEventListener('step:tool-result', event => {
      const data = JSON.parse(event.data) as {
        step: string;
        toolCallId: string;
        toolName: string;
        output?: unknown;
        error?: string;
        warning?: string;
        duration: number;
      };
      const job = jobs[jobId];
      if (!job) return;
      const step = job.steps.find(item => item.step === data.step && item.status === 'running');
      const toolCall = step?.toolCalls?.find(item => item.toolCallId === data.toolCallId);
      if (!toolCall) return;
      toolCall.status = data.error ? 'error' : 'complete';
      toolCall.output = data.output;
      toolCall.error = data.error;
      toolCall.warning = data.warning;
      toolCall.duration = data.duration;
    });

    es.addEventListener('step:error', event => {
      const data = JSON.parse(event.data) as { step: string; error: string; willRetry?: boolean };
      const job = jobs[jobId];
      if (!job) return;
      const step = job.steps.find(item => item.step === data.step && item.status === 'running');
      if (step) {
        step.status = 'error';
        step.error = data.error;
      }
      if (job.error !== 'User cancelled') {
        job.status = 'error';
        job.error = data.error;
      }
      closeJobEventSource(jobId);

      scheduleQueueOverviewRefresh();
    });

    es.addEventListener('pipeline:complete', event => {
      const data = JSON.parse(event.data) as { yaml: string; scores: Record<string, unknown> };
      const job = jobs[jobId];
      if (!job) return;
      if (job.status === 'paused') return;
      job.status = 'complete';
      job.currentStep = undefined;
      job.yaml = data.yaml;
      job.scores = data.scores;
      closeJobEventSource(jobId);

      scheduleQueueOverviewRefresh();
    });

    es.addEventListener('pipeline:stopped', event => {
      const data = JSON.parse(event.data) as {
        yaml: string;
        stoppedAtStage: string;
        reason: string;
      };
      const job = jobs[jobId];
      if (!job) return;
      if (job.status === 'paused') return;
      job.status = 'partial';
      job.currentStep = undefined;
      job.yaml = data.yaml;
      job.scores = {};
      closeJobEventSource(jobId);

      scheduleQueueOverviewRefresh();
    });

    es.onerror = () => {
      const job = jobs[jobId];
      if (!job || job.status === 'complete' || job.status === 'partial' || job.status === 'error') {
        closeJobEventSource(jobId);
      } else if (job.status === 'paused') {
        closeJobEventSource(jobId);
      }
    };
  }

  function closeJobEventSource(jobId: string): void {
    eventSources.get(jobId)?.close();
    eventSources.delete(jobId);
  }

  function syncRunningEventSourcesFromJobs(): void {
    const runningIds = Object.values(jobs)
      .filter(job => job.status === 'running')
      .map(job => job.jobId);
    syncRunningEventSources(runningIds);
  }

  function syncRunningEventSourcesFromOverview(): void {
    const runningIds = queueOverview.value
      .filter(item => item.status === 'running')
      .map(item => item.jobId);
    syncRunningEventSources(runningIds);
  }

  function syncRunningEventSources(runningIds: string[]): void {
    const running = new Set(runningIds);
    for (const jobId of Array.from(eventSources.keys())) {
      if (!running.has(jobId)) {
        closeJobEventSource(jobId);
      }
    }

    for (const jobId of runningIds) {
      if (eventSources.has(jobId)) continue;
      if (eventSources.size >= MAX_ACTIVE_EVENT_SOURCES) break;
      subscribeToJob(jobId);
    }
  }

  async function resumeGeneration(
    jobId: string,
    fromStage?: ResumeStage,
    notes?: string,
    userScore?: number
  ): Promise<void> {
    eventSources.get(jobId)?.close();
    const oldJob = jobs[jobId];
    const body: Record<string, unknown> = {};
    if (fromStage) body.fromStage = fromStage;
    if (notes !== undefined) body.notes = notes;
    if (userScore !== undefined) body.userScore = userScore;
    const response = await request.post<GenerateResponse>(
      `/v2/generate/${jobId}/resume`,
      body,
      LOCAL_QUEUE_REQUEST
    );
    if (oldJob) {
      const previousSteps = oldJob.steps.filter(step => {
        if (!fromStage) return false;
        const order: ResumeStage[] = ['searching', 'pondering', 'auditing'];
        return order.indexOf(step.step as ResumeStage) < order.indexOf(fromStage);
      });
      registerJob(
        response.jobId,
        {
          word: oldJob.word,
          context: oldJob.context,
          language: oldJob.language,
          notes: notes ?? oldJob.notes,
        },
        response
      );
      const newJob = jobs[response.jobId];
      if (newJob) {
        newJob.error = undefined;
        newJob.steps = previousSteps.map(step => ({ ...step }));
      }
    }
    const overviewLoaded = await fetchQueueOverview();
    if (!overviewLoaded) syncRunningEventSourcesFromJobs();
  }

  async function cancelGeneration(jobId: string): Promise<void> {
    await request.post(`/v2/generate/${jobId}/cancel`, undefined, LOCAL_QUEUE_REQUEST);
    const job = jobs[jobId];
    if (job) {
      job.status = 'error';
      job.error = 'User cancelled';
    }
    closeJobEventSource(jobId);
    await fetchQueueOverview();
  }

  async function pauseGeneration(jobId: string): Promise<void> {
    await request.post(`/v2/generate/${jobId}/pause`, undefined, LOCAL_QUEUE_REQUEST);
    const job = jobs[jobId];
    if (job) {
      job.status = 'paused';
      const runningStep = job.steps.find(step => step.status === 'running');
      if (runningStep) {
        runningStep.status = 'pending';
        runningStep.summary = 'Paused';
      }
    }
    closeJobEventSource(jobId);
    await fetchQueueOverview();
  }

  async function resumeActiveGeneration(jobId: string): Promise<void> {
    await request.post(`/v2/generate/${jobId}/resume-active`, undefined, LOCAL_QUEUE_REQUEST);
    await fetchQueueOverview();
    const overviewItem = queueOverview.value.find(item => item.jobId === jobId);
    if (overviewItem) {
      const job = ensureJobFromOverview(overviewItem);
      job.status = overviewItem.status === 'queued' ? 'queued' : 'running';
      syncRunningEventSourcesFromOverview();
    }
  }

  async function fixGeneration(jobId: string, notes?: string): Promise<string> {
    const job = jobs[jobId];
    const userNotes = notes?.trim() || undefined;
    const response = await request.post<GenerateResponse>(
      `/v2/generate/${jobId}/fix`,
      userNotes ? { notes: userNotes } : undefined,
      LOCAL_QUEUE_REQUEST
    );
    if (job) {
      const revisionNotes = job.scores?.revision_notes as string | undefined;
      const fixNotes =
        userNotes && revisionNotes
          ? `${revisionNotes}\n\nUser feedback:\n${userNotes}`
          : userNotes || revisionNotes || job.notes;
      const previousSteps = job.steps
        .filter(step => step.status === 'complete')
        .map(step => ({ ...step }));
      registerJob(
        response.jobId,
        {
          word: job.word,
          context: job.context,
          language: job.language,
          notes: fixNotes,
        },
        response
      );
      const newJob = jobs[response.jobId];
      if (newJob) {
        newJob.steps = [...previousSteps];
        if (!newJob.steps.some(step => step.step === 'fixing')) {
          newJob.steps.push({ step: 'fixing', status: 'pending' });
        }
      }

      const overviewLoaded = await fetchQueueOverview();
      if (!overviewLoaded) syncRunningEventSourcesFromJobs();
    }
    return response.jobId;
  }

  function unsubscribeJob(jobId: string): void {
    closeJobEventSource(jobId);
  }

  function selectJob(jobId: string | null): void {
    // Close stale EventSources for jobs that reached a terminal state.
    for (const [id, es] of eventSources) {
      const job = jobs[id];
      if (
        job &&
        (job.status === 'complete' || job.status === 'partial' || job.status === 'error')
      ) {
        es.close();
        eventSources.delete(id);
      }
    }

    if (jobId && !(jobId in jobs)) {
      const overviewItem = queueOverview.value.find(item => item.jobId === jobId);
      if (overviewItem) {
        ensureJobFromOverview(overviewItem);
        if (overviewItem.status === 'running') {
          subscribeToJob(jobId);
        }
      }
    }
    selectedJobId.value = jobId;
  }

  // ---- Queue overview ----

  let overviewDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleQueueOverviewRefresh(): void {
    if (overviewDebounceTimer) clearTimeout(overviewDebounceTimer);
    overviewDebounceTimer = setTimeout(() => {
      void fetchQueueOverview();
    }, 200);
  }

  async function fetchQueueOverview(): Promise<boolean> {
    try {
      const res = await request.get<{ jobs: typeof queueOverview.value }>(
        '/v2/generate/queue/overview',
        LOCAL_QUEUE_REQUEST
      );
      queueOverview.value = res.jobs;
      for (const item of res.jobs) {
        ensureJobFromOverview(item);
      }
      syncRunningEventSourcesFromOverview();
      return true;
    } catch {
      // Non-critical.
      return false;
    }
  }

  async function fetchQueueHistory(
    options: {
      page?: number;
      pageSize?: number;
      status?: QueueHistoryStatus | null;
      query?: string;
    } = {}
  ): Promise<void> {
    const page = options.page ?? queueHistoryPage.value;
    const pageSize = options.pageSize ?? queueHistoryPageSize.value;
    const status =
      'status' in options
        ? options.status === null
          ? undefined
          : options.status
        : queueHistoryStatus.value;
    const query = options.query !== undefined ? options.query : queueHistoryQuery.value;
    const requestId = ++queueHistoryRequestId;

    queueHistoryPage.value = page;
    queueHistoryPageSize.value = pageSize;
    queueHistoryStatus.value = status;
    queueHistoryQuery.value = query;
    queueHistoryLoading.value = true;

    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (status) params.set('status', status);
    if (query.trim()) params.set('query', query.trim());

    try {
      const res = await request.get<QueueHistoryResponse>(
        `/v2/generate/queue/history?${params.toString()}`,
        LOCAL_QUEUE_REQUEST
      );
      if (requestId !== queueHistoryRequestId) return;
      queueHistory.value = res.jobs;
      queueHistoryTotal.value = res.total;
      queueHistoryPage.value = res.page;
      queueHistoryPageSize.value = res.pageSize;
    } finally {
      if (requestId === queueHistoryRequestId) {
        queueHistoryLoading.value = false;
      }
    }
  }

  async function loadHistoryJob(jobId: string): Promise<JobState | null> {
    const res = await request.get<{
      job: JobState & {
        jobType?: string;
        result?: { yaml: string; scores: Record<string, unknown> };
      };
    }>(`/v2/generate/queue/history/${jobId}`, LOCAL_QUEUE_REQUEST);
    return upsertJobFromServer(res.job);
  }

  async function deleteHistoryJob(jobId: string): Promise<void> {
    await request.delete(`/v2/generate/queue/history/${jobId}`, LOCAL_QUEUE_REQUEST);
    delete jobs[jobId];
    if (selectedJobId.value === jobId) selectedJobId.value = null;

    await fetchQueueHistory();
    await fetchTodayWorkset();
  }

  async function clearQueueHistory(): Promise<number> {
    const res = await request.post<{ deleted: number }>(
      '/v2/generate/queue/history/clear',
      {
        status: queueHistoryStatus.value,
        query: queueHistoryQuery.value.trim() || undefined,
      },
      LOCAL_QUEUE_REQUEST
    );
    for (const job of queueHistory.value) {
      delete jobs[job.jobId];
    }
    if (selectedJobId.value && !(selectedJobId.value in jobs)) {
      selectedJobId.value = null;
    }

    await fetchQueueHistory({ page: 1 });
    await fetchTodayWorkset();
    return res.deleted;
  }

  async function fetchTodayWorkset(): Promise<void> {
    const res = await request.get<WorksetResponse>(
      '/v2/generate/workset/today',
      LOCAL_QUEUE_REQUEST
    );
    todayWorkset.value = res.jobs;
    todayWorksetTotal.value = res.total;
  }

  async function saveTodayWorkset(
    jobIds?: string[],
    options: { forceUpdate?: boolean } = {}
  ): Promise<WorksetSaveResponse> {
    const ids = jobIds?.length ? jobIds : todayWorkset.value.map(job => job.jobId);
    const responses: WorksetSaveResponse[] = [];
    for (let index = 0; index < ids.length; index += WORKSET_SAVE_CHUNK_SIZE) {
      const chunk = ids.slice(index, index + WORKSET_SAVE_CHUNK_SIZE);
      const response = await request.post<WorksetSaveResponse>(
        '/v2/generate/workset/save',
        {
          jobIds: chunk,
          forceUpdate: options.forceUpdate === true,
        },
        WORKSET_SAVE_REQUEST
      );
      responses.push(response);
    }
    await fetchTodayWorkset();
    return mergeWorksetSaveResponses(responses);
  }

  async function setUserReviewScore(
    jobId: string,
    score: number
  ): Promise<UserReviewScoreResponse> {
    return request.post<UserReviewScoreResponse>(
      `/v2/generate/queue/history/${encodeURIComponent(jobId)}/user-review-score`,
      { score },
      LOCAL_QUEUE_REQUEST
    );
  }

  async function improveTodayWorkset(jobIds: string[]): Promise<WorksetImproveResponse> {
    const response = await request.post<WorksetImproveResponse>(
      '/v2/generate/workset/improve',
      { jobIds },
      LOCAL_QUEUE_REQUEST
    );
    await fetchQueueOverview();
    await fetchTodayWorkset();
    return response;
  }

  async function queueCancelAll(): Promise<void> {
    await request.post('/v2/generate/queue/cancel-all', undefined, LOCAL_QUEUE_REQUEST);
    await fetchQueueOverview();
  }

  async function queuePauseAll(): Promise<void> {
    await request.post('/v2/generate/queue/pause-all', undefined, LOCAL_QUEUE_REQUEST);
    for (const job of Object.values(jobs)) {
      if (job.status === 'queued' || job.status === 'running') {
        job.status = 'paused';
        const runningStep = job.steps.find(step => step.status === 'running');
        if (runningStep) {
          runningStep.status = 'pending';
          runningStep.summary = 'Paused';
        }
      }
    }

    await fetchQueueOverview();
  }

  async function queueResumeAll(): Promise<void> {
    const pausedIds = queueOverview.value
      .filter(item => item.status === 'paused')
      .map(item => item.jobId);
    await request.post('/v2/generate/queue/resume-all', undefined, LOCAL_QUEUE_REQUEST);
    await fetchQueueOverview();
    for (const jobId of pausedIds) {
      const overviewItem = queueOverview.value.find(item => item.jobId === jobId);
      if (!overviewItem) continue;
      const job = ensureJobFromOverview(overviewItem);
      job.status = overviewItem.status === 'queued' ? 'queued' : 'running';
      syncRunningEventSourcesFromOverview();
    }
  }

  onUnmounted(() => {
    if (overviewDebounceTimer) clearTimeout(overviewDebounceTimer);
    for (const source of eventSources.values()) {
      source.close();
    }
    eventSources.clear();
  });

  return {
    jobs,
    currentJob,
    selectedJobId,
    isRunning,
    isComplete,
    startGeneration,
    startBatchGeneration,
    cancelGeneration,
    pauseGeneration,
    resumeActiveGeneration,
    resumeGeneration,
    fixGeneration,
    subscribeToJob,
    unsubscribeJob,
    selectJob,
    queueOverview,
    fetchQueueOverview,
    queueHistory,
    queueHistoryTotal,
    queueHistoryPage,
    queueHistoryPageSize,
    queueHistoryStatus,
    queueHistoryQuery,
    queueHistoryLoading,
    fetchQueueHistory,
    loadHistoryJob,
    deleteHistoryJob,
    clearQueueHistory,
    todayWorkset,
    todayWorksetTotal,
    fetchTodayWorkset,
    saveTodayWorkset,
    setUserReviewScore,
    improveTodayWorkset,
    queueCancelAll,
    queuePauseAll,
    queueResumeAll,
  };
}
