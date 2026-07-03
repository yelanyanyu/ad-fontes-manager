<script setup lang="ts">
import { ref, watch } from 'vue';
import type { StepState } from '@/composables/useAiGenerate';

const props = defineProps<{
  open: boolean;
  step: StepState | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const thinkingOpen = ref(false);
const toolsOpen = ref(false);
const rawOpen = ref(true);
const rawCopied = ref(false);
let rawCopiedTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.step?.step,
  () => {
    thinkingOpen.value = false;
    toolsOpen.value = false;
    rawOpen.value = true;
    rawCopied.value = false;
    if (rawCopiedTimer) clearTimeout(rawCopiedTimer);
  }
);

function rawStageText(): string {
  return String(props.step?.rawText || props.step?.tokens || '').trim();
}

async function copyRawText(): Promise<void> {
  const text = rawStageText();
  if (!text) return;
  await navigator.clipboard?.writeText(text);
  rawCopied.value = true;
  if (rawCopiedTimer) clearTimeout(rawCopiedTimer);
  rawCopiedTimer = setTimeout(() => {
    rawCopied.value = false;
    rawCopiedTimer = null;
  }, 1200);
}
</script>

<template>
  <aside v-show="open" class="stage-panel" aria-label="AI stage output">
    <header class="stage-panel-head">
      <div>
        <span>Stage Output</span>
        <strong>{{ step?.step || 'No stage selected' }}</strong>
      </div>
      <button type="button" class="icon-button" aria-label="Close stage output" @click="emit('close')">
        ×
      </button>
    </header>

    <div class="stage-panel-body">
      <section v-if="step?.toolCalls?.length" class="collapsible-section">
        <button class="toggle-head" type="button" @click.stop="toolsOpen = !toolsOpen">
          <span class="toggle-arrow">{{ toolsOpen ? '&#9660;' : '&#9654;' }}</span>
          <h3>Tools</h3>
        </button>
        <div v-show="toolsOpen" class="collapsible-body">
          <div v-for="toolCall in step.toolCalls" :key="toolCall.toolCallId" class="tool-record">
            <div class="tool-record-head">
              <strong>{{ toolCall.toolName }}</strong>
              <span :class="`tool-${toolCall.status}`">{{ toolCall.status }}</span>
            </div>
            <pre v-if="toolCall.input">{{ JSON.stringify(toolCall.input, null, 2) }}</pre>
            <pre v-if="toolCall.output">{{ JSON.stringify(toolCall.output, null, 2) }}</pre>
            <p v-if="toolCall.warning" class="warning-text">{{ toolCall.warning }}</p>
            <p v-if="toolCall.error" class="error-text">{{ toolCall.error }}</p>
          </div>
        </div>
      </section>

      <section v-if="step?.reasoningText" class="collapsible-section">
        <button class="toggle-head" type="button" @click.stop="thinkingOpen = !thinkingOpen">
          <span class="toggle-arrow">{{ thinkingOpen ? '&#9660;' : '&#9654;' }}</span>
          <h3>Thinking</h3>
        </button>
        <div v-show="thinkingOpen" class="collapsible-body">
          <pre>{{ step.reasoningText }}</pre>
        </div>
      </section>

      <section class="collapsible-section">
        <div class="raw-head">
          <button class="toggle-head" type="button" @click.stop="rawOpen = !rawOpen">
            <span class="toggle-arrow">{{ rawOpen ? '&#9660;' : '&#9654;' }}</span>
            <h3>Raw Text</h3>
          </button>
          <button
            v-if="rawStageText()"
            type="button"
            class="raw-copy-button"
            :class="{ copied: rawCopied }"
            aria-label="Copy raw stage text"
            @click="copyRawText"
          >
            <svg
              v-if="!rawCopied"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <span class="raw-copy-tip" role="tooltip">
              {{ rawCopied ? '已复制' : '复制当前 Stage 的 Raw Text' }}
            </span>
          </button>
        </div>
        <div v-show="rawOpen" class="collapsible-body">
          <pre>{{ step?.rawText || step?.tokens || 'No output yet.' }}</pre>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.stage-panel {
  position: absolute;
  inset: 0;
  background: var(--surface-panel);
  z-index: 25;
  display: flex;
  flex-direction: column;
}

.stage-panel-head {
  height: 58px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.stage-panel-head span {
  display: block;
  color: var(--muted);
  font-size: 11px;
}

.stage-panel-head strong {
  color: var(--text);
  font-size: 14px;
  text-transform: capitalize;
}

.icon-button {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
}

.stage-panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: grid;
  align-content: start;
  gap: 14px;
}

.collapsible-section {
  display: grid;
  gap: 8px;
}

.raw-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.toggle-head {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: none;
  padding: 2px 0;
  cursor: pointer;
  color: var(--muted);
  user-select: none;
}

.toggle-head:hover {
  color: var(--text);
}

.toggle-arrow {
  font-size: 9px;
  line-height: 1;
  width: 10px;
  text-align: center;
  flex-shrink: 0;
}

.raw-copy-button {
  position: relative;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.raw-copy-button:hover {
  border-color: var(--border);
  background: var(--surface);
  color: var(--text-soft);
}

.raw-copy-button.copied {
  border-color: transparent;
  background: rgba(148, 163, 184, 0.16);
  color: var(--muted);
}

.raw-copy-tip {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  width: max-content;
  max-width: 220px;
  padding: 7px 9px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-panel);
  color: var(--text-soft);
  box-shadow: var(--shadow-sm);
  font-size: 11px;
  line-height: 1.4;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-2px);
  transition:
    opacity 120ms ease,
    transform 120ms ease;
}

.raw-copy-button:hover .raw-copy-tip,
.raw-copy-button:focus-visible .raw-copy-tip {
  opacity: 1;
  transform: translateY(0);
}

.collapsible-body {
  display: grid;
  gap: 8px;
}

h3 {
  margin: 0;
  color: inherit;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.tool-record {
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  padding: 8px;
  background: var(--surface);
  display: grid;
  gap: 6px;
}

.tool-record-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}

.tool-complete {
  color: var(--green);
}

.tool-error {
  color: var(--red);
}

.tool-running,
.warning-text {
  color: var(--amber);
}

.error-text {
  color: var(--red);
}

pre {
  margin: 0;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--editor-field);
  color: var(--text);
  font: 11px/1.6 var(--mono);
  white-space: pre-wrap;
  word-break: break-word;
}

p {
  margin: 0;
  font-size: 12px;
}

</style>
