import type { PipelineContext } from '../types';

function parseReviewOutput(text: string): Partial<PipelineContext> {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return { scores: parsed };
  } catch {
    // LLM returned truncated / malformed JSON — pass raw text so
    // the audit-fix pipeline can still work with partial output.
    return { scores: { _raw: cleaned, _parse_error: true } };
  }
}

module.exports = { parseReviewOutput };
