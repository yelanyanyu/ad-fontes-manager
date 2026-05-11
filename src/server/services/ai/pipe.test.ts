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
});
