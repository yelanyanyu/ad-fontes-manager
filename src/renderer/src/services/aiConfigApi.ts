import request from '@/utils/request';

export interface AIProviderMasked {
  id: string;
  name: string;
  type: 'openai' | 'anthropic';
  baseUrl: string;
  apiKey: string;
  models: { id: string; name: string }[];
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
}

export interface AIConfigMasked {
  providers: AIProviderMasked[];
  search?: AISearchConfigMasked;
  stages: {
    research?: AIStageConfig;
    enrichment?: AIStageConfig;
    review?: AIStageConfig;
  };
  review: {
    threshold: number;
    thresholdByLanguage: Record<string, number>;
  };
}

export interface TestProviderInput {
  providerId?: string;
  baseUrl: string;
  apiKey: string;
  type: 'openai' | 'anthropic';
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
