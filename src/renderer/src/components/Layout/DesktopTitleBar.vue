<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useAppStore } from '@/stores/appStore';
import { renderReleaseNotesHtml } from '@/utils/releaseNotes';

const appStore = useAppStore();
const isElectron = computed(() => Boolean(window.electronAPI));
const updateSnapshot = ref<UpdateSnapshot>({ status: 'idle', info: null });
const updateInstallBlocked = ref<{ activeCount: number } | null>(null);
const showUpdateDialog = ref(false);
const maximized = ref(false);
let unsubscribeUpdateEvent: (() => void) | null = null;
let unsubscribeMaximized: (() => void) | null = null;

const currentUpdateVersion = computed(() => updateSnapshot.value.info?.version || '');
const hasUpdateEntry = computed(() =>
  ['available', 'downloading', 'downloaded'].includes(updateSnapshot.value.status)
);
const canInstallUpdate = computed(() => updateSnapshot.value.status === 'downloaded');
const canSkipUpdate = computed(() =>
  ['available', 'downloading', 'downloaded'].includes(updateSnapshot.value.status)
);
const renderedReleaseNotesHtml = computed(() => renderReleaseNotesHtml(updateSnapshot.value.info));
const entryLabel = computed(() => {
  if (updateSnapshot.value.status === 'downloaded') return `新版本 ${currentUpdateVersion.value} 已就绪`;
  if (updateSnapshot.value.status === 'downloading') return `正在下载 ${currentUpdateVersion.value}`;
  return '有可用更新';
});
const dialogSubtitle = computed(() => {
  if (updateSnapshot.value.status === 'downloaded') return '更新已下载，安装后会重启应用。';
  if (updateSnapshot.value.status === 'downloading') return '正在下载更新，下载完成后即可安装。';
  return '更新细则如下。';
});

const applyUpdateSnapshot = (snapshot: UpdateSnapshot): void => {
  updateSnapshot.value = snapshot;
  if (snapshot.status !== 'error') {
    updateInstallBlocked.value = null;
  }
};

const skipCurrentUpdate = async (): Promise<void> => {
  if (!window.electronAPI || !currentUpdateVersion.value) return;
  await window.electronAPI.skipReleaseVersion(currentUpdateVersion.value);
  updateSnapshot.value = { ...updateSnapshot.value, status: 'skipped' };
  showUpdateDialog.value = false;
  appStore.addToast(`已跳过 ${currentUpdateVersion.value}`, 'info');
};

const installCurrentUpdate = async (force = false): Promise<void> => {
  if (!window.electronAPI || !canInstallUpdate.value) return;
  const result = await window.electronAPI.installUpdate({ force });
  if (result.ok) {
    showUpdateDialog.value = false;
    return;
  }

  updateInstallBlocked.value = { activeCount: result.activeCount };
  showUpdateDialog.value = true;
  appStore.addToast('队列仍有任务运行，安装更新前请确认', 'warning');
};

const minimize = (): void => {
  void window.electronAPI?.minimizeWindow();
};

const toggleMaximize = async (): Promise<void> => {
  if (!window.electronAPI) return;
  maximized.value = await window.electronAPI.toggleMaximizeWindow();
};

const closeWindow = (): void => {
  void window.electronAPI?.closeWindow();
};

onMounted(async () => {
  if (!window.electronAPI) return;
  unsubscribeUpdateEvent = window.electronAPI.onUpdateEvent(applyUpdateSnapshot);
  unsubscribeMaximized = window.electronAPI.onWindowMaximized(value => {
    maximized.value = value;
  });
  maximized.value = await window.electronAPI.isWindowMaximized();
});

onUnmounted(() => {
  unsubscribeUpdateEvent?.();
  unsubscribeUpdateEvent = null;
  unsubscribeMaximized?.();
  unsubscribeMaximized = null;
});
</script>

<template>
  <div v-if="isElectron" class="desktop-titlebar">
    <div class="titlebar-drag-region">
      <div class="titlebar-brand">
        <img src="/logo.png" alt="" class="titlebar-logo" />
        <span>Etymos</span>
      </div>
    </div>

    <div class="titlebar-actions">
      <button
        v-if="hasUpdateEntry"
        type="button"
        class="update-entry"
        :class="'status-' + updateSnapshot.status"
        @click="showUpdateDialog = true"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 12a9 9 0 0 1-15.4 6.36" />
          <path d="M3 12a9 9 0 0 1 15.4-6.36" />
          <path d="M6 18H3v3" />
          <path d="M18 6h3V3" />
        </svg>
        <span>{{ entryLabel }}</span>
      </button>

      <button class="window-control" type="button" title="最小化" @click="minimize">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" /></svg>
      </button>
      <button
        class="window-control"
        type="button"
        :title="maximized ? '还原' : '最大化'"
        @click="toggleMaximize"
      >
        <svg v-if="!maximized" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="7" y="7" width="10" height="10" rx="1" />
        </svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 9h8v8H9z" />
          <path d="M7 15H5V5h10v2" />
        </svg>
      </button>
      <button class="window-control close" type="button" title="关闭" @click="closeWindow">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 7l10 10M17 7 7 17" />
        </svg>
      </button>
    </div>

    <Teleport to="body">
      <div v-if="showUpdateDialog" class="update-overlay" @click.self="showUpdateDialog = false">
        <div class="update-card">
          <div class="update-card-header">
            <h3>{{ currentUpdateVersion ? `发现新版本 ${currentUpdateVersion}` : '发现新版本' }}</h3>
            <p>{{ dialogSubtitle }}</p>
          </div>

          <div class="update-meta" v-if="updateSnapshot.info">
            <span>版本 {{ updateSnapshot.info.version }}</span>
            <span v-if="updateSnapshot.info.releaseName">{{ updateSnapshot.info.releaseName }}</span>
          </div>

          <div class="update-body">
            <!-- eslint-disable-next-line vue/no-v-html -- sanitized allowlisted release notes -->
            <div class="update-release-notes" v-html="renderedReleaseNotesHtml"></div>
          </div>

          <div v-if="updateInstallBlocked" class="update-warning">
            <span>队列中还有 {{ updateInstallBlocked.activeCount }} 个任务，安装会重启应用。</span>
            <button class="btn danger compact" type="button" @click="installCurrentUpdate(true)">
              仍然安装
            </button>
          </div>

          <div class="update-actions">
            <button class="btn" type="button" @click="showUpdateDialog = false">稍后</button>
            <button v-if="canSkipUpdate" class="btn" type="button" @click="skipCurrentUpdate">
              跳过此版本
            </button>
            <button
              v-if="canInstallUpdate"
              class="btn primary"
              type="button"
              @click="installCurrentUpdate(false)"
            >
              安装更新
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.desktop-titlebar {
  height: 38px;
  display: flex;
  align-items: center;
  background: rgba(255, 255, 252, 0.82);
  border-bottom: 1px solid var(--border);
  -webkit-app-region: drag;
  user-select: none;
}

[data-theme='dark'] .desktop-titlebar {
  background: rgba(24, 22, 20, 0.86);
}

.titlebar-drag-region {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: center;
  padding-left: 12px;
}

.titlebar-brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
}

.titlebar-logo {
  width: 18px;
  height: 18px;
  border-radius: 5px;
}

.titlebar-actions {
  height: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 6px;
  -webkit-app-region: no-drag;
}

.update-entry {
  height: 24px;
  border: 1px solid var(--green-border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--green);
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.update-entry:hover {
  background: var(--green-soft);
}

.update-entry.status-downloading {
  color: var(--muted);
  border-color: var(--line);
}

.update-entry svg {
  width: 13px;
  height: 13px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.window-control {
  width: 42px;
  height: 38px;
  border: 0;
  background: transparent;
  color: var(--muted);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.window-control:hover {
  background: var(--surface-soft);
  color: var(--text);
}

.window-control.close:hover {
  background: #d93025;
  color: #fff;
}

.window-control svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.update-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  -webkit-app-region: no-drag;
}

.update-card {
  width: min(720px, calc(100vw - 32px));
  max-height: calc(100vh - 72px);
  display: flex;
  flex-direction: column;
  padding: 24px;
  border-radius: var(--radius-xl);
  background: var(--surface);
  box-shadow: var(--shadow-md), 0 8px 32px rgba(0, 0, 0, 0.18);
}

.update-card-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.update-card-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text);
}

.update-card-header p {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}

.update-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.update-meta span {
  padding: 3px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  background: var(--surface-soft);
  font-size: 11px;
}

.update-body {
  max-height: 450px;
  overflow-y: auto;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
}

.update-release-notes {
  color: var(--text);
  font-size: 13px;
  line-height: 1.65;
}

.update-release-notes :deep(h1),
.update-release-notes :deep(h2),
.update-release-notes :deep(h3),
.update-release-notes :deep(h4),
.update-release-notes :deep(h5),
.update-release-notes :deep(h6) {
  margin: 16px 0 8px;
  color: var(--text);
  font-weight: 700;
  line-height: 1.35;
}

.update-release-notes :deep(h1:first-child),
.update-release-notes :deep(h2:first-child),
.update-release-notes :deep(h3:first-child) {
  margin-top: 0;
}

.update-release-notes :deep(h1) {
  font-size: 18px;
}

.update-release-notes :deep(h2) {
  font-size: 15px;
}

.update-release-notes :deep(p) {
  margin: 0 0 10px;
  color: var(--text-soft);
}

.update-release-notes :deep(ul),
.update-release-notes :deep(ol) {
  margin: 8px 0;
  padding-left: 22px;
  color: var(--text-soft);
}

.update-release-notes :deep(li) {
  margin: 4px 0;
}

.update-release-notes :deep(code) {
  padding: 2px 5px;
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text);
  font-family: var(--mono);
  font-size: 12px;
}

.update-release-notes :deep(pre) {
  padding: 10px;
  overflow-x: auto;
  border-radius: var(--radius-md);
  background: var(--surface);
}

.update-warning {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 12px;
  padding: 8px 10px;
  border: 1px solid var(--red-border);
  border-radius: var(--radius-md);
  background: var(--red-soft);
  color: var(--red);
  font-size: 12px;
}

.update-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.btn {
  height: 30px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-strong);
  padding: 0 14px;
  background: var(--surface);
  color: var(--text-soft);
  font-size: 12px;
  font-weight: 560;
  cursor: pointer;
}

.btn:hover {
  background: var(--surface-soft);
}

.btn.primary {
  border-color: transparent;
  background: var(--green);
  color: #fff;
}

.btn.primary:hover {
  background: var(--green-hover);
}

.btn.danger {
  color: var(--red);
  border-color: var(--red-border);
}

.btn.danger:hover {
  background: var(--red-soft);
}

.btn.compact {
  height: 26px;
  padding: 0 10px;
  font-size: 11px;
}
</style>
