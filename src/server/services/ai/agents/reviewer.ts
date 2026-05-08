import type { PipelineContext } from '../types';

function parseReviewOutput(text: string): Partial<PipelineContext> {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  return { scores: parsed };
}

module.exports = { parseReviewOutput };
