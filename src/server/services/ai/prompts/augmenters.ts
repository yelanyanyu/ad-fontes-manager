import type { PipelineContext, PipelineStage } from '../types';

const { buildAiFlavorMarkerEvidence } = require('../aiFlavorMarkers') as {
  buildAiFlavorMarkerEvidence: (ctx: PipelineContext) => { summaryText: string };
};

export function buildPromptAugmentationVariables(
  stage: PipelineStage,
  ctx: PipelineContext
): Record<string, string> {
  const variables: Record<string, string> = {};

  for (const augmenter of stage.promptInputAugmenters || []) {
    if (augmenter === 'aiFlavorMarkerReport') {
      variables.mechanicalAiFlavorReport = buildAiFlavorMarkerEvidence(ctx).summaryText;
    }
  }

  return variables;
}

module.exports = { buildPromptAugmentationVariables };
