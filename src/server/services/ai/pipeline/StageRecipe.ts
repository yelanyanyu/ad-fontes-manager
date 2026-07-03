import type { AssembledPrompt } from '../prompts/assembler';
import type { PipelineContext, PipelineStage, StagePolicy } from '../types';

// 这个文件定义单个 Stage 在 workflow 里的输入和输出形状。
// 它刻意贴近常见 workflow 框架：Recipe 像 step definition，Context 像 state，Patch 像 step output。

/**
 * 一个 Stage 接受后的上下文变化。
 */
export type StageContextPatch = Partial<PipelineContext>;

/**
 * 一条可执行的 Stage 配方。
 */
export type StageRecipe = PipelineStage & { policy: StagePolicy };

/**
 * 执行 Stage Recipe 时传给执行器的完整输入。
 */
export interface StageRecipeRunInput {
  recipe: StageRecipe;
  context: PipelineContext;
  prompt: AssembledPrompt;
}

/**
 * Stage 正常完成时返回的结果。
 */
export interface StageRecipeRunComplete {
  status: 'complete';
  contextPatch: StageContextPatch;
  rawText: string;
  reasoningText?: string;
  diagnostics?: unknown;
  summary: string;
  durationMs: number;
}

/**
 * Stage 被 Stop-loss 截停时返回的结果。
 */
export interface StageRecipeRunStopped {
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
}

/**
 * Stage 执行后的统一结果。
 */
export type StageRecipeRunOutcome = StageRecipeRunComplete | StageRecipeRunStopped;
