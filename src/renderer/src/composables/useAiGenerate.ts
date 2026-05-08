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
  error?: string;
}

export interface JobState {
  jobId: string;
  word: string;
  language: 'en' | 'de';
  context?: string;
  status: 'queued' | 'running' | 'complete' | 'error';
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
}

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
  const isComplete = computed(() => currentJob.value?.status === 'complete');

  function touchJobs(): void {
    jobs.value = new Map(jobs.value);
  }

  function registerJob(jobId: string, params: GenerateParams): void {
    jobs.value.set(jobId, {
      jobId,
      word: params.word,
      language: params.language,
      context: params.context,
      status: 'running',
      steps: [],
    });
    selectedJobId.value = jobId;
    touchJobs();
  }

  async function startGeneration(params: GenerateParams): Promise<string> {
    const response = await request.post<GenerateResponse>('/v2/generate/single', params);
    registerJob(response.jobId, params);
    subscribeToJob(response.jobId);
    return response.jobId;
  }

  function subscribeToJob(jobId: string): void {
    eventSources.get(jobId)?.close();
    const es = new EventSource(`/api/v2/generate/${jobId}/stream`);
    eventSources.set(jobId, es);

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

    es.addEventListener('step:complete', event => {
      const data = JSON.parse(event.data) as {
        step: string;
        duration: number;
        summary: string;
        result?: unknown;
      };
      const job = jobs.value.get(jobId);
      if (!job) return;
      const step = job.steps.find(item => item.step === data.step && item.status === 'running');
      if (step) {
        step.status = 'complete';
        step.duration = data.duration;
        step.summary = data.summary;
        step.result = data.result;
      }
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

    es.onerror = () => {
      const job = jobs.value.get(jobId);
      if (!job || job.status === 'complete' || job.status === 'error') {
        es.close();
        eventSources.delete(jobId);
      }
    };
  }

  async function resumeGeneration(jobId: string): Promise<void> {
    eventSources.get(jobId)?.close();
    const response = await request.post<{ jobId: string }>(`/v2/generate/${jobId}/resume`);
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
