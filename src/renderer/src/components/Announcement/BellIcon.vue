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
      class="relative flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-100 bg-stone-50 text-stone-500 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
      aria-label="查看公告"
      @click.stop="toggle"
    >
      <i class="fa-regular fa-bell text-base" />
      <span
        v-if="announcementStore.hasUnread"
        class="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white"
        aria-hidden="true"
      />
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
        :loading="announcementStore.loading"
        :error="announcementStore.error"
      />
    </Transition>
  </div>
</template>
