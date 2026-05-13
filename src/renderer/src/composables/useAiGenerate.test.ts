import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestGetMock = vi.hoisted(() => vi.fn());
const requestPostMock = vi.hoisted(() => vi.fn());

vi.mock('@/utils/request', () => ({
  default: {
    get: requestGetMock,
    post: requestPostMock,
  },
}));

class MockEventSource {
  static instances: MockEventSource[] = [];
  listeners = new Map<string, (event: MessageEvent) => void>();
  closed = false;

  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.set(type, listener);
  }

  emit(type: string, data: unknown): void {
    this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent);
  }

  close(): void {
    this.closed = true;
  }
}

describe('useAiGenerate', () => {
  let useAiGenerate: typeof import('./useAiGenerate').useAiGenerate;

  beforeEach(async () => {
    vi.resetModules();
    requestGetMock.mockReset();
    requestPostMock.mockReset();
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
    ({ useAiGenerate } = await import('./useAiGenerate'));
  });

  it('stores queued state, tool calls, and raw text from SSE events', async () => {
    requestPostMock.mockResolvedValue({ jobId: 'job-1', queued: true, position: 2 });
    const ai = useAiGenerate();

    await ai.startGeneration({ word: 'conduct', language: 'en' });
    const source = MockEventSource.instances[0];
    source.emit('job:queued', { position: 2 });
    source.emit('job:started', {});
    source.emit('step:start', { step: 'searching', message: 'Searching' });
    source.emit('step:tool-call', {
      step: 'searching',
      toolCallId: 'call-1',
      toolName: 'search_etymology',
      input: { query: 'conduct etymology' },
      startTime: 10,
    });
    source.emit('step:tool-result', {
      step: 'searching',
      toolCallId: 'call-1',
      toolName: 'search_etymology',
      output: { success: false },
      warning: 'Search API key not configured.',
      duration: 12,
    });
    source.emit('step:complete', {
      step: 'searching',
      duration: 20,
      summary: 'done',
      rawText: 'yield:\n  lemma: conduct\n',
    });

    const job = ai.currentJob.value;
    expect(job?.queuePosition).toBeUndefined();
    expect(job?.steps[0].rawText).toContain('lemma: conduct');
    expect(job?.steps[0].toolCalls?.[0]).toMatchObject({
      toolCallId: 'call-1',
      status: 'complete',
      warning: 'Search API key not configured.',
    });
  });

  it('restores completed replay steps even when no running step exists', async () => {
    const ai = useAiGenerate();

    ai.queueOverview.value = [
      {
        jobId: 'job-paused',
        jobType: 'generate',
        status: 'paused',
        word: 'crate',
        language: 'en',
        priority: 'normal',
        createdAt: '2026-05-11 10:00:00',
      },
    ];

    ai.selectJob('job-paused');
    const source = MockEventSource.instances[0];
    source.emit('job:paused', { step: 'pondering' });
    source.emit('step:complete', {
      step: 'searching',
      duration: 100,
      summary: 'Searched',
      result: { researchYaml: 'yield:\n  lemma: crate\n' },
      rawText: 'yield:\n  lemma: crate\n',
      reasoningText: 'search thinking',
    });
    source.emit('step:start', { step: 'pondering', message: 'Pondering' });
    source.emit('job:paused', { step: 'pondering' });

    expect(ai.currentJob.value?.status).toBe('paused');
    expect(ai.currentJob.value?.steps).toMatchObject([
      {
        step: 'searching',
        status: 'complete',
        result: { researchYaml: 'yield:\n  lemma: crate\n' },
        rawText: 'yield:\n  lemma: crate\n',
        reasoningText: 'search thinking',
      },
      { step: 'pondering', status: 'pending' },
    ]);
  });

  it('posts the requested resume stage', async () => {
    requestPostMock.mockResolvedValueOnce({ jobId: 'job-1', queued: false });
    requestPostMock.mockResolvedValueOnce({ jobId: 'job-1' });
    const ai = useAiGenerate();

    await ai.startGeneration({ word: 'conduct', language: 'en' });
    await ai.resumeGeneration('job-1', 'pondering');

    expect(requestPostMock).toHaveBeenLastCalledWith(
      '/v2/generate/job-1/resume',
      {
        fromStage: 'pondering',
      },
      expect.objectContaining({ skipRateLimit: true })
    );
  });

  it('registers and subscribes to jobs returned by batch generation', async () => {
    requestPostMock.mockResolvedValue({
      batchId: 'batch-1',
      jobs: [
        { jobId: 'job-a', word: 'proliferate', queued: true, position: 1 },
        { jobId: 'job-b', word: 'ameliorate', queued: true, position: 2 },
      ],
      skipped: [],
    });
    const ai = useAiGenerate();

    const response = await ai.startBatchGeneration('en', [
      { word: 'proliferate', context: 'context text' },
      { word: 'ameliorate' },
    ]);

    expect(response.batchId).toBe('batch-1');
    expect(ai.jobs['job-a']).toMatchObject({
      word: 'proliferate',
      context: 'context text',
      status: 'queued',
      queuePosition: 1,
    });
    expect(MockEventSource.instances.map(source => source.url)).toEqual([
      '/api/v2/generate/job-a/stream',
      '/api/v2/generate/job-b/stream',
    ]);
    expect(ai.currentJob.value?.jobId).toBe('job-a');
  });

  it('pauses and resumes active jobs through queue endpoints', async () => {
    requestPostMock.mockResolvedValue({});
    requestGetMock.mockResolvedValueOnce({
      jobs: [
        {
          jobId: 'job-1',
          jobType: 'generate',
          status: 'paused',
          word: 'crate',
          language: 'en',
          priority: 'normal',
          createdAt: 'now',
        },
      ],
    });
    requestGetMock.mockResolvedValueOnce({
      jobs: [
        {
          jobId: 'job-1',
          jobType: 'generate',
          status: 'queued',
          word: 'crate',
          language: 'en',
          priority: 'normal',
          createdAt: 'now',
        },
      ],
    });
    const ai = useAiGenerate();
    ai.jobs['job-1'] = {
      jobId: 'job-1',
      word: 'crate',
      language: 'en',
      status: 'running',
      steps: [{ step: 'searching', status: 'running' }],
    };

    await ai.pauseGeneration('job-1');
    expect(requestPostMock).toHaveBeenCalledWith(
      '/v2/generate/job-1/pause',
      undefined,
      expect.objectContaining({ skipRateLimit: true })
    );
    expect(ai.jobs['job-1']?.status).toBe('paused');

    await ai.resumeActiveGeneration('job-1');
    expect(requestPostMock).toHaveBeenCalledWith(
      '/v2/generate/job-1/resume-active',
      undefined,
      expect.objectContaining({ skipRateLimit: true })
    );
  });

  it('keeps completed target steps visible when starting an auto fix job', async () => {
    requestPostMock.mockResolvedValue({ jobId: 'fix-job-1', queued: false });
    const ai = useAiGenerate();

    ai.jobs['source-job'] = {
      jobId: 'source-job',
      word: 'crate',
      language: 'en',
      status: 'complete',
      steps: [
        {
          step: 'searching',
          status: 'complete',
          result: { researchYaml: 'yield:\n  lemma: crate\n' },
          rawText: 'yield:\n  lemma: crate\n',
          reasoningText: 'search thinking',
        },
        {
          step: 'auditing',
          status: 'complete',
          result: { overall_score: 5 },
          rawText: '{"overall_score":5}',
          reasoningText: 'audit thinking',
        },
      ],
      yaml: 'yield:\n  lemma: crate\n',
      scores: { revision_notes: 'Fix the weak fields.' },
    };

    await ai.fixGeneration('source-job', 'Use more concrete examples.');

    expect(requestPostMock).toHaveBeenCalledWith(
      '/v2/generate/source-job/fix',
      { notes: 'Use more concrete examples.' },
      expect.objectContaining({ skipRateLimit: true })
    );
    expect(ai.jobs['fix-job-1']?.notes).toContain('Fix the weak fields.');
    expect(ai.jobs['fix-job-1']?.notes).toContain('Use more concrete examples.');
    expect(ai.jobs['fix-job-1']?.steps).toMatchObject([
      { step: 'searching', status: 'complete', rawText: 'yield:\n  lemma: crate\n' },
      { step: 'auditing', status: 'complete', reasoningText: 'audit thinking' },
      { step: 'fixing', status: 'pending' },
    ]);
  });

  it('can clear the queue history status filter back to all', async () => {
    requestGetMock.mockResolvedValue({ jobs: [], total: 0, page: 1, pageSize: 20 });
    const ai = useAiGenerate();

    await ai.fetchQueueHistory({ status: 'error' });
    await ai.fetchQueueHistory({ status: null });

    expect(ai.queueHistoryStatus.value).toBeUndefined();
    expect(requestGetMock).toHaveBeenLastCalledWith(
      '/v2/generate/queue/history?page=1&pageSize=20',
      expect.objectContaining({ skipRateLimit: true })
    );
  });

  it('updates queue history filters immediately and ignores stale responses', async () => {
    const completeResponse = {
      jobs: [
        {
          jobId: 'complete-job',
          jobType: 'generate',
          status: 'complete',
          word: 'crate',
          language: 'en',
          priority: 'normal',
          createdAt: '2026-05-12 10:00:00',
          hasResult: true,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    };
    const errorResponse = {
      jobs: [
        {
          jobId: 'error-job',
          jobType: 'generate',
          status: 'error',
          word: 'suffer',
          language: 'en',
          priority: 'normal',
          createdAt: '2026-05-12 10:01:00',
          hasResult: false,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    };
    let resolveComplete!: (value: typeof completeResponse) => void;
    let resolveError!: (value: typeof errorResponse) => void;
    requestGetMock
      .mockReturnValueOnce(
        new Promise<typeof completeResponse>(resolve => {
          resolveComplete = resolve;
        })
      )
      .mockReturnValueOnce(
        new Promise<typeof errorResponse>(resolve => {
          resolveError = resolve;
        })
      );
    const ai = useAiGenerate();

    const firstRequest = ai.fetchQueueHistory({ page: 1, status: 'complete' });
    expect(ai.queueHistoryStatus.value).toBe('complete');
    expect(ai.queueHistoryLoading.value).toBe(true);

    const secondRequest = ai.fetchQueueHistory({ page: 1, status: 'error' });
    expect(ai.queueHistoryStatus.value).toBe('error');

    resolveComplete(completeResponse);
    await firstRequest;

    expect(ai.queueHistoryStatus.value).toBe('error');
    expect(ai.queueHistory.value).toEqual([]);
    expect(ai.queueHistoryLoading.value).toBe(true);

    resolveError(errorResponse);
    await secondRequest;

    expect(ai.queueHistoryStatus.value).toBe('error');
    expect(ai.queueHistory.value[0]?.jobId).toBe('error-job');
    expect(ai.queueHistoryLoading.value).toBe(false);
  });

  it('loads and saves today workset job results', async () => {
    requestGetMock.mockResolvedValueOnce({
      jobs: [
        {
          jobId: 'job-latest',
          jobType: 'fix',
          status: 'complete',
          word: 'crate',
          language: 'en',
          priority: 'high',
          createdAt: '2026-05-12 10:00:00',
          completedAt: '2026-05-12 10:03:00',
          hasResult: true,
          finalScore: 8,
        },
      ],
      total: 1,
    });
    requestPostMock.mockResolvedValue({
      ok: true,
      saved: 1,
      conflicts: 0,
      failed: 0,
      missing: [],
      results: [],
    });
    requestGetMock.mockResolvedValueOnce({ jobs: [], total: 0 });
    const ai = useAiGenerate();

    await ai.fetchTodayWorkset();
    expect(ai.todayWorkset.value[0]?.jobId).toBe('job-latest');
    expect(ai.todayWorkset.value[0]?.finalScore).toBe(8);
    const result = await ai.saveTodayWorkset();

    expect(requestPostMock).toHaveBeenCalledWith(
      '/v2/generate/workset/save',
      {
        jobIds: ['job-latest'],
        forceUpdate: false,
      },
      expect.objectContaining({ skipRateLimit: true, timeout: 30000 })
    );
    expect(result.saved).toBe(1);
  });

  it('can explicitly force update selected workset jobs', async () => {
    requestPostMock.mockResolvedValue({
      ok: true,
      saved: 1,
      conflicts: 0,
      failed: 0,
      missing: [],
      results: [],
    });
    requestGetMock.mockResolvedValue({ jobs: [], total: 0 });
    const ai = useAiGenerate();

    await ai.saveTodayWorkset(['job-conflict'], { forceUpdate: true });

    expect(requestPostMock).toHaveBeenCalledWith(
      '/v2/generate/workset/save',
      {
        jobIds: ['job-conflict'],
        forceUpdate: true,
      },
      expect.objectContaining({ skipRateLimit: true, timeout: 30000 })
    );
  });

  it('saves today workset jobs in chunks so large batches do not sit in one request', async () => {
    const ids = Array.from({ length: 60 }, (_, index) => `job-${index + 1}`);
    requestPostMock.mockResolvedValue({
      ok: true,
      saved: 25,
      conflicts: 0,
      failed: 0,
      missing: [],
      results: [],
    });
    requestPostMock.mockResolvedValueOnce({
      ok: true,
      saved: 25,
      conflicts: 0,
      failed: 0,
      missing: [],
      results: [],
    });
    requestPostMock.mockResolvedValueOnce({
      ok: true,
      saved: 25,
      conflicts: 0,
      failed: 0,
      missing: [],
      results: [],
    });
    requestPostMock.mockResolvedValueOnce({
      ok: true,
      saved: 10,
      conflicts: 0,
      failed: 0,
      missing: [],
      results: [],
    });
    requestGetMock.mockResolvedValue({ jobs: [], total: 0 });
    const ai = useAiGenerate();

    const result = await ai.saveTodayWorkset(ids);

    expect(requestPostMock).toHaveBeenCalledTimes(3);
    expect(requestPostMock).toHaveBeenNthCalledWith(
      1,
      '/v2/generate/workset/save',
      { jobIds: ids.slice(0, 25), forceUpdate: false },
      expect.objectContaining({ skipRateLimit: true, timeout: 30000 })
    );
    expect(requestPostMock).toHaveBeenNthCalledWith(
      3,
      '/v2/generate/workset/save',
      { jobIds: ids.slice(50, 60), forceUpdate: false },
      expect.objectContaining({ skipRateLimit: true, timeout: 30000 })
    );
    expect(result.saved).toBe(60);
  });
});
