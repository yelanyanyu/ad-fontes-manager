import type { PipelineContext, PipelineRunner, PipelineStage } from '../types';
import type { AssembledPrompt } from '../prompts/assembler';
import type { StageTextDiagnostics } from './LlmStageExecutor';

// 这个文件负责整条 AI 流水线的外层编排。
// 单个 Stage 的策略判断放在 StagePolicyEngine；真实 LLM 调用放在 LlmStageExecutor。
const { loggers } = require('../../../utils/logger') as {
  loggers: {
    ai: {
      child: (payload: Record<string, unknown>) => {
        info: (payload: Record<string, unknown>, message?: string) => void;
        error: (payload: Record<string, unknown>, message?: string) => void;
      };
    };
  };
};
const { assemblePrompt } = require('../prompts/assembler') as {
  assemblePrompt: (stage: PipelineStage, ctx: PipelineContext) => AssembledPrompt;
};
const { PipelineDefinitionNormalizer } =
  require('./PipelineDefinitionNormalizer') as typeof import('./PipelineDefinitionNormalizer');
const { StagePolicyEngine } =
  require('./StagePolicyEngine') as typeof import('./StagePolicyEngine');
const { LlmStageExecutor, summarizeToolEvidence } =
  require('./LlmStageExecutor') as typeof import('./LlmStageExecutor');
const { mergeYamlTexts } = require('../utils') as typeof import('../utils');

/**
 * 恢复运行时，跳过 resumeFrom 之前的 Stage。
 */
function shouldSkipStage(stages: PipelineStage[], stageId: string, resumeFrom?: string): boolean {
  if (!resumeFrom) return false;
  const stageOrder = stages.map(stage => stage.id);
  const resumeIdx = stageOrder.indexOf(resumeFrom);
  const stageIdx = stageOrder.indexOf(stageId);
  return stageIdx < resumeIdx;
}

/**
 * 合并 researchYaml 和 creativeYaml。解析失败时保留拼接结果。
 */
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

export class SequentialRunner implements PipelineRunner {
  /**
   * 运行整条流水线，负责恢复、进度事件和最终结果。
   */
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
      // 恢复时先把旧步骤 replay 给前端，让 UI 看到完整历史。
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

    const llmStageExecutor = new LlmStageExecutor();

    // StagePolicyEngine 只管单步策略；真实模型调用由 LlmStageExecutor 负责。
    const stagePolicyEngine = new StagePolicyEngine({
      emit: onProgress,
      assemblePrompt,
      summarizeToolEvidence,
      runStageText: async ({
        stage: engineStage,
        prompt,
        ctx: engineCtx,
        onChunk,
        onReasoning,
        onToolCall,
        onToolResult,
      }) => {
        let reasoningText = '';
        const stageRun = await llmStageExecutor.runStageText({
          stage: engineStage,
          prompt,
          ctx: engineCtx,
          onChunk,
          onReasoning: chunk => {
            reasoningText += chunk;
            onReasoning(chunk);
          },
          onToolCall,
          onToolResult,
          externalSignal: abortSignal as globalThis.AbortSignal | undefined,
          runLogger,
        });
        return { ...stageRun, reasoningText };
      },
    });

    for (const stage of normalizedDefinition.stages) {
      if (shouldSkipStage(normalizedDefinition.stages, stage.id, resumeFromStage)) {
        continue;
      }

      const stepStart = Date.now();
      onProgress({ type: 'step:start', step: stage.id, message: stage.description });
      runLogger.info({ step: stage.id, event: 'start' }, 'AI pipeline step started');

      try {
        const outcome = await stagePolicyEngine.executeStage({
          stage,
          prompt: assemblePrompt(stage, ctx),
          ctx,
        });

        if (outcome.status === 'stopped') {
          // Stop-loss 不算异常，Runner 正常返回当前可用 YAML。
          onProgress({
            type: 'pipeline:stopped',
            yaml: outcome.yaml,
            stoppedAtStage: outcome.stoppedAtStage,
            reason: outcome.reason,
          });
          runLogger.info(
            { event: 'pipeline:stopped', stoppedAtStage: outcome.stoppedAtStage },
            'AI pipeline stopped by stop-loss'
          );
          return { yaml: outcome.yaml, scores: ctx.scores || {} };
        }

        // StagePolicyEngine 只返回补丁；Runner 统一维护整条流水线的 state。
        Object.assign(ctx, outcome.contextPatch);
        runLogger.info(
          { step: stage.id, event: 'complete', durationMs: outcome.durationMs },
          'AI step complete'
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const errorDiagnostics = (error as { diagnostics?: StageTextDiagnostics } | undefined)
          ?.diagnostics;
        if (stage.id === 'fixing') {
          // 修复阶段失败时，旧 YAML 通常比空结果更有用。
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
          willRetry: false,
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
