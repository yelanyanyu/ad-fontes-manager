import type { PipelineContext } from '../types';

function parseResearchOutput(text: string): Partial<PipelineContext> {
  return { researchYaml: text.trim() };
}

module.exports = { parseResearchOutput };
