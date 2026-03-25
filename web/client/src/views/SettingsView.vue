<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import request from '@/utils/request';
import { useAppStore } from '@/stores/appStore';
import { useWordStore } from '@/stores/wordStore';
import { pingAnkiConnect } from '@/services/ankiConnectService';

type AnkiStatus = 'connected' | 'disconnected' | 'testing';

const router = useRouter();
const appStore = useAppStore();
const wordStore = useWordStore();
const { connectionStatus } = storeToRefs(wordStore);

const maxItems = ref(100);
const ankiStatus = ref<AnkiStatus>('disconnected');

const backendStatusText = computed(() => {
  if (connectionStatus.value === 'connected') return '已连接';
  if (connectionStatus.value === 'testing') return '检测中...';
  return '未连接';
});

const ankiStatusText = computed(() => {
  if (ankiStatus.value === 'connected') return '已连接';
  if (ankiStatus.value === 'testing') return '检测中...';
  return '未连接';
});

const close = (): void => {
  void router.push('/');
};

const loadConfig = async (): Promise<void> => {
  try {
    const config = await request.get<{ MAX_LOCAL_ITEMS?: number }>('/config');
    maxItems.value = config?.MAX_LOCAL_ITEMS || 100;
    await wordStore.checkConnection();
  } catch (error) {
    console.error('Failed to load settings', error);
  }
};

const save = async (): Promise<void> => {
  try {
    await request.post('/config', {
      MAX_LOCAL_ITEMS: Number.parseInt(String(maxItems.value), 10),
    });
    appStore.addToast('Configuration saved', 'success');
    void router.push('/');
  } catch (error) {
    console.error('Failed to save settings', error);
    appStore.addToast('Save failed', 'error');
  }
};

const testBackendConnection = async (): Promise<void> => {
  await wordStore.checkConnection();
  if (connectionStatus.value === 'connected') {
    appStore.addToast('Backend connected', 'success');
    return;
  }
  appStore.addToast('Backend disconnected', 'error');
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

onMounted(() => {
  void loadConfig();
  void testAnkiConnection();
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
          <span class="text-slate-500">Backend Status:</span>
          <span
            :class="{
              'text-green-600 font-bold': connectionStatus === 'connected',
              'text-red-500 font-bold': connectionStatus === 'disconnected',
              'text-yellow-500 font-bold': connectionStatus === 'testing',
            }"
          >
            {{ backendStatusText }}
          </span>
          <button class="text-primary hover:underline text-xs ml-2" @click="testBackendConnection">
            Refresh
          </button>
        </div>

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

        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">
            Max Local Items (Offline Cache)
          </label>
          <input
            v-model="maxItems"
            type="number"
            class="w-full text-sm p-2 rounded border border-slate-200 focus:ring-2 focus:ring-primary outline-none"
            placeholder="100"
          />
          <p class="text-xs text-slate-400 mt-1">
            Oldest items will be removed when limit is reached.
          </p>
        </div>
      </div>

      <div class="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
        <button
          class="px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-blue-600 transition-colors shadow-sm"
          @click="save"
        >
          Save Configuration
        </button>
      </div>
    </div>
  </div>
</template>
