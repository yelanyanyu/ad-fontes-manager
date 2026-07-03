import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { StagePolicyEngine } from './StagePolicyEngine';
import type { NormalizedPipelineStage } from './PipelineDefinitionNormalizer';
import type { PipelineContext, PipelineProgressEvent } from '../types';

const baseContext = (): PipelineContext => ({
  word: 'test',
  context: '',
  language: 'en',
  notes: '',
});

void describe('StagePolicyEngine', () => {
  void it('runs one Stage and returns parsed output as a context patch', async () => {
    const stage: NormalizedPipelineStage = {
      id: 'draft',
      description: 'Draft',
      type: 'llm',
      policy: {
        execution: { kind: 'llm' },
        output: { kind: 'yaml-fragment', contextKey: 'researchYaml' },
        assembly: { kind: 'none' },
        stopLoss: { kind: 'none' },
      },
    };
    const ctx = baseContext();

    const outcome = await new StagePolicyEngine({
      runStageText: async () => ({
        text: 'yield:\n  lemma: test\n',
        diagnostics: { textChars: 21 },
        toolEvidence: [],
      }),
    }).executeStage({ stage, ctx, prompt: { system: 'system', user: 'user' } });

    assert.equal(outcome.status, 'complete');
    assert.equal(ctx.researchYaml, undefined);
    assert.deepEqual(outcome.contextPatch, { researchYaml: 'yield:\n  lemma: test\n' });
    assert.equal(outcome.rawText, 'yield:\n  lemma: test\n');
  });

  void it('merges research and creative YAML when the Stage asks for assembly', async () => {
    const stage: NormalizedPipelineStage = {
      id: 'creative',
      description: 'Creative',
      type: 'llm',
      policy: {
        execution: { kind: 'llm' },
        output: { kind: 'yaml-fragment', contextKey: 'creativeYaml' },
        assembly: {
          kind: 'merge-yaml',
          sourceKeys: ['researchYaml', 'creativeYaml'],
          targetKey: 'fullYaml',
        },
        stopLoss: { kind: 'none' },
      },
    };
    const ctx = {
      ...baseContext(),
      researchYaml: 'yield:\n  lemma: test\n',
    };

    const outcome = await new StagePolicyEngine({
      runStageText: async () => ({
        text: 'application:\n  selected_examples: []\n',
        diagnostics: { textChars: 37 },
        toolEvidence: [],
      }),
    }).executeStage({ stage, ctx, prompt: { system: 'system', user: 'user' } });

    assert.equal(outcome.status, 'complete');
    assert.equal(ctx.creativeYaml, undefined);
    assert.equal(ctx.fullYaml, undefined);
    assert.equal(outcome.contextPatch.creativeYaml, 'application:\n  selected_examples: []\n');
    assert.match(outcome.contextPatch.fullYaml || '', /lemma: test/);
    assert.match(outcome.contextPatch.fullYaml || '', /selected_examples/);
  });

  void it('keeps a usable YAML when merge assembly cannot parse creative output', async () => {
    const stage: NormalizedPipelineStage = {
      id: 'creative',
      description: 'Creative',
      type: 'llm',
      policy: {
        execution: { kind: 'llm' },
        output: { kind: 'yaml-fragment', contextKey: 'creativeYaml' },
        assembly: {
          kind: 'merge-yaml',
          sourceKeys: ['researchYaml', 'creativeYaml'],
          targetKey: 'fullYaml',
        },
        stopLoss: { kind: 'none' },
      },
    };
    const ctx = {
      ...baseContext(),
      researchYaml: 'yield:\n  lemma: test\n',
    };

    const outcome = await new StagePolicyEngine({
      runStageText: async () => ({
        text: 'application:\n  selected_examples: [\n',
        diagnostics: { textChars: 35 },
        toolEvidence: [],
      }),
    }).executeStage({ stage, ctx, prompt: { system: 'system', user: 'user' } });

    assert.equal(outcome.status, 'complete');
    assert.match(outcome.contextPatch.fullYaml || '', /lemma: test/);
    assert.match(outcome.contextPatch.fullYaml || '', /selected_examples/);
  });

  void it('stops when required Stage output is empty', async () => {
    const stage: NormalizedPipelineStage = {
      id: 'research',
      description: 'Research',
      type: 'llm',
      policy: {
        execution: { kind: 'llm' },
        output: { kind: 'yaml-fragment', contextKey: 'researchYaml' },
        assembly: { kind: 'none' },
        stopLoss: {
          kind: 'require-text-and-context',
          contextKey: 'researchYaml',
          partialResultKey: 'researchYaml',
        },
      },
    };
    const ctx = baseContext();

    const outcome = await new StagePolicyEngine({
      runStageText: async () => ({
        text: '',
        diagnostics: { textChars: 0 },
        toolEvidence: [],
      }),
    }).executeStage({ stage, ctx, prompt: { system: 'system', user: 'user' } });

    assert.equal(outcome.status, 'stopped');
    assert.equal(outcome.stoppedAtStage, 'research');
    assert.match(outcome.reason, /required researchYaml is empty/);
    assert.equal(outcome.yaml, '');
  });

  void it('emits diagnostic and complete events for a completed Stage', async () => {
    const stage: NormalizedPipelineStage = {
      id: 'draft',
      description: 'Draft',
      type: 'llm',
      policy: {
        execution: { kind: 'llm' },
        output: { kind: 'yaml-fragment', contextKey: 'researchYaml' },
        assembly: { kind: 'none' },
        stopLoss: { kind: 'none' },
      },
    };
    const ctx = baseContext();
    const events: PipelineProgressEvent[] = [];

    await new StagePolicyEngine({
      runStageText: async () => ({
        text: 'yield:\n  lemma: test\n',
        diagnostics: { textChars: 21 },
        toolEvidence: [],
      }),
      emit: event => events.push(event),
    }).executeStage({ stage, ctx, prompt: { system: 'system', user: 'user' } });

    assert.deepEqual(
      events.map(event => event.type),
      ['step:diagnostic', 'step:complete']
    );
    assert.deepEqual(events[0], {
      type: 'step:diagnostic',
      step: 'draft',
      diagnostics: { textChars: 21 },
    });
    assert.equal(events[1].type, 'step:complete');
    if (events[1].type === 'step:complete') {
      assert.equal(events[1].step, 'draft');
      assert.equal(events[1].summary, 'Draft 完成');
      assert.deepEqual(events[1].result, { researchYaml: 'yield:\n  lemma: test\n' });
      assert.equal(events[1].rawText, 'yield:\n  lemma: test\n');
      assert.deepEqual(events[1].diagnostics, { textChars: 21 });
    }
  });

  void it('emits a complete event when Stop-loss stops a Stage', async () => {
    const stage: NormalizedPipelineStage = {
      id: 'research',
      description: 'Research',
      type: 'llm',
      policy: {
        execution: { kind: 'llm' },
        output: { kind: 'yaml-fragment', contextKey: 'researchYaml' },
        assembly: { kind: 'none' },
        stopLoss: {
          kind: 'require-text-and-context',
          contextKey: 'researchYaml',
          partialResultKey: 'researchYaml',
        },
      },
    };
    const ctx = baseContext();
    const events: PipelineProgressEvent[] = [];

    await new StagePolicyEngine({
      runStageText: async () => ({
        text: '',
        diagnostics: { textChars: 0 },
      }),
      emit: event => events.push(event),
    }).executeStage({ stage, ctx, prompt: { system: 'system', user: 'user' } });

    assert.deepEqual(
      events.map(event => event.type),
      ['step:diagnostic', 'step:complete']
    );
    assert.equal(events[1].type, 'step:complete');
    if (events[1].type === 'step:complete') {
      assert.equal(events[1].step, 'research');
      assert.match(events[1].summary, /Stopped: research/);
      assert.deepEqual(events[1].result, { researchYaml: '' });
      assert.equal(events[1].rawText, '');
    }
  });

  void it('emits token and reasoning events from Stage text callbacks', async () => {
    const stage: NormalizedPipelineStage = {
      id: 'draft',
      description: 'Draft',
      type: 'llm',
      policy: {
        execution: { kind: 'llm' },
        output: { kind: 'yaml-fragment', contextKey: 'researchYaml' },
        assembly: { kind: 'none' },
        stopLoss: { kind: 'none' },
      },
    };
    const ctx = baseContext();
    const events: PipelineProgressEvent[] = [];

    await new StagePolicyEngine({
      runStageText: async params => {
        params.onChunk('visible ');
        params.onReasoning('thinking ');
        return {
          text: 'yield:\n  lemma: test\n',
          reasoningText: 'thinking ',
        };
      },
      emit: event => events.push(event),
    }).executeStage({ stage, ctx, prompt: { system: 'system', user: 'user' } });

    assert.deepEqual(
      events.slice(0, 2).map(event => event.type),
      ['step:tokens', 'step:reasoning']
    );
    assert.deepEqual(events[0], { type: 'step:tokens', step: 'draft', chunk: 'visible ' });
    assert.deepEqual(events[1], { type: 'step:reasoning', step: 'draft', chunk: 'thinking ' });
  });

  void it('emits tool call and tool result events from Stage text callbacks', async () => {
    const stage: NormalizedPipelineStage = {
      id: 'research',
      description: 'Research',
      type: 'llm',
      policy: {
        execution: {
          kind: 'llm',
          tools: { names: ['search_etymology'] },
        },
        output: { kind: 'yaml-fragment', contextKey: 'researchYaml' },
        assembly: { kind: 'none' },
        stopLoss: { kind: 'none' },
      },
    };
    const ctx = baseContext();
    const events: PipelineProgressEvent[] = [];

    await new StagePolicyEngine({
      runStageText: async params => {
        params.onToolCall({
          toolCallId: 'call-1',
          toolName: 'search_etymology',
          input: { query: 'test etymology' },
          startTime: 123,
        });
        params.onToolResult({
          toolCallId: 'call-1',
          toolName: 'search_etymology',
          output: { ok: true },
          duration: 45,
        });
        return { text: 'yield:\n  lemma: test\n' };
      },
      emit: event => events.push(event),
    }).executeStage({ stage, ctx, prompt: { system: 'system', user: 'user' } });

    assert.deepEqual(
      events.slice(0, 2).map(event => event.type),
      ['step:tool-call', 'step:tool-result']
    );
    assert.deepEqual(events[0], {
      type: 'step:tool-call',
      step: 'research',
      toolCallId: 'call-1',
      toolName: 'search_etymology',
      input: { query: 'test etymology' },
      startTime: 123,
    });
    assert.deepEqual(events[1], {
      type: 'step:tool-result',
      step: 'research',
      toolCallId: 'call-1',
      toolName: 'search_etymology',
      output: { ok: true },
      duration: 45,
    });
  });

  void it('retries a stopped Stage without tools when the policy asks for it', async () => {
    const stage: NormalizedPipelineStage = {
      id: 'searching',
      description: 'Searching',
      type: 'llm',
      toolNames: ['search_etymology'],
      policy: {
        execution: {
          kind: 'llm',
          tools: { names: ['search_etymology'] },
        },
        output: { kind: 'yaml-fragment', contextKey: 'researchYaml' },
        assembly: { kind: 'none' },
        stopLoss: {
          kind: 'require-text-and-context',
          contextKey: 'researchYaml',
          partialResultKey: 'researchYaml',
          fallback: { kind: 'retry-without-tools', useToolEvidenceSummary: true },
        },
      },
    };
    const ctx = baseContext();
    const calls: Array<{ stage: NormalizedPipelineStage; ctx: PipelineContext }> = [];

    const outcome = await new StagePolicyEngine({
      assemblePrompt: (promptStage, promptCtx) => ({
        system: promptStage.toolNames?.length ? 'with tools' : 'without tools',
        user: promptCtx.searchSummary || '',
      }),
      summarizeToolEvidence: () => 'source: Middle English testen',
      runStageText: async params => {
        calls.push({ stage: params.stage, ctx: params.ctx });
        if (calls.length === 1) {
          return {
            text: '',
            diagnostics: { textChars: 0 },
            toolEvidence: [{ toolName: 'search_etymology', output: { success: true } }],
          };
        }
        return {
          text: 'yield:\n  lemma: test\n',
          diagnostics: { textChars: 21 },
          toolEvidence: [],
        };
      },
    }).executeStage({ stage, ctx, prompt: { system: 'system', user: 'user' } });

    assert.equal(outcome.status, 'complete');
    assert.equal(ctx.researchYaml, undefined);
    assert.deepEqual(outcome.contextPatch, { researchYaml: 'yield:\n  lemma: test\n' });
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].stage.toolNames, []);
    assert.equal(calls[1].stage.policy.execution.tools, undefined);
    assert.match(calls[1].ctx.searchSummary || '', /Middle English testen/);
  });

  void it('keeps the original stopped outcome when the retry without tools fails', async () => {
    const stage: NormalizedPipelineStage = {
      id: 'searching',
      description: 'Searching',
      type: 'llm',
      toolNames: ['search_etymology'],
      policy: {
        execution: {
          kind: 'llm',
          tools: { names: ['search_etymology'] },
        },
        output: { kind: 'yaml-fragment', contextKey: 'researchYaml' },
        assembly: { kind: 'none' },
        stopLoss: {
          kind: 'require-text-and-context',
          contextKey: 'researchYaml',
          partialResultKey: 'researchYaml',
          fallback: { kind: 'retry-without-tools', useToolEvidenceSummary: false },
        },
      },
    };
    const ctx = { ...baseContext(), researchYaml: 'previous yaml' };
    let calls = 0;

    const outcome = await new StagePolicyEngine({
      runStageText: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            text: '',
            diagnostics: { textChars: 0 },
          };
        }
        throw new Error('fallback failed');
      },
    }).executeStage({ stage, ctx, prompt: { system: 'system', user: 'user' } });

    assert.equal(outcome.status, 'stopped');
    assert.equal(outcome.yaml, 'previous yaml');
    assert.equal(outcome.rawText, '');
    assert.deepEqual(outcome.diagnostics, { textChars: 0 });
    assert.equal(calls, 2);
  });
});
