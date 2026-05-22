const config = require('../../utils/config') as {
  get: <T = unknown>(path: string, defaultValue?: T) => T;
  loadConfigFile: () => Record<string, unknown>;
  saveConfigFile: (config: Record<string, unknown>) => void;
};
const { loggers } = require('../../utils/logger') as {
  loggers: {
    ai: {
      info: (payload: Record<string, unknown>, message?: string) => void;
      error: (payload: Record<string, unknown>, message?: string) => void;
    };
  };
};
const { AIConfigSchema, AIConfigUpdateSchema } = require('../../schemas/aiConfig') as {
  AIConfigSchema: { parse: (value: unknown) => AIConfig };
  AIConfigUpdateSchema: { parse: (value: unknown) => AIConfigUpdate };
};
const { getDefaultAIConfig } = require('../../utils/defaultAppConfig') as {
  getDefaultAIConfig: () => AIConfig;
};

interface AIModel {
  id: string;
  name: string;
  endpointType?: 'openai' | 'anthropic';
}

interface AIProvider {
  id: string;
  name: string;
  type: 'openai' | 'anthropic';
  baseUrl: string;
  anthropicBaseUrl?: string;
  apiKey: string;
  models: AIModel[];
}

interface AISearchConfig {
  provider: 'brave' | 'tavily';
  apiKey: string;
  autoDomains: boolean;
  domains: {
    common: string[];
    en: string[];
    de: string[];
  };
}

interface AIStageConfig {
  provider: string;
  model: string;
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'auto';
}

interface AIConfig {
  providers: AIProvider[];
  queue_concurrency: number;
  search?: AISearchConfig;
  stages: {
    fast?: AIStageConfig;
    balanced?: AIStageConfig;
    expert?: AIStageConfig;
  };
  review: {
    threshold: number;
    thresholdByLanguage: Record<string, number>;
  };
}

type AIConfigUpdate = Partial<AIConfig>;
type AIConfigMasked = AIConfig;

const knownAnthropicBaseUrls: Record<string, string> = {
  deepseek: 'https://api.deepseek.com/anthropic',
};

const defaultAIConfig = (): AIConfig => getDefaultAIConfig();

function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '***';
  const prefix = key.slice(0, 3);
  const suffix = key.slice(-4);
  return `${prefix}***${suffix}`;
}

function containsMask(value: string): boolean {
  return value.includes('***');
}

function withProviderEndpointDefaults(provider: AIProvider): AIProvider {
  if (provider.anthropicBaseUrl) return provider;
  const knownBaseUrl = knownAnthropicBaseUrls[provider.id];
  if (!knownBaseUrl) return provider;
  return {
    ...provider,
    anthropicBaseUrl: knownBaseUrl,
  };
}

function withAIEndpointDefaults(ai: AIConfig): AIConfig {
  return {
    ...ai,
    providers: ai.providers.map(withProviderEndpointDefaults),
  };
}

function getAIConfig(): AIConfig {
  const ai = config.get<AIConfig | undefined>('ai');
  if (!ai) return defaultAIConfig();
  return withAIEndpointDefaults(AIConfigSchema.parse(ai));
}

function getAIConfigMasked(): AIConfigMasked {
  const ai = getAIConfig();
  return {
    ...ai,
    providers: ai.providers,
    search: ai.search,
  };
}

function mergeProviderWithMaskedCheck(
  inputProvider: AIProvider,
  existingProvider?: AIProvider
): AIProvider {
  if (!existingProvider) return inputProvider;
  if (!containsMask(inputProvider.apiKey)) return inputProvider;
  return {
    ...inputProvider,
    apiKey:
      existingProvider.apiKey && !containsMask(existingProvider.apiKey)
        ? existingProvider.apiKey
        : '',
  };
}

function mergeSearchWithMaskedCheck(
  inputSearch: AISearchConfig,
  existingSearch?: AISearchConfig
): AISearchConfig {
  if (!existingSearch) return inputSearch;
  if (!containsMask(inputSearch.apiKey)) return inputSearch;
  return {
    ...inputSearch,
    apiKey:
      existingSearch.apiKey && !containsMask(existingSearch.apiKey) ? existingSearch.apiKey : '',
  };
}

function mergeProvidersWithMaskedKeys(
  inputProviders: AIProvider[] | undefined,
  existingProviders: AIProvider[]
): AIProvider[] {
  if (!inputProviders) return existingProviders;
  const existingById = new Map(existingProviders.map(provider => [provider.id, provider]));
  return inputProviders.map(provider =>
    containsMask(provider.apiKey) && !existingById.has(provider.id)
      ? { ...provider, apiKey: '' }
      : mergeProviderWithMaskedCheck(provider, existingById.get(provider.id))
  );
}

function resolveProviderApiKeyForTest(providerId: string | undefined, inputApiKey: string): string {
  if (!providerId || (!containsMask(inputApiKey) && inputApiKey)) return inputApiKey;
  const provider = getAIConfig().providers.find(item => item.id === providerId);
  return provider?.apiKey || inputApiKey;
}

function updateAIConfig(input: unknown): AIConfigMasked {
  const validated = AIConfigUpdateSchema.parse(input) as AIConfigUpdate;
  const existing = getAIConfig();

  const merged: AIConfig = {
    providers: mergeProvidersWithMaskedKeys(validated.providers, existing.providers),
    queue_concurrency: validated.queue_concurrency ?? existing.queue_concurrency,
    search: validated.search
      ? containsMask(validated.search.apiKey) && !existing.search
        ? { ...validated.search, apiKey: '' }
        : mergeSearchWithMaskedCheck(validated.search, existing.search)
      : existing.search,
    stages: validated.stages ? { ...existing.stages, ...validated.stages } : existing.stages,
    review: validated.review ? { ...existing.review, ...validated.review } : existing.review,
  };

  const fullValidated = withAIEndpointDefaults(AIConfigSchema.parse(merged));
  config.saveConfigFile({ ...config.loadConfigFile(), ai: fullValidated });
  const { updateQueueConcurrency } = require('./queue') as {
    updateQueueConcurrency: (maxConcurrency: number) => void;
  };
  updateQueueConcurrency(fullValidated.queue_concurrency);

  loggers.ai.info(
    {
      providerCount: fullValidated.providers.length,
      hasSearch: Boolean(fullValidated.search),
      queueConcurrency: fullValidated.queue_concurrency,
    },
    'AI config saved'
  );

  return {
    ...fullValidated,
    providers: fullValidated.providers,
    search: fullValidated.search,
  };
}

module.exports = {
  maskApiKey,
  getAIConfig,
  getAIConfigMasked,
  updateAIConfig,
  mergeProviderWithMaskedCheck,
  mergeSearchWithMaskedCheck,
  resolveProviderApiKeyForTest,
};
