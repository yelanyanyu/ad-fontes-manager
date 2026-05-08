<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import WordEditor from '@/components/WordEditor/WordEditor.vue';
import WordList from '@/components/WordList/WordList.vue';
import WordPreview from '@/components/WordPreview/WordPreview.vue';
import AiGenerateDrawer from '@/components/AiGenerate/AiGenerateDrawer.vue';

defineOptions({
  name: 'HomeView',
});

const leftPanel = ref<HTMLElement | null>(null);
const dragHandle = ref<HTMLElement | null>(null);
const container = ref<HTMLElement | null>(null);
const wordEditorRef = ref<InstanceType<typeof WordEditor> | null>(null);
const previewId = ref<string | null>(null);
const aiDrawerOpen = ref(false);

const showPreview = (id: string) => {
  previewId.value = id;
};

const closePreview = () => {
  previewId.value = null;
};

const applyGeneratedYaml = (yamlContent: string) => {
  wordEditorRef.value?.applyGeneratedYaml(yamlContent);
  aiDrawerOpen.value = false;
};

let handleResizeMove: ((e: MouseEvent) => void) | null = null;
let handleResizeUp: (() => void) | null = null;

onMounted(() => {
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
      style="width: 45%"
    >
      <WordEditor ref="wordEditorRef" @ai-generate-open="aiDrawerOpen = true" />
    </div>

    <div ref="dragHandle" class="resizer" />

    <div data-tour="word-list" class="right-panel">
      <WordList @preview="showPreview" />
    </div>

    <WordPreview v-if="previewId" :word-id="previewId" @close="closePreview" />
    <AiGenerateDrawer
      v-show="aiDrawerOpen"
      :open="aiDrawerOpen"
      @close="aiDrawerOpen = false"
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
}

.right-panel {
  flex: 1;
  min-width: 350px;
  display: flex;
  flex-direction: column;
  min-height: 0;
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
