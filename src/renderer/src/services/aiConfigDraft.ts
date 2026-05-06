import type { AIConfigMasked, AIStageConfig } from './aiConfigApi';

const isCompleteStage = (stage: AIStageConfig | undefined): boolean =>
  Boolean(stage?.provider.trim()) && Boolean(stage?.model.trim());

const isDraftOnlyStage = (stage: AIStageConfig | undefined): boolean =>
  Boolean(stage?.provider.trim()) && !stage?.model.trim();

export const mergeSavedAIConfigWithDraft = (
  saved: AIConfigMasked,
  draft: AIConfigMasked
): AIConfigMasked => {
  const stages = { ...saved.stages };
  const draftProvidersById = new Map(draft.providers.map(provider => [provider.id, provider]));
  const providers = saved.providers.map(provider => {
    const draftProvider = draftProvidersById.get(provider.id);
    if (!draftProvider) return provider;
    const draftModelsById = new Map(draftProvider.models.map(model => [model.id, model]));
    return {
      ...provider,
      models: provider.models.map(model => {
        const draftModel = draftModelsById.get(model.id);
        if (!draftModel?.endpointType || model.endpointType) return model;
        return { ...model, endpointType: draftModel.endpointType };
      }),
    };
  });

  for (const [key, draftStage] of Object.entries(draft.stages || {})) {
    const stageKey = key as keyof AIConfigMasked['stages'];
    if (isCompleteStage(stages[stageKey])) continue;
    if (isDraftOnlyStage(draftStage)) {
      stages[stageKey] = draftStage;
    }
  }

  return {
    ...saved,
    providers,
    stages,
  };
};
