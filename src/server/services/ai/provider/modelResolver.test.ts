import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

void describe('modelResolver', () => {
  void afterEach(() => {
    delete process.env.ADFONTES_CONFIG_PATH;
    const config = require('../../../utils/config') as { clearCache: () => void };
    config.clearCache();
  });

  void it('resolves a stage model from AI config', () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-model-resolver-')),
      'config.json'
    );
    process.env.ADFONTES_CONFIG_PATH = configPath;
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        ai: {
          providers: [
            {
              id: 'openai',
              name: 'OpenAI',
              type: 'openai',
              baseUrl: 'https://api.openai.com/v1',
              apiKey: 'sk-test',
              models: [{ id: 'gpt-4o-mini', name: 'GPT-4o Mini' }],
            },
          ],
          stages: { fast: { provider: 'openai', model: 'gpt-4o-mini' } },
          review: { threshold: 6, thresholdByLanguage: {} },
        },
      }),
      'utf8'
    );

    const config = require('../../../utils/config') as { clearCache: () => void };
    config.clearCache();
    const { resolveModel } = require('./modelResolver') as {
      resolveModel: (stage: 'fast' | 'balanced' | 'expert') => {
        provider: string;
        modelId: string;
        apiKey: string;
        format: string;
        isMock: boolean;
      };
    };

    const model = resolveModel('fast');
    assert.equal(model.provider, 'openai');
    assert.equal(model.modelId, 'gpt-4o-mini');
    assert.equal(model.format, 'openai');
    assert.equal(model.isMock, true);
  });

  void it('derives the DeepSeek Anthropic endpoint for legacy configs without anthropicBaseUrl', () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-model-resolver-')),
      'config.json'
    );
    process.env.ADFONTES_CONFIG_PATH = configPath;
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        ai: {
          providers: [
            {
              id: 'deepseek',
              name: 'deepseek',
              type: 'anthropic',
              baseUrl: 'https://api.deepseek.com',
              apiKey: 'sk-test',
              models: [{ id: 'deepseek-v4-pro[1m]', name: 'deepseek-v4-pro[1m]' }],
            },
          ],
          stages: { expert: { provider: 'deepseek', model: 'deepseek-v4-pro[1m]' } },
          review: { threshold: 6, thresholdByLanguage: {} },
        },
      }),
      'utf8'
    );

    const config = require('../../../utils/config') as { clearCache: () => void };
    config.clearCache();
    const { resolveModel } = require('./modelResolver') as {
      resolveModel: (stage: 'fast' | 'balanced' | 'expert') => {
        baseUrl: string;
        format: string;
      };
    };

    const model = resolveModel('expert');
    assert.equal(model.format, 'anthropic');
    assert.equal(model.baseUrl, 'https://api.deepseek.com/anthropic');
  });
});
