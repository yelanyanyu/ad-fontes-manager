import type { PipelineDefinition } from '../types';

const { parseReviewOutput } = require('../agents/reviewer') as {
  parseReviewOutput: (text: string) => Record<string, unknown>;
};

export const fixPipeline: PipelineDefinition = {
  id: 'fix',
  language: '*',
  stages: [
    {
      id: 'fixing',
      description: 'Applying revision notes to fix low-scoring YAML fields',
      type: 'llm',
      modelKey: 'expert',
      systemPromptFile: 'content-fixer.md',
      outputParser: (text: string) => ({ fullYaml: text }),
    },
    {
      id: 'auditing',
      description: 'Reviewing fixed YAML fields and producing updated scores',
      type: 'llm',
      modelKey: 'expert',
      systemPromptFile: 'content-reviewer.md',
      outputParser: parseReviewOutput,
    },
  ],
};
