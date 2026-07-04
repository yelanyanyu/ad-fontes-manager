import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { resolveAIEndpoint } = require('./endpointResolver') as {
  resolveAIEndpoint: (input: {
    providerType: 'openai' | 'anthropic';
    baseUrl: string;
    anthropicBaseUrl?: string;
    modelEndpointType?: 'openai' | 'anthropic';
  }) => { endpointType: 'openai' | 'anthropic'; baseUrl: string };
};

void describe('endpointResolver', () => {
  void it('uses provider type when the model has no endpoint override', () => {
    const result = resolveAIEndpoint({
      providerType: 'openai',
      baseUrl: 'https://api.deepseek.com',
      anthropicBaseUrl: 'https://api.deepseek.com/anthropic',
    });

    assert.deepEqual(result, {
      endpointType: 'openai',
      baseUrl: 'https://api.deepseek.com',
    });
  });

  void it('uses model endpoint override and anthropic base URL when present', () => {
    const result = resolveAIEndpoint({
      providerType: 'openai',
      baseUrl: 'https://api.deepseek.com',
      anthropicBaseUrl: 'https://api.deepseek.com/anthropic',
      modelEndpointType: 'anthropic',
    });

    assert.deepEqual(result, {
      endpointType: 'anthropic',
      baseUrl: 'https://api.deepseek.com/anthropic',
    });
  });
});
