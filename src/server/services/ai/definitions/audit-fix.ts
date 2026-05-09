import type { PipelineDefinition } from '../types';

export const auditFixPipeline: PipelineDefinition = {
  id: 'audit-fix',
  language: '*',
  stages: [
    {
      id: 'auditing',
      description: 'Reviewing YAML fields and producing scores with revision notes',
      type: 'llm',
      modelKey: 'expert',
      systemPromptFile: 'content-reviewer.md',
    },
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
