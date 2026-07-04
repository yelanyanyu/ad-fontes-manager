const { getAIConfig } = require('./configService') as {
  getAIConfig: () => {
    providers: Array<{
      id: string;
      type: 'openai' | 'anthropic';
      baseUrl: string;
      anthropicBaseUrl?: string;
      apiKey: string;
      models: Array<{ id: string; endpointType?: 'openai' | 'anthropic' }>;
    }>;
    stages: Record<
      string,
      { provider?: string; model?: string; reasoningEffort?: string } | undefined
    >;
  };
};
const { resolveAIEndpoint } = require('./endpointResolver') as {
  resolveAIEndpoint: (input: {
    providerType: 'openai' | 'anthropic';
    baseUrl: string;
    anthropicBaseUrl?: string;
    modelEndpointType?: 'openai' | 'anthropic';
  }) => { endpointType: 'openai' | 'anthropic'; baseUrl: string };
};

export interface ResolvedModel {
  provider: string;
  modelId: string;
  apiKey: string;
  baseUrl: string;
  format: 'openai' | 'anthropic';
  reasoningEffort: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'auto';
  isMock: boolean;
}

function resolveModel(stageName: 'fast' | 'balanced' | 'expert' = 'balanced'): ResolvedModel {
  const aiConfig = getAIConfig();
  const stage =
    aiConfig.stages[stageName] ||
    aiConfig.stages.balanced ||
    aiConfig.stages.fast ||
    aiConfig.stages.expert;

  if (!stage?.provider || !stage.model) {
    throw new Error(`AI model stage not configured: ${stageName}`);
  }

  const provider = aiConfig.providers.find(item => item.id === stage.provider);
  if (!provider) {
    throw new Error(`AI provider not found: ${stage.provider}`);
  }

  const model = provider.models.find(item => item.id === stage.model);
  const endpoint = resolveAIEndpoint({
    providerType: provider.type,
    baseUrl: provider.baseUrl,
    anthropicBaseUrl: provider.anthropicBaseUrl,
    modelEndpointType: model?.endpointType,
  });

  return {
    provider: provider.id,
    modelId: stage.model,
    apiKey: provider.apiKey,
    baseUrl: endpoint.baseUrl,
    format: endpoint.endpointType,
    reasoningEffort:
      (stage.reasoningEffort as ResolvedModel['reasoningEffort'] | undefined) ||
      (stageName === 'expert' ? 'high' : 'auto'),
    isMock: provider.apiKey === '' || provider.apiKey.startsWith('sk-test'),
  };
}

module.exports = { resolveModel };
