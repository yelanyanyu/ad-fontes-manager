import type { PipelineDefinition } from '../types';

const { parseReviewOutput } = require('../agents/reviewer') as {
  parseReviewOutput: (text: string) => Record<string, unknown>;
};

export const auditFixPipeline: PipelineDefinition = {
  id: 'audit-fix',
  language: '*',
  stages: [
    {
      id: 'auditing',
      description: 'Reviewing YAML fields and producing scores with revision notes',
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
    {
      id: 'fixing',
      description: 'Applying revision notes to fix low-scoring YAML fields',
      type: 'llm',
      policy: {
        execution: { kind: 'llm', timeoutMs: 1_200_000 },
        output: { kind: 'full-yaml', contextKey: 'fullYaml' },
        assembly: { kind: 'none' },
        stopLoss: { kind: 'none' },
      },
      modelKey: 'balanced',
      systemPromptFile: 'content-fixer.md',
      outputParser: (text: string) => ({ fullYaml: text }),
    },
  ],
};
