<script setup lang="ts">
import { computed, ref } from 'vue';
import CodeMirrorYamlEditor from '@/components/WordEditor/CodeMirrorYamlEditor.vue';

const yamlDraft = ref(`yield:
  lemma: etymos
  language: en
  pronunciation: /ˈetɪmɒs/
  definition: A test entry for the CodeMirror YAML editor.
`);

const lineCount = computed(() => yamlDraft.value.split('\n').length);
const characterCount = computed(() => yamlDraft.value.length);
</script>

<template>
  <div class="test-workspace">
    <section class="test-panel" aria-label="CodeMirror YAML test bench">
      <header class="test-panel__head">
        <div class="test-panel__title">
          <strong>CodeMirror YAML</strong>
          <span>test route</span>
        </div>
      </header>

      <div class="test-panel__body">
        <div class="editor-column">
          <CodeMirrorYamlEditor v-model="yamlDraft" />
        </div>

        <aside class="state-column" aria-label="Editor state">
          <dl>
            <div>
              <dt>Lines</dt>
              <dd>{{ lineCount }}</dd>
            </div>
            <div>
              <dt>Characters</dt>
              <dd>{{ characterCount }}</dd>
            </div>
          </dl>
          <pre>{{ yamlDraft }}</pre>
        </aside>
      </div>
    </section>
  </div>
</template>

<style scoped>
.test-workspace {
  min-height: 0;
  height: 100%;
  padding: 8px 0;
}

.test-panel {
  height: 100%;
  max-width: 1180px;
  margin: 0 auto;
  display: grid;
  grid-template-rows: 48px 1fr;
  overflow: hidden;
  background: var(--surface-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
}

.test-panel__head {
  padding: 0 14px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--line);
  background: linear-gradient(180deg, #fffefa, #fbf8f2);
}

[data-theme="dark"] .test-panel__head {
  background: linear-gradient(180deg, #2a261f, #221f1a);
}

.test-panel__title {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.test-panel__title strong {
  font-size: 14px;
  font-weight: 740;
  letter-spacing: 0.055em;
  color: #2f2b26;
  text-transform: uppercase;
}

[data-theme="dark"] .test-panel__title strong {
  color: #eee8de;
}

.test-panel__title span {
  color: var(--muted);
  font-size: 13px;
  font-weight: 500;
}

.test-panel__body {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 14px;
  padding: 14px;
}

.editor-column {
  min-height: 0;
}

.state-column {
  min-width: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 12px;
}

.state-column dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.state-column dl div {
  padding: 10px;
  border: 1px solid var(--line);
  background: var(--surface-muted);
}

.state-column dt {
  margin-bottom: 4px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.state-column dd {
  margin: 0;
  color: var(--text);
  font-size: 18px;
  font-weight: 740;
}

.state-column pre {
  min-height: 0;
  margin: 0;
  padding: 12px;
  overflow: auto;
  border: 1px solid var(--line);
  background: var(--editor-field);
  color: var(--text);
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
}

@media (max-width: 900px) {
  .test-panel__body {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(360px, 1fr) auto;
  }
}
</style>
