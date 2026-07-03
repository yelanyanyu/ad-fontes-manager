import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { PipelineStage } from '../types';

// 这个测试文件覆盖 Stage Tool 的解析边界。
// 重点不是搜索工具本身，而是确认流水线不会被 AI SDK function call 这一种实现绑死。

function writeAIConfig(searchApiKey: string): void {
  const configPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-stage-tools-')),
    'config.json'
  );
  process.env.ADFONTES_CONFIG_PATH = configPath;
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      ai: {
        providers: [],
        stages: {},
        search: {
          provider: 'brave',
          apiKey: searchApiKey,
          autoDomains: false,
          domains: { common: [], en: [], de: [] },
        },
      },
    }),
    'utf8'
  );
  const config = require('../../../utils/config') as { clearCache: () => void };
  config.clearCache();
}

function createStage(toolNames: string[]): PipelineStage {
  return {
    id: 'searching',
    description: 'Searching',
    type: 'llm',
    toolNames,
  };
}

void describe('StageToolResolver', () => {
  void afterEach(() => {
    delete process.env.ADFONTES_CONFIG_PATH;
    const config = require('../../../utils/config') as { clearCache: () => void };
    config.clearCache();
  });

  void it('resolves known tools as function-call descriptors and AI SDK tools', () => {
    writeAIConfig('search-key');
    const { StageToolResolver } =
      require('./StageToolResolver') as typeof import('./StageToolResolver');

    const resolution = new StageToolResolver().resolve(
      createStage(['search_etymology', 'fetch_page'])
    );

    assert.deepEqual(
      resolution.descriptors.map(descriptor => [descriptor.name, descriptor.kind]),
      [
        ['search_etymology', 'function-call'],
        ['fetch_page', 'function-call'],
      ]
    );
    assert.deepEqual(Object.keys(resolution.aiSdkTools).sort(), ['fetch_page', 'search_etymology']);
  });

  void it('does not expose search tools when the search API key is missing', () => {
    writeAIConfig('');
    const { StageToolResolver } =
      require('./StageToolResolver') as typeof import('./StageToolResolver');
    const messages: string[] = [];

    const resolution = new StageToolResolver().resolve(
      {
        ...createStage(['search_etymology', 'fetch_page']),
        policy: {
          execution: {
            kind: 'llm',
            tools: {
              names: ['search_etymology', 'fetch_page'],
              requiresSearchApiKey: true,
            },
          },
          output: { kind: 'yaml-fragment', contextKey: 'researchYaml' },
          assembly: { kind: 'none' },
          stopLoss: { kind: 'none' },
        },
      },
      {
        info: (_payload, message) => {
          if (message) messages.push(message);
        },
      }
    );

    assert.deepEqual(resolution.descriptors, []);
    assert.deepEqual(resolution.aiSdkTools, {});
    assert.deepEqual(messages, ['Search tools disabled because search API key is not configured']);
  });

  void it('keeps unknown tools as custom descriptors without passing them to AI SDK', () => {
    writeAIConfig('search-key');
    const { StageToolResolver } =
      require('./StageToolResolver') as typeof import('./StageToolResolver');

    const resolution = new StageToolResolver().resolve(createStage(['project_cli_tool']));

    assert.deepEqual(resolution.descriptors, [{ name: 'project_cli_tool', kind: 'custom' }]);
    assert.deepEqual(resolution.aiSdkTools, {});
  });
});
