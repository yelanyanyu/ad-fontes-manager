import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

void describe('runtime config', () => {
  void afterEach(() => {
    delete process.env.ADFONTES_CONFIG_PATH;
    const config = require('./config') as { clearCache: () => void };
    config.clearCache();
  });

  void it('migrates old User Configuration while preserving user-owned AI values', () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-config-migration-')),
      'config.json'
    );
    process.env.ADFONTES_CONFIG_PATH = configPath;
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          ai: {
            providers: [
              {
                id: 'deepseek',
                name: 'deepseek',
                type: 'openai',
                baseUrl: 'https://api.deepseek.com',
                apiKey: 'sk-user-owned-key',
                models: [{ id: 'deepseek-chat', name: 'deepseek-chat' }],
              },
            ],
            queue_concurrency: 2,
          },
        },
        null,
        2
      ),
      'utf8'
    );

    const config = require('./config') as {
      clearCache: () => void;
      reload: () => unknown;
    };
    config.clearCache();
    config.reload();

    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      schemaVersion?: number;
      ai?: {
        providers?: Array<{ apiKey?: string }>;
        queue_concurrency?: number;
        search?: { provider?: string; apiKey?: string; autoDomains?: boolean };
        stages?: {
          fast?: { provider?: string; model?: string; reasoningEffort?: string };
          balanced?: { reasoningEffort?: string };
          expert?: { reasoningEffort?: string };
        };
      };
    };

    assert.equal(saved.schemaVersion, 1);
    assert.equal(saved.ai?.providers?.[0]?.apiKey, 'sk-user-owned-key');
    assert.equal(saved.ai?.queue_concurrency, 2);
    assert.equal(saved.ai?.search?.provider, 'tavily');
    assert.equal(saved.ai?.search?.apiKey, '');
    assert.equal(saved.ai?.search?.autoDomains, true);
    assert.equal(saved.ai?.stages?.fast?.provider, 'deepseek');
    assert.equal(saved.ai?.stages?.fast?.model, 'deepseek-v4-flash[1m]');
    assert.equal(saved.ai?.stages?.fast?.reasoningEffort, 'none');
    assert.equal(saved.ai?.stages?.balanced?.reasoningEffort, 'low');
    assert.equal(saved.ai?.stages?.expert?.reasoningEffort, 'medium');
  });
});
