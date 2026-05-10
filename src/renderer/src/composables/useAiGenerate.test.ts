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

  it('posts the requested resume stage', async () => {
    requestPostMock.mockResolvedValueOnce({ jobId: 'job-1', queued: false });
    requestPostMock.mockResolvedValueOnce({ jobId: 'job-1' });
    const ai = useAiGenerate();

    await ai.startGeneration({ word: 'conduct', language: 'en' });
    await ai.resumeGeneration('job-1', 'pondering');

    expect(requestPostMock).toHaveBeenLastCalledWith('/v2/generate/job-1/resume', {
      fromStage: 'pondering',
    });
  });

  it('can clear the queue history status filter back to all', async () => {
    requestGetMock.mockResolvedValue({ jobs: [], total: 0, page: 1, pageSize: 20 });
    const ai = useAiGenerate();

    await ai.fetchQueueHistory({ status: 'error' });
    await ai.fetchQueueHistory({ status: null });

    expect(ai.queueHistoryStatus.value).toBeUndefined();
    expect(requestGetMock).toHaveBeenLastCalledWith(
      '/v2/generate/queue/history?page=1&pageSize=20'
    );
  });
});
