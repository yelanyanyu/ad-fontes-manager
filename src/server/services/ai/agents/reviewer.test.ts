import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { parseReviewOutput } = require('./reviewer') as {
  parseReviewOutput: (text: string) => {
    scores?: Record<string, unknown>;
    revisionNotes?: string;
  };
};

void describe('parseReviewOutput', () => {
  void it('extracts score and revision notes from malformed reviewer JSON', () => {
    const result = parseReviewOutput(`\`\`\`json
{
  "overall_score": 8,
  "field_scores": {
    "visual_imagery_zh": {
      "score": 8,
      "verdict": "pass"
    }
  },
  "revision_notes": "对 visual_imagery_zh 的修改意见：避免「而是」这一转折句式。
}
\`\`\``);

    assert.equal(result.scores?._parse_error, true);
    assert.equal(result.scores?.overall_score, 8);
    assert.match(String(result.scores?.revision_notes), /避免「而是」/);
    assert.equal(result.revisionNotes, result.scores?.revision_notes);
  });

  void it('parses fenced JSON and mirrors revision notes onto context', () => {
    const result = parseReviewOutput(`\`\`\`json
{"overall_score": 9, "revision_notes": "无需修改。"}
\`\`\``);

    assert.equal(result.scores?.overall_score, 9);
    assert.equal(result.scores?.revision_notes, '无需修改。');
    assert.equal(result.revisionNotes, '无需修改。');
  });
});
