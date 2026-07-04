import type { Tool } from 'ai';
import type { AssembledPrompt } from '../prompts/assembler';
import type { PipelineContext, PipelineStage } from '../types';
import type { StageToolDescriptor, StageToolEvidence } from './StageRecipe';

// 这个模块负责执行一个 LLM Stage。
// 它现在使用 AI SDK 的 function-call 工具形态，但接口按“Stage Tool”设计，方便以后接 CLI、MCP 或自定义调用器。
const yaml = require('js-yaml') as typeof import('js-yaml');
const { createOpenAI } = require('@ai-sdk/openai') as typeof import('@ai-sdk/openai');
const { createOpenAICompatible } =
  require('@ai-sdk/openai-compatible') as typeof import('@ai-sdk/openai-compatible');
const { createAnthropic } = require('@ai-sdk/anthropic') as typeof import('@ai-sdk/anthropic');
const { getStagePolicy } =
  require('./PipelineDefinitionNormalizer') as typeof import('./PipelineDefinitionNormalizer');
const { StageToolResolver } =
  require('./StageToolResolver') as typeof import('./StageToolResolver');
const { resolveModel } = require('../provider') as {
  resolveModel: (stageName?: 'fast' | 'balanced' | 'expert') => {
    provider: string;
    modelId: string;
    apiKey: string;
    baseUrl: string;
    format: 'openai' | 'anthropic';
    reasoningEffort: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'auto';
    isMock: boolean;
  };
};
const { buildReasoningParams } =
  require('../tools/reasoning') as typeof import('../tools/reasoning');
const { CURRENT_WORD_SCHEMA_VERSION } = require('../../../schemas/word/version') as {
  CURRENT_WORD_SCHEMA_VERSION: number;
};

type StreamText = typeof import('ai').streamText;

export interface StageTextDiagnostics {
  stageId: string;
  provider: string;
  modelId: string;
  attempt: number;
  finishReason?: unknown;
  usage?: unknown;
  textChars: number;
  reasoningChars: number;
  chunkCount: number;
  reasoningChunkCount: number;
  lastPartType?: string;
  maxOutputTokens?: number;
}

export interface StageTextResult {
  text: string;
  diagnostics: StageTextDiagnostics;
  toolEvidence: StageToolEvidence[];
}

export interface RunStageTextOptions {
  stage: PipelineStage;
  prompt: AssembledPrompt;
  ctx: PipelineContext;
  onChunk: (chunk: string) => void;
  onToolCall?: (event: {
    toolCallId: string;
    toolName: string;
    input?: unknown;
    startTime: number;
  }) => void;
  onToolResult?: (event: {
    toolCallId: string;
    toolName: string;
    output?: unknown;
    error?: string;
    warning?: string;
    duration: number;
  }) => void;
  onReasoning?: (chunk: string) => void;
  externalSignal?: globalThis.AbortSignal;
  runLogger?: {
    info: (payload: Record<string, unknown>, msg?: string) => void;
    error: (payload: Record<string, unknown>, msg?: string) => void;
  };
}

const BACKOFF_SCHEDULE = [2000, 8000];

/**
 * 生成结构化阶段的 mock YAML，供本地测试和无真实模型配置时使用。
 */
function buildStructuralMock(word: string, language: string, context: string): string {
  if (language === 'de') {
    return yaml.dump(
      {
        ad_fontes: {
          word_schema_version: CURRENT_WORD_SCHEMA_VERSION,
        },
        yield: {
          user_word: word,
          lemma: word,
          genus: 'der',
          syllabification: word,
          kasus: 'Nominativ',
          user_context_sentence: context || `Der ${word} steht im Satz.`,
          part_of_speech: 'Nomen',
          contextual_meaning: {
            de: `Eine Testbedeutung fuer ${word}.`,
            zh: `${word} 的测试释义`,
          },
          other_common_meanings: ['Mock secondary meaning'],
          language,
        },
        etymology: {
          morphological_analysis: {
            word_formation: 'Mock formation',
            components: [
              {
                element: word.toLowerCase(),
                type: 'Wortstamm',
                de_meaning: 'Mock root meaning',
              },
            ],
            structure_analysis: 'Mock German structure analysis for the MVP pipeline.',
          },
          historical_origins: {
            earliest_attestation: 'Mock OHG',
            source_form: `${word.toLowerCase()} (mock source)`,
            pgmc_root: 'N/A',
            pie_root: 'N/A',
            sound_changes: 'N/A',
          },
        },
      },
      { lineWidth: -1, noRefs: true }
    );
  }

  return yaml.dump(
    {
      ad_fontes: {
        word_schema_version: CURRENT_WORD_SCHEMA_VERSION,
      },
      yield: {
        user_word: word,
        lemma: word.toLowerCase(),
        syllabification: word,
        word_forms: [word.toLowerCase(), `${word.toLowerCase()}s`, `${word.toLowerCase()}ed`],
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
          source_word: {
            language: 'en',
            word: `${word.toLowerCase()} (mock source)`,
            meaning: 'mock source meaning',
            relation: 'derived_from',
          },
          pie_root: 'N/A',
        },
      },
      word_formation: {
        derivations: [
          {
            language: 'en',
            word: word.toLowerCase(),
            part_of_speech: 'noun',
            relation: 'base_form',
            logic: 'Mock formation relationship.',
          },
        ],
      },
    },
    { lineWidth: -1, noRefs: true }
  );
}

/**
 * 生成补充内容阶段的 mock YAML。
 */
function buildCreativeMock(word: string, language: string, context: string): string {
  return yaml.dump(
    {
      etymology: {
        visual_imagery_zh: '测试视觉意象：我把这个词先当作一张可检查的词源草图。',
        meaning_evolution_zh:
          'HELLO FROM ENRICHMENT AGENT：这里展示从词源画面到现代含义的测试路径。',
      },
      cognate_family: {
        cognates: [
          {
            word: `${word.toLowerCase()}-kin`,
            language,
            relation: 'cognate',
            logic: 'Mock cognate relationship.',
          },
        ],
      },
      application: {
        selected_examples: [
          {
            type: 'Current Context',
            sentence: context || `The word ${word} appears in a learning note.`,
            translation_zh:
              language === 'de'
                ? '这是用于验证德语生成管道的例句。'
                : '这是用于验证生成管道的例句。',
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

/**
 * 生成审核阶段的 mock JSON。
 */
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

/**
 * 根据模型配置创建 AI SDK provider。
 */
function createProvider(model: ReturnType<typeof resolveModel>) {
  if (model.format === 'openai') {
    const isOfficialOpenAI = model.baseUrl.includes('api.openai.com');
    if (isOfficialOpenAI) {
      return createOpenAI({ apiKey: model.apiKey, baseURL: model.baseUrl }).chat(model.modelId);
    }

    // 第三方 OpenAI-compatible 服务更常兼容 Chat Completions；这里避免默认走 Responses API。
    return createOpenAICompatible({
      name: model.provider,
      apiKey: model.apiKey,
      baseURL: model.baseUrl,
    }).chatModel(model.modelId);
  }
  if (model.format === 'anthropic') {
    return createAnthropic({ apiKey: model.apiKey, baseURL: model.baseUrl })(model.modelId);
  }
  throw new Error(`Unsupported model format: ${model.format}`);
}

/**
 * 判断当前 Stage 是否应该走审核 mock 输出。
 */
function shouldUseReviewOutput(stage: PipelineStage): boolean {
  return getStagePolicy(stage).output.kind === 'scores';
}

/**
 * 判断当前 Stage 是否应该走结构化 mock 输出。
 */
function shouldUseStructuralOutput(stage: PipelineStage): boolean {
  return getStagePolicy(stage).output.contextKey === 'researchYaml';
}

/**
 * 把模型调用错误压成日志和重试逻辑需要的简单分类。
 */
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

/**
 * 等待下一次重试。
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 只在值确实是普通对象时返回 record。
 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * 压缩工具结果里的长文本，避免下一轮 prompt 太大。
 */
function compactText(value: unknown, maxLength = 1200): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}...` : text;
}

/**
 * 把成功的工具结果整理成给 fallback prompt 使用的证据摘要。
 */
export function summarizeToolEvidence(evidence: StageToolEvidence[]): string {
  const lines: string[] = [];

  for (const item of evidence) {
    const output = asRecord(item.output);
    if (!output || output.success === false) continue;

    const data = asRecord(output.data);
    if (!data) continue;

    if (item.toolName === 'fetch_page') {
      const title = compactText(data.title, 160);
      const url = compactText(data.url, 240);
      const content = compactText(data.content);
      if (!title && !url && !content) continue;

      lines.push(`Fetched page: ${title || url || 'untitled'}`);
      if (url) lines.push(`URL: ${url}`);
      if (content) lines.push(`Content: ${content}`);
      continue;
    }

    if (item.toolName === 'search_etymology') {
      const results = Array.isArray(data.results) ? data.results.slice(0, 5) : [];
      const resultLines = results
        .map(result => {
          const record = asRecord(result);
          if (!record) return '';
          const title = compactText(record.title, 160);
          const url = compactText(record.url, 240);
          const snippet = compactText(record.snippet, 600);
          if (!title && !url && !snippet) return '';
          return `- ${title || url || 'untitled'}${url ? ` (${url})` : ''}${snippet ? `: ${snippet}` : ''}`;
        })
        .filter(Boolean);

      if (resultLines.length > 0) {
        lines.push('Search results:');
        lines.push(...resultLines);
      }
    }
  }

  return lines.join('\n').trim();
}

/**
 * 把工具结果转成模型下一轮能直接阅读的短文本。
 */
function formatToolModelResult(toolName: string, output: unknown): string {
  const outputRecord = asRecord(output);
  if (!outputRecord) return `Tool ${toolName} returned: ${compactText(String(output), 1200)}`;

  if (outputRecord.success === false) {
    const errorMessage = compactText(outputRecord.errorMessage, 600);
    return `Tool ${toolName} failed${errorMessage ? `: ${errorMessage}` : '.'}`;
  }

  const data = asRecord(outputRecord.data);
  if (!data) {
    return `Tool ${toolName} returned: ${compactText(JSON.stringify(outputRecord), 1200)}`;
  }

  if (toolName === 'fetch_page') {
    const title = compactText(data.title, 160);
    const url = compactText(data.url, 240);
    const content = compactText(data.content, 900);
    return [
      `Tool fetch_page result: ${title || url || 'untitled'}`,
      url ? `URL: ${url}` : '',
      content ? `Content: ${content}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (toolName === 'search_etymology') {
    const results = Array.isArray(data.results) ? data.results.slice(0, 5) : [];
    const resultLines = results
      .map(result => {
        const record = asRecord(result);
        if (!record) return '';
        const title = compactText(record.title, 140);
        const url = compactText(record.url, 220);
        const snippet = compactText(record.snippet, 360);
        return `- ${title || url || 'untitled'}${url ? ` (${url})` : ''}${snippet ? `: ${snippet}` : ''}`;
      })
      .filter(Boolean);
    return [`Tool search_etymology results:`, ...resultLines].join('\n');
  }

  return `Tool ${toolName} returned: ${compactText(JSON.stringify(data), 1200)}`;
}

/**
 * 把上一轮工具结果追加到下一轮用户 prompt 后面。
 */
function appendToolResultsToPrompt(prompt: string, toolModelResults: string[]): string {
  if (toolModelResults.length === 0) return prompt;
  return [
    prompt,
    '',
    'Tool Results',
    'Use these compressed tool results as evidence for the next answer. Do not repeat tool calls unless more evidence is needed.',
    ...toolModelResults,
  ].join('\n');
}

/**
 * 执行时再读取 streamText，方便测试或未来适配器替换 AI SDK 调用。
 */
function streamStageText(options: Parameters<StreamText>[0]): ReturnType<StreamText> {
  const { streamText } = require('ai') as { streamText: StreamText };
  return streamText(options);
}

/**
 * 执行单个 LLM Stage，并把流式文本、推理文本、工具回合和诊断收集成统一结果。
 */
export class LlmStageExecutor {
  async runStageText(options: RunStageTextOptions): Promise<StageTextResult> {
    const {
      stage,
      prompt,
      ctx,
      onChunk,
      onToolCall,
      onToolResult,
      onReasoning,
      externalSignal,
      runLogger,
    } = options;
    const model = resolveModel(stage.modelKey || 'balanced');
    if (model.isMock) {
      // Mock 模式尽量沿用真实 Stage 的 Output Policy，这样测试能覆盖同一条流水线路径。
      const mockDiagnostics: StageTextDiagnostics = {
        stageId: stage.id,
        provider: model.provider,
        modelId: model.modelId,
        attempt: 1,
        finishReason: 'mock',
        textChars: 0,
        reasoningChars: 0,
        chunkCount: 0,
        reasoningChunkCount: 0,
        lastPartType: 'mock',
      };
      if (shouldUseReviewOutput(stage)) {
        const text = buildMockReview();
        return {
          text,
          diagnostics: { ...mockDiagnostics, textChars: text.length },
          toolEvidence: [],
        };
      }
      if (shouldUseStructuralOutput(stage)) {
        const text = buildStructuralMock(ctx.word, ctx.language, ctx.context);
        return {
          text,
          diagnostics: { ...mockDiagnostics, textChars: text.length },
          toolEvidence: [],
        };
      }
      const text = buildCreativeMock(ctx.word, ctx.language, ctx.context);
      return {
        text,
        diagnostics: { ...mockDiagnostics, textChars: text.length },
        toolEvidence: [],
      };
    }

    const maxRetries = 1;
    let lastError: unknown;
    const toolStartTimes = new Map<string, number>();
    const policy = getStagePolicy(stage);
    const stageToolResolution = new StageToolResolver().resolve(stage, runLogger);
    const tools = stageToolResolution.aiSdkTools as Record<string, Tool>;
    const toolDescriptors = new Map(
      stageToolResolution.descriptors.map((descriptor: StageToolDescriptor) => [
        descriptor.name,
        descriptor,
      ])
    );
    const reasoningParams = buildReasoningParams(
      model.format,
      model.reasoningEffort,
      model.provider
    );

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const timeoutMs = policy.execution.timeoutMs || 60_000;
      const stageController = new globalThis.AbortController();
      const timeoutId = setTimeout(() => stageController.abort(), timeoutMs);
      const signals: globalThis.AbortSignal[] = [stageController.signal];
      if (externalSignal) signals.push(externalSignal);
      const combinedSignal = signals.length > 1 ? globalThis.AbortSignal.any(signals) : signals[0];

      try {
        let fullText = '';
        let finishReason: unknown;
        let usage: unknown;
        let textChars = 0;
        let reasoningChars = 0;
        let chunkCount = 0;
        let reasoningChunkCount = 0;
        let lastPartType: string | undefined;
        const toolEvidence: StageToolEvidence[] = [];

        const hasTools = Object.keys(tools).length > 0;
        const maxToolRounds = hasTools ? policy.execution.tools?.maxRounds || 3 : 0;
        const toolModelResults: string[] = [];

        for (let toolRound = 0; ; toolRound += 1) {
          // 有工具时，模型可能先产出工具调用；工具结果会压缩后放进下一轮 prompt。
          const roundModelResults: string[] = [];
          const result = streamStageText({
            model: createProvider(model),
            system: prompt.system,
            prompt: appendToolResultsToPrompt(prompt.user, toolModelResults),
            abortSignal: combinedSignal,
            ...(policy.execution.maxOutputTokens
              ? { maxOutputTokens: policy.execution.maxOutputTokens }
              : {}),
            ...(hasTools ? { tools } : {}),
            ...(Object.keys(reasoningParams.providerOptions).length > 0
              ? {
                  providerOptions: reasoningParams.providerOptions as Record<
                    string,
                    Record<string, unknown>
                  >,
                }
              : {}),
          } as Parameters<StreamText>[0]);

          for await (const part of result.fullStream as AsyncIterable<Record<string, unknown>>) {
            lastPartType = String(part.type || '');
            if (part.type === 'text-delta') {
              const text =
                typeof part.delta === 'string'
                  ? part.delta
                  : typeof part.text === 'string'
                    ? part.text
                    : typeof part.textDelta === 'string'
                      ? part.textDelta
                      : '';
              fullText += text;
              textChars += text.length;
              chunkCount += 1;
              onChunk(text);
            } else if (part.type === 'reasoning-delta' || part.type === 'reasoning') {
              const reasoningText =
                typeof (part as Record<string, unknown>).delta === 'string'
                  ? ((part as Record<string, unknown>).delta as string)
                  : typeof (part as Record<string, unknown>).text === 'string'
                    ? ((part as Record<string, unknown>).text as string)
                    : typeof (part as Record<string, unknown>).textDelta === 'string'
                      ? ((part as Record<string, unknown>).textDelta as string)
                      : '';
              if (reasoningText) {
                reasoningChars += reasoningText.length;
                reasoningChunkCount += 1;
                onReasoning?.(reasoningText);
              }
            } else if (part.type === 'tool-call') {
              const toolCallId = String(part.toolCallId || `${stage.id}-${Date.now()}`);
              const toolName = String(part.toolName || 'unknown_tool');
              const startTime = Date.now();
              toolStartTimes.set(toolCallId, startTime);
              onToolCall?.({
                toolCallId,
                toolName,
                input: part.input,
                startTime,
              });
            } else if (part.type === 'tool-result') {
              const toolCallId = String(part.toolCallId || `${stage.id}-${Date.now()}`);
              const toolName = String(part.toolName || 'unknown_tool');
              const startedAt = toolStartTimes.get(toolCallId) || Date.now();
              const output = part.output;
              const resultObject =
                output && typeof output === 'object' && !Array.isArray(output)
                  ? (output as Record<string, unknown>)
                  : {};
              const modelResult = formatToolModelResult(toolName, output);
              if (resultObject.success !== false) {
                toolEvidence.push({
                  toolName,
                  toolKind: toolDescriptors.get(toolName)?.kind || 'custom',
                  output,
                  uiResult: output,
                  modelResult,
                });
                roundModelResults.push(modelResult);
              }
              onToolResult?.({
                toolCallId,
                toolName,
                output,
                error:
                  typeof resultObject.errorMessage === 'string'
                    ? resultObject.errorMessage
                    : undefined,
                warning:
                  resultObject.success === false
                    ? typeof resultObject.errorMessage === 'string'
                      ? resultObject.errorMessage
                      : 'Tool returned no usable result.'
                    : typeof resultObject.warning === 'string'
                      ? resultObject.warning
                      : undefined,
                duration: Date.now() - startedAt,
              });
              if (
                toolName === policy.execution.tools?.fallbackOnFailureToolName &&
                resultObject.success === false
              ) {
                // 搜索工具明确失败时，让 StagePolicyEngine 决定是否无工具重试。
                runLogger?.info(
                  {
                    step: stage.id,
                    toolName,
                    errorCode: resultObject.errorCode,
                  },
                  'Search tool failed; switching stage to no-tool fallback'
                );
                return {
                  text: '',
                  toolEvidence,
                  diagnostics: {
                    stageId: stage.id,
                    provider: model.provider,
                    modelId: model.modelId,
                    attempt: attempt + 1,
                    finishReason: 'tool-fallback',
                    textChars,
                    reasoningChars,
                    chunkCount,
                    reasoningChunkCount,
                    lastPartType,
                  },
                };
              }
            }

            if ('finishReason' in part) {
              finishReason = part.finishReason;
            }
            if ('usage' in part) {
              usage = part.usage;
            } else if ('totalUsage' in part) {
              usage = part.totalUsage;
            }
          }

          if (
            fullText.trim() ||
            !hasTools ||
            roundModelResults.length === 0 ||
            toolRound >= maxToolRounds
          ) {
            break;
          }
          // 本轮没有正文但拿到了工具结果，继续让模型基于这些结果生成正文。
          toolModelResults.push(...roundModelResults);
        }

        const diagnostics: StageTextDiagnostics = {
          stageId: stage.id,
          provider: model.provider,
          modelId: model.modelId,
          attempt: attempt + 1,
          finishReason,
          usage,
          textChars,
          reasoningChars,
          chunkCount,
          reasoningChunkCount,
          lastPartType,
          ...(policy.execution.maxOutputTokens
            ? { maxOutputTokens: policy.execution.maxOutputTokens }
            : {}),
        };

        runLogger?.info(diagnostics as unknown as Record<string, unknown>, 'LLM stream finished');

        if (finishReason === 'length') {
          // 截断输出通常不完整，交给外层按失败处理。
          const err = new Error(
            `${stage.id}: LLM output was truncated because finishReason=length`
          );
          (err as Error & { diagnostics?: StageTextDiagnostics }).diagnostics = diagnostics;
          throw err;
        }

        if (attempt > 0) {
          runLogger?.info(
            { stageId: stage.id, attempt: attempt + 1 },
            'LLM call succeeded after retry'
          );
        }
        return { text: fullText, diagnostics, toolEvidence };
      } catch (error) {
        lastError = error;
        const { code, willRetry } = classifyLLMError(error);
        runLogger?.error(
          { stageId: stage.id, attempt: attempt + 1, errorCode: code, willRetry },
          `LLM call failed: ${error instanceof Error ? error.message : String(error)}`
        );

        if (willRetry && attempt < maxRetries) {
          const delay = BACKOFF_SCHEDULE[attempt] || 2000;
          runLogger?.info(
            { stageId: stage.id, attempt: attempt + 1, delayMs: delay },
            'Retrying LLM call'
          );
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
}
