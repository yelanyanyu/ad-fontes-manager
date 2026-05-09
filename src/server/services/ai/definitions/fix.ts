import type { PipelineDefinition } from '../types';

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
  ],
};
