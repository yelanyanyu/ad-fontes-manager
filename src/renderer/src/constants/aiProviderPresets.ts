import type { AIProviderMasked } from '@/services/aiConfigApi';
import deepseekLogo from '@/assets/images/providers/deepseek.png';
import openrouterLogo from '@/assets/images/providers/openrouter.png';
import bailianLogo from '@/assets/images/providers/bailian.png';
import siliconLogo from '@/assets/images/providers/silicon.png';
import aihubmixLogo from '@/assets/images/providers/aihubmix.webp';

export interface AIProviderPreset {
  id: string;
  name: string;
  type: AIProviderMasked['type'];
  apiHost: string;
  anthropicApiHost: string;
  enabled: boolean;
  isSystem: boolean;
  models: Array<{ id: string; name: string; group: string }>;
  logo?: string;
  websites?: {
    official?: string;
    apiKey?: string;
    docs?: string;
    models?: string;
  };
}

export const aiProviderPresets: AIProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'deepseek',
    type: 'openai',
    apiHost: 'https://api.deepseek.com',
    anthropicApiHost: 'https://api.deepseek.com/anthropic',
    enabled: false,
    isSystem: true,
    logo: deepseekLogo,
    websites: {
      official: 'https://deepseek.com/',
      apiKey: 'https://platform.deepseek.com/api_keys',
      docs: 'https://platform.deepseek.com/api-docs/',
      models: 'https://platform.deepseek.com/api-docs/',
    },
    models: [
      { id: 'deepseek-v4-pro', name: 'deepseek-v4-pro[1m]', group: 'deepseek' },
      { id: 'deepseek-v4-flash', name: 'deepseek-v4-flash[1m]', group: 'deepseek' },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'openai',
    apiHost: 'https://openrouter.ai/api/v1/',
    anthropicApiHost: 'https://openrouter.ai/api',
    enabled: false,
    isSystem: true,
    logo: openrouterLogo,
    websites: {
      official: 'https://openrouter.ai/',
      apiKey: 'https://openrouter.ai/settings/keys',
      docs: 'https://openrouter.ai/docs/quick-start',
      models: 'https://openrouter.ai/models',
    },
    models: [
      {
        id: 'google/gemini-2.5-flash-image-preview',
        name: 'Google: Gemini 2.5 Flash Image',
        group: 'google',
      },
      {
        id: 'google/gemini-2.5-flash-preview',
        name: 'Google: Gemini 2.5 Flash Preview',
        group: 'google',
      },
      {
        id: 'qwen/qwen-2.5-7b-instruct:free',
        name: 'Qwen: Qwen-2.5-7B Instruct',
        group: 'qwen',
      },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek: V3', group: 'deepseek' },
      {
        id: 'mistralai/mistral-7b-instruct:free',
        name: 'Mistral: Mistral 7B Instruct',
        group: 'mistralai',
      },
    ],
  },
  {
    id: 'dashscope',
    name: 'Bailian',
    type: 'openai',
    apiHost: 'https://dashscope.aliyuncs.com/compatible-mode/v1/',
    anthropicApiHost: 'https://dashscope.aliyuncs.com/apps/anthropic',
    enabled: false,
    isSystem: true,
    logo: bailianLogo,
    websites: {
      official: 'https://www.aliyun.com/product/bailian',
      apiKey: 'https://bailian.console.aliyun.com/?tab=model#/api-key',
      docs: 'https://help.aliyun.com/zh/model-studio/getting-started/',
      models: 'https://bailian.console.aliyun.com/?tab=model#/model-market',
    },
    models: [
      { id: 'qwen3.5-plus', name: 'Qwen3.5-Plus', group: 'Qwen' },
      { id: 'qwen3.5-flash', name: 'Qwen3.5-Flash', group: 'Qwen' },
      { id: 'qwen3-max', name: 'Qwen3-Max', group: 'Qwen' },
      { id: 'kimi-k2.5', name: 'Kimi K2.5', group: 'Kimi' },
      { id: 'glm-5', name: 'GLM-5', group: 'GLM' },
      { id: 'MiniMax/MiniMax-M2.5', name: 'MiniMax M2.5', group: 'MiniMax' },
      { id: 'deepseek-v3.2', name: 'DeepSeek V3.2', group: 'DeepSeek' },
    ],
  },
  {
    id: 'silicon',
    name: 'Silicon',
    type: 'openai',
    apiHost: 'https://api.siliconflow.cn',
    anthropicApiHost: 'https://api.siliconflow.cn',
    enabled: false,
    isSystem: true,
    logo: siliconLogo,
    websites: {
      official: 'https://www.siliconflow.cn',
      apiKey: 'https://cloud.siliconflow.cn/i/d1nTBKXU',
      docs: 'https://docs.siliconflow.cn/',
      models: 'https://cloud.siliconflow.cn/models',
    },
    models: [
      {
        id: 'deepseek-ai/DeepSeek-V3.2',
        name: 'deepseek-ai/DeepSeek-V3.2',
        group: 'deepseek-ai',
      },
      { id: 'Qwen/Qwen3-8B', name: 'Qwen/Qwen3-8B', group: 'Qwen' },
      { id: 'BAAI/bge-m3', name: 'BAAI/bge-m3', group: 'BAAI' },
    ],
  },
  {
    id: 'aihubmix',
    name: 'AiHubMix',
    type: 'openai',
    apiHost: 'https://aihubmix.com/v1',
    anthropicApiHost: 'https://aihubmix.com',
    enabled: false,
    isSystem: true,
    logo: aihubmixLogo,
    websites: {
      official: 'https://aihubmix.com?aff=SJyh',
      apiKey: 'https://aihubmix.com?aff=SJyh',
      docs: 'https://doc.aihubmix.com/',
      models: 'https://aihubmix.com/models',
    },
    models: [
      { id: 'gpt-5', name: 'gpt-5', group: 'OpenAI' },
      { id: 'gpt-5-mini', name: 'gpt-5-mini', group: 'OpenAI' },
      { id: 'gpt-5-nano', name: 'gpt-5-nano', group: 'OpenAI' },
      { id: 'gpt-5-chat-latest', name: 'gpt-5-chat-latest', group: 'OpenAI' },
      { id: 'o3', name: 'o3', group: 'OpenAI' },
      { id: 'o4-mini', name: 'o4-mini', group: 'OpenAI' },
      { id: 'gpt-4.1', name: 'gpt-4.1', group: 'OpenAI' },
      { id: 'gpt-4o', name: 'gpt-4o', group: 'OpenAI' },
      { id: 'gpt-image-1', name: 'gpt-image-1', group: 'OpenAI' },
      { id: 'DeepSeek-V3', name: 'DeepSeek-V3', group: 'DeepSeek' },
      { id: 'DeepSeek-R1', name: 'DeepSeek-R1', group: 'DeepSeek' },
      { id: 'claude-sonnet-4-20250514', name: 'claude-sonnet-4-20250514', group: 'Claude' },
      { id: 'gemini-2.5-pro', name: 'gemini-2.5-pro', group: 'Gemini' },
      { id: 'gemini-2.5-flash-nothink', name: 'gemini-2.5-flash-nothink', group: 'Gemini' },
      { id: 'gemini-2.5-flash', name: 'gemini-2.5-flash', group: 'Gemini' },
      {
        id: 'Qwen3-235B-A22B-Instruct-2507',
        name: 'Qwen3-235B-A22B-Instruct-2507',
        group: 'qwen',
      },
      { id: 'kimi-k2-0711-preview', name: 'kimi-k2-0711-preview', group: 'moonshot' },
      {
        id: 'Llama-4-Scout-17B-16E-Instruct',
        name: 'Llama-4-Scout-17B-16E-Instruct',
        group: 'llama',
      },
      {
        id: 'Llama-4-Maverick-17B-128E-Instruct-FP8',
        name: 'Llama-4-Maverick-17B-128E-Instruct-FP8',
        group: 'llama',
      },
    ],
  },
];
