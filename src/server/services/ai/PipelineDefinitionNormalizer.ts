import type { PipelineDefinition, PipelineStage, StagePolicy } from './types';

const STAGE_TIMEOUT_MS: Record<string, number> = {
  searching: 240_000,
  pondering: 600_000,
  auditing: 600_000,
  fixing: 1_200_000,
};

const AUDITING_MAX_COMPLETION_TOKENS = 384 * 1024;
const DEFAULT_THINKING_BUDGET_TOKENS = 16_000;
const AUDITING_MAX_OUTPUT_TOKENS = AUDITING_MAX_COMPLETION_TOKENS - DEFAULT_THINKING_BUDGET_TOKENS;

export type NormalizedPipelineStage = PipelineStage & { policy: StagePolicy };
export type NormalizedPipelineDefinition = Omit<PipelineDefinition, 'stages'> & {
  stages: NormalizedPipelineStage[];
};

// 这里负责补齐 Pipeline Definition 里缺失的 Stage Policy。
// 旧配置可以继续省略 policy，但补默认值的逻辑只放在这个文件里。
export class PipelineDefinitionNormalizer {
  /**
   * 返回一个新的 Pipeline Definition，里面每个 Stage 都带有 policy。
   */
  normalize(definition: PipelineDefinition): NormalizedPipelineDefinition {
    return {
      ...definition,
      stages: definition.stages.map(stage => this.normalizeStage(stage)),
    };
  }

  /**
   * 返回一个新的 Stage；如果原来没有 policy，就按旧规则补上。
   */
  normalizeStage(stage: PipelineStage): NormalizedPipelineStage {
    return {
      ...stage,
      policy: getStagePolicy(stage),
    };
  }
}

/**
 * 读取 Stage 上已有的 policy；没有的话，生成旧版本默认使用的 policy。
 */
export function getStagePolicy(stage: PipelineStage): StagePolicy {
  return stage.policy || legacyStagePolicy(stage);
}

/**
 * 按旧版本的 Stage id 规则生成 policy。
 */
function legacyStagePolicy(stage: PipelineStage): StagePolicy {
  if (stage.id === 'searching') {
    return {
      execution: {
        kind: stage.type,
        timeoutMs: STAGE_TIMEOUT_MS.searching,
        ...(stage.toolNames?.length
          ? {
              tools: {
                names: stage.toolNames,
                maxRounds: 3,
                requiresSearchApiKey: true,
                fallbackOnFailureToolName: 'search_etymology',
              },
            }
          : {}),
      },
      output: { kind: 'yaml-fragment', contextKey: 'researchYaml' },
      assembly: { kind: 'none' },
      stopLoss: {
        kind: 'require-text-and-context',
        contextKey: 'researchYaml',
        partialResultKey: 'researchYaml',
        ...(stage.toolNames?.length
          ? { fallback: { kind: 'retry-without-tools', useToolEvidenceSummary: true } }
          : {}),
      },
    };
  }

  if (stage.id === 'pondering') {
    return {
      execution: { kind: stage.type, timeoutMs: STAGE_TIMEOUT_MS.pondering },
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
    };
  }

  if (stage.id === 'auditing') {
    return {
      execution: {
        kind: stage.type,
        timeoutMs: STAGE_TIMEOUT_MS.auditing,
        maxOutputTokens: AUDITING_MAX_OUTPUT_TOKENS,
      },
      output: { kind: 'scores' },
      assembly: { kind: 'none' },
      stopLoss: { kind: 'none' },
    };
  }

  if (stage.id === 'fixing') {
    return {
      execution: { kind: stage.type, timeoutMs: STAGE_TIMEOUT_MS.fixing },
      output: { kind: 'full-yaml', contextKey: 'fullYaml' },
      assembly: { kind: 'none' },
      stopLoss: { kind: 'none' },
    };
  }

  return {
    execution: { kind: stage.type, timeoutMs: STAGE_TIMEOUT_MS[stage.id] || 60_000 },
    output: { kind: 'full-yaml', contextKey: 'fullYaml' },
    assembly: { kind: 'none' },
    stopLoss: { kind: 'none' },
  };
}
