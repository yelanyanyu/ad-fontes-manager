<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '@/stores/appStore';
import { useThemeStore, type ThemePreference } from '@/stores/themeStore';
import { pingAnkiConnect } from '@/services/ankiConnectService';
import {
  getStoredAnkiExportOptionsSummary,
  hasStoredAnkiExportOptions,
  type StoredAnkiExportOptionsSummary,
} from '@/services/ankiExportOptionsStore';
import { listStoredFieldMappingModelNames } from '@/services/ankiFieldMappingStore';
import { requestOnboardingReplay } from '@/components/Onboarding/onboardingState';

type AnkiStatus = 'connected' | 'disconnected' | 'testing';

const router = useRouter();
const appStore = useAppStore();
const themeStore = useThemeStore();

const ankiStatus = ref<AnkiStatus>('disconnected');
const isElectron = computed(() => Boolean(window.electronAPI));
const dataDir = ref('');
const dataDirStatus = ref('');
const ankiConfig = ref<StoredAnkiExportOptionsSummary>(getStoredAnkiExportOptionsSummary());
const ankiMappingModels = ref<string[]>([]);
const hasSavedAnkiConfig = computed(
  () => hasStoredAnkiExportOptions() || ankiMappingModels.value.length > 0
);

const ankiStatusText = computed(() => {
  if (ankiStatus.value === 'connected') return '已连接';
  if (ankiStatus.value === 'testing') return '检测中...';
  return '未连接';
});

const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];

const close = (): void => {
  void router.push('/');
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
  void testAnkiConnection();
  void loadDataDir();
});
</script>

<template>
  <div class="settings-page">
    <div class="settings-container">
      <!-- Header -->
      <div class="panel-head">
        <div class="panel-title">
          <strong>Settings</strong>
        </div>
        <button class="head-link" @click="close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="panel-body">
        <!-- Theme -->
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
                @change="themeStore.setTheme(opt.value)"
              />
              {{ opt.label }}
            </label>
          </div>
        </div>

        <!-- Anki Status -->
        <div class="settings-section">
          <div class="section-title">Anki 连接</div>
          <div class="status-row">
            <span class="status-label">状态:</span>
            <span
              :class="{
                'status-connected': ankiStatus === 'connected',
                'status-disconnected': ankiStatus === 'disconnected',
                'status-testing': ankiStatus === 'testing',
              }"
            >
              {{ ankiStatusText }}
            </span>
            <button class="btn btn-sm" @click="testAnkiConnection">Refresh</button>
          </div>
        </div>

        <!-- Anki Config -->
        <div class="settings-section">
          <div class="section-title">Anki 配置</div>
          <div class="section-actions">
            <button class="btn btn-sm" @click="loadAnkiConfig">Refresh</button>
          </div>

          <div v-if="hasSavedAnkiConfig" class="config-grid">
            <span class="config-label">Deck</span>
            <span class="config-value">{{ ankiConfig.deckName }}</span>
            <span class="config-label">Model</span>
            <span class="config-value">{{ ankiConfig.modelName }}</span>
            <span class="config-label">Template</span>
            <span class="config-value">{{ ankiConfig.templateName || 'Not selected' }}</span>
            <span class="config-label">Tags</span>
            <span class="config-value">{{ ankiConfig.tagsText || 'None' }}</span>
            <span class="config-label">APKG file</span>
            <span class="config-value">{{ ankiConfig.apkgPath }}</span>
            <span class="config-label">Field mappings</span>
            <span class="config-value">
              {{ ankiMappingModels.length ? ankiMappingModels.join(', ') : 'None' }}
            </span>
          </div>
          <p v-else class="empty-text">No saved Anki configuration yet.</p>
        </div>

        <!-- Data Directory (Electron only) -->
        <div v-if="isElectron" class="settings-section">
          <div class="section-title">数据目录</div>
          <div class="section-desc data-dir">{{ dataDir }}</div>
          <button class="btn btn-primary" @click="selectAndSetDataDir">
            Choose Directory
          </button>
          <p v-if="dataDirStatus" class="status-text">{{ dataDirStatus }}</p>
        </div>

        <!-- Onboarding -->
        <div class="settings-section">
          <div class="section-title">新手指引</div>
          <div class="section-desc">重新播放界面高亮引导。</div>
          <button class="btn btn-primary" @click="replayOnboarding">
            重新播放新手指引
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  min-height: calc(100vh - 88px);
  padding: 8px 0;
}

.settings-container {
  max-width: 672px;
  margin: 0 auto;
  background: var(--surface-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.panel-head {
  height: 48px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--line);
  background: linear-gradient(180deg, #fffefa, #fbf8f2);
}

[data-theme="dark"] .panel-head {
  background: linear-gradient(180deg, #2a261f, #221f1a);
}

.panel-title strong {
  font-size: 14px;
  font-weight: 740;
  letter-spacing: 0.055em;
  color: #2f2b26;
  text-transform: uppercase;
}

[data-theme="dark"] .panel-title strong {
  color: #eee8de;
}

.head-link {
  border: 0;
  background: transparent;
  color: #9d968d;
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  transition: color 0.12s ease;
}

.head-link:hover {
  color: var(--text);
}

.panel-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.settings-section {
  padding: 16px;
  border-radius: var(--radius-lg);
  background: var(--surface-soft);
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

.section-actions {
  margin-bottom: 8px;
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

.status-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-label {
  font-size: 13px;
  color: var(--muted);
}

.status-connected {
  color: var(--green);
  font-weight: 700;
  font-size: 13px;
}

.status-disconnected {
  color: var(--red);
  font-weight: 700;
  font-size: 13px;
}

.status-testing {
  color: var(--amber);
  font-weight: 700;
  font-size: 13px;
}

.config-grid {
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

.empty-text {
  font-size: 12px;
  color: var(--muted);
}

.data-dir {
  word-break: break-all;
}

.status-text {
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
}

/* Buttons */
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

.btn-primary {
  background: var(--green);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 4px 10px rgba(36, 114, 83, 0.14);
}

.btn-primary:hover {
  background: var(--green-hover);
}

[data-theme="dark"] .btn-primary {
  color: #08100c;
}
</style>
