<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import AnnouncementDropdown from './AnnouncementDropdown.vue';
import { useAnnouncementStore } from '@/stores/announcementStore';

const announcementStore = useAnnouncementStore();
const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);

function toggle(): void {
  open.value = !open.value;
  if (open.value) {
    announcementStore.markLatestAsRead();
  }
}

function onDocumentClick(event: MouseEvent): void {
  if (rootRef.value && !rootRef.value.contains(event.target as Node)) {
    open.value = false;
  }
}

onMounted(() => {
  void announcementStore.fetchAnnouncements();
  document.addEventListener('click', onDocumentClick);
});

onUnmounted(() => document.removeEventListener('click', onDocumentClick));
</script>

<template>
  <div ref="rootRef" class="relative" data-tour="announcement-bell">
    <button
      type="button"
      class="icon-btn"
      aria-label="查看公告"
      title="Notifications"
      @click.stop="toggle"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
      <span v-if="announcementStore.hasUnread" class="unread-dot" aria-hidden="true" />
    </button>

    <Transition
      enter-active-class="transition ease-out duration-150"
      enter-from-class="opacity-0 translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition ease-in duration-100"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-1"
    >
      <AnnouncementDropdown
        v-if="open"
        :announcements="announcementStore.announcements"
        :source-notice="announcementStore.sourceNotice"
        :loading="announcementStore.loading"
        :error="announcementStore.error"
      />
    </Transition>
  </div>
</template>

<style scoped>
.icon-btn {
  width: 30px;
  height: 30px;
  position: relative;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface);
  color: #5e5851;
  display: grid;
  place-items: center;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition:
    background 0.14s ease,
    border-color 0.14s ease,
    color 0.14s ease;
}

.icon-btn:hover {
  background: #fff;
  border-color: var(--border-strong);
}

[data-theme='dark'] .icon-btn {
  background: rgba(255, 255, 255, 0.05);
  color: #c7beb3;
}

[data-theme='dark'] .icon-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}

.unread-dot {
  position: absolute;
  right: 4px;
  top: 4px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ef4444;
  border: 2px solid var(--surface);
}
</style>
