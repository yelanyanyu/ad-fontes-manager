import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

void describe('buildReasoningParams', () => {
  void it('omits reasoning params for auto effort', () => {
    const { buildReasoningParams } = require('./reasoning') as typeof import('./reasoning');
    assert.deepEqual(buildReasoningParams('openai', 'auto'), {
      providerOptions: {},
      metadata: { effort: 'auto', enabled: false },
    });
  });

  void it('maps Anthropic xhigh to max thinking effort', () => {
    const { buildReasoningParams } = require('./reasoning') as typeof import('./reasoning');
    assert.deepEqual(buildReasoningParams('anthropic', 'xhigh'), {
      providerOptions: {
        anthropic: {
          thinking: { type: 'enabled', budgetTokens: 16000 },
        },
      },
      metadata: { effort: 'xhigh', enabled: true },
    });
  });

  void it('maps OpenAI high to reasoningEffort', () => {
    const { buildReasoningParams } = require('./reasoning') as typeof import('./reasoning');
    assert.deepEqual(buildReasoningParams('openai', 'high'), {
      providerOptions: {
        openai: { reasoningEffort: 'high' },
      },
      metadata: { effort: 'high', enabled: true },
    });
  });

  void it('uses provider-specific SiliconFlow thinking parameters', () => {
    const { buildReasoningParams } = require('./reasoning') as typeof import('./reasoning');
    assert.deepEqual(buildReasoningParams('openai', 'high', 'silicon'), {
      providerOptions: {
        silicon: {
          enable_thinking: true,
          thinking_budget: 16000,
        },
      },
      metadata: { effort: 'high', enabled: true },
    });
  });

  void it('keys third-party OpenAI-compatible reasoning options by provider id', () => {
    const { buildReasoningParams } = require('./reasoning') as typeof import('./reasoning');
    assert.deepEqual(buildReasoningParams('openai', 'xhigh', 'openrouter'), {
      providerOptions: {
        openrouter: { reasoningEffort: 'high' },
      },
      metadata: { effort: 'xhigh', enabled: true },
    });
  });
});
