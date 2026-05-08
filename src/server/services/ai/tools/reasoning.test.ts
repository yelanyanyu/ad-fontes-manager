import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

void describe('buildReasoningParams', () => {
  void it('omits reasoning params for auto effort', () => {
    const { buildReasoningParams } = require('./reasoning') as typeof import('./reasoning');
    assert.deepEqual(buildReasoningParams('openai', 'auto'), {});
  });

  void it('maps Anthropic xhigh to max thinking effort', () => {
    const { buildReasoningParams } = require('./reasoning') as typeof import('./reasoning');
    assert.deepEqual(buildReasoningParams('anthropic', 'xhigh'), {
      thinking: { type: 'enabled', effort: 'max' },
    });
  });

  void it('maps OpenAI high to reasoningEffort', () => {
    const { buildReasoningParams } = require('./reasoning') as typeof import('./reasoning');
    assert.deepEqual(buildReasoningParams('openai', 'high'), { reasoningEffort: 'high' });
  });
});
