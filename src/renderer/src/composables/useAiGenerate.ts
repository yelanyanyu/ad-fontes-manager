import { computed, onUnmounted, ref, type InjectionKey } from 'vue';
import request from '@/utils/request';

export interface StepState {
  step: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  message?: string;
  duration?: number;
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
}

export interface GenerateParams {
  word: string;
  context?: string;
  language: 'en' | 'de';
  notes?: string;
}

interface GenerateResponse {
  jobId: string;
  queued?: boolean;
  position?: number;
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
  error?: string;
}

export type QueueHistoryStatus = 'complete' | 'partial' | 'error';

export interface QueueHistoryJob extends QueueJobOverview {
  completedAt?: string;
  hasResult: boolean;
}

interface QueueHistoryResponse {
  jobs: QueueHistoryJob[];
  total: number;
  page: number;
  pageSize: number;
}

export type AiGenerateState = ReturnType<typeof useAiGenerate>;

export const AI_STATE_KEY: InjectionKey<AiGenerateState> = Symbol('ai-state');

export function useAiGenerate() {
  const jobs = ref<Map<string, JobState>>(new Map());
  const selectedJobId = ref<string | null>(null);
  const eventSources = new Map<string, EventSource>();
  const queueOverview = ref<QueueJobOverview[]>([]);
  const queueHistory = ref<QueueHistoryJob[]>([]);
  const queueHistoryTotal = ref(0);
  const queueHistoryPage = ref(1);
  const queueHistoryPageSize = ref(20);
  const queueHistoryStatus = ref<QueueHistoryStatus | undefined>();
  const queueHistoryQuery = ref('');

  const currentJob = computed(() => {
    if (!selectedJobId.value) return null;
    return jobs.value.get(selectedJobId.value) || null;
  });
  const isRunning = computed(
    () => currentJob.value?.status === 'running' || currentJob.value?.status === 'queued'
  );
  const isComplete = computed(
    () => currentJob.value?.status === 'complete' || currentJob.value?.status === 'partial'
  );

  function touchJobs(): void {
    jobs.value = new Map(jobs.value);
  }

  function registerJob(jobId: string, params: GenerateParams, response: GenerateResponse): void {
    jobs.value.set(jobId, {
      jobId,
      word: params.word,
      language: params.language,
      context: params.context,
      notes: params.notes,
      status: response.queued ? 'queued' : 'running',
      queuePosition: response.position,
      steps: [],
    });
    selectedJobId.value = jobId;
    touchJobs();
  }

  async function startGeneration(params: GenerateParams): Promise<string> {
    const response = await request.post<GenerateResponse>('/v2/generate/single', params);
    registerJob(response.jobId, params, response);
    subscribeToJob(response.jobId);
    await fetchQueueOverview();
    return response.jobId;
  }

  function ensureJobFromOverview(item: QueueJobOverview): JobState {
    const existing = jobs.value.get(item.jobId);
    if (existing) return existing;

    const language = item.language === 'de' ? 'de' : 'en';
    const job: JobState = {
      jobId: item.jobId,
      word: item.word,
      language,
      status:
        item.status === 'paused'
          ? 'paused'
          : item.status === 'queued'
            ? 'queued'
            : item.status === 'error'
              ? 'error'
              : 'running',
      steps: item.jobType === 'fix' ? [{ step: 'fixing', status: 'pending' }] : [],
      error: item.error,
    };
    jobs.value.set(item.jobId, job);
    touchJobs();
    return job;
  }

  function upsertJobFromServer(
    job: JobState & {
      jobType?: string;
      result?: { yaml: string; scores: Record<string, unknown> };
    }
  ): JobState {
    const language = job.language === 'de' ? 'de' : 'en';
    const existing = jobs.value.get(job.jobId);
    const next: JobState = {
      ...(existing || {
        steps: job.jobType === 'fix' ? [{ step: 'fixing', status: 'pending' as const }] : [],
      }),
      steps: job.steps?.length
        ? job.steps
        : existing?.steps || (job.jobType === 'fix' ? [{ step: 'fixing', status: 'pending' }] : []),
      jobId: job.jobId,
      word: job.word,
      language,
      context: job.context,
      notes: job.notes,
      status: job.status,
      error: job.error,
      yaml: job.yaml || job.result?.yaml,
      scores: job.scores || job.result?.scores,
    };
    jobs.value.set(job.jobId, next);
    touchJobs();
    return next;
  }

  function subscribeToJob(jobId: string): void {
    eventSources.get(jobId)?.close();
    const es = new EventSource(`/api/v2/generate/${jobId}/stream`);
    eventSources.set(jobId, es);

    es.addEventListener('job:queued', event => {
      const data = JSON.parse(event.data) as { position: number };
      const job = jobs.value.get(jobId);
      if (!job) return;
      job.status = 'queued';
      job.queuePosition = data.position;
      touchJobs();
      void fetchQueueOverview();
    });

    es.addEventListener('job:started', () => {
      const job = jobs.value.get(jobId);
      if (!job) return;
      job.status = 'running';
      job.queuePosition = undefined;
      touchJobs();
      void fetchQueueOverview();
    });

    es.addEventListener('job:paused', event => {
      const data = JSON.parse(event.data) as { step?: string };
      const job = jobs.value.get(jobId);
      if (!job) return;
      job.status = 'paused';
      job.queuePosition = undefined;
      job.currentStep = data.step;
      const runningStep = job.steps.find(step => step.status === 'running');
      if (runningStep) {
        runningStep.status = 'pending';
        runningStep.summary = 'Paused';
      }
      touchJobs();
      void fetchQueueOverview();
    });

    es.addEventListener('step:start', event => {
      const data = JSON.parse(event.data) as { step: string; message: string };
      const job = jobs.value.get(jobId);
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
      touchJobs();
    });

    es.addEventListener('step:tokens', event => {
      const data = JSON.parse(event.data) as { step: string; chunk: string };
      const job = jobs.value.get(jobId);
      if (!job) return;
      const step = job.steps.find(item => item.step === data.step && item.status === 'running');
      if (step) {
        step.tokens = (step.tokens || '') + data.chunk;
      }
      touchJobs();
    });

    es.addEventListener('step:reasoning', event => {
      const data = JSON.parse(event.data) as { step: string; chunk: string };
      const job = jobs.value.get(jobId);
      if (!job) return;
      const step = job.steps.find(item => item.step === data.step && item.status === 'running');
      if (step) {
        step.reasoningText = (step.reasoningText || '') + data.chunk;
      }
      touchJobs();
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
      const job = jobs.value.get(jobId);
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
      touchJobs();
    });

    es.addEventListener('step:tool-call', event => {
      const data = JSON.parse(event.data) as {
        step: string;
        toolCallId: string;
        toolName: string;
        input?: unknown;
        startTime: number;
      };
      const job = jobs.value.get(jobId);
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
      touchJobs();
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
      const job = jobs.value.get(jobId);
      if (!job) return;
      const step = job.steps.find(item => item.step === data.step && item.status === 'running');
      const toolCall = step?.toolCalls?.find(item => item.toolCallId === data.toolCallId);
      if (!toolCall) return;
      toolCall.status = data.error ? 'error' : 'complete';
      toolCall.output = data.output;
      toolCall.error = data.error;
      toolCall.warning = data.warning;
      toolCall.duration = data.duration;
      touchJobs();
    });

    es.addEventListener('step:error', event => {
      const data = JSON.parse(event.data) as { step: string; error: string; willRetry?: boolean };
      const job = jobs.value.get(jobId);
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
      es.close();
      eventSources.delete(jobId);
      touchJobs();
      void fetchQueueOverview();
    });

    es.addEventListener('pipeline:complete', event => {
      const data = JSON.parse(event.data) as { yaml: string; scores: Record<string, unknown> };
      const job = jobs.value.get(jobId);
      if (!job) return;
      if (job.status === 'paused') return;
      job.status = 'complete';
      job.currentStep = undefined;
      job.yaml = data.yaml;
      job.scores = data.scores;
      const revisionNotes = data.scores?.revision_notes as string | undefined;
      if (!revisionNotes || revisionNotes === '无需修改。') {
        es.close();
        eventSources.delete(jobId);
      }
      touchJobs();
      void fetchQueueOverview();
    });

    es.addEventListener('pipeline:stopped', event => {
      const data = JSON.parse(event.data) as {
        yaml: string;
        stoppedAtStage: string;
        reason: string;
      };
      const job = jobs.value.get(jobId);
      if (!job) return;
      if (job.status === 'paused') return;
      job.status = 'partial';
      job.currentStep = undefined;
      job.yaml = data.yaml;
      job.scores = {};
      es.close();
      eventSources.delete(jobId);
      touchJobs();
      void fetchQueueOverview();
    });

    es.onerror = () => {
      const job = jobs.value.get(jobId);
      if (!job || job.status === 'complete' || job.status === 'partial' || job.status === 'error') {
        es.close();
        eventSources.delete(jobId);
      } else if (job.status === 'paused') {
        es.close();
        eventSources.delete(jobId);
      }
    };
  }

  async function resumeGeneration(
    jobId: string,
    fromStage?: ResumeStage,
    notes?: string,
    userScore?: number
  ): Promise<void> {
    eventSources.get(jobId)?.close();
    const oldJob = jobs.value.get(jobId);
    const body: Record<string, unknown> = {};
    if (fromStage) body.fromStage = fromStage;
    if (notes !== undefined) body.notes = notes;
    if (userScore !== undefined) body.userScore = userScore;
    const response = await request.post<GenerateResponse>(`/v2/generate/${jobId}/resume`, body);
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
      const newJob = jobs.value.get(response.jobId);
      if (newJob) {
        newJob.error = undefined;
        newJob.steps = previousSteps.map(step => ({ ...step }));
        touchJobs();
      }
    }
    subscribeToJob(response.jobId);
    await fetchQueueOverview();
  }

  async function cancelGeneration(jobId: string): Promise<void> {
    await request.post(`/v2/generate/${jobId}/cancel`);
    const job = jobs.value.get(jobId);
    if (job) {
      job.status = 'error';
      job.error = 'User cancelled';
      touchJobs();
    }
    await fetchQueueOverview();
  }

  async function fixGeneration(jobId: string): Promise<string> {
    const job = jobs.value.get(jobId);
    const response = await request.post<GenerateResponse>(`/v2/generate/${jobId}/fix`);
    if (job) {
      const previousSteps = job.steps
        .filter(step => step.status === 'complete')
        .map(step => ({ ...step }));
      registerJob(
        response.jobId,
        {
          word: job.word,
          context: job.context,
          language: job.language,
          notes: (job.scores?.revision_notes as string | undefined) || job.notes,
        },
        response
      );
      const newJob = jobs.value.get(response.jobId);
      if (newJob) {
        newJob.steps = [...previousSteps, { step: 'fixing', status: 'pending' }];
      }
      touchJobs();
      subscribeToJob(response.jobId);
      await fetchQueueOverview();
    }
    return response.jobId;
  }

  function unsubscribeJob(jobId: string): void {
    eventSources.get(jobId)?.close();
    eventSources.delete(jobId);
  }

  function selectJob(jobId: string | null): void {
    if (jobId && !jobs.value.has(jobId)) {
      const overviewItem = queueOverview.value.find(item => item.jobId === jobId);
      if (overviewItem) {
        ensureJobFromOverview(overviewItem);
        if (
          overviewItem.status === 'queued' ||
          overviewItem.status === 'running' ||
          overviewItem.status === 'paused'
        ) {
          subscribeToJob(jobId);
        }
      }
    }
    selectedJobId.value = jobId;
  }

  // ---- Queue overview ----

  async function fetchQueueOverview(): Promise<void> {
    try {
      const res = await request.get<{ jobs: typeof queueOverview.value }>(
        '/v2/generate/queue/overview'
      );
      queueOverview.value = res.jobs;
    } catch {
      // Non-critical.
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
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (status) params.set('status', status);
    if (query.trim()) params.set('query', query.trim());

    const res = await request.get<QueueHistoryResponse>(
      `/v2/generate/queue/history?${params.toString()}`
    );
    queueHistory.value = res.jobs;
    queueHistoryTotal.value = res.total;
    queueHistoryPage.value = res.page;
    queueHistoryPageSize.value = res.pageSize;
    queueHistoryStatus.value = status;
    queueHistoryQuery.value = query;
  }

  async function loadHistoryJob(jobId: string): Promise<JobState | null> {
    const res = await request.get<{
      job: JobState & {
        jobType?: string;
        result?: { yaml: string; scores: Record<string, unknown> };
      };
    }>(`/v2/generate/queue/history/${jobId}`);
    return upsertJobFromServer(res.job);
  }

  async function deleteHistoryJob(jobId: string): Promise<void> {
    await request.delete(`/v2/generate/queue/history/${jobId}`);
    jobs.value.delete(jobId);
    if (selectedJobId.value === jobId) selectedJobId.value = null;
    touchJobs();
    await fetchQueueHistory();
  }

  async function clearQueueHistory(): Promise<number> {
    const res = await request.post<{ deleted: number }>('/v2/generate/queue/history/clear', {
      status: queueHistoryStatus.value,
      query: queueHistoryQuery.value.trim() || undefined,
    });
    for (const job of queueHistory.value) {
      jobs.value.delete(job.jobId);
    }
    if (selectedJobId.value && !jobs.value.has(selectedJobId.value)) {
      selectedJobId.value = null;
    }
    touchJobs();
    await fetchQueueHistory({ page: 1 });
    return res.deleted;
  }

  async function queueCancelAll(): Promise<void> {
    await request.post('/v2/generate/queue/cancel-all');
    await fetchQueueOverview();
  }

  async function queuePauseAll(): Promise<void> {
    await request.post('/v2/generate/queue/pause-all');
    for (const job of jobs.value.values()) {
      if (job.status === 'queued' || job.status === 'running') {
        job.status = 'paused';
        const runningStep = job.steps.find(step => step.status === 'running');
        if (runningStep) {
          runningStep.status = 'pending';
          runningStep.summary = 'Paused';
        }
      }
    }
    touchJobs();
    await fetchQueueOverview();
  }

  async function queueResumeAll(): Promise<void> {
    const pausedIds = queueOverview.value
      .filter(item => item.status === 'paused')
      .map(item => item.jobId);
    await request.post('/v2/generate/queue/resume-all');
    await fetchQueueOverview();
    for (const jobId of pausedIds) {
      const overviewItem = queueOverview.value.find(item => item.jobId === jobId);
      if (!overviewItem) continue;
      const job = ensureJobFromOverview(overviewItem);
      job.status = overviewItem.status === 'queued' ? 'queued' : 'running';
      touchJobs();
      if (overviewItem.status === 'queued' || overviewItem.status === 'running') {
        subscribeToJob(jobId);
      }
    }
  }

  onUnmounted(() => {
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
    cancelGeneration,
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
    fetchQueueHistory,
    loadHistoryJob,
    deleteHistoryJob,
    clearQueueHistory,
    queueCancelAll,
    queuePauseAll,
    queueResumeAll,
  };
}
