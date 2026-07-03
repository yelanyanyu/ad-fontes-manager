import type { PipelineContext, PipelineContextKey, PipelineRunner, PipelineStage } from './types';
import type { Tool } from 'ai';
import type { AssembledPrompt } from './prompts/assembler';

const yaml = require('js-yaml') as typeof import('js-yaml');
const { streamText } = require('ai') as typeof import('ai');
const { createOpenAI } = require('@ai-sdk/openai') as typeof import('@ai-sdk/openai');
const { createOpenAICompatible } =
  require('@ai-sdk/openai-compatible') as typeof import('@ai-sdk/openai-compatible');
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
const { assemblePrompt } = require('./prompts/assembler') as {
  assemblePrompt: (stage: PipelineStage, ctx: PipelineContext) => AssembledPrompt;
};
const { PipelineDefinitionNormalizer, getStagePolicy } =
  require('./PipelineDefinitionNormalizer') as typeof import('./PipelineDefinitionNormalizer');
const { resolveModel } = require('./modelResolver') as {
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
const { mergeYamlTexts } = require('./utils') as typeof import('./utils');
const { resolveTools } = require('./tools/adapter') as {
  resolveTools: (toolNames?: string[]) => Record<string, Tool>;
};
const { buildReasoningParams } = require('./tools/reasoning') as typeof import('./tools/reasoning');
const { getAIConfig } = require('./configService') as {
  getAIConfig: () => {
    search?: {
      apiKey?: string;
    };
  };
};
const { CURRENT_WORD_SCHEMA_VERSION } = require('../../schemas/word/version') as {
  CURRENT_WORD_SCHEMA_VERSION: number;
};

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

function createProvider(model: ReturnType<typeof resolveModel>) {
  if (model.format === 'openai') {
    const isOfficialOpenAI = model.baseUrl.includes('api.openai.com');
    if (isOfficialOpenAI) {
      return createOpenAI({ apiKey: model.apiKey, baseURL: model.baseUrl }).chat(model.modelId);
    }

    // Third-party OpenAI-compatible providers need Chat Completions semantics
    // and their own providerOptions key, which @ai-sdk/openai-compatible supplies.
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

const BACKOFF_SCHEDULE = [2000, 8000];

function getContextValue(ctx: Partial<PipelineContext>, key?: PipelineContextKey): unknown {
  if (!key) return undefined;
  return ctx[key];
}

function shouldUseReviewOutput(stage: PipelineStage): boolean {
  return getStagePolicy(stage).output.kind === 'scores';
}

function shouldUseStructuralOutput(stage: PipelineStage): boolean {
  return getStagePolicy(stage).output.contextKey === 'researchYaml';
}

interface StageTextDiagnostics {
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

interface ToolEvidence {
  toolName: string;
  output?: unknown;
  modelResult?: string;
}

interface StageTextResult {
  text: string;
  diagnostics: StageTextDiagnostics;
  toolEvidence: ToolEvidence[];
}

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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function compactText(value: unknown, maxLength = 1200): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}...` : text;
}

function summarizeToolEvidence(evidence: ToolEvidence[]): string {
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

interface RunStageTextOptions {
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

async function runStageText(options: RunStageTextOptions): Promise<StageTextResult> {
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
    return { text, diagnostics: { ...mockDiagnostics, textChars: text.length }, toolEvidence: [] };
  }

  const maxRetries = 1;
  let lastError: unknown;
  const toolStartTimes = new Map<string, number>();
  const policy = getStagePolicy(stage);
  const tools = resolveStageTools(stage, runLogger);
  const reasoningParams = buildReasoningParams(model.format, model.reasoningEffort, model.provider);

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
      const toolEvidence: ToolEvidence[] = [];

      const hasTools = Object.keys(tools).length > 0;
      const maxToolRounds = hasTools ? policy.execution.tools?.maxRounds || 3 : 0;
      const toolModelResults: string[] = [];

      for (let toolRound = 0; ; toolRound += 1) {
        const roundModelResults: string[] = [];
        const result = streamText({
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
        } as Parameters<typeof streamText>[0]);

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
              toolEvidence.push({ toolName, output, modelResult });
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
        const err = new Error(`${stage.id}: LLM output was truncated because finishReason=length`);
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

function shouldSkipStage(stages: PipelineStage[], stageId: string, resumeFrom?: string): boolean {
  if (!resumeFrom) return false;
  const stageOrder = stages.map(stage => stage.id);
  const resumeIdx = stageOrder.indexOf(resumeFrom);
  const stageIdx = stageOrder.indexOf(stageId);
  return stageIdx < resumeIdx;
}

function mergeCreativeYaml(
  ctx: PipelineContext,
  runLogger?: {
    info: (payload: Record<string, unknown>, msg?: string) => void;
    error: (payload: Record<string, unknown>, msg?: string) => void;
  }
): void {
  if (!ctx.researchYaml || !ctx.creativeYaml) {
    runLogger?.info(
      {
        hasResearchYaml: Boolean(ctx.researchYaml),
        hasCreativeYaml: Boolean(ctx.creativeYaml),
      },
      'mergeCreativeYaml: missing input YAML, skipping merge'
    );
    return;
  }

  try {
    ctx.fullYaml = mergeYamlTexts(ctx.researchYaml, ctx.creativeYaml);
    runLogger?.info(
      { fullYamlChars: ctx.fullYaml.length },
      'mergeCreativeYaml: merged YAML successfully'
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runLogger?.error({ error: msg }, 'mergeCreativeYaml: yaml.load or deepMerge threw');
    // Fallback: concatenate research + creative so auditing still sees creative fields.
    ctx.fullYaml = `${ctx.researchYaml}\n${ctx.creativeYaml}`;
    runLogger?.info(
      { fullYamlChars: ctx.fullYaml.length },
      'mergeCreativeYaml: used concatenation fallback'
    );
  }
}

function checkStopLoss(
  stage: PipelineStage,
  text: string,
  parsed: Partial<PipelineContext>
): { stopped: boolean; reason?: string } {
  const policy = getStagePolicy(stage).stopLoss;
  if (policy.kind === 'none') return { stopped: false };

  if (!text.trim()) {
    return {
      stopped: true,
      reason: `${stage.id}: required ${policy.contextKey || 'output'} is empty because LLM returned empty text`,
    };
  }

  const value = getContextValue(parsed, policy.contextKey);
  if (!value || (typeof value === 'string' && !value.trim())) {
    return {
      stopped: true,
      reason: `${stage.id}: parsed ${policy.contextKey || 'output'} is empty after fence stripping`,
    };
  }

  return { stopped: false };
}

function parseStageOutput(stage: PipelineStage, text: string): Partial<PipelineContext> {
  if (stage.outputParser) return stage.outputParser(text);

  const outputPolicy = getStagePolicy(stage).output;
  if (outputPolicy.kind === 'scores') return { scores: {} };
  if (outputPolicy.contextKey) {
    return { [outputPolicy.contextKey]: text } as Partial<PipelineContext>;
  }
  return { fullYaml: text };
}

function resolveStageTools(
  stage: PipelineStage,
  runLogger?: {
    info: (payload: Record<string, unknown>, msg?: string) => void;
  }
): Record<string, Tool> {
  const policy = getStagePolicy(stage);
  const toolNames = policy.execution.tools?.names || stage.toolNames || [];
  if (policy.execution.tools?.requiresSearchApiKey && toolNames.includes('search_etymology')) {
    const aiConfig = getAIConfig();
    if (!aiConfig.search?.apiKey) {
      runLogger?.info(
        { step: stage.id, event: 'search-tools-disabled' },
        'Search tools disabled because search API key is not configured'
      );
      return {};
    }
  }

  return resolveTools(toolNames);
}

function applyAssemblyPolicy(
  stage: PipelineStage,
  ctx: PipelineContext,
  runLogger?: {
    info: (payload: Record<string, unknown>, msg?: string) => void;
    error: (payload: Record<string, unknown>, msg?: string) => void;
  }
): void {
  const policy = getStagePolicy(stage).assembly;
  if (policy.kind === 'merge-yaml') {
    mergeCreativeYaml(ctx, runLogger);
  }
}

function getPartialYamlForStop(stage: PipelineStage, ctx: PipelineContext): string {
  const key = getStagePolicy(stage).stopLoss.partialResultKey;
  const value = getContextValue(ctx, key);
  return typeof value === 'string' ? value : ctx.researchYaml || '';
}

export class SequentialRunner implements PipelineRunner {
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
    const normalizedDefinition = new PipelineDefinitionNormalizer().normalize(definition);
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
      if (ctx.researchYaml && ctx.creativeYaml && !ctx.fullYaml) {
        mergeCreativeYaml(ctx, runLogger);
      }
      if (previousSteps) {
        for (const step of previousSteps) {
          onProgress({
            type: 'step:complete',
            step: step.step,
            duration: step.duration || 0,
            summary: step.summary || step.step,
            result: step.result,
            rawText: step.rawText,
            reasoningText: step.reasoningText,
          });
        }
      }
    } else {
      runLogger.info(
        { event: 'pipeline:start', pipeline: normalizedDefinition.id },
        'AI pipeline started'
      );
    }

    for (const stage of normalizedDefinition.stages) {
      if (shouldSkipStage(normalizedDefinition.stages, stage.id, resumeFromStage)) {
        continue;
      }

      const stepStart = Date.now();
      onProgress({ type: 'step:start', step: stage.id, message: stage.description });
      runLogger.info({ step: stage.id, event: 'start' }, 'AI pipeline step started');

      try {
        let reasoningText = '';
        const stageRun = await runStageText({
          stage,
          prompt: assemblePrompt(stage, ctx),
          ctx,
          onChunk: chunk => onProgress({ type: 'step:tokens', step: stage.id, chunk }),
          onToolCall: event => onProgress({ type: 'step:tool-call', step: stage.id, ...event }),
          onToolResult: event => onProgress({ type: 'step:tool-result', step: stage.id, ...event }),
          onReasoning: chunk => {
            reasoningText += chunk;
            onProgress({ type: 'step:reasoning', step: stage.id, chunk });
          },
          externalSignal: abortSignal as globalThis.AbortSignal | undefined,
          runLogger,
        });
        let text = stageRun.text;
        let streamDiagnostics = stageRun.diagnostics;
        const stagePolicy = getStagePolicy(stage);
        const searchEvidenceSummary = stagePolicy.stopLoss.fallback?.useToolEvidenceSummary
          ? summarizeToolEvidence(stageRun.toolEvidence)
          : '';
        onProgress({
          type: 'step:diagnostic',
          step: stage.id,
          diagnostics: streamDiagnostics,
        });
        let parsed = parseStageOutput(stage, text);
        if (stagePolicy.output.kind === 'scores' && parsed.scores?._parse_error) {
          runLogger.error(
            {
              stageId: stage.id,
              rawTextChars: text.length,
              rawTextTail: text.slice(-500),
              finishReason: streamDiagnostics.finishReason,
              usage: streamDiagnostics.usage,
            },
            'Auditing output failed to parse'
          );
        }
        Object.assign(ctx, parsed);

        let stopResult = checkStopLoss(stage, text, parsed);
        if (stopResult.stopped) {
          let fallbackText = text;
          let fallbackParsed = parsed;

          if (stagePolicy.stopLoss.fallback?.kind === 'retry-without-tools') {
            runLogger.info(
              {
                step: stage.id,
                reason: stopResult.reason,
                hasToolEvidence: Boolean(searchEvidenceSummary),
              },
              searchEvidenceSummary
                ? 'Synthesizing searching stage from collected tool evidence'
                : 'Retrying searching stage without tools'
            );

            const fallbackStage: PipelineStage = {
              ...stage,
              toolNames: [],
              policy: {
                ...stagePolicy,
                execution: {
                  ...stagePolicy.execution,
                  tools: undefined,
                },
              },
            };
            const fallbackCtx: PipelineContext = searchEvidenceSummary
              ? {
                  ...ctx,
                  searchSummary: [ctx.searchSummary, searchEvidenceSummary]
                    .filter(Boolean)
                    .join('\n\n'),
                }
              : ctx;
            try {
              reasoningText = '';
              const fallbackRun = await runStageText({
                stage: fallbackStage,
                prompt: assemblePrompt(fallbackStage, fallbackCtx),
                ctx: fallbackCtx,
                onChunk: chunk => onProgress({ type: 'step:tokens', step: stage.id, chunk }),
                onReasoning: chunk => {
                  reasoningText += chunk;
                  onProgress({ type: 'step:reasoning', step: stage.id, chunk });
                },
                externalSignal: abortSignal as globalThis.AbortSignal | undefined,
                runLogger,
              });
              fallbackText = fallbackRun.text;
              streamDiagnostics = fallbackRun.diagnostics;
              onProgress({
                type: 'step:diagnostic',
                step: stage.id,
                diagnostics: streamDiagnostics,
              });
              fallbackParsed = parseStageOutput(stage, fallbackText);
              stopResult = checkStopLoss(stage, fallbackText, fallbackParsed);
            } catch (err) {
              runLogger.error(
                { step: stage.id, error: err instanceof Error ? err.message : String(err) },
                'Fallback searching stage also failed'
              );
            }
          }

          if (stopResult.stopped) {
            const duration = Date.now() - stepStart;
            onProgress({
              type: 'step:complete',
              step: stage.id,
              duration,
              summary: `Stopped: ${stopResult.reason}`,
              result: fallbackParsed,
              rawText: fallbackText,
              reasoningText,
              diagnostics: streamDiagnostics,
            });
            runLogger.info(
              { step: stage.id, event: 'stopped', reason: stopResult.reason, durationMs: duration },
              'AI step stopped by stop-loss'
            );

            const partialYaml = getPartialYamlForStop(stage, ctx);
            onProgress({
              type: 'pipeline:stopped',
              yaml: partialYaml,
              stoppedAtStage: stage.id,
              reason: stopResult.reason || 'unknown',
            });
            runLogger.info(
              { event: 'pipeline:stopped', stoppedAtStage: stage.id },
              'AI pipeline stopped by stop-loss'
            );
            return { yaml: partialYaml, scores: ctx.scores || {} };
          }

          Object.assign(ctx, fallbackParsed);
          text = fallbackText;
          parsed = fallbackParsed;
          runLogger.info({ step: stage.id }, 'Fallback searching stage succeeded');
        }

        applyAssemblyPolicy(stage, ctx, runLogger);
        const duration = Date.now() - stepStart;
        onProgress({
          type: 'step:complete',
          step: stage.id,
          duration,
          summary: `${stage.description} 完成`,
          result: parsed,
          rawText: text,
          reasoningText,
          diagnostics: streamDiagnostics,
        });
        runLogger.info(
          { step: stage.id, event: 'complete', durationMs: duration },
          'AI step complete'
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const errorDiagnostics = (error as { diagnostics?: StageTextDiagnostics } | undefined)
          ?.diagnostics;
        if (stage.id === 'fixing') {
          const fallbackYaml = ctx.fullYaml || ctx.researchYaml || '';
          const duration = Date.now() - stepStart;
          onProgress({
            type: 'step:complete',
            step: stage.id,
            duration,
            summary: `Fix interrupted: ${message}. Kept prior YAML.`,
            result: { fullYaml: fallbackYaml, fallback: true, error: message },
            diagnostics: errorDiagnostics,
          });
          onProgress({
            type: 'pipeline:stopped',
            yaml: fallbackYaml,
            stoppedAtStage: stage.id,
            reason: message,
          });
          runLogger.error(
            { step: stage.id, event: 'fallback', error: message },
            'Fix step failed; returning prior YAML fallback'
          );
          return {
            yaml: fallbackYaml,
            scores: { ...ctx.scores, fix_fallback: true, fix_error: message },
          };
        }
        onProgress({
          type: 'step:error',
          step: stage.id,
          error: message,
          willRetry: true,
          diagnostics: errorDiagnostics,
        });
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
