import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('AiGenerateStagePanel structure', () => {
  it('keeps raw text copy as a quiet icon inside the Raw Text header', () => {
    const source = readFileSync(resolve(__dirname, 'AiGenerateStagePanel.vue'), 'utf8');

    expect(source).toContain('class="raw-head"');
    expect(source).toContain('class="raw-copy-button"');
    expect(source).toContain('aria-label="Copy raw stage text"');
    expect(source).toContain('已复制');
    expect(source).toContain('rawCopied');
    expect(source).not.toContain('Diff');
    expect(source).not.toContain('Stage copy actions');
  });
});
