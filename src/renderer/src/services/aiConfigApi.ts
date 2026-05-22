import request from '@/utils/request';

export interface AIProviderMasked {
  id: string;
  name: string;
  type: 'openai' | 'anthropic';
  baseUrl: string;
  anthropicBaseUrl?: string;
  apiKey: string;
  models: { id: string; name: string; endpointType?: 'openai' | 'anthropic' }[];
}

export interface AISearchConfigMasked {
  provider: 'brave' | 'tavily';
  apiKey: string;
  autoDomains: boolean;
  domains: {
    common: string[];
    en: string[];
    de: string[];
  };
}

export interface AIStageConfig {
  provider: string;
  model: string;
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'auto';
}

export interface AIConfigMasked {
  providers: AIProviderMasked[];
  queue_concurrency: number;
  search?: AISearchConfigMasked;
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

export interface TestProviderInput {
  providerId?: string;
  baseUrl: string;
  anthropicBaseUrl?: string;
  apiKey: string;
  type: 'openai' | 'anthropic';
  modelEndpointType?: 'openai' | 'anthropic';
  model: string;
}

export interface TestProviderResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
  statusCode?: number;
}

export const fetchAIConfig = (): Promise<AIConfigMasked> => request.get('/v2/config/ai');

export const saveAIConfig = (config: AIConfigMasked): Promise<AIConfigMasked> =>
  request.put('/v2/config/ai', config);

export const testProvider = (input: TestProviderInput): Promise<TestProviderResult> =>
  request.post('/v2/config/ai/test-provider', input, { skipErrorToast: true });

export interface TestSearchInput {
  provider: 'brave' | 'tavily';
  apiKey: string;
}

export const testSearch = (input: TestSearchInput): Promise<TestProviderResult> =>
  request.post('/v2/config/ai/test-search', input, { skipErrorToast: true });
