import type { PipelineContext } from '../types';

const { stripMarkdownFences } = require('../utils') as {
  stripMarkdownFences: (text: string) => string;
};

function parseEnrichmentOutput(text: string): Partial<PipelineContext> {
  return { creativeYaml: stripMarkdownFences(text) };
}

module.exports = { parseEnrichmentOutput };
