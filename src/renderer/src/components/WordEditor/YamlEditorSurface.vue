<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { applyYamlEditorTab } from '@/modules/wordEditor/yamlEditorSurface';

interface LineDepthInfo {
  depth: number;
}

const props = defineProps<{
  modelValue: string;
  lineDepths: LineDepthInfo[];
  cursorLine: number;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'cursor-change': [position: number];
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const lineNumberRef = ref<HTMLElement | null>(null);
const lineMeasureRef = ref<HTMLElement | null>(null);
const lineHeights = ref<number[]>([]);
let lineMeasureFrame: number | null = null;
let editorResizeObserver: ResizeObserver | null = null;

const syncScroll = (): void => {
  if (textareaRef.value && lineNumberRef.value) {
    lineNumberRef.value.scrollTop = textareaRef.value.scrollTop;
  }
};

function getDefaultLineHeight(): number {
  const textarea = textareaRef.value;
  if (!textarea) return 22;
  const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight);
  return Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 22;
}

function measureLineHeights(): void {
  const textarea = textareaRef.value;
  const measure = lineMeasureRef.value;
  if (!textarea || !measure) return;

  measure.style.width = `${textarea.clientWidth}px`;
  measure.textContent = '';

  const defaultHeight = getDefaultLineHeight();
  const nextHeights = props.modelValue.split('\n').map(line => {
    const row = document.createElement('div');
    row.className = 'line-measure-row';
    row.textContent = line.length > 0 ? line : ' ';
    measure.appendChild(row);
    return Math.max(defaultHeight, row.getBoundingClientRect().height);
  });

  lineHeights.value = nextHeights.length > 0 ? nextHeights : [defaultHeight];
  measure.textContent = '';
  syncScroll();
}

function scheduleLineMeasure(): void {
  if (lineMeasureFrame !== null) window.cancelAnimationFrame(lineMeasureFrame);
  lineMeasureFrame = window.requestAnimationFrame(() => {
    lineMeasureFrame = null;
    measureLineHeights();
  });
}

function updateCursorPos(): void {
  emit('cursor-change', textareaRef.value?.selectionStart ?? 0);
}

function handleInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value);
}

function handleKeydown(event: KeyboardEvent): void {
  if (props.readonly) return;
  if (event.key !== 'Tab') return;
  event.preventDefault();

  const textarea = textareaRef.value;
  if (!textarea) return;

  const result = applyYamlEditorTab({
    value: props.modelValue,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd,
    shiftKey: event.shiftKey,
  });

  emit('update:modelValue', result.value);
  void nextTick(() => {
    textarea.selectionStart = result.selectionStart;
    textarea.selectionEnd = result.selectionEnd;
    updateCursorPos();
  });
}

watch(
  () => props.modelValue,
  () => void nextTick(scheduleLineMeasure),
  { flush: 'post' }
);

onMounted(() => {
  scheduleLineMeasure();
  if (textareaRef.value) {
    editorResizeObserver = new ResizeObserver(() => scheduleLineMeasure());
    editorResizeObserver.observe(textareaRef.value);
  }
});

onUnmounted(() => {
  if (lineMeasureFrame !== null) window.cancelAnimationFrame(lineMeasureFrame);
  editorResizeObserver?.disconnect();
});

defineExpose({
  focus: () => textareaRef.value?.focus(),
  scheduleLineMeasure,
});
</script>

<template>
  <div class="editor-area">
    <div ref="lineNumberRef" class="line-number">
      <div
        v-for="(info, idx) in lineDepths"
        :key="idx"
        class="ln-row"
        :class="{ 'ln-row-active': idx === cursorLine }"
        :style="{ height: `${lineHeights[idx] || getDefaultLineHeight()}px` }"
      >
        <span class="ln-num">{{ idx + 1 }}</span>
        <span v-if="info.depth > 0" class="ln-dots">
          <span
            v-for="d in Math.min(info.depth, 8)"
            :key="d"
            class="ln-dot"
            :style="{ opacity: 0.2 + (d / 8) * 0.5 }"
          />
        </span>
      </div>
    </div>
    <div class="editor-input">
      <textarea
        ref="textareaRef"
        :value="modelValue"
        :readonly="readonly"
        spellcheck="false"
        placeholder="每行输入 YAML 内容，例如：lemma: apple..."
        @input="handleInput"
        @scroll="syncScroll"
        @click="updateCursorPos"
        @keyup="updateCursorPos"
        @keydown="handleKeydown"
      />
      <div ref="lineMeasureRef" class="line-measure" aria-hidden="true" />
    </div>
  </div>
</template>

<style scoped>
.editor-area {
  min-height: 0;
  background: var(--editor-field);
  display: grid;
  grid-template-columns: 46px 1fr;
  border-bottom: 1px solid var(--line);
  font-family: var(--mono);
  font-size: 13px;
  line-height: 1.72;
  color: #3b3732;
}

[data-theme="dark"] .editor-area {
  color: #d8d0c5;
}

.line-number {
  padding-top: 18px;
  padding-bottom: 18px;
  color: #b5ada2;
  border-right: 1px solid var(--line);
  user-select: none;
  overflow: hidden;
  line-height: 1.72;
  font-size: 13px;
  box-sizing: border-box;
}

[data-theme="dark"] .line-number {
  color: #706961;
  background: #1b1814;
}

.ln-row {
  display: flex;
  align-items: flex-start;
  height: calc(1em * 1.72);
  padding: 0 4px;
}

.ln-row-active {
  background: rgba(36, 114, 83, 0.06);
}

[data-theme="dark"] .ln-row-active {
  background: rgba(67, 179, 127, 0.08);
}

.ln-num {
  width: 22px;
  text-align: right;
  color: var(--faint);
  flex-shrink: 0;
  font-size: 12px;
}

.ln-dots {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 4px;
  min-width: 10px;
  flex-shrink: 0;
}

.ln-dot {
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: var(--faint);
  flex-shrink: 0;
}

.editor-input {
  position: relative;
  min-height: 0;
  overflow: hidden;
}

.editor-input textarea {
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 0;
  outline: 0;
  resize: none;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: inherit;
  box-sizing: border-box;
  padding: 18px 16px;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.line-measure {
  position: absolute;
  inset: 0 auto auto 0;
  box-sizing: border-box;
  padding: 18px 16px;
  visibility: hidden;
  pointer-events: none;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  font: inherit;
  line-height: inherit;
  color: transparent;
  z-index: -1;
}

:deep(.line-measure-row) {
  min-height: calc(1em * 1.72);
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.editor-input textarea::placeholder {
  color: #9a9389;
}

[data-theme="dark"] .editor-input textarea::placeholder {
  color: #80786f;
}
</style>
