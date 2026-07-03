import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { StagePolicyEngine } from './StagePolicyEngine';
import type { NormalizedPipelineStage } from './PipelineDefinitionNormalizer';
import type { PipelineContext, PipelineProgressEvent } from './types';

const baseContext = (): PipelineContext => ({
  word: 'test',
  context: '',
  language: 'en',
  notes: '',
});

void describe('StagePolicyEngine', () => {
  void it('runs one Stage and writes parsed output into context', async () => {
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
    assert.equal(ctx.researchYaml, 'yield:\n  lemma: test\n');
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
    assert.equal(ctx.creativeYaml, 'application:\n  selected_examples: []\n');
    assert.match(ctx.fullYaml || '', /lemma: test/);
    assert.match(ctx.fullYaml || '', /selected_examples/);
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

    assert.deepEqual(events.map(event => event.type), ['step:diagnostic', 'step:complete']);
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
});
