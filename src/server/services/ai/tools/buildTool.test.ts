import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

void describe('buildTool', () => {
  void it('passes caller aborts into the tool execution signal', async () => {
    const { buildTool } = require('./buildTool') as typeof import('./buildTool');
    const controller = new AbortController();
    let capturedSignal: AbortSignal | undefined;

    const tool = buildTool({
      id: 'abortable_tool',
      description: 'Abortable test tool',
      inputSchema: { type: 'object' },
      timeoutMs: 30_000,
      maxRetries: 0,
      execute: async (_input: Record<string, never>, signal: AbortSignal) => {
        capturedSignal = signal;
        await new Promise<void>(resolve => {
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
        return { aborted: signal.aborted };
      },
    });

    const resultPromise = tool.run({}, controller.signal);
    await new Promise(resolve => setTimeout(resolve, 0));
    controller.abort();
    const result = await resultPromise;

    assert.equal(capturedSignal?.aborted, true);
    assert.deepEqual(result, { success: true, data: { aborted: true } });
  });
});
