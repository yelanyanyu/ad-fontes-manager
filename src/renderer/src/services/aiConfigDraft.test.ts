import { describe, expect, it } from 'vitest';

import type { AIConfigMasked } from './aiConfigApi';
import { mergeSavedAIConfigWithDraft } from './aiConfigDraft';

const baseConfig = (): AIConfigMasked => ({
  providers: [
    {
      id: 'deepseek',
      name: 'DeepSeek',
      type: 'openai',
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      models: [{ id: 'deepseek-chat', name: 'deepseek-chat' }],
    },
  ],
  queue_concurrency: 1,
  search: {
    provider: 'brave',
    apiKey: '',
    autoDomains: true,
    domains: { common: [], en: [], de: [] },
  },
  stages: {},
  review: { threshold: 6, thresholdByLanguage: {} },
});

describe('aiConfigDraft', () => {
  it('keeps a draft stage provider while the model is still empty after autosave', () => {
    const draft = baseConfig();
    draft.stages.fast = { provider: 'deepseek', model: '' };

    const saved = baseConfig();

    const merged = mergeSavedAIConfigWithDraft(saved, draft);

    expect(merged.stages.fast).toEqual({ provider: 'deepseek', model: '' });
  });

  it('uses the saved complete stage over the local draft', () => {
    const draft = baseConfig();
    draft.stages.fast = { provider: 'deepseek', model: '' };

    const saved = baseConfig();
    saved.stages.fast = { provider: 'deepseek', model: 'deepseek-chat' };

    const merged = mergeSavedAIConfigWithDraft(saved, draft);

    expect(merged.stages.fast).toEqual({ provider: 'deepseek', model: 'deepseek-chat' });
  });

  it('keeps a changed draft provider over an older saved complete stage', () => {
    const draft = baseConfig();
    draft.providers.push({
      id: 'openrouter',
      name: 'OpenRouter',
      type: 'openai',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: '',
      models: [{ id: 'openrouter-model', name: 'openrouter-model' }],
    });
    draft.stages.expert = { provider: 'openrouter', model: '' };

    const saved = baseConfig();
    saved.stages.expert = { provider: 'deepseek', model: 'deepseek-chat' };

    const merged = mergeSavedAIConfigWithDraft(saved, draft);

    expect(merged.stages.expert).toEqual({ provider: 'openrouter', model: '' });
  });

  it('keeps a draft model endpoint override when autosave response omits it', () => {
    const draft = baseConfig();
    draft.providers[0].models[0].endpointType = 'openai';

    const saved = baseConfig();

    const merged = mergeSavedAIConfigWithDraft(saved, draft);

    expect(merged.providers[0].models[0].endpointType).toBe('openai');
  });
});
