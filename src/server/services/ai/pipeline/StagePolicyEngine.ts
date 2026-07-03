import type { AssembledPrompt } from '../prompts/assembler';
import type { NormalizedPipelineStage } from './PipelineDefinitionNormalizer';
import type { StageContextPatch, StageRecipeRunOutcome } from './StageRecipe';
import type { PipelineContext, PipelineProgressEvent } from '../types';

// 这个模块只处理单个 Stage 的执行规则。
// Runner 负责排队、恢复和合并上下文；这里负责解析输出、Stop-loss、回退和进度事件。
const { mergeYamlTexts } = require('../utils') as typeof import('../utils');

type ToolCallEvent = Omit<
  Extract<PipelineProgressEvent, { type: 'step:tool-call' }>,
  'type' | 'step'
>;
type ToolResultEvent = Omit<
  Extract<PipelineProgressEvent, { type: 'step:tool-result' }>,
  'type' | 'step'
>;

export interface StageToolEvidence {
  toolName: string;
  output?: unknown;
  modelResult?: string;
}

// LLM 适配器返回的原始结果。Engine 只依赖这些字段，不关心具体供应商。
export interface StageTextResult {
  text: string;
  reasoningText?: string;
  diagnostics?: unknown;
  toolEvidence?: StageToolEvidence[];
}

// Engine 需要外部提供的能力。这样可以把策略逻辑和真实 LLM 调用分开测试。
export interface StagePolicyEngineAdapters {
  runStageText(params: {
    stage: NormalizedPipelineStage;
    prompt: AssembledPrompt;
    ctx: PipelineContext;
    isFallback?: boolean;
    onChunk: (chunk: string) => void;
    onReasoning: (chunk: string) => void;
    onToolCall: (event: ToolCallEvent) => void;
    onToolResult: (event: ToolResultEvent) => void;
  }): Promise<StageTextResult>;
  assemblePrompt?: (stage: NormalizedPipelineStage, ctx: PipelineContext) => AssembledPrompt;
  summarizeToolEvidence?: (evidence: StageToolEvidence[]) => string;
  emit?: (event: PipelineProgressEvent) => void;
}

export type StageOutcome = StageRecipeRunOutcome;

// 执行一个已经补齐 policy 的 Stage。
// 它不拼 prompt，也不决定下一个 Stage；这些事留给 Runner。
export class StagePolicyEngine {
  constructor(private readonly adapters: StagePolicyEngineAdapters) {}

  /**
   * 运行一个 Stage，返回 Runner 可以合并进 Pipeline Context 的补丁。
   */
  async executeStage(params: {
    stage: NormalizedPipelineStage;
    ctx: PipelineContext;
    prompt: AssembledPrompt;
  }): Promise<StageOutcome> {
    const startedAt = Date.now();
    let stageRun = await this.runStageText(params);

    // 先按 Output Policy 解析，再用 Stop-loss 判断这次输出能不能继续用。
    let contextPatch = this.parseStageOutput(params.stage, stageRun.text);
    this.emitDiagnostic(params.stage.id, stageRun.diagnostics);
    let stopResult = this.checkStopLoss(params.stage, stageRun.text, contextPatch);

    // 有些搜索 Stage 会先用工具跑；工具没有给出正文时，再用工具证据跑一次无工具版本。
    if (stopResult.stopped) {
      const fallbackRun = await this.retryWithoutTools(params, stageRun);
      if (fallbackRun) {
        stageRun = fallbackRun;
        contextPatch = this.parseStageOutput(params.stage, stageRun.text);
        this.emitDiagnostic(params.stage.id, stageRun.diagnostics);
        stopResult = this.checkStopLoss(params.stage, stageRun.text, contextPatch);
      }
    }

    if (stopResult.stopped) {
      // 仍然没有可用结果时，不写 ctx，直接把已有的部分 YAML 交回 Runner。
      const outcome: StageOutcome = {
        status: 'stopped',
        contextPatch,
        rawText: stageRun.text,
        reasoningText: stageRun.reasoningText,
        diagnostics: stageRun.diagnostics,
        summary: `Stopped: ${stopResult.reason}`,
        durationMs: Date.now() - startedAt,
        yaml: this.getPartialYamlForStop(params.stage, params.ctx),
        reason: stopResult.reason || 'unknown',
        stoppedAtStage: params.stage.id,
      };
      this.emitStepComplete(params.stage, outcome);
      return outcome;
    }

    // 只有通过 Stop-loss 的结果才会变成补丁；真正写回 ctx 的动作留给 Runner。
    const acceptedPatch = this.buildAcceptedPatch(params.stage, params.ctx, contextPatch);

    const outcome: StageOutcome = {
      status: 'complete',
      contextPatch: acceptedPatch,
      rawText: stageRun.text,
      reasoningText: stageRun.reasoningText,
      diagnostics: stageRun.diagnostics,
      summary: `${params.stage.description} 完成`,
      durationMs: Date.now() - startedAt,
    };
    this.emitStepComplete(params.stage, outcome);
    return outcome;
  }

  /**
   * 调用外部 LLM 适配器，并把流式事件补上当前 Stage。
   */
  private runStageText(params: {
    stage: NormalizedPipelineStage;
    ctx: PipelineContext;
    prompt: AssembledPrompt;
    isFallback?: boolean;
  }): Promise<StageTextResult> {
    return this.adapters.runStageText({
      ...params,
      onChunk: chunk => {
        this.adapters.emit?.({ type: 'step:tokens', step: params.stage.id, chunk });
      },
      onReasoning: chunk => {
        this.adapters.emit?.({ type: 'step:reasoning', step: params.stage.id, chunk });
      },
      onToolCall: event => {
        this.adapters.emit?.({ type: 'step:tool-call', step: params.stage.id, ...event });
      },
      onToolResult: event => {
        this.adapters.emit?.({ type: 'step:tool-result', step: params.stage.id, ...event });
      },
    });
  }

  /**
   * 需要时用无工具 Stage 再跑一次。
   */
  private async retryWithoutTools(
    params: {
      stage: NormalizedPipelineStage;
      ctx: PipelineContext;
      prompt: AssembledPrompt;
    },
    stageRun: StageTextResult
  ): Promise<StageTextResult | undefined> {
    const fallback = params.stage.policy.stopLoss.fallback;
    if (fallback?.kind !== 'retry-without-tools') {
      return Promise.resolve(undefined);
    }

    const searchEvidenceSummary =
      fallback.useToolEvidenceSummary && this.adapters.summarizeToolEvidence
        ? this.adapters.summarizeToolEvidence(stageRun.toolEvidence || [])
        : '';
    // fallbackStage 仍然是同一个 Stage，只是暂时去掉工具配置。
    const fallbackStage: NormalizedPipelineStage = {
      ...params.stage,
      toolNames: [],
      policy: {
        ...params.stage.policy,
        execution: {
          ...params.stage.policy.execution,
          tools: undefined,
        },
      },
    };
    // 工具证据只给这次 fallback prompt 使用，不提前写进主 ctx。
    const fallbackCtx = searchEvidenceSummary
      ? {
          ...params.ctx,
          searchSummary: [params.ctx.searchSummary, searchEvidenceSummary]
            .filter(Boolean)
            .join('\n\n'),
        }
      : params.ctx;
    const fallbackPrompt = this.adapters.assemblePrompt
      ? this.adapters.assemblePrompt(fallbackStage, fallbackCtx)
      : params.prompt;

    try {
      return await this.runStageText({
        stage: fallbackStage,
        prompt: fallbackPrompt,
        ctx: fallbackCtx,
        isFallback: true,
      });
    } catch {
      // fallback 本身失败时，保留第一次运行得到的 stopped outcome。
      return undefined;
    }
  }

  /**
   * 按 Stage 的 Output Policy 把文本放进对应的 context 字段。
   */
  private parseStageOutput(stage: NormalizedPipelineStage, text: string): StageContextPatch {
    if (stage.outputParser) return stage.outputParser(text);

    const outputPolicy = stage.policy.output;
    if (outputPolicy.kind === 'scores') return { scores: {} };
    if (outputPolicy.contextKey) {
      return { [outputPolicy.contextKey]: text } as StageContextPatch;
    }
    return { fullYaml: text };
  }

  /**
   * 检查这个 Stage 是否已经没有可继续用的结果。
   */
  private checkStopLoss(
    stage: NormalizedPipelineStage,
    text: string,
    parsed: StageContextPatch
  ): { stopped: boolean; reason?: string } {
    const policy = stage.policy.stopLoss;
    if (policy.kind === 'none') return { stopped: false };

    if (!text.trim()) {
      return {
        stopped: true,
        reason: `${stage.id}: required ${policy.contextKey || 'output'} is empty because LLM returned empty text`,
      };
    }

    const value = this.getContextValue(parsed, policy.contextKey);
    if (!value || (typeof value === 'string' && !value.trim())) {
      return {
        stopped: true,
        reason: `${stage.id}: parsed ${policy.contextKey || 'output'} is empty after fence stripping`,
      };
    }

    return { stopped: false };
  }

  /**
   * 在临时 context 上应用组装规则，返回 Runner 应该合并的完整补丁。
   */
  private buildAcceptedPatch(
    stage: NormalizedPipelineStage,
    ctx: PipelineContext,
    contextPatch: StageContextPatch
  ): StageContextPatch {
    const nextCtx: PipelineContext = { ...ctx, ...contextPatch };
    const acceptedPatch: StageContextPatch = { ...contextPatch };

    // Assembly 会派生出新的 context 字段，也要作为补丁交回 Runner。
    this.applyAssemblyPolicy(stage, nextCtx);
    const targetKey = stage.policy.assembly.targetKey;
    if (targetKey && nextCtx[targetKey] !== ctx[targetKey]) {
      acceptedPatch[targetKey] = nextCtx[targetKey];
    }

    return acceptedPatch;
  }

  /**
   * 按 Stage 的 Assembly Policy 处理需要合并的 YAML。
   */
  private applyAssemblyPolicy(stage: NormalizedPipelineStage, ctx: PipelineContext): void {
    if (stage.policy.assembly.kind === 'merge-yaml' && ctx.researchYaml && ctx.creativeYaml) {
      try {
        ctx.fullYaml = mergeYamlTexts(ctx.researchYaml, ctx.creativeYaml);
      } catch {
        // 合并器解析失败时，仍保留两段原文，让后面的审核或修复 Stage 有东西可看。
        ctx.fullYaml = `${ctx.researchYaml}\n${ctx.creativeYaml}`;
      }
    }
  }

  /**
   * 停止时优先返回 policy 指定的那段 YAML。
   */
  private getPartialYamlForStop(stage: NormalizedPipelineStage, ctx: PipelineContext): string {
    const value = this.getContextValue(ctx, stage.policy.stopLoss.partialResultKey);
    return typeof value === 'string' ? value : ctx.researchYaml || '';
  }

  /**
   * 从 context 或解析结果里读取一个字段。
   */
  private getContextValue(ctx: Partial<PipelineContext>, key?: keyof PipelineContext): unknown {
    if (!key) return undefined;
    return ctx[key];
  }

  /**
   * 有诊断信息时，把它发给外层进度流。
   */
  private emitDiagnostic(step: string, diagnostics: unknown): void {
    if (diagnostics === undefined) return;
    this.adapters.emit?.({
      type: 'step:diagnostic',
      step,
      diagnostics,
    });
  }

  /**
   * Stage 结束时发出统一的 complete 事件。
   */
  private emitStepComplete(stage: NormalizedPipelineStage, outcome: StageOutcome): void {
    this.adapters.emit?.({
      type: 'step:complete',
      step: stage.id,
      duration: outcome.durationMs,
      summary: outcome.summary,
      result: outcome.contextPatch,
      rawText: outcome.rawText,
      reasoningText: outcome.reasoningText,
      diagnostics: outcome.diagnostics,
    });
  }
}
