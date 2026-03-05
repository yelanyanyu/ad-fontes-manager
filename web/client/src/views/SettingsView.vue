<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import request from '@/utils/request';
import { useAppStore } from '@/stores/appStore';
import { useWordStore } from '@/stores/wordStore';
import { storeToRefs } from 'pinia';

const router = useRouter();
const appStore = useAppStore();
const wordStore = useWordStore();
const { connectionStatus } = storeToRefs(wordStore);
const maxItems = ref(100);

// 只显示后端连通状态
const statusText = computed(() => {
  if (connectionStatus.value === 'connected') return '已连接';
  if (connectionStatus.value === 'testing') return '检测中...';
  return '未连接';
});

const close = () => {
  void router.push('/');
};

const loadConfig = async () => {
  try {
    const config = await request.get('/config');
    if (config) {
      maxItems.value = config.MAX_LOCAL_ITEMS || 100;
    }
    // 检测后端连通性
    await wordStore.checkConnection();
  } catch (e) {
    console.error('Failed to load settings', e);
  }
};

const save = async () => {
  try {
    await request.post('/config', {
      MAX_LOCAL_ITEMS: parseInt(maxItems.value),
    });
    appStore.addToast('Configuration saved', 'success');
    void router.push('/');
  } catch (e) {
    console.error('Failed to save settings', e);
    appStore.addToast('Save failed', 'error');
  }
};

const testConnection = async () => {
  await wordStore.checkConnection();
  if (connectionStatus.value === 'connected') {
    appStore.addToast('Backend connected', 'success');
  } else {
    appStore.addToast('Backend disconnected', 'error');
  }
};

onMounted(() => {
  void loadConfig();
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
        <!-- 后端连通状态 -->
        <div class="flex items-center gap-2 text-sm p-3 bg-slate-50 rounded-lg">
          <span class="text-slate-500">Backend Status:</span>
          <span
            :class="{
              'text-green-600 font-bold': connectionStatus === 'connected',
              'text-red-500 font-bold': connectionStatus === 'disconnected',
              'text-yellow-500 font-bold': connectionStatus === 'testing',
            }"
          >
            {{ statusText }}
          </span>
          <button class="text-primary hover:underline text-xs ml-2" @click="testConnection">
            Refresh
          </button>
        </div>

        <!-- 本地存储配置 -->
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
