import type { PipelineContext } from '../types';

function parseEnrichmentOutput(text: string): Partial<PipelineContext> {
  return { fullYaml: text.trim() };
}

module.exports = { parseEnrichmentOutput };
