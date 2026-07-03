import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { PipelineDefinitionNormalizer } from './PipelineDefinitionNormalizer';
import type { PipelineDefinition, StagePolicy } from './types';

void describe('PipelineDefinitionNormalizer', () => {
  void it('keeps an explicit Stage Policy unchanged', () => {
    const explicitPolicy: StagePolicy = {
      execution: { kind: 'llm', timeoutMs: 1234 },
      output: { kind: 'full-yaml', contextKey: 'fullYaml' },
      assembly: { kind: 'none' },
      stopLoss: { kind: 'none' },
    };
    const definition: PipelineDefinition = {
      id: 'explicit',
      language: 'en',
      stages: [
        {
          id: 'custom',
          description: 'Custom',
          type: 'llm',
          policy: explicitPolicy,
        },
      ],
    };

    const normalized = new PipelineDefinitionNormalizer().normalize(definition);

    assert.equal(normalized.stages[0].policy, explicitPolicy);
    assert.notEqual(normalized.stages[0], definition.stages[0]);
  });

  void it('adds the legacy searching policy when an old Stage has no policy', () => {
    const definition: PipelineDefinition = {
      id: 'legacy-search',
      language: 'en',
      stages: [
        {
          id: 'searching',
          description: 'Searching',
          type: 'llm',
          toolNames: ['search_etymology'],
        },
      ],
    };

    const normalized = new PipelineDefinitionNormalizer().normalize(definition);
    const policy = normalized.stages[0].policy;

    assert.deepEqual(policy.execution, {
      kind: 'llm',
      timeoutMs: 240_000,
      tools: {
        names: ['search_etymology'],
        maxRounds: 3,
        requiresSearchApiKey: true,
        fallbackOnFailureToolName: 'search_etymology',
      },
    });
    assert.deepEqual(policy.output, { kind: 'yaml-fragment', contextKey: 'researchYaml' });
    assert.deepEqual(policy.assembly, { kind: 'none' });
    assert.deepEqual(policy.stopLoss, {
      kind: 'require-text-and-context',
      contextKey: 'researchYaml',
      partialResultKey: 'researchYaml',
      fallback: { kind: 'retry-without-tools', useToolEvidenceSummary: true },
    });
  });

  void it('adds a simple full-yaml policy for unknown legacy Stages', () => {
    const definition: PipelineDefinition = {
      id: 'legacy-custom',
      language: 'en',
      stages: [
        {
          id: 'drafting',
          description: 'Drafting',
          type: 'llm',
        },
      ],
    };

    const normalized = new PipelineDefinitionNormalizer().normalize(definition);

    assert.deepEqual(normalized.stages[0].policy, {
      execution: { kind: 'llm', timeoutMs: 60_000 },
      output: { kind: 'full-yaml', contextKey: 'fullYaml' },
      assembly: { kind: 'none' },
      stopLoss: { kind: 'none' },
    });
  });

  void it('adds the legacy pondering policy when an old Stage has no policy', () => {
    const definition: PipelineDefinition = {
      id: 'legacy-ponder',
      language: 'en',
      stages: [
        {
          id: 'pondering',
          description: 'Pondering',
          type: 'llm',
        },
      ],
    };

    const normalized = new PipelineDefinitionNormalizer().normalize(definition);

    assert.deepEqual(normalized.stages[0].policy, {
      execution: { kind: 'llm', timeoutMs: 600_000 },
      output: { kind: 'yaml-fragment', contextKey: 'creativeYaml' },
      assembly: {
        kind: 'merge-yaml',
        sourceKeys: ['researchYaml', 'creativeYaml'],
        targetKey: 'fullYaml',
      },
      stopLoss: {
        kind: 'require-text-and-context',
        contextKey: 'creativeYaml',
        partialResultKey: 'researchYaml',
      },
    });
  });

  void it('adds the legacy auditing policy when an old Stage has no policy', () => {
    const definition: PipelineDefinition = {
      id: 'legacy-audit',
      language: 'en',
      stages: [
        {
          id: 'auditing',
          description: 'Auditing',
          type: 'llm',
        },
      ],
    };

    const normalized = new PipelineDefinitionNormalizer().normalize(definition);

    assert.deepEqual(normalized.stages[0].policy, {
      execution: {
        kind: 'llm',
        timeoutMs: 600_000,
        maxOutputTokens: 377_216,
      },
      output: { kind: 'scores' },
      assembly: { kind: 'none' },
      stopLoss: { kind: 'none' },
    });
  });

  void it('adds the legacy fixing policy when an old Stage has no policy', () => {
    const definition: PipelineDefinition = {
      id: 'legacy-fix',
      language: 'en',
      stages: [
        {
          id: 'fixing',
          description: 'Fixing',
          type: 'llm',
        },
      ],
    };

    const normalized = new PipelineDefinitionNormalizer().normalize(definition);

    assert.deepEqual(normalized.stages[0].policy, {
      execution: { kind: 'llm', timeoutMs: 1_200_000 },
      output: { kind: 'full-yaml', contextKey: 'fullYaml' },
      assembly: { kind: 'none' },
      stopLoss: { kind: 'none' },
    });
  });
});
