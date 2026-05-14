import type { PipelineContext } from '../types';

function stripReviewFences(text: string): string {
  return text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function extractJsonObject(text: string): string | undefined {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return undefined;
  return text.slice(start, end + 1);
}

function normalizeParsedScores(parsed: Record<string, unknown>): Partial<PipelineContext> {
  const revisionNotes =
    typeof parsed.revision_notes === 'string' ? parsed.revision_notes : undefined;
  return { scores: parsed, ...(revisionNotes ? { revisionNotes } : {}) };
}

function extractNumericProperty(text: string, key: string): number | undefined {
  const match = new RegExp(`"${key}"\\s*:\\s*"?(-?\\d+(?:\\.\\d+)?)"?`, 'i').exec(text);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function extractStringProperty(text: string, key: string): string | undefined {
  const match = new RegExp(`"${key}"\\s*:\\s*"`, 'i').exec(text);
  if (!match) return undefined;

  let value = '';
  let escaped = false;
  for (let index = match.index + match[0].length; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      value += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      return value.trim();
    }
    value += char;
  }

  return value.replace(/\n\s*}\s*$/, '').trim() || undefined;
}

function extractFallbackScores(text: string): Record<string, unknown> {
  const scores: Record<string, unknown> = { _raw: text, _parse_error: true };
  const overallScore =
    extractNumericProperty(text, 'overall_score') ?? extractNumericProperty(text, 'over_score');
  const revisionNotes = extractStringProperty(text, 'revision_notes');

  if (overallScore !== undefined) scores.overall_score = overallScore;
  if (revisionNotes) scores.revision_notes = revisionNotes;

  return scores;
}

function parseReviewOutput(text: string): Partial<PipelineContext> {
  const cleaned = stripReviewFences(text);
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return normalizeParsedScores(parsed);
  } catch {
    const jsonObject = extractJsonObject(cleaned);
    if (jsonObject && jsonObject !== cleaned) {
      try {
        const parsed = JSON.parse(jsonObject) as Record<string, unknown>;
        return normalizeParsedScores(parsed);
      } catch {
        // Fall through to partial extraction below.
      }
    }

    // LLM returned truncated / malformed JSON. Keep raw text, but still extract
    // the fields that drive score display and audit-fix continuation.
    const scores = extractFallbackScores(cleaned);
    const revisionNotes =
      typeof scores.revision_notes === 'string' ? scores.revision_notes : undefined;
    return { scores, ...(revisionNotes ? { revisionNotes } : {}) };
  }
}

module.exports = { parseReviewOutput };
