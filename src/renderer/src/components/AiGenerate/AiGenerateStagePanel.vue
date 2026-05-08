<script setup lang="ts">
import type { StepState } from '@/composables/useAiGenerate';

defineProps<{
  open: boolean;
  step: StepState | null;
}>();

const emit = defineEmits<{
  close: [];
}>();
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
      <section v-if="step?.toolCalls?.length" class="tool-section">
        <h3>Tools</h3>
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
      </section>

      <section v-if="step?.reasoningText" class="reasoning-section">
        <h3>Thinking</h3>
        <pre>{{ step.reasoningText }}</pre>
      </section>

      <section class="raw-section">
        <h3>Raw Text</h3>
        <pre>{{ step?.rawText || step?.tokens || 'No output yet.' }}</pre>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.stage-panel {
  position: absolute;
  top: 0;
  right: 100%;
  width: min(420px, 42vw);
  height: 100%;
  border-left: 1px solid var(--line);
  border-right: 1px solid var(--line);
  background: var(--surface-panel);
  box-shadow: var(--shadow-md);
  z-index: 22;
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

.tool-section,
.raw-section {
  display: grid;
  gap: 8px;
}

h3 {
  margin: 0;
  color: var(--muted);
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

@media (max-width: 920px) {
  .stage-panel {
    right: 0;
    width: 100%;
    z-index: 24;
  }
}
</style>
