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
      modelKey: 'fast',
      systemPromptFile: 'de-structural.md',
      toolNames: ['search_etymology', 'fetch_page'],
      outputParser: parseResearchOutput,
    },
    {
      id: 'pondering',
      description: 'Pondering',
      type: 'llm',
      modelKey: 'expert',
      systemPromptFile: 'de-creative.md',
      outputParser: parseEnrichmentOutput,
    },
    {
      id: 'auditing',
      description: 'Auditing',
      type: 'llm',
      modelKey: 'expert',
      systemPromptFile: 'content-reviewer.md',
      promptInputAugmenters: ['aiFlavorMarkerReport'],
      outputParser: parseReviewOutput,
    },
  ],
};

module.exports = { germanPipeline };
