import type { PipelineContext } from '../types';

const { stripMarkdownFences } = require('../utils') as {
  stripMarkdownFences: (text: string) => string;
};

function parseResearchOutput(text: string): Partial<PipelineContext> {
  return { researchYaml: stripMarkdownFences(text) };
}

module.exports = { parseResearchOutput };
