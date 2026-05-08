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

const englishPipeline: PipelineDefinition = {
  id: 'single-word-en-v1',
  language: 'en',
  stages: [
    {
      id: 'research',
      description: 'Research',
      type: 'llm',
      modelKey: 'fast',
      systemPromptFile: 'english-generation.md',
      toolNames: ['search_etymology', 'fetch_page'],
      outputParser: parseResearchOutput,
    },
    {
      id: 'enrichment',
      description: 'Enrichment',
      type: 'llm',
      modelKey: 'balanced',
      systemPromptFile: 'english-generation.md',
      outputParser: parseEnrichmentOutput,
    },
    {
      id: 'review',
      description: 'Review',
      type: 'llm',
      modelKey: 'expert',
      systemPromptFile: 'content-reviewer.md',
      outputParser: parseReviewOutput,
    },
  ],
};

module.exports = { englishPipeline };
