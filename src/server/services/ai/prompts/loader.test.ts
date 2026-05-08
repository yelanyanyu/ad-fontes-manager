import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

void describe('prompt loader', () => {
  void it('loads a UTF-8 prompt and injects variables', () => {
    const { loadSystemPrompt, clearCache } = require('./loader') as {
      loadSystemPrompt: (filename: string, variables: Record<string, string>) => string;
      clearCache: () => void;
    };

    clearCache();
    const prompt = loadSystemPrompt('content-reviewer.md', {
      yaml: 'lemma: apple\nvisual_imagery_zh: 测试',
    });

    assert.match(prompt, /lemma: apple/);
    assert.match(prompt, /测试/);
    assert.equal(prompt.includes('{{yaml}}'), false);
  });
});
