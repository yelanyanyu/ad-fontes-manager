import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { PipelineProgressEvent } from './types';

function writeMockAIConfig(): void {
  const configPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-pipe-')),
    'config.json'
  );
  process.env.ADFONTES_CONFIG_PATH = configPath;
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      ai: {
        providers: [
          {
            id: 'mock',
            name: 'Mock',
            type: 'openai',
            baseUrl: 'https://mock.invalid/v1',
            apiKey: 'sk-test',
            models: [
              { id: 'mock-fast', name: 'mock-fast' },
              { id: 'mock-balanced', name: 'mock-balanced' },
              { id: 'mock-expert', name: 'mock-expert' },
            ],
          },
        ],
        stages: {
          fast: { provider: 'mock', model: 'mock-fast', reasoningEffort: 'auto' },
          balanced: { provider: 'mock', model: 'mock-balanced', reasoningEffort: 'auto' },
          expert: { provider: 'mock', model: 'mock-expert', reasoningEffort: 'high' },
        },
        review: { threshold: 6, thresholdByLanguage: {} },
      },
    }),
    'utf8'
  );
  const config = require('../../utils/config') as { clearCache: () => void };
  config.clearCache();
}

void describe('SequentialRunner', () => {
  void afterEach(() => {
    delete process.env.ADFONTES_CONFIG_PATH;
    const config = require('../../utils/config') as { clearCache: () => void };
    config.clearCache();
    delete require.cache[require.resolve('./pipe')];
    delete require.cache[require.resolve('./definitions/english')];
    delete require.cache[require.resolve('./definitions/german')];
  });

  void it('allows tool-enabled searching to continue after tool results before stop-loss', async () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-pipe-')),
      'config.json'
    );
    process.env.ADFONTES_CONFIG_PATH = configPath;
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        ai: {
          providers: [
            {
              id: 'realish',
              name: 'Realish',
              type: 'openai',
              baseUrl: 'https://mock.invalid/v1',
              apiKey: 'sk-live-test',
              models: [{ id: 'model-fast', name: 'model-fast' }],
            },
          ],
          stages: {
            fast: { provider: 'realish', model: 'model-fast', reasoningEffort: 'auto' },
          },
          search: {
            provider: 'brave',
            apiKey: 'search-test-key',
            autoDomains: false,
            domains: { common: [], en: [], de: [] },
          },
          review: { threshold: 6, thresholdByLanguage: {} },
        },
      }),
      'utf8'
    );

    const aiPath = require.resolve('ai');
    const originalAI = require(aiPath);
    const stopMarker = { kind: 'three-steps' };
    const calls: Array<Record<string, unknown>> = [];
    require.cache[aiPath]!.exports = {
      ...originalAI,
      stepCountIs: (count: number) => ({ ...stopMarker, count }),
      streamText: (options: Record<string, unknown>) => {
        calls.push(options);
        return {
          fullStream: (async function* () {
            yield { type: 'text-delta', text: 'yield:\n  lemma: crate\n  language: en\n' };
          })(),
        };
      },
    };

    delete require.cache[require.resolve('./pipe')];
    const { SequentialRunner } = require('./pipe') as typeof import('./pipe');

    try {
      await new SequentialRunner().run({
        definition: {
          id: 'tool-search',
          language: 'en',
          stages: [
            {
              id: 'searching',
              description: 'Searching',
              type: 'llm',
              modelKey: 'fast',
              systemPromptFile: 'english-structural.md',
              toolNames: ['search_etymology'],
              outputParser: (text: string) => ({ researchYaml: text }),
            },
          ],
        },
        input: { word: 'crate', language: 'en' },
        onProgress: () => undefined,
      });
    } finally {
      require.cache[aiPath]!.exports = originalAI;
    }

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].stopWhen, { ...stopMarker, count: 3 });
  });

  void it('does not expose search or fetch tools when search API key is missing', async () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-pipe-')),
      'config.json'
    );
    process.env.ADFONTES_CONFIG_PATH = configPath;
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        ai: {
          providers: [
            {
              id: 'realish',
              name: 'Realish',
              type: 'openai',
              baseUrl: 'https://mock.invalid/v1',
              apiKey: 'sk-live-test',
              models: [{ id: 'model-fast', name: 'model-fast' }],
            },
          ],
          stages: {
            fast: { provider: 'realish', model: 'model-fast', reasoningEffort: 'auto' },
          },
          search: {
            provider: 'brave',
            apiKey: '',
            autoDomains: false,
            domains: { common: [], en: [], de: [] },
          },
          review: { threshold: 6, thresholdByLanguage: {} },
        },
      }),
      'utf8'
    );

    const aiPath = require.resolve('ai');
    const originalAI = require(aiPath);
    const calls: Array<Record<string, unknown>> = [];
    require.cache[aiPath]!.exports = {
      ...originalAI,
      streamText: (options: Record<string, unknown>) => {
        calls.push(options);
        return {
          fullStream: (async function* () {
            yield { type: 'text-delta', text: 'yield:\n  lemma: crate\n  language: en\n' };
          })(),
        };
      },
    };

    delete require.cache[require.resolve('./pipe')];
    const { SequentialRunner } = require('./pipe') as typeof import('./pipe');

    try {
      await new SequentialRunner().run({
        definition: {
          id: 'tool-search',
          language: 'en',
          stages: [
            {
              id: 'searching',
              description: 'Searching',
              type: 'llm',
              modelKey: 'fast',
              systemPromptFile: 'english-structural.md',
              toolNames: ['search_etymology', 'fetch_page'],
              outputParser: (text: string) => ({ researchYaml: text }),
            },
          ],
        },
        input: { word: 'crate', language: 'en' },
        onProgress: () => undefined,
      });
    } finally {
      require.cache[aiPath]!.exports = originalAI;
    }

    assert.equal(calls.length, 1);
    assert.equal(calls[0].tools, undefined);
    assert.equal(calls[0].stopWhen, undefined);
  });

  void it('falls back without tools immediately after the search tool fails', async () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-pipe-')),
      'config.json'
    );
    process.env.ADFONTES_CONFIG_PATH = configPath;
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        ai: {
          providers: [
            {
              id: 'realish',
              name: 'Realish',
              type: 'openai',
              baseUrl: 'https://mock.invalid/v1',
              apiKey: 'sk-live-test',
              models: [{ id: 'model-fast', name: 'model-fast' }],
            },
          ],
          stages: {
            fast: { provider: 'realish', model: 'model-fast', reasoningEffort: 'auto' },
          },
          search: {
            provider: 'brave',
            apiKey: 'bad-search-key',
            autoDomains: false,
            domains: { common: [], en: [], de: [] },
          },
          review: { threshold: 6, thresholdByLanguage: {} },
        },
      }),
      'utf8'
    );

    const aiPath = require.resolve('ai');
    const originalAI = require(aiPath);
    const calls: Array<Record<string, unknown>> = [];
    require.cache[aiPath]!.exports = {
      ...originalAI,
      streamText: (options: Record<string, unknown>) => {
        calls.push(options);
        return {
          fullStream:
            calls.length === 1
              ? (async function* () {
                  yield {
                    type: 'tool-result',
                    toolCallId: 'search-1',
                    toolName: 'search_etymology',
                    output: {
                      success: false,
                      errorCode: 'tool_error',
                      errorMessage: 'Brave Search API returned 401: Unauthorized',
                    },
                  };
                  yield { type: 'text-delta', text: 'yield:\n  lemma: wrong\n' };
                })()
              : (async function* () {
                  yield { type: 'text-delta', text: 'yield:\n  lemma: crate\n  language: en\n' };
                })(),
        };
      },
    };

    delete require.cache[require.resolve('./pipe')];
    const { SequentialRunner } = require('./pipe') as typeof import('./pipe');

    try {
      const result = await new SequentialRunner().run({
        definition: {
          id: 'tool-search',
          language: 'en',
          stages: [
            {
              id: 'searching',
              description: 'Searching',
              type: 'llm',
              modelKey: 'fast',
              systemPromptFile: 'english-structural.md',
              toolNames: ['search_etymology', 'fetch_page'],
              outputParser: (text: string) => ({ researchYaml: text }),
            },
          ],
        },
        input: { word: 'crate', language: 'en' },
        onProgress: () => undefined,
      });

      assert.equal(result.yaml, 'yield:\n  lemma: crate\n  language: en\n');
    } finally {
      require.cache[aiPath]!.exports = originalAI;
    }

    assert.equal(calls.length, 2);
    assert.ok(calls[0].tools);
    assert.equal(calls[1].tools, undefined);
    assert.equal(calls[1].stopWhen, undefined);
  });

  void it('synthesizes searching output from successful tool evidence when the tool loop ends without text', async () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-pipe-')),
      'config.json'
    );
    process.env.ADFONTES_CONFIG_PATH = configPath;
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        ai: {
          providers: [
            {
              id: 'realish',
              name: 'Realish',
              type: 'openai',
              baseUrl: 'https://mock.invalid/v1',
              apiKey: 'sk-live-test',
              models: [{ id: 'model-fast', name: 'model-fast' }],
            },
          ],
          stages: {
            fast: { provider: 'realish', model: 'model-fast', reasoningEffort: 'auto' },
          },
          search: {
            provider: 'brave',
            apiKey: 'search-test-key',
            autoDomains: false,
            domains: { common: [], en: [], de: [] },
          },
          review: { threshold: 6, thresholdByLanguage: {} },
        },
      }),
      'utf8'
    );

    const aiPath = require.resolve('ai');
    const originalAI = require(aiPath);
    const calls: Array<Record<string, unknown>> = [];
    require.cache[aiPath]!.exports = {
      ...originalAI,
      streamText: (options: Record<string, unknown>) => {
        calls.push(options);
        return {
          fullStream:
            calls.length === 1
              ? (async function* () {
                  yield {
                    type: 'tool-result',
                    toolCallId: 'fetch-1',
                    toolName: 'fetch_page',
                    output: {
                      success: true,
                      data: {
                        url: 'https://www.etymonline.com/word/swept',
                        title: 'swept | Etymology',
                        content:
                          'swept: past tense and past participle of sweep; Old English swapan.',
                      },
                    },
                  };
                  yield {
                    type: 'tool-result',
                    toolCallId: 'search-1',
                    toolName: 'search_etymology',
                    output: {
                      success: true,
                      data: {
                        results: [
                          {
                            title: 'sweep | Etymology',
                            url: 'https://www.etymonline.com/word/sweep',
                            snippet: 'sweep is from Old English swapan.',
                          },
                        ],
                      },
                    },
                  };
                  yield { type: 'finish', finishReason: 'tool-calls' };
                })()
              : (async function* () {
                  yield {
                    type: 'text-delta',
                    text: 'yield:\n  user_word: Swept\n  lemma: sweep\n  language: en\netymology:\n  historical_origins:\n    source_word: Old English swapan\n',
                  };
                })(),
        };
      },
    };

    delete require.cache[require.resolve('./pipe')];
    const { SequentialRunner } = require('./pipe') as typeof import('./pipe');

    try {
      const result = await new SequentialRunner().run({
        definition: {
          id: 'tool-search',
          language: 'en',
          stages: [
            {
              id: 'searching',
              description: 'Searching',
              type: 'llm',
              modelKey: 'fast',
              systemPromptFile: 'english-structural.md',
              toolNames: ['search_etymology', 'fetch_page'],
              outputParser: (text: string) => ({ researchYaml: text }),
            },
          ],
        },
        input: { word: 'Swept', language: 'en' },
        onProgress: () => undefined,
      });

      assert.match(result.yaml, /Old English swapan/);
    } finally {
      require.cache[aiPath]!.exports = originalAI;
    }

    assert.equal(calls.length, 2);
    assert.ok(calls[0].tools);
    assert.equal(calls[1].tools, undefined);
    assert.match(String(calls[1].system), /swept: past tense and past participle of sweep/);
    assert.match(String(calls[1].system), /sweep is from Old English swapan/);
  });

  void it('stores accumulated reasoning and raw text on completed stages', async () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-pipe-')),
      'config.json'
    );
    process.env.ADFONTES_CONFIG_PATH = configPath;
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        ai: {
          providers: [
            {
              id: 'realish',
              name: 'Realish',
              type: 'openai',
              baseUrl: 'https://mock.invalid/v1',
              apiKey: 'sk-live-test',
              models: [{ id: 'model-fast', name: 'model-fast' }],
            },
          ],
          stages: {
            fast: { provider: 'realish', model: 'model-fast', reasoningEffort: 'auto' },
          },
          review: { threshold: 6, thresholdByLanguage: {} },
        },
      }),
      'utf8'
    );
    const config = require('../../utils/config') as { clearCache: () => void };
    config.clearCache();
    const aiPath = require.resolve('ai');
    const originalAI = require(aiPath);
    require.cache[aiPath]!.exports = {
      ...originalAI,
      stepCountIs: originalAI.stepCountIs,
      streamText: () => ({
        fullStream: (async function* () {
          yield { type: 'reasoning-delta', text: 'thinking ' };
          yield { type: 'reasoning-delta', text: 'about crate' };
          yield { type: 'text-delta', text: 'yield:\n  lemma: crate\n  language: en\n' };
        })(),
      }),
    };

    delete require.cache[require.resolve('./pipe')];
    const { SequentialRunner } = require('./pipe') as typeof import('./pipe');
    const events: PipelineProgressEvent[] = [];

    try {
      await new SequentialRunner().run({
        definition: {
          id: 'single-stage',
          language: 'en',
          stages: [
            {
              id: 'searching',
              description: 'Searching',
              type: 'llm',
              modelKey: 'fast',
              systemPromptFile: 'english-structural.md',
              outputParser: (text: string) => ({ researchYaml: text }),
            },
          ],
        },
        input: { word: 'crate', language: 'en' },
        onProgress: event => events.push(event),
      });
    } finally {
      require.cache[aiPath]!.exports = originalAI;
    }

    const complete = events.find(
      (event): event is Extract<PipelineProgressEvent, { type: 'step:complete' }> =>
        event.type === 'step:complete'
    );
    assert.ok(complete);
    assert.equal(complete.reasoningText, 'thinking about crate');
    assert.equal(complete.rawText, 'yield:\n  lemma: crate\n  language: en\n');
  });

  void it('repairs common quoted-scalar YAML slips before merging creative output', async () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-pipe-')),
      'config.json'
    );
    process.env.ADFONTES_CONFIG_PATH = configPath;
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        ai: {
          providers: [
            {
              id: 'realish',
              name: 'Realish',
              type: 'openai',
              baseUrl: 'https://mock.invalid/v1',
              apiKey: 'sk-live-test',
              models: [
                { id: 'model-fast', name: 'model-fast' },
                { id: 'model-expert', name: 'model-expert' },
              ],
            },
          ],
          stages: {
            fast: { provider: 'realish', model: 'model-fast', reasoningEffort: 'auto' },
            expert: { provider: 'realish', model: 'model-expert', reasoningEffort: 'auto' },
          },
          review: { threshold: 6, thresholdByLanguage: {} },
        },
      }),
      'utf8'
    );
    const config = require('../../utils/config') as { clearCache: () => void };
    config.clearCache();

    const aiPath = require.resolve('ai');
    const originalAI = require(aiPath);
    const calls: Array<Record<string, unknown>> = [];
    const stageOutputs = [
      [
        'yield:',
        '  lemma: "composure"',
        '  language: "en"',
        'etymology:',
        '  root_and_affixes:',
        '    root: "pos" (from Latin ponere)',
        '  historical_origins:',
        '    source_word: "Latin componere"',
      ].join('\n'),
      [
        'etymology:',
        '  visual_imagery_zh: |',
        '    杯子终于落回杯碟中心。',
        '  meaning_evolution_zh: |',
        '    从放回原位走到心神归位。',
        'nuance:',
        '  image_differentiation_zh: |',
        '    composure 像把散掉的东西重新放稳。',
      ].join('\n'),
      JSON.stringify({ overall_score: 8, revision_notes: 'Keep it concrete.' }),
    ];

    require.cache[aiPath]!.exports = {
      ...originalAI,
      stepCountIs: originalAI.stepCountIs,
      streamText: (options: Record<string, unknown>) => {
        const text = stageOutputs[calls.length];
        calls.push(options);
        return {
          fullStream: (async function* () {
            yield { type: 'text-delta', text };
          })(),
        };
      },
    };

    delete require.cache[require.resolve('./pipe')];
    const { SequentialRunner } = require('./pipe') as typeof import('./pipe');
    const { englishPipeline } =
      require('./definitions/english') as typeof import('./definitions/english');

    try {
      const result = await new SequentialRunner().run({
        definition: englishPipeline,
        input: { word: 'composure', language: 'en' },
        onProgress: () => undefined,
      });

      assert.match(result.yaml, /root: pos \(from Latin ponere\)/);
      assert.match(result.yaml, /visual_imagery_zh:/);
      assert.doesNotMatch(String(calls[2].system), /杯子终于落回杯碟中心/);
      assert.match(String(calls[2].prompt), /visual_imagery_zh:/);
      assert.match(String(calls[2].prompt), /historical_origins:/);
    } finally {
      require.cache[aiPath]!.exports = originalAI;
    }
  });

  void it('replays previous steps with raw text and reasoning intact', async () => {
    writeMockAIConfig();
    const { SequentialRunner } = require('./pipe') as typeof import('./pipe');
    const events: PipelineProgressEvent[] = [];

    await new SequentialRunner().run({
      definition: {
        id: 'resume-replay',
        language: 'en',
        stages: [],
      },
      input: { word: 'crate', language: 'en' },
      resumeFromStage: 'pondering',
      previousSteps: [
        {
          step: 'searching',
          duration: 12,
          summary: 'Searched',
          result: { researchYaml: 'yield:\n  lemma: crate\n' },
          rawText: 'yield:\n  lemma: crate\n',
          reasoningText: 'search thinking',
        },
      ],
      onProgress: event => events.push(event),
    });

    const complete = events.find(
      (event): event is Extract<PipelineProgressEvent, { type: 'step:complete' }> =>
        event.type === 'step:complete' && event.step === 'searching'
    );
    assert.ok(complete);
    assert.equal(complete.rawText, 'yield:\n  lemma: crate\n');
    assert.equal(complete.reasoningText, 'search thinking');
  });

  void it('runs the English mock pipeline as searching, pondering, auditing and deep-merges YAML', async () => {
    writeMockAIConfig();
    const { SequentialRunner } = require('./pipe') as typeof import('./pipe');
    const { englishPipeline } =
      require('./definitions/english') as typeof import('./definitions/english');
    const events: PipelineProgressEvent[] = [];

    assert.deepEqual(
      englishPipeline.stages.map(stage => [
        stage.policy?.execution.kind,
        stage.policy?.output.kind,
        stage.policy?.assembly.kind,
        stage.policy?.stopLoss.kind,
      ]),
      [
        ['llm', 'yaml-fragment', 'none', 'require-text-and-context'],
        ['llm', 'yaml-fragment', 'merge-yaml', 'require-text-and-context'],
        ['llm', 'scores', 'none', 'none'],
      ]
    );

    const result = await new SequentialRunner().run({
      definition: englishPipeline,
      input: { word: 'conduct', context: 'The conductor raised a baton.', language: 'en' },
      onProgress: event => events.push(event),
    });

    const completedSteps = events
      .filter(
        (event): event is Extract<PipelineProgressEvent, { type: 'step:complete' }> =>
          event.type === 'step:complete'
      )
      .map(event => event.step);

    assert.deepEqual(completedSteps, ['searching', 'pondering', 'auditing']);
    assert.match(result.yaml, /historical_origins:/);
    assert.match(result.yaml, /visual_imagery_zh:/);
    assert.match(result.yaml, /image_differentiation_zh:/);
    assert.equal(typeof result.scores.overall_score, 'number');

    const pondering = events.find(
      (event): event is Extract<PipelineProgressEvent, { type: 'step:complete' }> =>
        event.type === 'step:complete' && event.step === 'pondering'
    );
    assert.ok(pondering?.rawText?.includes('visual_imagery_zh'));
  });

  void it('runs an English generate pipeline from Stage Policy without fixed Stage names', async () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-pipe-')),
      'config.json'
    );
    process.env.ADFONTES_CONFIG_PATH = configPath;
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        ai: {
          providers: [
            {
              id: 'realish',
              name: 'Realish',
              type: 'openai',
              baseUrl: 'https://mock.invalid/v1',
              apiKey: 'sk-live-test',
              models: [
                { id: 'model-fast', name: 'model-fast' },
                { id: 'model-expert', name: 'model-expert' },
              ],
            },
          ],
          stages: {
            fast: { provider: 'realish', model: 'model-fast', reasoningEffort: 'auto' },
            expert: { provider: 'realish', model: 'model-expert', reasoningEffort: 'auto' },
          },
          review: { threshold: 6, thresholdByLanguage: {} },
        },
      }),
      'utf8'
    );
    const config = require('../../utils/config') as { clearCache: () => void };
    config.clearCache();

    const aiPath = require.resolve('ai');
    const originalAI = require(aiPath);
    const stageOutputs = [
      'yield:\n  lemma: conduct\n  language: en\netymology:\n  historical_origins:\n    history_myth: research\n',
      'etymology:\n  visual_imagery_zh: 指挥棒把声音聚拢。\nnuance:\n  image_differentiation_zh: conduct 是引导路径。\n',
      JSON.stringify({ overall_score: 8, revision_notes: 'Keep it concrete.' }),
    ];
    require.cache[aiPath]!.exports = {
      ...originalAI,
      stepCountIs: originalAI.stepCountIs,
      streamText: () => {
        const text = stageOutputs.shift() || '';
        return {
          fullStream: (async function* () {
            yield { type: 'text-delta', text };
          })(),
        };
      },
    };

    delete require.cache[require.resolve('./pipe')];
    const { SequentialRunner } = require('./pipe') as typeof import('./pipe');
    const events: PipelineProgressEvent[] = [];

    try {
      const result = await new SequentialRunner().run({
        definition: {
          id: 'policy-defined-english',
          language: 'en',
          stages: [
            {
              id: 'research-pass',
              description: 'Research pass',
              type: 'llm',
              modelKey: 'fast',
              systemPromptFile: 'english-structural.md',
              outputParser: (text: string) => ({ researchYaml: text }),
              policy: {
                execution: { kind: 'llm', timeoutMs: 240_000 },
                output: { kind: 'yaml-fragment', contextKey: 'researchYaml' },
                assembly: { kind: 'none' },
                stopLoss: {
                  kind: 'require-text-and-context',
                  contextKey: 'researchYaml',
                  partialResultKey: 'researchYaml',
                },
              },
            },
            {
              id: 'creative-pass',
              description: 'Creative pass',
              type: 'llm',
              modelKey: 'expert',
              systemPromptFile: 'english-creative.md',
              outputParser: (text: string) => ({ creativeYaml: text }),
              policy: {
                execution: { kind: 'llm', timeoutMs: 600_000 },
                output: { kind: 'yaml-fragment', contextKey: 'creativeYaml' },
                assembly: {
                  kind: 'merge-yaml',
                  sourceKeys: ['researchYaml', 'creativeYaml'],
                  targetKey: 'fullYaml',
                },
                stopLoss: {
                  kind: 'require-text-and-context',
                  contextKey: 'creativeYaml',
                  partialResultKey: 'researchYaml',
                },
              },
            },
            {
              id: 'review-pass',
              description: 'Review pass',
              type: 'llm',
              modelKey: 'expert',
              systemPromptFile: 'content-reviewer.md',
              outputParser: (text: string) => ({ scores: JSON.parse(text) }),
              policy: {
                execution: {
                  kind: 'llm',
                  timeoutMs: 600_000,
                  maxOutputTokens: 377_216,
                },
                output: { kind: 'scores' },
                assembly: { kind: 'none' },
                stopLoss: { kind: 'none' },
              },
            },
          ],
        },
        input: { word: 'conduct', context: 'The conductor raised a baton.', language: 'en' },
        onProgress: event => events.push(event),
      });

      const completedSteps = events
        .filter(
          (event): event is Extract<PipelineProgressEvent, { type: 'step:complete' }> =>
            event.type === 'step:complete'
        )
        .map(event => event.step);

      assert.deepEqual(completedSteps, ['research-pass', 'creative-pass', 'review-pass']);
      assert.match(result.yaml, /historical_origins:/);
      assert.match(result.yaml, /visual_imagery_zh:/);
      assert.equal(result.scores.overall_score, 8);
    } finally {
      require.cache[aiPath]!.exports = originalAI;
    }
  });

  void it('selects German structural keys in the German mock pipeline', async () => {
    writeMockAIConfig();
    const { SequentialRunner } = require('./pipe') as typeof import('./pipe');
    const { germanPipeline } =
      require('./definitions/german') as typeof import('./definitions/german');

    const result = await new SequentialRunner().run({
      definition: germanPipeline,
      input: { word: 'See', context: 'Der See ist ruhig.', language: 'de' },
      onProgress: () => undefined,
    });

    assert.match(result.yaml, /language: de/);
    assert.match(result.yaml, /contextual_meaning:\n\s+de:/);
    assert.match(result.yaml, /morphological_analysis:/);
    assert.doesNotMatch(result.yaml, /root_and_affixes:/);
  });

  void it('returns prior YAML as a partial fallback when fixing is interrupted', async () => {
    writeMockAIConfig();
    const { SequentialRunner } = require('./pipe') as typeof import('./pipe');
    const events: PipelineProgressEvent[] = [];
    const priorYaml = 'yield:\n  lemma: dignity\n  language: en\n';

    const result = await new SequentialRunner().run({
      definition: {
        id: 'fix',
        language: '*',
        stages: [
          {
            id: 'fixing',
            description: 'Applying revision notes',
            type: 'llm',
            systemPromptFile: 'missing-fixer-prompt.md',
          },
        ],
      },
      input: { word: 'dignity', language: 'en', notes: 'Make it less generic.' },
      previousContext: { researchYaml: priorYaml },
      onProgress: event => events.push(event),
    });

    assert.equal(result.yaml, priorYaml);
    assert.equal(result.scores.fix_fallback, true);
    assert.ok(
      events.some(
        (event): event is Extract<PipelineProgressEvent, { type: 'pipeline:stopped' }> =>
          event.type === 'pipeline:stopped' && event.stoppedAtStage === 'fixing'
      )
    );
  });

  void it('passes malformed audit output into audit-fix scoring and revision notes', async () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-pipe-')),
      'config.json'
    );
    process.env.ADFONTES_CONFIG_PATH = configPath;
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        ai: {
          providers: [
            {
              id: 'realish',
              name: 'Realish',
              type: 'openai',
              baseUrl: 'https://mock.invalid/v1',
              apiKey: 'sk-live-test',
              models: [{ id: 'model-expert', name: 'model-expert' }],
            },
          ],
          stages: {
            expert: { provider: 'realish', model: 'model-expert', reasoningEffort: 'auto' },
            balanced: { provider: 'realish', model: 'model-expert', reasoningEffort: 'auto' },
          },
          review: { threshold: 6, thresholdByLanguage: {} },
        },
      }),
      'utf8'
    );
    const config = require('../../utils/config') as { clearCache: () => void };
    config.clearCache();

    const aiPath = require.resolve('ai');
    const originalAI = require(aiPath);
    const priorYaml = 'yield:\n  lemma: amuse\n  language: en\n';
    const fixedYaml = 'yield:\n  lemma: amuse\n  language: en\nfixed: true\n';
    const malformedAudit = `{
  "overall_score": 8,
  "overall_assessment": "visual_imagery_zh 扣除2分。",
  "revision_notes": "对 visual_imagery_zh 的修改意见：删掉「而是」转折句式。
}`;
    const stageOutputs = [malformedAudit, fixedYaml];
    const calls: Array<Record<string, unknown>> = [];

    require.cache[aiPath]!.exports = {
      ...originalAI,
      stepCountIs: originalAI.stepCountIs,
      streamText: (options: Record<string, unknown>) => {
        const text = stageOutputs[calls.length] || '';
        calls.push(options);
        return {
          fullStream: (async function* () {
            yield { type: 'text-delta', text };
          })(),
        };
      },
    };

    delete require.cache[require.resolve('./pipe')];
    delete require.cache[require.resolve('./definitions/audit-fix')];
    const { SequentialRunner } = require('./pipe') as typeof import('./pipe');
    const { auditFixPipeline } =
      require('./definitions/audit-fix') as typeof import('./definitions/audit-fix');

    try {
      const result = await new SequentialRunner().run({
        definition: auditFixPipeline,
        input: { word: 'amuse', language: 'en' },
        previousContext: { researchYaml: priorYaml },
        onProgress: () => undefined,
      });

      assert.equal(result.yaml, fixedYaml);
      assert.equal(result.scores.overall_score, 8);
      assert.match(String(calls[1].prompt), /lemma: amuse/);
      assert.match(String(calls[1].prompt), /删掉「而是」转折句式/);
      assert.doesNotMatch(String(calls[1].prompt), /overall_score/);
    } finally {
      require.cache[aiPath]!.exports = originalAI;
    }
  });

  void it('creates OpenAI chat model (not responses) to stay compatible with third-party providers', async () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-pipe-')),
      'config.json'
    );
    process.env.ADFONTES_CONFIG_PATH = configPath;
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        ai: {
          providers: [
            {
              id: 'realish',
              name: 'Realish',
              type: 'openai',
              baseUrl: 'https://third-party.invalid',
              apiKey: 'sk-live-test',
              models: [{ id: 'model-fast', name: 'model-fast' }],
            },
          ],
          stages: {
            fast: { provider: 'realish', model: 'model-fast', reasoningEffort: 'auto' },
          },
          review: { threshold: 6, thresholdByLanguage: {} },
        },
      }),
      'utf8'
    );
    const config = require('../../utils/config') as { clearCache: () => void };
    config.clearCache();

    const aiPath = require.resolve('ai');
    const originalAI = require(aiPath);
    let capturedModel: { provider?: string; modelId?: string } | null = null;
    require.cache[aiPath]!.exports = {
      ...originalAI,
      stepCountIs: originalAI.stepCountIs,
      streamText: (options: Record<string, unknown>) => {
        capturedModel = options.model as { provider?: string; modelId?: string };
        return {
          fullStream: (async function* () {
            yield { type: 'text-delta', text: 'yield:\n  lemma: crate\n  language: en\n' };
          })(),
        };
      },
    };

    delete require.cache[require.resolve('./pipe')];
    const { SequentialRunner } = require('./pipe') as typeof import('./pipe');

    try {
      await new SequentialRunner().run({
        definition: {
          id: 'single-stage',
          language: 'en',
          stages: [
            {
              id: 'searching',
              description: 'Searching',
              type: 'llm',
              modelKey: 'fast',
              systemPromptFile: 'english-structural.md',
              outputParser: (text: string) => ({ researchYaml: text }),
            },
          ],
        },
        input: { word: 'crate', language: 'en' },
        onProgress: () => undefined,
      });
    } finally {
      require.cache[aiPath]!.exports = originalAI;
    }

    assert.ok(capturedModel, 'Expected streamText to be called with a model');
    const model = capturedModel as { provider?: string; modelId?: string };
    assert.equal(model.modelId, 'model-fast');
    assert.ok(
      model.provider?.endsWith('.chat'),
      `Expected provider to end with '.chat' (Chat Completions API), got '${model.provider}'. ` +
        '@ai-sdk/openai v3 defaults to Responses API which third-party providers (SiliconFlow, etc.) do not support.'
    );
  });

  void it('passes SiliconFlow thinking options under the silicon provider key', async () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-pipe-')),
      'config.json'
    );
    process.env.ADFONTES_CONFIG_PATH = configPath;
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        ai: {
          providers: [
            {
              id: 'silicon',
              name: 'SiliconFlow',
              type: 'openai',
              baseUrl: 'https://api.siliconflow.cn/v1',
              apiKey: 'sk-live-test',
              models: [{ id: 'deepseek-ai/DeepSeek-V3.2', name: 'DeepSeek-V3.2' }],
            },
          ],
          stages: {
            expert: {
              provider: 'silicon',
              model: 'deepseek-ai/DeepSeek-V3.2',
              reasoningEffort: 'high',
            },
          },
          review: { threshold: 6, thresholdByLanguage: {} },
        },
      }),
      'utf8'
    );
    const config = require('../../utils/config') as { clearCache: () => void };
    config.clearCache();

    const aiPath = require.resolve('ai');
    const originalAI = require(aiPath);
    let capturedProviderOptions: unknown;
    require.cache[aiPath]!.exports = {
      ...originalAI,
      stepCountIs: originalAI.stepCountIs,
      streamText: (options: Record<string, unknown>) => {
        capturedProviderOptions = options.providerOptions;
        return {
          fullStream: (async function* () {
            yield { type: 'text-delta', text: '{"overall_score":9}' };
          })(),
        };
      },
    };

    delete require.cache[require.resolve('./pipe')];
    const { SequentialRunner } = require('./pipe') as typeof import('./pipe');

    try {
      await new SequentialRunner().run({
        definition: {
          id: 'single-stage',
          language: 'en',
          stages: [
            {
              id: 'auditing',
              description: 'Auditing',
              type: 'llm',
              modelKey: 'expert',
              systemPromptFile: 'content-reviewer.md',
              outputParser: (text: string) => ({ scores: JSON.parse(text) }),
            },
          ],
        },
        input: { word: 'amuse', language: 'en' },
        previousContext: { researchYaml: 'yield:\n  lemma: amuse\n  language: en\n' },
        onProgress: () => undefined,
      });
    } finally {
      require.cache[aiPath]!.exports = originalAI;
    }

    assert.deepEqual(capturedProviderOptions, {
      silicon: {
        enable_thinking: true,
        thinking_budget: 16000,
      },
    });
  });

  void it('sets a large output token budget for auditing stages', async () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-pipe-')),
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
              name: 'DeepSeek',
              type: 'anthropic',
              baseUrl: 'https://api.deepseek.com',
              anthropicBaseUrl: 'https://api.deepseek.com/anthropic',
              apiKey: 'sk-live-test',
              models: [
                {
                  id: 'deepseek-v4-pro',
                  name: 'deepseek-v4-pro',
                  endpointType: 'anthropic',
                },
              ],
            },
          ],
          stages: {
            expert: {
              provider: 'deepseek',
              model: 'deepseek-v4-pro',
              reasoningEffort: 'high',
            },
          },
          review: { threshold: 6, thresholdByLanguage: {} },
        },
      }),
      'utf8'
    );
    const config = require('../../utils/config') as { clearCache: () => void };
    config.clearCache();

    const aiPath = require.resolve('ai');
    const originalAI = require(aiPath);
    let capturedMaxOutputTokens: unknown;
    require.cache[aiPath]!.exports = {
      ...originalAI,
      stepCountIs: originalAI.stepCountIs,
      streamText: (options: Record<string, unknown>) => {
        capturedMaxOutputTokens = options.maxOutputTokens;
        return {
          fullStream: (async function* () {
            yield { type: 'text-delta', text: '{"overall_score":9}' };
          })(),
        };
      },
    };

    delete require.cache[require.resolve('./pipe')];
    const { SequentialRunner } = require('./pipe') as typeof import('./pipe');

    try {
      await new SequentialRunner().run({
        definition: {
          id: 'single-stage',
          language: 'en',
          stages: [
            {
              id: 'auditing',
              description: 'Auditing',
              type: 'llm',
              modelKey: 'expert',
              systemPromptFile: 'content-reviewer.md',
              outputParser: (text: string) => ({ scores: JSON.parse(text) }),
            },
          ],
        },
        input: { word: 'amuse', language: 'en' },
        previousContext: { researchYaml: 'yield:\n  lemma: amuse\n  language: en\n' },
        onProgress: () => undefined,
      });
    } finally {
      require.cache[aiPath]!.exports = originalAI;
    }

    assert.equal(capturedMaxOutputTokens, 377216);
  });

  void it('records stream diagnostics for completed auditing stages', async () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-pipe-')),
      'config.json'
    );
    process.env.ADFONTES_CONFIG_PATH = configPath;
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        ai: {
          providers: [
            {
              id: 'realish',
              name: 'Realish',
              type: 'openai',
              baseUrl: 'https://mock.invalid/v1',
              apiKey: 'sk-live-test',
              models: [{ id: 'model-expert', name: 'model-expert' }],
            },
          ],
          stages: {
            expert: { provider: 'realish', model: 'model-expert', reasoningEffort: 'auto' },
          },
          review: { threshold: 6, thresholdByLanguage: {} },
        },
      }),
      'utf8'
    );
    const config = require('../../utils/config') as { clearCache: () => void };
    config.clearCache();

    const aiPath = require.resolve('ai');
    const originalAI = require(aiPath);
    const events: PipelineProgressEvent[] = [];
    require.cache[aiPath]!.exports = {
      ...originalAI,
      stepCountIs: originalAI.stepCountIs,
      streamText: () => ({
        fullStream: (async function* () {
          yield { type: 'reasoning-delta', text: 'thinking' };
          yield { type: 'text-delta', text: '{"overall_score":9}' };
          yield {
            type: 'finish',
            finishReason: 'stop',
            usage: { inputTokens: 10, outputTokens: 5 },
          };
        })(),
      }),
    };

    delete require.cache[require.resolve('./pipe')];
    const { SequentialRunner } = require('./pipe') as typeof import('./pipe');

    try {
      await new SequentialRunner().run({
        definition: {
          id: 'single-stage',
          language: 'en',
          stages: [
            {
              id: 'auditing',
              description: 'Auditing',
              type: 'llm',
              modelKey: 'expert',
              systemPromptFile: 'content-reviewer.md',
              outputParser: (text: string) => ({ scores: JSON.parse(text) }),
            },
          ],
        },
        input: { word: 'amuse', language: 'en' },
        previousContext: { researchYaml: 'yield:\n  lemma: amuse\n  language: en\n' },
        onProgress: event => events.push(event),
      });
    } finally {
      require.cache[aiPath]!.exports = originalAI;
    }

    const diagnostic = events.find(
      (event): event is Extract<PipelineProgressEvent, { type: 'step:diagnostic' }> =>
        event.type === 'step:diagnostic'
    );
    assert.equal((diagnostic?.diagnostics as Record<string, unknown>).finishReason, 'stop');
    assert.equal((diagnostic?.diagnostics as Record<string, unknown>).textChars, 19);
    assert.equal((diagnostic?.diagnostics as Record<string, unknown>).reasoningChars, 8);

    const complete = events.find(
      (event): event is Extract<PipelineProgressEvent, { type: 'step:complete' }> =>
        event.type === 'step:complete'
    );
    assert.equal((complete?.diagnostics as Record<string, unknown>).finishReason, 'stop');
  });

  void it('fails auditing stages when the stream finish reason is length', async () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-pipe-')),
      'config.json'
    );
    process.env.ADFONTES_CONFIG_PATH = configPath;
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        ai: {
          providers: [
            {
              id: 'realish',
              name: 'Realish',
              type: 'openai',
              baseUrl: 'https://mock.invalid/v1',
              apiKey: 'sk-live-test',
              models: [{ id: 'model-expert', name: 'model-expert' }],
            },
          ],
          stages: {
            expert: { provider: 'realish', model: 'model-expert', reasoningEffort: 'auto' },
          },
          review: { threshold: 6, thresholdByLanguage: {} },
        },
      }),
      'utf8'
    );
    const config = require('../../utils/config') as { clearCache: () => void };
    config.clearCache();

    const aiPath = require.resolve('ai');
    const originalAI = require(aiPath);
    const events: PipelineProgressEvent[] = [];
    require.cache[aiPath]!.exports = {
      ...originalAI,
      stepCountIs: originalAI.stepCountIs,
      streamText: () => ({
        fullStream: (async function* () {
          yield { type: 'text-delta', text: '{"overall_score":3,"field_scores":{' };
          yield { type: 'finish', finishReason: 'length', usage: { outputTokens: 4096 } };
        })(),
      }),
    };

    delete require.cache[require.resolve('./pipe')];
    const { SequentialRunner } = require('./pipe') as typeof import('./pipe');

    try {
      await assert.rejects(
        () =>
          new SequentialRunner().run({
            definition: {
              id: 'single-stage',
              language: 'en',
              stages: [
                {
                  id: 'auditing',
                  description: 'Auditing',
                  type: 'llm',
                  modelKey: 'expert',
                  systemPromptFile: 'content-reviewer.md',
                  outputParser: (text: string) => ({ scores: JSON.parse(text) }),
                },
              ],
            },
            input: { word: 'amuse', language: 'en' },
            previousContext: { researchYaml: 'yield:\n  lemma: amuse\n  language: en\n' },
            onProgress: event => events.push(event),
          }),
        /finishReason=length/
      );
    } finally {
      require.cache[aiPath]!.exports = originalAI;
    }

    const error = events.find(
      (event): event is Extract<PipelineProgressEvent, { type: 'step:error' }> =>
        event.type === 'step:error'
    );
    assert.equal((error?.diagnostics as Record<string, unknown>).finishReason, 'length');
  });

  void it('uses fixing fullYaml as the final YAML instead of the pre-fix merged YAML', async () => {
    const configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-pipe-')),
      'config.json'
    );
    process.env.ADFONTES_CONFIG_PATH = configPath;
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        ai: {
          providers: [
            {
              id: 'realish',
              name: 'Realish',
              type: 'openai',
              baseUrl: 'https://mock.invalid/v1',
              apiKey: 'sk-live-test',
              models: [{ id: 'model-expert', name: 'model-expert' }],
            },
          ],
          stages: {
            expert: { provider: 'realish', model: 'model-expert', reasoningEffort: 'auto' },
          },
          review: { threshold: 6, thresholdByLanguage: {} },
        },
      }),
      'utf8'
    );
    const config = require('../../utils/config') as { clearCache: () => void };
    config.clearCache();
    const aiPath = require.resolve('ai');
    const originalAI = require(aiPath);
    const fixedYaml = 'yield:\n  lemma: dignity\n  language: en\nfixed: true\n';
    const oldMergedYaml = 'yield:\n  lemma: dignity\n  language: en\nold_merge: true\n';
    const stageOutputs = [
      fixedYaml,
      JSON.stringify({ overall_score: 9, revision_notes: '无需修改。' }),
    ];
    const events: PipelineProgressEvent[] = [];

    require.cache[aiPath]!.exports = {
      ...originalAI,
      stepCountIs: originalAI.stepCountIs,
      streamText: () => {
        const text = stageOutputs.shift() || '';
        return {
          fullStream: (async function* () {
            yield { type: 'text-delta', text };
          })(),
        };
      },
    };

    delete require.cache[require.resolve('./pipe')];
    const { SequentialRunner } = require('./pipe') as typeof import('./pipe');

    try {
      const result = await new SequentialRunner().run({
        definition: {
          id: 'fix',
          language: '*',
          stages: [
            {
              id: 'fixing',
              description: 'Applying revision notes',
              type: 'llm',
              modelKey: 'expert',
              systemPromptFile: 'content-fixer.md',
              outputParser: (text: string) => ({ fullYaml: text }),
            },
            {
              id: 'auditing',
              description: 'Auditing fixed YAML',
              type: 'llm',
              modelKey: 'expert',
              systemPromptFile: 'content-reviewer.md',
              outputParser: (text: string) => ({ scores: JSON.parse(text) }),
            },
          ],
        },
        input: { word: 'dignity', language: 'en', notes: 'Apply the fix.' },
        previousContext: { fullYaml: oldMergedYaml },
        resumeFromStage: 'fixing',
        onProgress: event => events.push(event),
      });

      assert.equal(result.yaml, fixedYaml);
      const complete = events.find(
        (event): event is Extract<PipelineProgressEvent, { type: 'pipeline:complete' }> =>
          event.type === 'pipeline:complete'
      );
      assert.equal(complete?.yaml, fixedYaml);
    } finally {
      require.cache[aiPath]!.exports = originalAI;
    }
  });
});
