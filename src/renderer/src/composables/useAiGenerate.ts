import { computed, onUnmounted, ref } from 'vue';
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
  status: 'queued' | 'running' | 'complete' | 'partial' | 'error';
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

export function useAiGenerate() {
  const jobs = ref<Map<string, JobState>>(new Map());
  const selectedJobId = ref<string | null>(null);
  const eventSources = new Map<string, EventSource>();

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
    return response.jobId;
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
    });

    es.addEventListener('job:started', () => {
      const job = jobs.value.get(jobId);
      if (!job) return;
      job.status = 'running';
      job.queuePosition = undefined;
      touchJobs();
    });

    es.addEventListener('step:start', event => {
      const data = JSON.parse(event.data) as { step: string; message: string };
      const job = jobs.value.get(jobId);
      if (!job) return;
      if (!job.steps.some(step => step.step === data.step && step.status === 'running')) {
        job.steps.push({ step: data.step, status: 'running', message: data.message });
      }
      job.currentStep = data.step;
      job.status = 'running';
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
      const step = job.steps.find(item => item.step === data.step && item.status === 'running');
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
    });

    es.addEventListener('pipeline:complete', event => {
      const data = JSON.parse(event.data) as { yaml: string; scores: Record<string, unknown> };
      const job = jobs.value.get(jobId);
      if (!job) return;
      job.status = 'complete';
      job.currentStep = undefined;
      job.yaml = data.yaml;
      job.scores = data.scores;
      es.close();
      eventSources.delete(jobId);
      touchJobs();
    });

    es.addEventListener('pipeline:stopped', event => {
      const data = JSON.parse(event.data) as {
        yaml: string;
        stoppedAtStage: string;
        reason: string;
      };
      const job = jobs.value.get(jobId);
      if (!job) return;
      job.status = 'partial';
      job.currentStep = undefined;
      job.yaml = data.yaml;
      job.scores = {};
      es.close();
      eventSources.delete(jobId);
      touchJobs();
    });

    es.onerror = () => {
      const job = jobs.value.get(jobId);
      if (!job || job.status === 'complete' || job.status === 'error') {
        es.close();
        eventSources.delete(jobId);
      }
    };
  }

  async function resumeGeneration(jobId: string, fromStage?: ResumeStage): Promise<void> {
    eventSources.get(jobId)?.close();
    const response = await request.post<{ jobId: string }>(
      `/v2/generate/${jobId}/resume`,
      fromStage ? { fromStage } : {}
    );
    const job = jobs.value.get(response.jobId);
    if (job) {
      job.status = 'running';
      job.error = undefined;
      touchJobs();
    }
    subscribeToJob(response.jobId);
  }

  async function cancelGeneration(jobId: string): Promise<void> {
    await request.post(`/v2/generate/${jobId}/cancel`);
    const job = jobs.value.get(jobId);
    if (job) {
      job.status = 'error';
      job.error = 'User cancelled';
      touchJobs();
    }
  }

  function unsubscribeJob(jobId: string): void {
    eventSources.get(jobId)?.close();
    eventSources.delete(jobId);
  }

  function selectJob(jobId: string | null): void {
    selectedJobId.value = jobId;
  }

  onUnmounted(() => {
    for (const es of eventSources.values()) {
      es.close();
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
    subscribeToJob,
    unsubscribeJob,
    selectJob,
  };
}
