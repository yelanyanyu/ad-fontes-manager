import type { AssembledPrompt } from './prompts/assembler';
import type { NormalizedPipelineStage } from './PipelineDefinitionNormalizer';
import type { PipelineContext } from './types';

const { mergeYamlTexts } = require('./utils') as typeof import('./utils');

type StageContextPatch = Partial<PipelineContext>;

export interface StageTextResult {
  text: string;
  reasoningText?: string;
  diagnostics?: unknown;
  toolEvidence?: unknown[];
}

export interface StagePolicyEngineAdapters {
  runStageText(params: {
    stage: NormalizedPipelineStage;
    prompt: AssembledPrompt;
    ctx: PipelineContext;
  }): Promise<StageTextResult>;
}

export type StageOutcome =
  | {
      status: 'complete';
      contextPatch: StageContextPatch;
      rawText: string;
      reasoningText?: string;
      diagnostics?: unknown;
      summary: string;
      durationMs: number;
    }
  | {
      status: 'stopped';
      contextPatch: StageContextPatch;
      rawText: string;
      reasoningText?: string;
      diagnostics?: unknown;
      summary: string;
      durationMs: number;
      yaml: string;
      reason: string;
      stoppedAtStage: string;
    };

// 执行一个已经补齐 policy 的 Stage。
// 它不拼 prompt，也不决定下一个 Stage；这些事留给 Runner。
export class StagePolicyEngine {
  constructor(private readonly adapters: StagePolicyEngineAdapters) {}

  /**
   * 运行一个 Stage，把结果写回 ctx，并返回 Runner 需要知道的结果。
   */
  async executeStage(params: {
    stage: NormalizedPipelineStage;
    ctx: PipelineContext;
    prompt: AssembledPrompt;
  }): Promise<StageOutcome> {
    const startedAt = Date.now();
    const stageRun = await this.adapters.runStageText(params);
    const contextPatch = this.parseStageOutput(params.stage, stageRun.text);
    const stopResult = this.checkStopLoss(params.stage, stageRun.text, contextPatch);
    if (stopResult.stopped) {
      return {
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
    }

    Object.assign(params.ctx, contextPatch);
    this.applyAssemblyPolicy(params.stage, params.ctx);

    return {
      status: 'complete',
      contextPatch,
      rawText: stageRun.text,
      reasoningText: stageRun.reasoningText,
      diagnostics: stageRun.diagnostics,
      summary: `${params.stage.description} 完成`,
      durationMs: Date.now() - startedAt,
    };
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
   * 按 Stage 的 Assembly Policy 处理需要合并的 YAML。
   */
  private applyAssemblyPolicy(stage: NormalizedPipelineStage, ctx: PipelineContext): void {
    if (stage.policy.assembly.kind === 'merge-yaml' && ctx.researchYaml && ctx.creativeYaml) {
      ctx.fullYaml = mergeYamlTexts(ctx.researchYaml, ctx.creativeYaml);
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
}
