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

  it('keeps a draft model endpoint override when autosave response omits it', () => {
    const draft = baseConfig();
    draft.providers[0].models[0].endpointType = 'openai';

    const saved = baseConfig();

    const merged = mergeSavedAIConfigWithDraft(saved, draft);

    expect(merged.providers[0].models[0].endpointType).toBe('openai');
  });
});
