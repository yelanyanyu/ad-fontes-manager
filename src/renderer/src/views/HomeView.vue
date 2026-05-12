<script setup lang="ts">
import { onMounted, onUnmounted, provide, ref } from 'vue';
import WordEditor from '@/components/WordEditor/WordEditor.vue';
import WordList from '@/components/WordList/WordList.vue';
import WordPreview from '@/components/WordPreview/WordPreview.vue';
import AiGenerateDrawer from '@/components/AiGenerate/AiGenerateDrawer.vue';
import AiQueueBar from '@/components/AiGenerate/AiQueueBar.vue';
import JobResultPreview from '@/components/AiGenerate/JobResultPreview.vue';
import {
  useAiGenerate,
  AI_STATE_KEY,
  type JobState,
  type QueueHistoryJob,
} from '@/composables/useAiGenerate';

const aiState = useAiGenerate();
provide(AI_STATE_KEY, aiState);

defineOptions({
  name: 'HomeView',
});

const leftPanel = ref<HTMLElement | null>(null);
const dragHandle = ref<HTMLElement | null>(null);
const container = ref<HTMLElement | null>(null);
const wordEditorRef = ref<InstanceType<typeof WordEditor> | null>(null);
const previewId = ref<string | null>(null);
const previewJob = ref<JobState | null>(null);
const aiDrawerOpen = ref(false);
const queueExpanded = ref(false);

const showPreview = (id: string) => {
  previewId.value = id;
};

const closePreview = () => {
  previewId.value = null;
};

const closeJobPreview = () => {
  previewJob.value = null;
};

const applyGeneratedYaml = (yamlContent: string) => {
  wordEditorRef.value?.applyGeneratedYaml(yamlContent);
  aiDrawerOpen.value = false;
  queueExpanded.value = false;
  previewJob.value = null;
};

const openAiGenerate = () => {
  aiDrawerOpen.value = true;
};

const openAiJob = () => {
  aiDrawerOpen.value = true;
};

const openHistoryJob = async (job: QueueHistoryJob) => {
  const loaded = await aiState.loadHistoryJob(job.jobId);
  if (!loaded) return;
  previewJob.value = null;
  aiState.selectJob(job.jobId);
  aiDrawerOpen.value = true;
};

let handleResizeMove: ((e: MouseEvent) => void) | null = null;
let handleResizeUp: (() => void) | null = null;

onMounted(() => {
  window.addEventListener('ad-fontes:ai-generate-open', openAiGenerate);

  const handle = dragHandle.value;
  const left = leftPanel.value;
  const parent = container.value;

  if (!handle || !left || !parent) return;

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  handle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = left.getBoundingClientRect().width;
    handle.classList.add('active');
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });

  handleResizeMove = (e) => {
    if (!isResizing) return;
    const dx = e.clientX - startX;
    const newWidth = startWidth + dx;

    if (newWidth < 300) return;
    if (newWidth > parent.clientWidth - 350) return;

    left.style.width = `${newWidth}px`;
  };

  handleResizeUp = () => {
    if (isResizing) {
      isResizing = false;
      handle.classList.remove('active');
      document.body.style.cursor = '';
    }
  };

  document.addEventListener('mousemove', handleResizeMove);
  document.addEventListener('mouseup', handleResizeUp);
});

onUnmounted(() => {
  window.removeEventListener('ad-fontes:ai-generate-open', openAiGenerate);
  if (handleResizeMove) document.removeEventListener('mousemove', handleResizeMove);
  if (handleResizeUp) document.removeEventListener('mouseup', handleResizeUp);
});
</script>

<template>
  <div ref="container" class="grid-layout">
    <div
      ref="leftPanel"
      data-tour="word-editor"
      class="left-panel"
      :class="{ 'queue-expanded': queueExpanded }"
      style="width: 45%"
    >
      <div class="editor-shell">
        <WordEditor ref="wordEditorRef" />
      </div>
      <AiQueueBar
        class="queue-shell"
        @expanded-change="queueExpanded = $event"
        @job-selected="openAiJob"
        @history-job-selected="openHistoryJob"
      />
    </div>

    <div ref="dragHandle" class="resizer" />

    <div data-tour="word-list" class="right-panel" :class="{ 'ai-drawer-open': aiDrawerOpen }">
      <WordList @preview="showPreview" />
      <AiGenerateDrawer
        v-show="aiDrawerOpen"
        :open="aiDrawerOpen"
        @close="aiDrawerOpen = false"
        @yaml-ready="applyGeneratedYaml"
      />
    </div>

    <WordPreview v-if="previewId" :word-id="previewId" @close="closePreview" />
    <JobResultPreview
      v-if="previewJob"
      :job="previewJob"
      @close="closeJobPreview"
      @yaml-ready="applyGeneratedYaml"
    />
  </div>
</template>

<style scoped>
.grid-layout {
  height: calc(100vh - 88px);
  display: flex;
  flex-direction: row;
  gap: 0;
  align-items: stretch;
}

.left-panel {
  flex: none;
  min-width: 300px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.editor-shell {
  flex: 1 1 auto;
  min-height: 220px;
  display: flex;
  transition:
    flex-basis 0.22s ease,
    min-height 0.22s ease,
    opacity 0.18s ease,
    transform 0.22s ease;
}

.queue-shell {
  flex: 0 0 29px;
}

.left-panel.queue-expanded .editor-shell {
  flex: 0 0 0;
  min-height: 0;
  opacity: 0;
  transform: translateY(-8px);
  pointer-events: none;
}

.left-panel.queue-expanded .queue-shell {
  flex: 1 1 auto;
}

.right-panel {
  flex: 1;
  min-width: 350px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.resizer {
  width: 6px;
  cursor: col-resize;
  background-color: var(--border);
  border-radius: 999px;
  flex-shrink: 0;
  transition: background-color 0.2s;
  margin: 0 4px;
}

.resizer:hover,
.resizer.active {
  background-color: var(--green);
}
</style>
