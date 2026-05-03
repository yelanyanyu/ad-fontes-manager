<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '@/stores/appStore';
import { pingAnkiConnect } from '@/services/ankiConnectService';
import {
  getStoredAnkiExportOptionsSummary,
  hasStoredAnkiExportOptions,
  type StoredAnkiExportOptionsSummary,
} from '@/services/ankiExportOptionsStore';
import { listStoredFieldMappingModelNames } from '@/services/ankiFieldMappingStore';

type AnkiStatus = 'connected' | 'disconnected' | 'testing';

const router = useRouter();
const appStore = useAppStore();

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

onMounted(() => {
  loadAnkiConfig();
  void testAnkiConnection();
  void loadDataDir();
});
</script>

<template>
  <div class="p-8">
    <div
      class="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
    >
      <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
        <h3 class="text-lg font-bold text-slate-800">Settings</h3>
        <button class="text-slate-400 hover:text-slate-600 transition-colors" @click="close">
          <i class="fa-solid fa-xmark text-xl" />
        </button>
      </div>

      <div class="p-6 space-y-4">
        <div class="flex items-center gap-2 text-sm p-3 bg-slate-50 rounded-lg">
          <span class="text-slate-500">Anki Status:</span>
          <span
            :class="{
              'text-green-600 font-bold': ankiStatus === 'connected',
              'text-red-500 font-bold': ankiStatus === 'disconnected',
              'text-yellow-500 font-bold': ankiStatus === 'testing',
            }"
          >
            {{ ankiStatusText }}
          </span>
          <button class="text-primary hover:underline text-xs ml-2" @click="testAnkiConnection">
            Refresh
          </button>
        </div>

        <div class="space-y-3 text-sm p-3 bg-slate-50 rounded-lg">
          <div class="flex items-center justify-between gap-3">
            <div class="font-semibold text-slate-700">Anki Configuration</div>
            <button class="text-primary hover:underline text-xs" @click="loadAnkiConfig">
              Refresh
            </button>
          </div>

          <div v-if="hasSavedAnkiConfig" class="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2">
            <span class="text-slate-500">Deck</span>
            <span class="break-all text-slate-700">{{ ankiConfig.deckName }}</span>
            <span class="text-slate-500">Model</span>
            <span class="break-all text-slate-700">{{ ankiConfig.modelName }}</span>
            <span class="text-slate-500">Template</span>
            <span class="break-all text-slate-700">{{ ankiConfig.templateName || 'Not selected' }}</span>
            <span class="text-slate-500">Tags</span>
            <span class="break-all text-slate-700">{{ ankiConfig.tagsText || 'None' }}</span>
            <span class="text-slate-500">APKG file</span>
            <span class="break-all text-slate-700">{{ ankiConfig.apkgPath }}</span>
            <span class="text-slate-500">Field mappings</span>
            <span class="break-all text-slate-700">
              {{ ankiMappingModels.length ? ankiMappingModels.join(', ') : 'None' }}
            </span>
          </div>
          <p v-else class="text-slate-500">No saved Anki configuration yet.</p>
        </div>

        <div v-if="isElectron" class="space-y-3 text-sm p-3 bg-slate-50 rounded-lg">
          <div>
            <div class="font-semibold text-slate-700">Data Directory</div>
            <div class="mt-1 break-all text-slate-500">{{ dataDir }}</div>
          </div>
          <button
            class="px-3 py-2 bg-primary text-white rounded-md hover:bg-blue-700 transition-colors"
            @click="selectAndSetDataDir"
          >
            Choose Directory
          </button>
          <p v-if="dataDirStatus" class="text-slate-500">{{ dataDirStatus }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
