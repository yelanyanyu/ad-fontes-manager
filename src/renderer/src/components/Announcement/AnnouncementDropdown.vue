<script setup lang="ts">
import { computed, ref } from 'vue';
import AnnouncementMarkdown from './AnnouncementMarkdown.vue';
import type { Announcement } from '@/stores/announcementStore';

const props = defineProps<{
  announcements: Announcement[];
  loading: boolean;
  error: string;
}>();

const expandedVersion = ref<number | null>(props.announcements[0]?.version ?? null);

const sortedAnnouncements = computed(() =>
  [...props.announcements].sort((a, b) => b.version - a.version)
);
</script>

<template>
  <div
    class="absolute right-0 top-full mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-lg border border-emerald-100 bg-white shadow-xl z-50 overflow-hidden"
  >
    <div class="px-4 py-3 border-b border-emerald-50">
      <h2 class="text-sm font-semibold text-slate-800">更新公告</h2>
    </div>

    <div v-if="loading" class="px-4 py-8 text-center text-sm text-slate-500">正在加载...</div>

    <div v-else-if="!announcements.length" class="px-4 py-8 text-center text-sm text-slate-500">
      暂无公告
    </div>

    <div v-else class="max-h-[28rem] overflow-y-auto">
      <article
        v-for="announcement in sortedAnnouncements"
        :key="announcement.version"
        class="border-b border-emerald-50 last:border-b-0"
      >
        <button
          type="button"
          class="w-full px-4 py-3 text-left hover:bg-emerald-50 transition-colors"
          @click="
            expandedVersion =
              expandedVersion === announcement.version ? null : announcement.version
          "
        >
          <span class="flex items-start justify-between gap-3">
            <span class="min-w-0">
              <span class="block text-sm font-semibold text-slate-800 truncate">
                {{ announcement.title }}
              </span>
              <span class="mt-0.5 block text-xs text-slate-500">{{ announcement.date }}</span>
            </span>
            <svg class="chevron-icon" :class="{ 'rotate-180': expandedVersion === announcement.version }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 9 6 6 6-6" /></svg>
          </span>
        </button>

        <div v-if="expandedVersion === announcement.version" class="px-4 pb-4">
          <AnnouncementMarkdown :body-md="announcement.body_md" />
        </div>
      </article>
    </div>

    <div v-if="error" class="px-4 py-2 bg-amber-50 text-xs text-amber-700 border-t border-amber-100">
      {{ error }}
    </div>
  </div>
</template>
