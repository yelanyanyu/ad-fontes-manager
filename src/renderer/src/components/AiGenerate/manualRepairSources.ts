import type { StepState } from '@/composables/useAiGenerate';

export interface ManualRepairSourceJob {
  yaml?: string;
  steps?: StepState[];
}

export interface ManualRepairSources {
  minimalInputYaml: string;
  originalYaml: string;
}

const ORIGINAL_STAGE_SEQUENCE = ['searching', 'pondering'];

function looksLikeYaml(text: string): boolean {
  return /```ya?ml/i.test(text) || /(^|\n)\s*(ad_fontes|yield|etymology):\s*/.test(text);
}

function rawStageYaml(steps: StepState[] = []): string {
  return ORIGINAL_STAGE_SEQUENCE.map(stageName =>
    String(
      steps.find(item => item.step === stageName && item.rawText?.trim())?.rawText || ''
    ).trim()
  )
    .filter(text => text && looksLikeYaml(text))
    .join('\n\n');
}

// 结果 YAML 用来做最小修复；原始 YAML 优先取 Stage rawText，避免把结果字段误当原文。
export function resolveManualRepairSources(job: ManualRepairSourceJob): ManualRepairSources {
  const minimalInputYaml = String(job.yaml || '');
  return {
    minimalInputYaml,
    originalYaml: rawStageYaml(job.steps) || minimalInputYaml,
  };
}
