import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const loadService = () => require('./configService');

void describe('configService', () => {
  void afterEach(() => {
    delete process.env.ADFONTES_CONFIG_PATH;
    delete process.env.AI_QUEUE_CONCURRENCY;
    try {
      const config = require('../../utils/config') as { clearCache: () => void };
      config.clearCache();
    } catch {
      // Ignore cleanup failures before the module exists.
    }
  });

  void it('masks a standard OpenAI API key', () => {
    const { maskApiKey } = loadService();
    const result = maskApiKey('sk-proj-abcdefghijklmnopqrstuvwxyz123456');
    assert.equal(result, 'sk-***3456');
    assert.equal(result.includes('abcdefghij'), false);
  });

  void it('keeps an empty API key empty when masking', () => {
    const { maskApiKey } = loadService();
    const result = maskApiKey('');
    assert.equal(result, '');
  });

  void it('masks a short key', () => {
    const { maskApiKey } = loadService();
    const result = maskApiKey('abc12345');
    assert.equal(result, '***');
  });

  void it('masks a Brave API key', () => {
    const { maskApiKey } = loadService();
    const result = maskApiKey('BSA-abcdefghijklmnop');
    assert.equal(result, 'BSA***mnop');
  });

  void it('mergeProviderWithMaskedCheck reuses existing key when input is masked', () => {
    const { mergeProviderWithMaskedCheck } = loadService();
    const existing = {
      id: 'openai',
      name: 'OpenAI',
      type: 'openai' as const,
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-real-key-12345',
      models: [{ id: 'gpt-4o', name: 'gpt-4o' }],
    };
    const input = { ...existing, apiKey: 'sk-***2345' };
    const result = mergeProviderWithMaskedCheck(input, existing);
    assert.equal(result.apiKey, 'sk-real-key-12345');
  });

  void it('mergeProviderWithMaskedCheck clears masked input when existing key is empty', () => {
    const { mergeProviderWithMaskedCheck } = loadService();
    const existing = {
      id: 'deepseek',
      name: 'deepseek',
      type: 'openai' as const,
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      models: [{ id: 'deepseek-v4-pro', name: 'deepseek-v4-pro[1m]' }],
    };
    const input = { ...existing, apiKey: 'sk-***0d1c' };
    const result = mergeProviderWithMaskedCheck(input, existing);
    assert.equal(result.apiKey, '');
  });

  void it('mergeProviderWithMaskedCheck uses new key when input is unmasked', () => {
    const { mergeProviderWithMaskedCheck } = loadService();
    const existing = {
      id: 'openai',
      name: 'OpenAI',
      type: 'openai' as const,
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-old-key',
      models: [{ id: 'gpt-4o', name: 'gpt-4o' }],
    };
    const input = { ...existing, apiKey: 'sk-new-key-67890' };
    const result = mergeProviderWithMaskedCheck(input, existing);
    assert.equal(result.apiKey, 'sk-new-key-67890');
  });

  void it('mergeProviderWithMaskedCheck returns input as-is when no existing provider matches', () => {
    const { mergeProviderWithMaskedCheck } = loadService();
    const input = {
      id: 'openai',
      name: 'OpenAI',
      type: 'openai' as const,
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-new-key',
      models: [{ id: 'gpt-4o', name: 'gpt-4o' }],
    };
    const result = mergeProviderWithMaskedCheck(input, undefined);
    assert.equal(result.apiKey, 'sk-new-key');
  });

  void it('updateAIConfig preserves masked provider and search keys when saving', () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-ai-config-')),
      'config.json'
    );
    process.env.ADFONTES_CONFIG_PATH = configPath;

    const config = require('../../utils/config') as { clearCache: () => void };
    config.clearCache();
    const { updateAIConfig } = loadService();

    updateAIConfig({
      providers: [
        {
          id: 'openai',
          name: 'OpenAI',
          type: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'sk-real-key-12345',
          models: [{ id: 'gpt-4o', name: 'gpt-4o' }],
        },
      ],
      search: {
        provider: 'brave',
        apiKey: 'BSA-real-search-key',
        autoDomains: true,
        domains: { common: ['etymonline.com'], en: [], de: [] },
      },
    });

    updateAIConfig({
      providers: [
        {
          id: 'openai',
          name: 'OpenAI',
          type: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'sk-***2345',
          models: [{ id: 'gpt-4o-mini', name: 'gpt-4o-mini' }],
        },
      ],
      search: {
        provider: 'brave',
        apiKey: 'BSA***-key',
        autoDomains: false,
        domains: { common: ['wiktionary.org'], en: [], de: [] },
      },
    });

    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      ai: {
        providers: Array<{ apiKey: string; models: Array<{ id: string }> }>;
        search: { apiKey: string; autoDomains: boolean; domains: { common: string[] } };
      };
    };

    assert.equal(saved.ai.providers[0].apiKey, 'sk-real-key-12345');
    assert.equal(saved.ai.providers[0].models[0].id, 'gpt-4o-mini');
    assert.equal(saved.ai.search.apiKey, 'BSA-real-search-key');
    assert.equal(saved.ai.search.autoDomains, false);
    assert.deepEqual(saved.ai.search.domains.common, ['wiktionary.org']);
  });

  void it('updateAIConfig accepts preset providers and search config without API keys', () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-ai-config-')),
      'config.json'
    );
    process.env.ADFONTES_CONFIG_PATH = configPath;

    const config = require('../../utils/config') as { clearCache: () => void };
    config.clearCache();
    const { updateAIConfig } = loadService();

    const result = updateAIConfig({
      providers: [
        {
          id: 'deepseek',
          name: 'deepseek',
          type: 'openai',
          baseUrl: 'https://api.deepseek.com',
          apiKey: '',
          models: [
            { id: 'deepseek-v4-pro', name: 'deepseek-v4-pro[1m]' },
            { id: 'deepseek-v4-flash', name: 'deepseek-v4-flash[1m]' },
          ],
        },
      ],
      search: {
        provider: 'brave',
        apiKey: '',
        autoDomains: true,
        domains: { common: ['etymonline.com'], en: [], de: [] },
      },
    });

    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      ai: {
        providers: Array<{ id: string; apiKey: string; models: Array<{ id: string }> }>;
        search: { apiKey: string };
      };
    };

    assert.equal(result.providers[0].apiKey, '');
    assert.equal(saved.ai.providers[0].id, 'deepseek');
    assert.equal(saved.ai.providers[0].apiKey, '');
    assert.equal(saved.ai.providers[0].models[0].id, 'deepseek-v4-pro');
    assert.equal(saved.ai.search.apiKey, '');
  });

  void it('updateAIConfig persists model endpoint overrides and Anthropic provider URL', () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-ai-config-')),
      'config.json'
    );
    process.env.ADFONTES_CONFIG_PATH = configPath;

    const config = require('../../utils/config') as { clearCache: () => void };
    config.clearCache();
    const { updateAIConfig } = loadService();

    updateAIConfig({
      providers: [
        {
          id: 'deepseek',
          name: 'deepseek',
          type: 'openai',
          baseUrl: 'https://api.deepseek.com',
          anthropicBaseUrl: 'https://api.deepseek.com/anthropic',
          apiKey: '',
          models: [
            { id: 'deepseek-v4-flash', name: 'deepseek-v4-flash' },
            {
              id: 'deepseek-v4-pro[1m]',
              name: 'deepseek-v4-pro[1m]',
              endpointType: 'anthropic',
            },
          ],
        },
      ],
    });

    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      ai: {
        providers: Array<{
          anthropicBaseUrl?: string;
          models: Array<{ id: string; endpointType?: string }>;
        }>;
      };
    };

    assert.equal(saved.ai.providers[0].anthropicBaseUrl, 'https://api.deepseek.com/anthropic');
    assert.equal(saved.ai.providers[0].models[1].endpointType, 'anthropic');
  });

  void it('updateAIConfig preserves unrelated config file sections when saving AI settings', () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-ai-config-')),
      'config.json'
    );
    process.env.ADFONTES_CONFIG_PATH = configPath;
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          server: { port: 4567 },
          database: { url: './data/custom.db' },
        },
        null,
        2
      ),
      'utf8'
    );

    const config = require('../../utils/config') as { clearCache: () => void };
    config.clearCache();
    const { updateAIConfig } = loadService();

    updateAIConfig({
      providers: [
        {
          id: 'deepseek',
          name: 'deepseek',
          type: 'openai',
          baseUrl: 'https://api.deepseek.com',
          apiKey: '',
          models: [{ id: 'deepseek-chat', name: 'deepseek-chat' }],
        },
      ],
    });

    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      server?: { port?: number };
      database?: { url?: string };
      ai?: { providers: Array<{ id: string }> };
    };

    assert.equal(saved.server?.port, 4567);
    assert.equal(saved.database?.url, './data/custom.db');
    assert.equal(saved.ai?.providers[0].id, 'deepseek');
  });

  void it('updateAIConfig persists queue concurrency alongside AI settings', () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-ai-config-')),
      'config.json'
    );
    process.env.ADFONTES_CONFIG_PATH = configPath;

    const config = require('../../utils/config') as { clearCache: () => void };
    config.clearCache();
    const { getAIConfig, updateAIConfig } = loadService();

    const result = updateAIConfig({
      providers: [],
      queue_concurrency: 3,
    });

    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      ai?: { queue_concurrency?: number };
    };

    assert.equal(result.queue_concurrency, 3);
    assert.equal(getAIConfig().queue_concurrency, 3);
    assert.equal(saved.ai?.queue_concurrency, 3);
  });

  void it('returns safe Default App Configuration for a new user without AI settings', () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-ai-config-')),
      'config.json'
    );
    process.env.ADFONTES_CONFIG_PATH = configPath;
    fs.writeFileSync(configPath, JSON.stringify({ dataDir: 'C:\\Users\\tester\\data' }), 'utf8');

    const config = require('../../utils/config') as { clearCache: () => void };
    config.clearCache();
    const { getAIConfig } = loadService();

    const result = getAIConfig();

    assert.equal(result.queue_concurrency, 5);
    assert.equal(result.search?.provider, 'tavily');
    assert.equal(result.search?.apiKey, '');
    assert.equal(result.search?.autoDomains, true);
    assert.equal(result.stages.fast?.provider, 'deepseek');
    assert.equal(result.stages.fast?.model, 'deepseek-v4-flash[1m]');
    assert.equal(result.stages.fast?.reasoningEffort, 'none');
    assert.equal(result.stages.balanced?.model, 'deepseek-v4-pro[1m]');
    assert.equal(result.stages.balanced?.reasoningEffort, 'low');
    assert.equal(result.stages.expert?.model, 'deepseek-v4-pro[1m]');
    assert.equal(result.stages.expert?.reasoningEffort, 'medium');
    assert.equal(
      result.providers.some((provider: { id: string }) => provider.id === 'deepseek'),
      true
    );
    assert.equal(
      result.providers.every((provider: { apiKey: string }) => provider.apiKey === ''),
      true
    );
  });

  void it('reads AI queue concurrency from the environment', () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-ai-config-')),
      'config.json'
    );
    process.env.ADFONTES_CONFIG_PATH = configPath;
    process.env.AI_QUEUE_CONCURRENCY = '4';

    const config = require('../../utils/config') as {
      clearCache: () => void;
      get: <T = unknown>(path: string, defaultValue?: T) => T;
    };
    config.clearCache();

    assert.equal(config.get<number>('ai.queue_concurrency'), 4);

    delete process.env.AI_QUEUE_CONCURRENCY;
  });

  void it('updateAIConfig never persists a masked provider key without an existing real key', () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-ai-config-')),
      'config.json'
    );
    process.env.ADFONTES_CONFIG_PATH = configPath;

    const config = require('../../utils/config') as { clearCache: () => void };
    config.clearCache();
    const { updateAIConfig } = loadService();

    updateAIConfig({
      providers: [
        {
          id: 'deepseek',
          name: 'deepseek',
          type: 'openai',
          baseUrl: 'https://api.deepseek.com',
          apiKey: 'sk-***0d1c',
          models: [{ id: 'deepseek-v4-pro', name: 'deepseek-v4-pro[1m]' }],
        },
      ],
    });

    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      ai: { providers: Array<{ apiKey: string }> };
    };

    assert.equal(saved.ai.providers[0].apiKey, '');
  });

  void it('resolveProviderApiKeyForTest reads the stored key for masked test input', () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-ai-config-')),
      'config.json'
    );
    process.env.ADFONTES_CONFIG_PATH = configPath;

    const config = require('../../utils/config') as { clearCache: () => void };
    config.clearCache();
    const { resolveProviderApiKeyForTest, updateAIConfig } = loadService();

    updateAIConfig({
      providers: [
        {
          id: 'deepseek',
          name: 'deepseek',
          type: 'openai',
          baseUrl: 'https://api.deepseek.com',
          apiKey: 'sk-real-key-0d1c',
          models: [{ id: 'deepseek-v4-pro', name: 'deepseek-v4-pro[1m]' }],
        },
      ],
    });

    const result = resolveProviderApiKeyForTest('deepseek', 'sk-***0d1c');
    assert.equal(result, 'sk-real-key-0d1c');
  });
});
