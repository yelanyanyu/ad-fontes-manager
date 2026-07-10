import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createFileSettingsAdapter, createUserSettingsModule } from './userSettings';

// 这些测试把 User Settings module 当作公开入口，避免绑定内部 JSON 写法。
interface TestConfig {
  ai?: {
    queue_concurrency?: number;
    providers?: Array<{ id: string; apiKey?: string }>;
    search?: { provider?: string; apiKey?: string; autoDomains?: boolean };
    stages?: { fast?: { provider?: string; model?: string; reasoningEffort?: string } };
  };
  server?: { port?: number };
  database?: { url?: string };
  logging?: { level?: string };
  customUserFlag?: string;
}

// 测试只关心这张票承诺的输出形状，因此在断言入口做一次集中转型。
function asTestConfig(value: unknown): TestConfig {
  return value as TestConfig;
}

void describe('User Settings module', () => {
  void afterEach(() => {
    delete process.env.ADFONTES_CONFIG_PATH;
  });

  // 这条主测试锁住第一张票最重要的输出：用户设置可迁移，runtime 字段不变形。
  void it('reads and updates user settings through a file adapter without changing runtime output', () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-user-settings-')),
      'config.json'
    );
    const originalConfig: TestConfig = {
      server: { port: 19001 },
      database: { url: './data/custom.db' },
      logging: { level: 'debug' },
      ai: {
        providers: [
          {
            id: 'deepseek',
            apiKey: 'sk-user-owned-key',
          },
        ],
        queue_concurrency: 2,
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(originalConfig, null, 2), 'utf8');
    process.env.ADFONTES_CONFIG_PATH = configPath;

    const settings = createUserSettingsModule({
      adapter: createFileSettingsAdapter({ configPath }),
    });

    const snapshotConfig = asTestConfig(settings.readSnapshot().config);
    assert.equal(snapshotConfig.ai?.providers?.[0]?.apiKey, 'sk-user-owned-key');
    assert.equal(snapshotConfig.ai?.queue_concurrency, 2);
    assert.equal(snapshotConfig.ai?.search?.provider, 'tavily');
    assert.equal(snapshotConfig.ai?.stages?.fast?.provider, 'deepseek');
    assert.equal(snapshotConfig.server?.port, 19001);
    assert.equal(snapshotConfig.database?.url, './data/custom.db');
    assert.equal(snapshotConfig.logging?.level, 'debug');

    const updated = settings.updateSettings({
      customUserFlag: 'kept-through-user-settings-module',
    });

    const updatedConfig = asTestConfig(updated.config);
    assert.equal(updatedConfig.customUserFlag, 'kept-through-user-settings-module');
    assert.equal(updatedConfig.server?.port, 19001);
    assert.equal(updatedConfig.database?.url, './data/custom.db');
    assert.equal(updatedConfig.logging?.level, 'debug');
    assert.equal(updatedConfig.ai?.providers?.[0]?.apiKey, 'sk-user-owned-key');
    assert.equal(updatedConfig.ai?.search?.provider, 'tavily');

    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8')) as TestConfig;
    assert.equal(saved.customUserFlag, 'kept-through-user-settings-module');
    assert.equal(saved.server?.port, 19001);
    assert.equal(saved.database?.url, './data/custom.db');
    assert.equal(saved.logging?.level, 'debug');
    assert.equal(saved.ai?.providers?.[0]?.apiKey, 'sk-user-owned-key');
    assert.equal(saved.ai?.search?.provider, 'tavily');
    assert.equal(saved.ai?.search?.apiKey, '');
    assert.equal(saved.ai?.search?.autoDomains, true);
    assert.equal(fs.existsSync(`${configPath}.bak`), true);
    assert.equal(fs.existsSync(`${configPath}.tmp`), false);
  });

  // File adapter 需要保留开发、standalone 与浏览器调试路径里的环境变量入口。
  void it('uses ADFONTES_CONFIG_PATH when no explicit file path is provided', () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-user-settings-env-')),
      'config.json'
    );
    process.env.ADFONTES_CONFIG_PATH = configPath;

    const settings = createUserSettingsModule({
      adapter: createFileSettingsAdapter(),
    });

    const updated = settings.updateSettings({
      customUserFlag: 'written-through-env-path',
    });

    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8')) as TestConfig;
    const updatedConfig = asTestConfig(updated.config);
    assert.equal(updatedConfig.customUserFlag, 'written-through-env-path');
    assert.equal(saved.customUserFlag, 'written-through-env-path');
    assert.equal(saved.ai?.search?.provider, 'tavily');
  });

  // 当前 slice 不引入模块级缓存；每次读取都应看到文件里的最新用户设置。
  void it('does not return stale settings after the backing file changes', () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-user-settings-cache-')),
      'config.json'
    );
    fs.writeFileSync(
      configPath,
      JSON.stringify({ customUserFlag: 'first-version' }, null, 2),
      'utf8'
    );

    const settings = createUserSettingsModule({
      adapter: createFileSettingsAdapter({ configPath }),
    });

    assert.equal(asTestConfig(settings.readSnapshot().config).customUserFlag, 'first-version');

    fs.writeFileSync(
      configPath,
      JSON.stringify({ customUserFlag: 'second-version' }, null, 2),
      'utf8'
    );

    assert.equal(asTestConfig(settings.readSnapshot().config).customUserFlag, 'second-version');
  });

  // 坏 JSON 仍按旧 runtime config 行为回落到默认输出，不能顺手覆盖用户文件。
  void it('falls back to default output for malformed JSON without overwriting the file', () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-user-settings-bad-json-')),
      'config.json'
    );
    fs.writeFileSync(configPath, '{ bad json', 'utf8');

    const settings = createUserSettingsModule({
      adapter: createFileSettingsAdapter({ configPath }),
    });

    const snapshotConfig = asTestConfig(settings.readSnapshot().config);
    assert.equal(snapshotConfig.ai?.search?.provider, 'tavily');
    assert.equal(snapshotConfig.server?.port, 8080);
    assert.equal(fs.readFileSync(configPath, 'utf8'), '{ bad json');
    assert.equal(fs.existsSync(`${configPath}.bak`), false);
  });

  // 面向 renderer/API 的快照必须走 masked 形状，避免把本地 key 从设置 seam 泄出。
  void it('returns a masked snapshot without leaking provider or search API keys', () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-user-settings-masked-')),
      'config.json'
    );
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
            search: {
              provider: 'tavily',
              apiKey: 'tvly-user-owned-key',
              autoDomains: true,
              domains: { common: [], en: [], de: [] },
            },
          },
        },
        null,
        2
      ),
      'utf8'
    );

    const settings = createUserSettingsModule({
      adapter: createFileSettingsAdapter({ configPath }),
    });

    const maskedConfig = asTestConfig(settings.readMaskedSnapshot().config);
    assert.equal(maskedConfig.ai?.providers?.[0]?.apiKey, 'sk-***-key');
    assert.equal(maskedConfig.ai?.search?.apiKey, '***-key');
    assert.notEqual(maskedConfig.ai?.providers?.[0]?.apiKey, 'sk-user-owned-key');
    assert.notEqual(maskedConfig.ai?.search?.apiKey, 'tvly-user-owned-key');

    const rawConfig = asTestConfig(settings.readSnapshot().config);
    assert.equal(rawConfig.ai?.providers?.[0]?.apiKey, 'sk-user-owned-key');
    assert.equal(rawConfig.ai?.search?.apiKey, 'tvly-user-owned-key');
  });
});
