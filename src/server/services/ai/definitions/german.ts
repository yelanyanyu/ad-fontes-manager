import type { PipelineDefinition } from '../types';

const { parseResearchOutput } = require('../agents/research') as {
  parseResearchOutput: (text: string) => Record<string, unknown>;
};
const { parseEnrichmentOutput } = require('../agents/enrichment') as {
  parseEnrichmentOutput: (text: string) => Record<string, unknown>;
};
const { parseReviewOutput } = require('../agents/reviewer') as {
  parseReviewOutput: (text: string) => Record<string, unknown>;
};

export const germanPipeline: PipelineDefinition = {
  id: 'single-word-de-v2',
  language: 'de',
  stages: [
    {
      id: 'searching',
      description: 'Searching',
      type: 'llm',
      policy: {
        execution: {
          kind: 'llm',
          timeoutMs: 240_000,
          tools: {
            names: ['search_etymology', 'fetch_page'],
            maxRounds: 3,
            requiresSearchApiKey: true,
            fallbackOnFailureToolName: 'search_etymology',
          },
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
      modelKey: 'fast',
      systemPromptFile: 'de-structural.md',
      toolNames: ['search_etymology', 'fetch_page'],
      outputParser: parseResearchOutput,
    },
    {
      id: 'pondering',
      description: 'Pondering',
      type: 'llm',
      policy: {
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
      },
      modelKey: 'expert',
      systemPromptFile: 'de-creative.md',
      outputParser: parseEnrichmentOutput,
    },
    {
      id: 'auditing',
      description: 'Auditing',
      type: 'llm',
      policy: {
        execution: { kind: 'llm', timeoutMs: 600_000, maxOutputTokens: 377_216 },
        output: { kind: 'scores' },
        assembly: { kind: 'none' },
        stopLoss: { kind: 'none' },
      },
      modelKey: 'expert',
      systemPromptFile: 'content-reviewer.md',
      promptInputAugmenters: ['aiFlavorMarkerReport'],
      outputParser: parseReviewOutput,
    },
  ],
};

module.exports = { germanPipeline };
