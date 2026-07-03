import type { AssembledPrompt } from '../prompts/assembler';
import type { PipelineContext, PipelineStage, StagePolicy } from '../types';

// 这个文件定义单个 Stage 在 workflow 里的输入和输出形状。
// 它刻意贴近常见 workflow 框架：Recipe 像 step definition，Context 像 state，Patch 像 step output。

/**
 * 一个 Stage 接受后的上下文变化。
 */
export type StageContextPatch = Partial<PipelineContext>;

/**
 * Stage Tool 的来源类型。
 *
 * 现在的实现主要把 Tool 适配成 AI SDK function call；这里仍然先把类型说宽，
 * 因为后续可以接 CLI 命令、MCP 工具，或者项目自己封装的调用器。
 */
export type StageToolKind = 'function-call' | 'cli' | 'mcp' | 'custom';

/**
 * Stage 可以调用的一个外部能力。
 */
export interface StageToolDescriptor {
  name: string;
  kind: StageToolKind;
  description?: string;
}

/**
 * 执行器内部真正使用的 Tool 集合。
 *
 * 泛型参数由具体执行器决定：AI SDK 执行器会放入 function-call Tool；
 * 未来的执行器也可以放 CLI、MCP 或自定义调用器。
 */
export type StageToolSet<TTool = unknown> = Record<string, TTool>;

/**
 * Tool 调用后留下的证据。
 */
export interface StageToolEvidence {
  toolName: string;
  toolKind?: StageToolKind;
  uiResult?: unknown;
  output?: unknown;
  modelResult?: string;
}

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
