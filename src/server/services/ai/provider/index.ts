export type { ResolvedModel } from './modelResolver';

// Provider module 的公开入口。
// 调用者从这里拿配置、模型和端点解析能力，不需要知道这些能力分别落在哪个内部文件。
const configService = require('./configService') as {
  getAIConfig: () => unknown;
  getAIConfigMasked: () => unknown;
  updateAIConfig: (input: unknown) => unknown;
  resolveProviderApiKeyForTest: (providerId: string | undefined, inputApiKey: string) => string;
};
const modelResolver = require('./modelResolver') as {
  resolveModel: (
    stageName?: 'fast' | 'balanced' | 'expert'
  ) => import('./modelResolver').ResolvedModel;
};
const endpointResolver = require('./endpointResolver') as {
  resolveAIEndpoint: (input: {
    providerType: 'openai' | 'anthropic';
    baseUrl: string;
    anthropicBaseUrl?: string;
    modelEndpointType?: 'openai' | 'anthropic';
  }) => { endpointType: 'openai' | 'anthropic'; baseUrl: string };
};

module.exports = {
  getAIConfig: configService.getAIConfig,
  getAIConfigMasked: configService.getAIConfigMasked,
  updateAIConfig: configService.updateAIConfig,
  resolveProviderApiKeyForTest: configService.resolveProviderApiKeyForTest,
  resolveModel: modelResolver.resolveModel,
  resolveAIEndpoint: endpointResolver.resolveAIEndpoint,
};
