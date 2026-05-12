<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '@/stores/appStore';
import { useThemeStore, type ThemePreference } from '@/stores/themeStore';
import { pingAnkiConnect } from '@/services/ankiConnectService';
import {
  getStoredAnkiExportOptionsSummary,
  type StoredAnkiExportOptionsSummary,
} from '@/services/ankiExportOptionsStore';
import { listStoredFieldMappingModelNames } from '@/services/ankiFieldMappingStore';
import {
  fetchAIConfig,
  saveAIConfig,
  testProvider,
  testSearch,
  type AIConfigMasked,
  type AIProviderMasked,
  type AIStageConfig,
  type TestProviderResult,
} from '@/services/aiConfigApi';
import { mergeSavedAIConfigWithDraft } from '@/services/aiConfigDraft';
import { aiProviderPresets, type AIProviderPreset } from '@/constants/aiProviderPresets';
import { requestOnboardingReplay } from '@/components/Onboarding/onboardingState';

type AnkiStatus = 'connected' | 'disconnected' | 'testing';
type StageKey = 'fast' | 'balanced' | 'expert';
type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'auto';
type DomainGroup = 'common' | 'en' | 'de';
type SettingsPage = 'about' | 'api';
type ApiSection = 'providers' | 'stages' | 'search' | 'review' | 'runtime';

const router = useRouter();
const appStore = useAppStore();
const themeStore = useThemeStore();

const activeSettingsPage = ref<SettingsPage>('api');
const activeApiSection = ref<ApiSection>('providers');
const ankiStatus = ref<AnkiStatus>('disconnected');
const isElectron = computed(() => Boolean(window.electronAPI));
const dataDir = ref('');
const dataDirStatus = ref('');
const ankiConfig = ref<StoredAnkiExportOptionsSummary>(getStoredAnkiExportOptionsSummary());
const ankiMappingModels = ref<string[]>([]);
const aiConfig = ref<AIConfigMasked | null>(null);
const aiLoading = ref(false);
const aiSaving = ref(false);
const aiError = ref('');
const selectedProviderId = ref<string | null>(null);
const showAddProviderPopup = ref(false);
const showApiKey = reactive<Record<string, boolean>>({});
const testingProvider = reactive<Record<string, boolean>>({});
const testResults = reactive<Record<string, TestProviderResult>>({});
const testingSearch = ref(false);
const searchTestResult = ref<TestProviderResult | null>(null);
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let autoSaveBusy = false;
const domainDrafts = reactive<Record<DomainGroup, string>>({
  common: '',
  en: '',
  de: '',
});
const addProviderForm = reactive({
  name: '',
  type: 'openai' as 'openai' | 'anthropic',
});
const showAddModelRow = ref(false);
const newModelId = ref('');
const newModelName = ref('');
const newModelEndpointType = ref<'' | AIProviderMasked['type']>('');
const testModelId = ref('');

const stageKeys: StageKey[] = ['fast', 'balanced', 'expert'];
const reasoningEffortOptions: Array<{ value: ReasoningEffort; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'none', label: 'None' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'XHigh' },
];
const domainGroups: Array<{ key: DomainGroup; label: string }> = [
  { key: 'common', label: '通用域名' },
  { key: 'en', label: '英文域名' },
  { key: 'de', label: '德文域名' },
];

const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];

const ankiStatusText = computed(() => {
  if (ankiStatus.value === 'connected') return '已连接';
  if (ankiStatus.value === 'testing') return '检测中...';
  return '未连接';
});

const selectedProvider = computed(() => {
  if (!aiConfig.value || !selectedProviderId.value) return null;
  return aiConfig.value.providers.find(p => p.id === selectedProviderId.value) || null;
});

const apiSectionTitles: Record<ApiSection, string> = {
  providers: 'AI 提供商',
  stages: '阶段模型分配',
  search: '搜索 API',
  review: '审核阈值',
  runtime: '运行参数',
};

const apiSectionDescription: Record<ApiSection, string> = {
  providers: '管理 LLM 提供商、密钥、地址和模型列表',
  stages: '为快速 / 均衡 / 专家三种模型配置指定供应商与模型，系统自动分配到对应流水线阶段',
  search: '配置网页搜索提供商与域名偏好',
  review: '设置审核评分阈值（1-10）与按语言覆盖',
  runtime: '配置 AI 作业队列的全局并发池大小',
};

const close = (): void => {
  void router.push('/');
};

const createEmptySearch = (): NonNullable<AIConfigMasked['search']> => ({
  provider: 'brave',
  apiKey: '',
  autoDomains: true,
  domains: {
    common: ['etymonline.com', 'wiktionary.org', 'merriam-webster.com'],
    en: ['oed.com'],
    de: [],
  },
});

const providerFromPreset = (preset: AIProviderPreset): AIProviderMasked => ({
  id: preset.id,
  name: preset.name,
  type: preset.type,
  baseUrl: preset.apiHost,
  anthropicBaseUrl: preset.anthropicApiHost,
  apiKey: '',
  models: preset.models.map(model => ({
    id: model.id,
    name: model.name,
    endpointType: model.endpointType,
  })),
});

const mergePresetModels = (
  presetModels: AIProviderMasked['models'],
  savedModels: AIProviderMasked['models']
): AIProviderMasked['models'] => {
  const savedById = new Map(savedModels.map(model => [model.id, model]));
  const presetIds = new Set(presetModels.map(model => model.id));
  const mergedPresetModels = presetModels.map(presetModel => ({
    ...presetModel,
    ...savedById.get(presetModel.id),
    endpointType: savedById.get(presetModel.id)?.endpointType || presetModel.endpointType,
  }));
  return [...mergedPresetModels, ...savedModels.filter(model => !presetIds.has(model.id))];
};

const mergePresetProviders = (providers: AIProviderMasked[]): AIProviderMasked[] => {
  const providerById = new Map(providers.map(provider => [provider.id, provider]));
  const presetIds = new Set(aiProviderPresets.map(preset => preset.id));
  const systemProviders = aiProviderPresets.map(preset => {
    const presetProvider = providerFromPreset(preset);
    const savedProvider = providerById.get(preset.id);
    if (!savedProvider) return presetProvider;
    return {
      ...presetProvider,
      ...savedProvider,
      models: mergePresetModels(presetProvider.models, savedProvider.models),
    };
  });
  const customProviders = providers.filter(provider => !presetIds.has(provider.id));
  return [...systemProviders, ...customProviders];
};

const isPresetProvider = (provider?: AIProviderMasked): boolean =>
  Boolean(provider && aiProviderPresets.some(preset => preset.id === provider.id));

const getPresetLogo = (providerId: string): string | undefined =>
  aiProviderPresets.find(p => p.id === providerId)?.logo;

const getPresetWebsite = (providerId: string): string | undefined =>
  aiProviderPresets.find(p => p.id === providerId)?.websites?.official;

const normalizeAIConfig = (config: AIConfigMasked): AIConfigMasked => ({
  ...config,
  providers: mergePresetProviders(config.providers || []),
  queue_concurrency: Math.max(1, Number(config.queue_concurrency || 1)),
  search: config.search || createEmptySearch(),
  stages: config.stages || {},
  review: {
    threshold: config.review?.threshold ?? 6,
    thresholdByLanguage: {
      en: config.review?.thresholdByLanguage?.en ?? config.review?.threshold ?? 6,
      de: config.review?.thresholdByLanguage?.de ?? config.review?.threshold ?? 6,
      ...(config.review?.thresholdByLanguage || {}),
    },
  },
});

const stageLabel = (stageKey: StageKey): string =>
  ({
    fast: '快速模型',
    balanced: '均衡模型',
    expert: '专家模型',
  })[stageKey];

const stageDescription = (stageKey: StageKey): string =>
  ({
    fast: '轻量快速模型。用于 Pass 1（搜索生成）和 Fixer（格式修复）阶段，速度快、成本低。',
    balanced: '均衡质量模型。用于 Pass 2（深度生成）和 Regenerator（字段重生成）阶段，平衡速度与质量。',
    expert: '最强推理模型。用于 Reviewer（内容审核评分）阶段，需要最高质量的三字段评分（1-10 分制）。',
  })[stageKey];

const getProviderModels = (providerId: string): AIProviderMasked['models'] =>
  aiConfig.value?.providers.find(provider => provider.id === providerId)?.models || [];

const getModelEndpointType = (
  provider: AIProviderMasked,
  modelId: string
): AIProviderMasked['type'] =>
  provider.models.find(model => model.id === modelId)?.endpointType || provider.type;

const getModelEndpointLabel = (provider: AIProviderMasked, modelId: string): string =>
  getModelEndpointType(provider, modelId) === 'anthropic' ? 'Anthropic' : 'OpenAI';

const getStage = (stageKey: StageKey): AIStageConfig => {
  if (!aiConfig.value) return { provider: '', model: '', reasoningEffort: 'auto' };
  const stages = aiConfig.value.stages as Record<StageKey, AIStageConfig | undefined>;
  if (!stages[stageKey]) {
    stages[stageKey] = {
      provider: '',
      model: '',
      reasoningEffort: stageKey === 'expert' ? 'high' : 'auto',
    };
  } else if (!stages[stageKey].reasoningEffort) {
    stages[stageKey].reasoningEffort = stageKey === 'expert' ? 'high' : 'auto';
  }
  return stages[stageKey] as AIStageConfig;
};

const updateStageProvider = (stageKey: StageKey, providerId: string): void => {
  const stage = getStage(stageKey);
  stage.provider = providerId;
  stage.model = '';
  triggerAutoSave();
};

const updateStageModel = (stageKey: StageKey, modelId: string): void => {
  getStage(stageKey).model = modelId;
  triggerAutoSave();
};

const updateStageReasoningEffort = (stageKey: StageKey, effort: string): void => {
  const allowed = reasoningEffortOptions.map(option => option.value);
  if (!allowed.includes(effort as ReasoningEffort)) return;
  getStage(stageKey).reasoningEffort = effort as ReasoningEffort;
  triggerAutoSave();
};

const updateQueueConcurrency = (value: number): void => {
  if (!aiConfig.value) return;
  const nextValue = Math.max(1, Math.floor(Number(value) || 1));
  aiConfig.value.queue_concurrency = nextValue;
  triggerAutoSave();
};

const updateModelEndpointType = (
  model: AIProviderMasked['models'][number],
  endpointType: string
): void => {
  model.endpointType =
    endpointType === 'openai' || endpointType === 'anthropic' ? endpointType : undefined;
  triggerAutoSave();
};

const sanitizeAIConfigForSave = (config: AIConfigMasked): AIConfigMasked => {
  const stages = Object.fromEntries(
    Object.entries(config.stages || {}).filter(
      ([, stage]) => Boolean(stage?.provider.trim()) && Boolean(stage?.model.trim())
    )
  ) as AIConfigMasked['stages'];
  return {
    ...config,
    stages,
    search: config.search
      ? {
          ...config.search,
          domains: {
            common: config.search.domains.common.filter(Boolean),
            en: config.search.domains.en.filter(Boolean),
            de: config.search.domains.de.filter(Boolean),
          },
        }
      : undefined,
  };
};

const loadAIConfig = async (): Promise<void> => {
  aiLoading.value = true;
  aiError.value = '';
  try {
    aiConfig.value = normalizeAIConfig(await fetchAIConfig());
  } catch (error) {
    aiError.value = error instanceof Error ? error.message : 'Failed to load AI config';
  } finally {
    aiLoading.value = false;
  }
};

const handleSaveAIConfig = async (silent = true): Promise<void> => {
  if (!aiConfig.value) return;
  aiSaving.value = true;
  aiError.value = '';
  try {
    const draftConfig = aiConfig.value;
    const savedConfig = await saveAIConfig(sanitizeAIConfigForSave(draftConfig));
    aiConfig.value = normalizeAIConfig(mergeSavedAIConfigWithDraft(savedConfig, draftConfig));
    if (!silent) {
      appStore.addToast('AI config saved', 'success');
    }
  } catch (error) {
    aiError.value = error instanceof Error ? error.message : 'Failed to save AI config';
    if (!silent) {
      appStore.addToast(aiError.value, 'error');
    }
  } finally {
    aiSaving.value = false;
  }
};

const triggerAutoSave = (): void => {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    if (autoSaveBusy) return;
    autoSaveBusy = true;
    try {
      await handleSaveAIConfig(true);
    } finally {
      autoSaveBusy = false;
    }
  }, 300);
};

const flushAutoSave = async (): Promise<void> => {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
  if (autoSaveBusy) return;
  autoSaveBusy = true;
  try {
    await handleSaveAIConfig(true);
  } finally {
    autoSaveBusy = false;
  }
};

const selectProvider = (providerId: string): void => {
  selectedProviderId.value = providerId;
  if (aiConfig.value) {
    const provider = aiConfig.value.providers.find(p => p.id === providerId);
    if (provider && provider.models.length > 0) {
      testModelId.value = provider.models[0].id;
    }
  }
};

const onTypeChange = (): void => {
  if (!selectedProvider.value) return;
  const preset = aiProviderPresets.find(p => p.id === selectedProvider.value!.id);
  if (!preset) { triggerAutoSave(); return; }
  selectedProvider.value.baseUrl = preset.apiHost;
  selectedProvider.value.anthropicBaseUrl = preset.anthropicApiHost;
  triggerAutoSave();
};

const confirmAddProvider = async (): Promise<void> => {
  if (!addProviderForm.name.trim()) return;
  const id = addProviderForm.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!aiConfig.value) return;
  const newProvider: AIProviderMasked = {
    id,
    name: addProviderForm.name.trim(),
    type: addProviderForm.type,
    baseUrl: 'https://api.openai.com/v1',
    anthropicBaseUrl: 'https://api.anthropic.com',
    apiKey: '',
    models: [{ id: 'gpt-4o-mini', name: 'gpt-4o-mini' }],
  };
  aiConfig.value.providers.push(newProvider);
  showAddProviderPopup.value = false;
  addProviderForm.name = '';
  addProviderForm.type = 'openai';
  selectedProviderId.value = id;
  await handleSaveAIConfig(true);
};

const removeProvider = (providerId: string): void => {
  if (!aiConfig.value) return;
  const idx = aiConfig.value.providers.findIndex(p => p.id === providerId);
  if (idx === -1) return;
  const [removed] = aiConfig.value.providers.splice(idx, 1);
  for (const stageKey of stageKeys) {
    const stage = getStage(stageKey);
    if (stage.provider === removed.id) {
      stage.provider = '';
      stage.model = '';
    }
  }
  if (selectedProviderId.value === providerId) {
    selectedProviderId.value = null;
  }
  triggerAutoSave();
};

const addModel = (): void => {
  if (!selectedProvider.value) return;
  const id = newModelId.value.trim();
  if (!id) return;
  const name = newModelName.value.trim() || id;
  selectedProvider.value.models = [
    ...selectedProvider.value.models,
    { id, name, endpointType: newModelEndpointType.value || undefined },
  ];
  newModelId.value = '';
  newModelName.value = '';
  newModelEndpointType.value = '';
  showAddModelRow.value = false;
  triggerAutoSave();
};

const removeModel = (index: number): void => {
  if (!selectedProvider.value) return;
  const filtered = [];
  for (let i = 0; i < selectedProvider.value.models.length; i++) {
    if (i !== index) filtered.push(selectedProvider.value.models[i]);
  }
  selectedProvider.value.models = filtered;
  triggerAutoSave();
};

const handleTestProvider = async (): Promise<void> => {
  const provider = selectedProvider.value;
  if (!provider) return;
  if (!provider.apiKey.trim()) {
    appStore.addToast('测试连接前请输入 API Key', 'error');
    return;
  }
  if (!provider.models.length) {
    appStore.addToast('请先添加至少一个模型', 'error');
    return;
  }

  const preset = aiProviderPresets.find(p => p.id === provider.id);
  const modelId = testModelId.value || provider.models[0]?.id;
  const modelEndpointType = getModelEndpointType(provider, modelId);
  const testBaseUrl =
    modelEndpointType === 'anthropic'
      ? provider.anthropicBaseUrl || preset?.anthropicApiHost || provider.baseUrl
      : provider.baseUrl;

  testingProvider[provider.id] = true;
  try {
    const result = await testProvider({
      providerId: provider.id,
      baseUrl: testBaseUrl,
      anthropicBaseUrl: provider.anthropicBaseUrl || preset?.anthropicApiHost,
      apiKey: provider.apiKey,
      type: provider.type,
      modelEndpointType: provider.models.find(model => model.id === modelId)?.endpointType,
      model: modelId,
    });
    testResults[provider.id] = result;
    if (result.ok) {
      appStore.addToast(
        `连接成功 (${result.latencyMs || 0}ms)`,
        'success'
      );
    } else {
      appStore.addToast(
        result.error || '连接失败',
        'error'
      );
    }
  } catch (error) {
    testResults[provider.id] = {
      ok: false,
      error: error instanceof Error ? error.message : 'Test failed',
    };
    appStore.addToast(
      error instanceof Error ? error.message : '连接失败',
      'error'
    );
  } finally {
    testingProvider[provider.id] = false;
  }
};

const handleTestSearch = async (): Promise<void> => {
  if (!aiConfig.value?.search) return;
  const search = aiConfig.value.search;
  if (!search.apiKey.trim()) {
    appStore.addToast('测试搜索前请输入 API Key', 'error');
    return;
  }
  testingSearch.value = true;
  searchTestResult.value = null;
  try {
    const result = await testSearch({
      provider: search.provider,
      apiKey: search.apiKey,
    });
    searchTestResult.value = result;
    if (result.ok) {
      appStore.addToast(`搜索连接成功 (${result.latencyMs || 0}ms)`, 'success');
    } else {
      appStore.addToast(result.error || '搜索连接失败', 'error');
    }
  } catch (error) {
    searchTestResult.value = {
      ok: false,
      error: error instanceof Error ? error.message : 'Test failed',
    };
    appStore.addToast(
      error instanceof Error ? error.message : '搜索连接失败',
      'error'
    );
  } finally {
    testingSearch.value = false;
  }
};

const addDomain = (group: DomainGroup): void => {
  if (!aiConfig.value?.search) return;
  const domain = domainDrafts[group].trim().replace(/,$/, '');
  if (!domain) return;
  const domains = aiConfig.value.search.domains[group];
  if (!domains.includes(domain)) {
    domains.push(domain);
  }
  domainDrafts[group] = '';
};

const handleDomainKeydown = (event: KeyboardEvent, group: DomainGroup): void => {
  if (event.key !== 'Enter' && event.key !== ',') return;
  event.preventDefault();
  addDomain(group);
};

const removeDomain = (group: DomainGroup, domain: string): void => {
  if (!aiConfig.value?.search) return;
  aiConfig.value.search.domains[group] = aiConfig.value.search.domains[group].filter(
    item => item !== domain
  );
};

const loadAnkiConfig = (): void => {
  ankiConfig.value = getStoredAnkiExportOptionsSummary();
  ankiMappingModels.value = listStoredFieldMappingModelNames();
};

const testAnkiConnection = async (): Promise<void> => {
  ankiStatus.value = 'testing';
  try {
    await pingAnkiConnect();
    ankiStatus.value = 'connected';
    appStore.addToast('Anki connected', 'success');
  } catch (error) {
    ankiStatus.value = 'disconnected';
    appStore.addToast('Anki disconnected', 'error');
    console.error('Failed to connect Anki', error);
  }
};

const loadDataDir = async (): Promise<void> => {
  if (!window.electronAPI) return;
  dataDir.value = await window.electronAPI.getDataDir();
};

const selectAndSetDataDir = async (): Promise<void> => {
  if (!window.electronAPI) return;
  const chosenPath = await window.electronAPI.selectDirectory();
  if (!chosenPath) return;

  try {
    const result = await window.electronAPI.setDataDir(chosenPath);
    dataDir.value = chosenPath;
    dataDirStatus.value = result.message;
    appStore.addToast('Data directory updated', 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dataDirStatus.value = message;
    appStore.addToast('Failed to update data directory', 'error');
  }
};

const replayOnboarding = (): void => {
  requestOnboardingReplay();
  appStore.addToast('新手指引已重新启动', 'info');
};

onMounted(() => {
  loadAnkiConfig();
  void loadAIConfig();
  void testAnkiConnection();
  void loadDataDir();
});
</script>

<template>
  <div class="settings-page">
    <div class="settings-shell">
      <div class="settings-topbar">
        <div class="settings-brand">
          <span class="brand-mark">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
          </span>
          <strong>设置</strong>
        </div>
        <button class="icon-button" type="button" aria-label="关闭设置" @click="close">×</button>
      </div>

      <main class="settings-body">
        <nav class="settings-nav" aria-label="设置分类">
          <button
            type="button"
            class="settings-nav-item"
            :class="{ active: activeSettingsPage === 'about' }"
            @click="activeSettingsPage = 'about'"
          >
            <span class="nav-symbol">i</span>
            <span>关于</span>
          </button>
          <button
            type="button"
            class="settings-nav-item"
            :class="{ active: activeSettingsPage === 'api' }"
            @click="activeSettingsPage = 'api'"
          >
            <span class="nav-symbol">API</span>
            <span>API</span>
          </button>

          <div v-if="activeSettingsPage === 'api'" class="api-section-nav">
            <button
              type="button"
              class="api-section-nav-item"
              :class="{ active: activeApiSection === 'providers' }"
              @click="activeApiSection = 'providers'"
            >
              <span class="api-nav-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="4" y="4" width="16" height="16" rx="4" />
                  <path d="M9 12h6" />
                  <path d="M12 9v6" />
                </svg>
              </span>
              AI 提供商
            </button>
            <button
              type="button"
              class="api-section-nav-item"
              :class="{ active: activeApiSection === 'stages' }"
              @click="activeApiSection = 'stages'"
            >
              <span class="api-nav-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 7h14" />
                  <path d="M5 12h14" />
                  <path d="M5 17h14" />
                  <circle cx="8" cy="7" r="1.5" />
                  <circle cx="14" cy="12" r="1.5" />
                  <circle cx="11" cy="17" r="1.5" />
                </svg>
              </span>
              阶段模型分配
            </button>
            <button
              type="button"
              class="api-section-nav-item"
              :class="{ active: activeApiSection === 'search' }"
              @click="activeApiSection = 'search'"
            >
              <span class="api-nav-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="6" />
                  <path d="M16 16l4 4" />
                </svg>
              </span>
              搜索 API
            </button>
            <button
              type="button"
              class="api-section-nav-item"
              :class="{ active: activeApiSection === 'review' }"
              @click="activeApiSection = 'review'"
            >
              <span class="api-nav-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 4l7 4v5c0 4.5-3 7-7 8-4-1-7-3.5-7-8V8l7-4z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </span>
              审核阈值
            </button>
            <button
              type="button"
              class="api-section-nav-item"
              :class="{ active: activeApiSection === 'runtime' }"
              @click="activeApiSection = 'runtime'"
            >
              <span class="api-nav-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 7h9" />
                  <path d="M4 17h9" />
                  <circle cx="17" cy="7" r="3" />
                  <circle cx="17" cy="17" r="3" />
                </svg>
              </span>
              运行参数
            </button>
          </div>
        </nav>

        <!-- Provider list column -->
        <aside
          v-if="activeSettingsPage === 'api' && activeApiSection === 'providers'"
          class="api-provider-column"
        >
          <div class="provider-search">
            <span>⌕</span>
            <input placeholder="搜索 API 平台..." />
          </div>

          <div class="provider-list cherry-list">
            <button
              v-for="provider in aiConfig?.providers || []"
              :key="provider.id"
              type="button"
              class="provider-row"
              :class="{ active: selectedProviderId === provider.id }"
              @click="selectProvider(provider.id)"
            >
              <img
                v-if="getPresetLogo(provider.id)"
                :src="getPresetLogo(provider.id)"
                class="provider-icon-img"
              />
              <span v-else class="provider-icon" :class="'provider-icon-' + provider.type">
                {{ provider.name.slice(0, 1).toUpperCase() }}
              </span>
              <span class="provider-copy">
                <strong>{{ provider.name }}</strong>
              </span>
              <span class="provider-status">ON</span>
            </button>
            <p v-if="!aiLoading && !aiConfig?.providers.length" class="empty-text provider-empty">
              暂无 API 服务
            </p>
          </div>

          <button
            class="btn btn-compact provider-add-button"
            type="button"
            @click="showAddProviderPopup = true"
          >
            + 添加 API 服务
          </button>
        </aside>

        <!-- Right content area -->
        <section
          v-if="activeSettingsPage === 'api'"
          class="settings-content settings-ai-page"
          :class="{ 'settings-content-wide': activeApiSection !== 'providers' }"
        >
          <header class="settings-ai-header">
            <div class="settings-ai-header-row">
              <div>
                <h1>
                  {{
                    activeApiSection === 'providers' && selectedProvider
                      ? selectedProvider.name
                      : apiSectionTitles[activeApiSection]
                  }}
                </h1>
                <p>{{ apiSectionDescription[activeApiSection] }}</p>
              </div>
              <a
                v-if="
                  activeApiSection === 'providers' &&
                  selectedProvider &&
                  getPresetWebsite(selectedProvider.id)
                "
                :href="getPresetWebsite(selectedProvider.id)"
                target="_blank"
                class="header-link-btn"
                :title="getPresetWebsite(selectedProvider.id)"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
              </a>
            </div>
          </header>

          <div v-if="aiLoading" class="status-text">加载中...</div>
          <div v-else-if="!aiConfig" class="status-text">暂未配置 AI</div>
          <template v-else>
            <!-- Provider detail panel -->
            <section
              v-if="activeApiSection === 'providers' && selectedProvider"
              class="provider-editor api-detail-block"
            >
              <div class="api-field-block">
                <label class="api-field-label">API 密钥</label>
                <div class="secret-input-row">
                  <div class="secret-input api-secret-input">
                    <input
                      v-model="selectedProvider.apiKey"
                      class="field-control"
                      :type="showApiKey[selectedProvider.id] ? 'text' : 'password'"
                      placeholder="输入 API Key"
                      @input="triggerAutoSave()"
                    />
                    <button
                      type="button"
                      class="eye-toggle"
                      :title="showApiKey[selectedProvider.id] ? '隐藏' : '查看'"
                      @click="showApiKey[selectedProvider.id] = !showApiKey[selectedProvider.id]"
                    >
                      <svg v-if="showApiKey[selectedProvider.id]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                      <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                    </button>
                  </div>
                  <select
                    v-model="testModelId"
                    class="field-control test-model-select"
                    title="选择测试模型"
                  >
                    <option v-for="m in selectedProvider.models" :key="m.id" :value="m.id">
                      {{ m.id }}
                    </option>
                  </select>
                  <button
                    class="btn btn-compact"
                    type="button"
                    :disabled="testingProvider[selectedProvider.id]"
                    @click="handleTestProvider()"
                  >
                    {{ testingProvider[selectedProvider.id] ? '检测中...' : '检测' }}
                  </button>
                </div>
                <p v-if="testResults[selectedProvider.id]" class="provider-test-result">
                  {{
                    testResults[selectedProvider.id].ok
                      ? `连接成功 ${testResults[selectedProvider.id].latencyMs || 0}ms`
                      : testResults[selectedProvider.id].error
                  }}
                </p>
              </div>

              <div class="api-field-block">
                <label class="api-field-label">API 地址</label>
                <input
                  v-model="selectedProvider.baseUrl"
                  class="field-control api-url-input"
                  @blur="flushAutoSave()"
                />
              </div>

              <div class="api-field-block">
                <label class="api-field-label">Anthropic API 地址</label>
                <input
                  v-model="selectedProvider.anthropicBaseUrl"
                  class="field-control api-url-input"
                  placeholder="https://api.anthropic.com"
                  @blur="flushAutoSave()"
                />
              </div>

              <div class="provider-form-grid cherry-provider-form">
                <label class="field-stack">
                  <span>名称</span>
                  <input
                    v-model="selectedProvider.name"
                    class="field-control"
                    placeholder="Provider name"
                    @input="triggerAutoSave()"
                  />
                </label>
                <label class="field-stack">
                  <span>类型</span>
                  <select
                    v-model="selectedProvider.type"
                    class="field-control"
                    @change="onTypeChange()"
                  >
                    <option value="openai">OpenAI compatible</option>
                    <option value="anthropic">Anthropic compatible</option>
                  </select>
                </label>
              </div>

              <!-- Model List -->
              <div class="api-field-block">
                <div class="api-section-title">
                  <span>模型</span>
                  <button class="btn btn-compact" type="button" @click="showAddModelRow = true">
                    + 添加模型
                  </button>
                </div>
                <div class="model-list">
                  <div
                    v-for="(model, mIdx) in selectedProvider.models"
                    :key="mIdx"
                    class="model-list-item"
                  >
                    <span class="model-id" :title="model.id">{{ model.id }}</span>
                    <span class="model-name" :title="model.name">{{ model.name }}</span>
                    <span class="model-endpoint-badge">
                      {{ getModelEndpointLabel(selectedProvider, model.id) }}
                    </span>
                    <select
                      :value="model.endpointType || ''"
                      class="field-control model-endpoint-select"
                      @change="updateModelEndpointType(model, ($event.target as HTMLSelectElement).value)"
                    >
                      <option value="">继承</option>
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                    </select>
                    <button
                      type="button"
                      class="model-remove-btn"
                      @click="removeModel(mIdx)"
                    >
                      ×
                    </button>
                  </div>
                  <div v-if="showAddModelRow" class="model-add-row">
                    <input
                      v-model="newModelId"
                      class="field-control model-id-input"
                      placeholder="model-id"
                      @keydown.enter="addModel()"
                    />
                    <input
                      v-model="newModelName"
                      class="field-control model-name-input"
                      placeholder="显示名称"
                      @keydown.enter="addModel()"
                    />
                    <select
                      v-model="newModelEndpointType"
                      class="field-control model-endpoint-select"
                    >
                      <option value="">继承</option>
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                    </select>
                    <button class="btn btn-compact" type="button" @click="addModel()">确定</button>
                    <button class="btn btn-compact" type="button" @click="showAddModelRow = false; newModelId = ''; newModelName = ''; newModelEndpointType = ''">取消</button>
                  </div>
                  <p v-if="!selectedProvider.models.length && !showAddModelRow" class="empty-text">
                    暂无模型
                  </p>
                </div>
              </div>

              <div class="provider-editor-actions">
                <button
                  v-if="!isPresetProvider(selectedProvider)"
                  class="btn danger"
                  type="button"
                  @click="removeProvider(selectedProvider.id)"
                >
                  删除
                </button>
              </div>
            </section>

            <!-- No provider selected placeholder -->
            <section
              v-else-if="activeApiSection === 'providers' && !selectedProvider"
              class="provider-editor api-detail-block provider-empty-state"
            >
              <p>从左侧列表选择一个 API 服务查看详情</p>
            </section>

            <!-- Stages section -->
            <div v-else-if="activeApiSection === 'stages'" class="api-config-stack">
              <section class="ai-panel ai-panel-stages">
                <header class="ai-panel-header">
                  <h2>阶段模型分配</h2>
                  <p>为快速 / 均衡 / 专家三种模型配置指定供应商与模型</p>
                </header>
                <div
                  v-for="stageKey in stageKeys"
                  :key="stageKey"
                  class="stage-assignment-row"
                >
                  <span class="stage-label">
                    <span class="stage-info-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                      <span class="stage-tooltip">{{ stageDescription(stageKey) }}</span>
                    </span>
                    {{ stageLabel(stageKey) }}
                  </span>
                  <select
                    class="field-control"
                    :value="getStage(stageKey).provider"
                    @change="updateStageProvider(stageKey, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">选择供应商</option>
                    <option v-for="provider in aiConfig.providers" :key="provider.id" :value="provider.id">
                      {{ provider.id }}
                    </option>
                  </select>
                  <span class="stage-arrow">→</span>
                  <select
                    class="field-control"
                    :value="getStage(stageKey).model"
                    :disabled="!getStage(stageKey).provider"
                    @change="updateStageModel(stageKey, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">选择模型</option>
                    <option
                      v-for="model in getProviderModels(getStage(stageKey).provider)"
                      :key="model.id"
                      :value="model.id"
                    >
                      {{ model.name }}
                    </option>
                  </select>
                  <select
                    class="field-control reasoning-select"
                    :value="getStage(stageKey).reasoningEffort || 'auto'"
                    @change="updateStageReasoningEffort(stageKey, ($event.target as HTMLSelectElement).value)"
                  >
                    <option
                      v-for="option in reasoningEffortOptions"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                </div>
              </section>
            </div>

            <!-- Search section -->
            <div v-else-if="activeApiSection === 'search'" class="api-config-stack">
              <section v-if="aiConfig.search" class="ai-panel ai-panel-search">
                <header class="ai-panel-header">
                  <h2>网络搜索</h2>
                  <p>配置网页搜索提供商与域名偏好</p>
                </header>

                <div class="search-api-row">
                  <label class="field-stack">
                    <span class="search-field-label">
                      提供商
                      <span class="stage-info-icon">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                        <span class="stage-tooltip">选择网页搜索 API 提供商。Brave Search API 和 Tavily Search API 均支持网络搜索，用于流水线 Pass 1 阶段的词源检索。</span>
                      </span>
                    </span>
                    <select
                      v-model="aiConfig.search.provider"
                      class="field-control"
                      @change="triggerAutoSave()"
                    >
                      <option value="brave">Brave</option>
                      <option value="tavily">Tavily</option>
                    </select>
                  </label>
                  <label class="field-stack search-key-field">
                    <span class="search-field-label">
                      API Key
                      <span class="stage-info-icon">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                        <span class="stage-tooltip">用于 Pass 1 搜索阶段的搜索 API 密钥。</span>
                      </span>
                    </span>
                    <div class="secret-input-row">
                      <span class="secret-input api-secret-input">
                        <input
                          v-model="aiConfig.search.apiKey"
                          class="field-control"
                          :type="showApiKey._search ? 'text' : 'password'"
                          placeholder="输入搜索 API Key"
                          @input="triggerAutoSave()"
                        />
                        <button
                          type="button"
                          class="eye-toggle"
                          :title="showApiKey._search ? '隐藏' : '查看'"
                          @click="showApiKey._search = !showApiKey._search"
                        >
                          <svg v-if="showApiKey._search" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                        </button>
                      </span>
                      <button
                        class="btn btn-compact"
                        type="button"
                        :disabled="testingSearch"
                        @click="handleTestSearch()"
                      >
                        {{ testingSearch ? '检测中...' : '检测' }}
                      </button>
                    </div>
                  </label>
                </div>
                <p v-if="searchTestResult" class="provider-test-result search-test-result">
                  {{
                    searchTestResult.ok
                      ? `连接成功 ${searchTestResult.latencyMs || 0}ms`
                      : searchTestResult.error
                  }}
                </p>

                <div class="domain-toggle-row">
                  <span class="search-field-label">
                    自动域名
                    <span class="stage-info-icon">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                      <span class="stage-tooltip">开启后根据当前语言自动追加默认搜索域名；关闭后使用下方手动域名。</span>
                    </span>
                  </span>
                  <input
                    v-model="aiConfig.search.autoDomains"
                    type="checkbox"
                    role="switch"
                    class="domain-switch"
                    @change="triggerAutoSave()"
                  />
                </div>

                <div class="domain-rows" :class="{ 'domain-disabled': aiConfig.search.autoDomains }">
                  <div v-for="group in domainGroups" :key="group.key" class="domain-row">
                    <span class="search-field-label">
                      {{ group.label }}
                      <span class="stage-info-icon">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                        <span class="stage-tooltip">{{
                          group.key === 'common'
                            ? '跨语言的通用词源网站（如 etymonline、wiktionary），所有语言均使用。'
                            : group.key === 'en'
                              ? '仅对英文单词生效的搜索域名（如 oed.com）。'
                              : '仅对德文单词生效的搜索域名。'
                        }}</span>
                      </span>
                    </span>
                    <div class="tag-input">
                      <span
                        v-for="domain in aiConfig.search.domains[group.key]"
                        :key="domain"
                        class="domain-chip"
                      >
                        {{ domain }}
                        <button
                          type="button"
                          :disabled="aiConfig.search.autoDomains"
                          @click="removeDomain(group.key, domain)"
                        >
                          ×
                        </button>
                      </span>
                      <input
                        v-model="domainDrafts[group.key]"
                        :placeholder="
                          aiConfig.search.domains[group.key].length
                            ? ''
                            : '添加域名（按 Enter）'
                        "
                        :disabled="aiConfig.search.autoDomains"
                        @keydown="handleDomainKeydown($event, group.key)"
                        @blur="addDomain(group.key)"
                      />
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <!-- Review section -->
            <div v-else-if="activeApiSection === 'review'" class="api-config-stack">
              <section class="ai-panel ai-panel-review">
                <header class="ai-panel-header">
                  <h2>审核阈值</h2>
                  <p>设置默认审核阈值和语言覆盖</p>
                </header>

                <div class="threshold-section">
                  <div class="threshold-default-row">
                    <span class="search-field-label">
                      默认阈值
                      <span class="stage-info-icon">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                        <span class="stage-tooltip">所有语言通用的审核评分阈值（1-10 分制）。Reviewer 阶段对 visual_imagery_zh、meaning_evolution_zh、image_differentiation_zh 三个字段评分，低于此阈值的字段将进入 Regenerator 阶段重新生成。</span>
                      </span>
                    </span>
                    <input
                      v-model.number="aiConfig.review.threshold"
                      class="number-control"
                      type="number"
                      min="1"
                      max="10"
                      @change="triggerAutoSave()"
                    />
                    <span class="range-hint">1-10</span>
                  </div>
                  <div class="threshold-lang-row">
                    <span class="search-field-label">
                      语言覆盖
                      <span class="stage-info-icon">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                        <span class="stage-tooltip">分别覆盖英文和德文的审核阈值；未设置时使用默认值。</span>
                      </span>
                    </span>
                    <div class="threshold-lang-inputs">
                      <label>en</label>
                      <input
                        v-model.number="aiConfig.review.thresholdByLanguage.en"
                        class="number-control"
                        type="number"
                        min="1"
                        max="10"
                        @change="triggerAutoSave()"
                      />
                      <span class="range-hint">1-10</span>
                      <label>de</label>
                      <input
                        v-model.number="aiConfig.review.thresholdByLanguage.de"
                        class="number-control"
                        type="number"
                        min="1"
                        max="10"
                        @change="triggerAutoSave()"
                      />
                      <span class="range-hint">1-10</span>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <!-- Runtime section -->
            <div v-else class="api-config-stack">
              <section class="ai-panel ai-panel-runtime">
                <header class="ai-panel-header">
                  <p>控制 AI 作业队列的全局并发池。Web 调试和 Electron 桌面端共用此配置。</p>
                </header>

                <div class="runtime-setting-row">
                  <span class="search-field-label">
                    并发池大小
                    <span class="stage-info-icon">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                      <span class="stage-tooltip">同一时间允许运行的 Generate / Fix / Audit-Fix Job 总数。设置为 3 时，最多 3 个 Job 同时执行；所有批次共享这个全局池。</span>
                    </span>
                  </span>
                  <input
                    class="number-control"
                    type="number"
                    min="1"
                    :value="aiConfig.queue_concurrency"
                    @change="updateQueueConcurrency(($event.target as HTMLInputElement).valueAsNumber)"
                  />
                  <span class="range-hint">≥ 1</span>
                </div>
              </section>
            </div>
          </template>
        </section>

        <!-- About section -->
        <section v-else class="settings-content secondary-settings">
          <div class="settings-section about-summary">
            <div class="section-title">关于</div>
            <div class="section-desc">Etymos / Ad Fontes Manager</div>
            <div class="about-grid">
              <span class="config-label">运行模式</span>
              <span class="config-value">{{ isElectron ? 'Desktop' : 'Web' }}</span>
              <span class="config-label">本地数据目录</span>
              <span class="config-value">{{ dataDir || 'Default web runtime' }}</span>
            </div>
          </div>

          <div class="settings-section">
            <div class="section-title">主题</div>
            <div class="section-desc">选择应用的色彩模式。</div>
            <div class="theme-options">
              <label
                v-for="opt in themeOptions"
                :key="opt.value"
                class="theme-option"
                :class="{ active: themeStore.preference === opt.value }"
              >
                <input
                  type="radio"
                  name="theme"
                  :value="opt.value"
                  :checked="themeStore.preference === opt.value"
                  @change="themeStore.setTheme(($event.target as HTMLInputElement).value as ThemePreference)"
                />
                <span>{{ opt.label }}</span>
              </label>
            </div>
          </div>

          <div class="settings-section">
            <div class="section-title">数据</div>
            <div class="section-desc">数据库存储位置。</div>
            <div class="data-row" v-if="isElectron">
              <button class="btn" @click="selectAndSetDataDir">更改数据目录</button>
              <span class="data-path">{{ dataDir || ' Default ' }}</span>
              <span v-if="dataDirStatus" class="data-error">{{ dataDirStatus }}</span>
            </div>
            <p class="data-note">
              AnkiConnect {{ ankiStatusText }}
              <span :class="'status-badge ' + ankiStatus" />
              <button class="btn btn-compact" @click="testAnkiConnection">重试</button>
            </p>
          </div>

          <div class="settings-section">
            <div class="section-title">指引</div>
            <div class="section-desc">重新运行新手指引。</div>
            <button class="btn btn-compact" @click="replayOnboarding">启动指引</button>
          </div>
        </section>
      </main>
    </div>

    <!-- Add Provider Popup -->
    <Teleport to="body">
      <div v-if="showAddProviderPopup" class="modal-overlay" @click.self="showAddProviderPopup = false">
        <div class="modal-card add-provider-modal">
          <h3>添加 API 服务</h3>
          <label class="field-stack">
            <span>名称</span>
            <input
              v-model="addProviderForm.name"
              class="field-control"
              placeholder="例如: DeepSeek, OpenAI"
              @keydown.enter="confirmAddProvider()"
            />
          </label>
          <label class="field-stack">
            <span>类型</span>
            <select v-model="addProviderForm.type" class="field-control">
              <option value="openai">OpenAI compatible</option>
              <option value="anthropic">Anthropic compatible</option>
            </select>
          </label>
          <div class="modal-actions">
            <button class="btn" type="button" @click="showAddProviderPopup = false">取消</button>
            <button
              class="btn btn-primary"
              type="button"
              :disabled="!addProviderForm.name.trim()"
              @click="confirmAddProvider()"
            >
              添加
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* ===== Settings Page Layout ===== */
.settings-page {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.settings-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(175deg, var(--bg-top), var(--bg-bottom));
}

.settings-topbar {
  flex: 0 0 auto;
  height: 48px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--line);
  background: var(--surface-head);
}

.settings-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text);
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  background: var(--green);
  color: #fff;
  font-weight: 700;
  font-size: 13px;
}

.icon-button {
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  padding: 4px 8px;
  font-size: 18px;
  border-radius: var(--radius-sm);
  transition: color 0.12s ease;
}

.icon-button:hover {
  color: var(--text);
}

/* ===== Body ===== */
.settings-body {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

/* ===== Left Nav ===== */
.settings-nav {
  flex: 0 0 auto;
  width: 180px;
  padding: 12px 0;
  border-right: 1px solid var(--line);
  background: var(--surface-soft);
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
  text-align: left;
  width: 100%;
}

.settings-nav-item:hover {
  color: var(--text);
  background: var(--surface);
}

.settings-nav-item.active {
  color: var(--text);
  font-weight: 640;
  background: var(--surface);
}

.nav-symbol {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  font-size: 11px;
  font-weight: 700;
  border-radius: var(--radius-sm);
  background: var(--surface-soft);
  border: 1px solid var(--border);
  flex-shrink: 0;
}

/* ===== API Section Sub-Nav ===== */
.api-section-nav {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 4px 0 4px 28px;
  border-top: 1px solid var(--line);
  margin-top: 4px;
}

.api-section-nav-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background 0.12s ease, color 0.12s ease;
  text-align: left;
  width: 100%;
}

.api-section-nav-item:hover {
  color: var(--text);
}

.api-section-nav-item.active {
  color: var(--green);
  font-weight: 600;
}

.api-nav-icon {
  width: 18px;
  height: 18px;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: currentColor;
  flex-shrink: 0;
}

.api-nav-icon svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.api-section-nav-item.active .api-nav-icon {
  background: var(--green-soft);
}

/* ===== Provider Column ===== */
.api-provider-column {
  flex: 0 0 auto;
  width: 220px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--line);
  background: var(--surface);
}

.provider-search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  color: var(--muted);
  font-size: 13px;
}

.provider-search input {
  flex: 1;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  outline: none;
}

.provider-search input::placeholder {
  color: var(--faint);
}

.provider-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.provider-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.1s ease;
  text-align: left;
}

.provider-row:hover {
  background: var(--surface-soft);
}

.provider-row.active {
  background: var(--green-soft);
  font-weight: 600;
}

.provider-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
  color: #fff;
  background: var(--green);
}

.provider-icon-anthropic {
  background: #d97706;
}

.provider-icon-img {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md);
  object-fit: contain;
  flex-shrink: 0;
}

.provider-copy {
  flex: 1;
  min-width: 0;
}

.provider-copy strong {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.provider-status {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: var(--radius-full);
  background: var(--green-soft);
  color: var(--green);
  flex-shrink: 0;
}

.provider-empty {
  padding: 16px 12px;
  text-align: center;
}

.provider-add-button {
  margin: 8px 12px;
  width: calc(100% - 24px);
}

/* ===== Main Content Area ===== */
.settings-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface);
}

.settings-ai-header {
  flex: 0 0 auto;
  padding: 16px 24px 12px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}

.settings-ai-header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.settings-ai-header h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
}

.settings-ai-header p {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--muted);
}

.header-link-btn {
  display: flex;
  align-items: center;
  padding: 4px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  text-decoration: none;
  flex-shrink: 0;
  margin-top: 2px;
}

.header-link-btn:hover {
  color: var(--text);
  background: var(--surface-soft);
}

/* ===== Provider Detail Panel ===== */
.provider-editor {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.provider-toggle-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line);
}

.provider-toggle-line input[type="checkbox"][role="switch"] {
  width: 36px;
  height: 20px;
  accent-color: var(--green);
}

.api-field-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.api-field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}

.api-url-input {
  font-family: var(--mono);
  font-size: 12px;
}

.secret-input {
  display: flex;
  align-items: center;
  gap: 4px;
}

.api-secret-input {
  position: relative;
  flex: 1;
}

.api-secret-input input {
  padding-right: 32px;
}

.eye-toggle {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  border: 0;
  background: transparent;
  color: var(--faint);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  border-radius: var(--radius-sm);
  transition: color 0.12s ease;
}

.eye-toggle:hover {
  color: var(--text);
}

.secret-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.secret-input-row .secret-input {
  flex: 1;
}

.test-model-select {
  width: auto;
  min-width: 120px;
  max-width: 160px;
  font-size: 11px;
  padding: 5px 8px;
}

.ghost-icon {
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
}

.ghost-icon:hover {
  color: var(--text);
}

.provider-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 14px;
}

.api-section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
}

.model-textarea {
  width: 100%;
  min-height: 80px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  font-size: 12px;
  font-family: var(--mono);
  resize: vertical;
  box-sizing: border-box;
}

.model-textarea:focus {
  outline: none;
  border-color: var(--green-border);
  box-shadow: 0 0 0 2px var(--green-soft);
}

/* Model list */
.model-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.model-list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  font-size: 12px;
}

.model-list-item:last-child {
  border-bottom: 0;
}

.model-list-item:hover {
  background: var(--surface-soft);
}

.model-id {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.model-name {
  font-size: 11px;
  color: var(--muted);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.model-endpoint-badge {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  color: var(--muted);
  flex-shrink: 0;
  font-size: 10px;
  padding: 2px 6px;
}

.model-endpoint-select {
  flex: 0 0 116px;
  font-size: 11px;
  padding: 4px 8px;
}

.model-remove-btn {
  border: 0;
  background: transparent;
  color: var(--faint);
  font-size: 14px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
  line-height: 1;
}

.model-remove-btn:hover {
  color: var(--red);
  background: var(--red-soft);
}

.model-add-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: var(--surface-soft);
  border-top: 1px solid var(--line);
}

.model-id-input {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  padding: 4px 8px;
}

.model-name-input {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  padding: 4px 8px;
}

.provider-test-result {
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
}

.provider-editor-actions {
  display: flex;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
}

/* ===== No Provider Selected ===== */
.provider-empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: var(--muted);
  font-size: 14px;
}

/* ===== Config Stack (Stages / Search / Review) ===== */
.api-config-stack {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ai-panel {
  padding: 16px;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--line);
}

.ai-panel-header {
  margin-bottom: 12px;
}

.ai-panel-header h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
}

.ai-panel-header p {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--muted);
}

/* Stage assignment */
.stage-assignment-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}

.stage-label {
  width: 120px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.stage-info-icon {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: help;
  color: var(--faint);
  flex-shrink: 0;
  transition: color 0.12s ease;
}

.stage-info-icon:hover {
  color: var(--green);
}

.stage-tooltip {
  display: none;
  position: absolute;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
  width: 280px;
  padding: 10px 12px;
  background: var(--text);
  color: var(--surface);
  font-size: 11px;
  font-weight: 400;
  line-height: 1.5;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  z-index: 100;
  pointer-events: none;
  white-space: normal;
}

.stage-info-icon:hover .stage-tooltip {
  display: block;
}

.stage-arrow {
  color: var(--faint);
  font-size: 12px;
  flex-shrink: 0;
}

.reasoning-select {
  flex: 0 0 116px;
}

/* Search config */
.search-api-row {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.search-key-field {
  flex: 1;
  min-width: 180px;
}

.domain-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--line);
}

.domain-switch {
  width: 36px;
  height: 20px;
  accent-color: var(--green);
}

.domain-disabled .tag-input {
  opacity: 0.4;
  pointer-events: none;
}

.domain-disabled .domain-chip {
  opacity: 0.5;
}


.domain-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.domain-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--muted);
}

.domain-row > span {
  width: 56px;
  flex-shrink: 0;
  font-weight: 600;
}

.tag-input {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  min-height: 32px;
}

.domain-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  background: var(--green-soft);
  border: 1px solid var(--green-border);
  border-radius: var(--radius-full);
  font-size: 11px;
  color: var(--green);
  font-weight: 500;
}

.domain-chip button {
  border: 0;
  background: transparent;
  color: var(--green);
  font-size: 13px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.tag-input input {
  flex: 1;
  min-width: 100px;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  outline: none;
  padding: 2px 4px;
}

/* Review threshold */
.threshold-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.threshold-default-row,
.threshold-lang-row,
.runtime-setting-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--text);
}

.threshold-lang-inputs {
  display: flex;
  align-items: center;
  gap: 8px;
}

.threshold-lang-inputs label {
  font-size: 12px;
  color: var(--muted);
}

.number-control {
  width: 56px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  text-align: center;
}

.number-control:focus {
  outline: none;
  border-color: var(--green-border);
}

.range-hint {
  font-size: 11px;
  color: var(--faint);
}

/* ===== Secondary Settings (About) ===== */
.secondary-settings {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settings-section {
  padding: 16px;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--line);
}

.section-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 4px;
}

.section-desc {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 8px;
}

.about-grid {
  display: grid;
  grid-template-columns: 128px 1fr;
  gap: 6px 12px;
  margin-top: 8px;
}

.config-label {
  font-size: 12px;
  color: var(--muted);
}

.config-value {
  font-size: 12px;
  color: var(--text);
  word-break: break-all;
}

.theme-options {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.theme-option {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
}

.theme-option:hover {
  border-color: var(--border-strong);
}

.theme-option.active {
  background: var(--green-soft);
  border-color: var(--green-border);
  color: var(--green);
  font-weight: 600;
}

.theme-option input {
  accent-color: var(--green);
}

.data-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.data-path {
  font-size: 12px;
  color: var(--muted);
  word-break: break-all;
}

.data-error {
  font-size: 11px;
  color: var(--red);
}

.data-note {
  font-size: 12px;
  color: var(--muted);
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-badge {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  background: var(--red);
}

.status-badge.connected {
  background: var(--green);
}

.status-badge.testing {
  background: var(--amber);
}

/* ===== Status Text ===== */
.status-text {
  font-size: 13px;
  color: var(--muted);
  padding: 24px;
  text-align: center;
}

.empty-text {
  font-size: 12px;
  color: var(--muted);
}

.ai-error {
  font-size: 12px;
  color: var(--red);
  padding: 0 24px 8px;
}

/* ===== Form Controls ===== */
.field-control {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  box-sizing: border-box;
  transition: border-color 0.12s ease;
}

.field-control:focus {
  outline: none;
  border-color: var(--green-border);
  box-shadow: 0 0 0 2px var(--green-soft);
}

.field-control:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.field-stack {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-stack > span:first-child {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}

.search-field-label {
  display: flex;
  align-items: center;
  gap: 4px;
}

select.field-control {
  appearance: auto;
}

/* ===== Buttons ===== */
.btn {
  height: 30px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-strong);
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 560;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.14s ease, border-color 0.14s ease;
  background: var(--surface);
  color: var(--text-soft);
}

.btn:hover {
  background: var(--surface-soft);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--green);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 4px 10px rgba(36, 114, 83, 0.14);
}

.btn-primary:hover {
  background: var(--green-hover);
}

.btn-compact {
  height: 26px;
  padding: 0 10px;
  font-size: 11px;
}

.btn.danger {
  color: var(--red);
  border-color: var(--red-border);
}

.btn.danger:hover {
  background: var(--red-soft);
}

/* ===== Add Provider Popup (Modal) ===== */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-card {
  background: var(--surface);
  border-radius: var(--radius-xl);
  padding: 24px;
  min-width: 360px;
  max-width: 420px;
  box-shadow: var(--shadow-md), 0 8px 32px rgba(0, 0, 0, 0.18);
}

.modal-card h3 {
  margin: 0 0 16px;
  font-size: 16px;
  color: var(--text);
}

.add-provider-modal .field-stack {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 14px;
}

.add-provider-modal .field-stack span {
  font-size: 12px;
  color: var(--muted);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
