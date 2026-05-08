import type { PipelineContext, PipelineRunner } from './types';

const yaml = require('js-yaml') as typeof import('js-yaml');
const { streamText } = require('ai') as typeof import('ai');
const { createOpenAI } = require('@ai-sdk/openai') as typeof import('@ai-sdk/openai');
const { createAnthropic } = require('@ai-sdk/anthropic') as typeof import('@ai-sdk/anthropic');
const { loggers } = require('../../utils/logger') as {
  loggers: {
    ai: {
      child: (payload: Record<string, unknown>) => {
        info: (payload: Record<string, unknown>, message?: string) => void;
        error: (payload: Record<string, unknown>, message?: string) => void;
      };
    };
  };
};
const { loadSystemPrompt } = require('./prompts/loader') as {
  loadSystemPrompt: (filename: string, variables: Record<string, string>) => string;
};
const { resolveModel } = require('./modelResolver') as {
  resolveModel: (stageName?: 'fast' | 'balanced' | 'expert') => {
    provider: string;
    modelId: string;
    apiKey: string;
    baseUrl: string;
    format: 'openai' | 'anthropic';
    isMock: boolean;
  };
};

function buildWordYaml(word: string, language: string, context: string): string {
  return yaml.dump(
    {
      yield: {
        user_word: word,
        lemma: word.toLowerCase(),
        syllabification: word,
        user_context_sentence: context || `I want to understand the word ${word}.`,
        part_of_speech: 'noun',
        contextual_meaning: {
          en: `A draft meaning for ${word}.`,
          zh: `${word} 的测试释义`,
        },
        other_common_meanings: ['Mock secondary meaning'],
        language,
      },
      etymology: {
        root_and_affixes: {
          prefix: 'N/A',
          root: word.toLowerCase(),
          suffix: 'N/A',
          structure_analysis: 'Mock structure analysis for the MVP pipeline.',
        },
        historical_origins: {
          history_myth: 'HELLO FROM RESEARCH AGENT',
          source_word: `${word.toLowerCase()} (mock source)`,
          pie_root: 'N/A',
        },
        visual_imagery_zh: '测试视觉意象：我把这个词先当作一张可检查的词源草图。',
        meaning_evolution_zh:
          'HELLO FROM ENRICHMENT AGENT：这里展示从词源画面到现代含义的测试路径。',
      },
      cognate_family: {
        cognates: [{ word: `${word.toLowerCase()}-kin`, logic: 'Mock cognate relationship.' }],
      },
      application: {
        selected_examples: [
          {
            type: 'Current Context',
            sentence: context || `The word ${word} appears in a learning note.`,
            translation_zh: '这是用于验证生成管道的例句。',
          },
        ],
      },
      nuance: {
        image_differentiation_zh: '测试意象区分：这里会比较近义词之间的根源画面差异。',
        synonyms: [{ word: 'term', meaning_zh: '词语' }],
      },
    },
    { lineWidth: -1, noRefs: true }
  );
}

function buildMockReview(): string {
  return JSON.stringify({
    overall_score: 7,
    field_scores: {
      visual_imagery_zh: {
        score: 7,
        verdict: 'pass',
        issues: ['Mock suggestion'],
        strengths: ['Mock positive feedback'],
      },
      meaning_evolution_zh: {
        score: 7,
        verdict: 'pass',
        issues: ['Mock suggestion'],
        strengths: ['Mock positive feedback'],
      },
      image_differentiation_zh: {
        score: 7,
        verdict: 'pass',
        issues: ['Mock suggestion'],
        strengths: ['Mock positive feedback'],
      },
    },
    overall_assessment: 'Mock assessment - prompts will be replaced with real content.',
  });
}

function buildPrompt(stageId: string, ctx: PipelineContext): string {
  const vars: Record<string, string> = {
    word: ctx.word,
    context: ctx.context || '',
    language: ctx.language,
    notes: ctx.notes || '',
    yaml: ctx.fullYaml || ctx.researchYaml || '',
    stage: stageId,
    researchYaml: ctx.researchYaml || '',
    searchSummary: ctx.searchSummary || '',
  };

  if (stageId === 'review') {
    return loadSystemPrompt('content-reviewer.md', vars);
  }

  const base = loadSystemPrompt('english-generation.md', vars);
  if (stageId === 'research') return base;

  return [
    base,
    '',
    '## Research Output',
    ctx.researchYaml || '',
    '',
    'Now generate the full YAML including all zh creative fields.',
  ].join('\n');
}

function createProvider(model: ReturnType<typeof resolveModel>) {
  if (model.format === 'openai') {
    return createOpenAI({ apiKey: model.apiKey, baseURL: model.baseUrl })(model.modelId);
  }
  if (model.format === 'anthropic') {
    return createAnthropic({ apiKey: model.apiKey, baseURL: model.baseUrl })(model.modelId);
  }
  throw new Error(`Unsupported model format: ${model.format}`);
}

const STAGE_TIMEOUT_MS: Record<string, number> = {
  research: 120_000,
  enrichment: 300_000,
  review: 180_000,
};

const BACKOFF_SCHEDULE = [2000, 8000];

function classifyLLMError(err: unknown): { code: string; willRetry: boolean } {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (msg.includes('429') || (msg.includes('rate') && msg.includes('limit'))) {
    return { code: 'rate_limit', willRetry: true };
  }
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) {
    return { code: 'provider_5xx', willRetry: true };
  }
  if (msg.includes('timeout') || msg.includes('abort')) {
    return { code: 'timeout', willRetry: false };
  }
  return { code: 'llm_error', willRetry: false };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runStageText(
  stageId: string,
  prompt: string,
  ctx: PipelineContext,
  onChunk: (chunk: string) => void,
  externalSignal?: globalThis.AbortSignal,
  runLogger?: {
    info: (payload: Record<string, unknown>, msg?: string) => void;
    error: (payload: Record<string, unknown>, msg?: string) => void;
  }
): Promise<string> {
  const model = resolveModel(
    stageId === 'research' ? 'fast' : stageId === 'review' ? 'expert' : 'balanced'
  );
  if (model.isMock) {
    if (stageId === 'review') return buildMockReview();
    return buildWordYaml(ctx.word, ctx.language, ctx.context);
  }

  const maxRetries = 1;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const timeoutMs = STAGE_TIMEOUT_MS[stageId] || 60_000;
    const stageController = new globalThis.AbortController();
    const timeoutId = setTimeout(() => stageController.abort(), timeoutMs);
    const signals: globalThis.AbortSignal[] = [stageController.signal];
    if (externalSignal) signals.push(externalSignal);
    const combinedSignal = signals.length > 1 ? globalThis.AbortSignal.any(signals) : signals[0];

    try {
      const result = streamText({
        model: createProvider(model),
        system: prompt,
        prompt: `Generate the ${stageId} output for "${ctx.word}".`,
        maxOutputTokens: 4096,
        abortSignal: combinedSignal,
      });

      let fullText = '';
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          fullText += part.text;
          onChunk(part.text);
        }
      }

      if (attempt > 0) {
        runLogger?.info({ stageId, attempt: attempt + 1 }, 'LLM call succeeded after retry');
      }
      return fullText;
    } catch (error) {
      lastError = error;
      const { code, willRetry } = classifyLLMError(error);
      runLogger?.error(
        { stageId, attempt: attempt + 1, errorCode: code, willRetry },
        `LLM call failed: ${error instanceof Error ? error.message : String(error)}`
      );

      if (willRetry && attempt < maxRetries) {
        const delay = BACKOFF_SCHEDULE[attempt] || 2000;
        runLogger?.info({ stageId, attempt: attempt + 1, delayMs: delay }, 'Retrying LLM call');
        await sleep(delay);
        continue;
      }
      break;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError;
}

function shouldSkipStage(stageId: string, resumeFrom?: string): boolean {
  if (!resumeFrom) return false;
  const stageOrder = ['research', 'enrichment', 'review'];
  const resumeIdx = stageOrder.indexOf(resumeFrom);
  const stageIdx = stageOrder.indexOf(stageId);
  return stageIdx < resumeIdx;
}

class SequentialRunner implements PipelineRunner {
  async run({
    definition,
    input,
    onProgress,
    abortSignal,
    resumeFromStage,
    previousContext,
    previousSteps,
  }: Parameters<PipelineRunner['run']>[0]) {
    const startTime = Date.now();
    const runLogger = loggers.ai.child({ word: input.word, language: input.language });
    const ctx: PipelineContext = {
      word: input.word,
      context: input.context || '',
      language: input.language,
      notes: input.notes || '',
      ...(previousContext || {}),
    };

    if (resumeFromStage) {
      runLogger.info(
        { event: 'pipeline:resume', fromStage: resumeFromStage },
        'AI pipeline resuming'
      );
      if (previousSteps) {
        for (const step of previousSteps) {
          onProgress({
            type: 'step:complete',
            step: step.step,
            duration: step.duration || 0,
            summary: step.summary || step.step,
            result: step.result,
          });
        }
      }
    } else {
      runLogger.info({ event: 'pipeline:start', pipeline: definition.id }, 'AI pipeline started');
    }

    for (const stage of definition.stages) {
      if (shouldSkipStage(stage.id, resumeFromStage)) {
        continue;
      }

      const stepStart = Date.now();
      onProgress({ type: 'step:start', step: stage.id, message: stage.description });
      runLogger.info({ step: stage.id, event: 'start' }, 'AI pipeline step started');

      try {
        const text = await runStageText(
          stage.id,
          buildPrompt(stage.id, ctx),
          ctx,
          chunk => onProgress({ type: 'step:tokens', step: stage.id, chunk }),
          abortSignal as globalThis.AbortSignal | undefined,
          runLogger
        );
        const parsed = stage.outputParser ? stage.outputParser(text) : { fullYaml: text };
        Object.assign(ctx, parsed);
        const duration = Date.now() - stepStart;
        onProgress({
          type: 'step:complete',
          step: stage.id,
          duration,
          summary: `${stage.description} 完成`,
          result: parsed,
        });
        runLogger.info(
          { step: stage.id, event: 'complete', durationMs: duration },
          'AI step complete'
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        onProgress({ type: 'step:error', step: stage.id, error: message, willRetry: true });
        runLogger.error({ step: stage.id, event: 'error', error: message }, 'AI step failed');
        throw error;
      }
    }

    const yamlText = ctx.fullYaml || ctx.researchYaml || '';
    const scores = ctx.scores || {};
    onProgress({
      type: 'pipeline:complete',
      yaml: yamlText,
      scores,
      totalDuration: Date.now() - startTime,
    });
    runLogger.info({ event: 'pipeline:complete' }, 'AI pipeline complete');
    return { yaml: yamlText, scores };
  }
}

const sequentialRunner = new SequentialRunner();

module.exports = { SequentialRunner, sequentialRunner };
