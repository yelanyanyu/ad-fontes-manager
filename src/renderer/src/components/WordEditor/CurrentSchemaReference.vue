<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useAppStore, SUPPORTED_LANGUAGES } from '@/stores/appStore';
import type { LanguageCode } from '@/stores/appStore';
import {
  fetchWordSchemaReference,
  type WordSchemaReferenceResponse,
} from '@/services/wordSchemaReferenceApi';

const emit = defineEmits<{
  close: [];
}>();

const appStore = useAppStore();
const { currentLanguage } = storeToRefs(appStore);

const selectedLanguage = ref<LanguageCode>(currentLanguage.value);
const followsAppLanguage = ref(true);
const loading = ref(false);
const errorMessage = ref('');
const reference = ref<WordSchemaReferenceResponse | null>(null);

let requestToken = 0;

const schemaYaml = computed(() => reference.value?.yaml || '');
const schemaLines = computed(() =>
  schemaYaml.value.split('\n').map((line, index) => ({
    key: `${index}-${line}`,
    line,
    section: line.match(/^([a-zA-Z_][\w-]*):\s*$/)?.[1] || '',
  }))
);
const sections = computed(() => {
  const seen = new Set<string>();
  return schemaLines.value
    .map(line => line.section)
    .filter((section): section is string => {
      if (!section || seen.has(section)) return false;
      seen.add(section);
      return true;
    });
});

async function loadReference(language: LanguageCode): Promise<void> {
  const token = ++requestToken;
  loading.value = true;
  errorMessage.value = '';
  try {
    const response = await fetchWordSchemaReference(language);
    if (token === requestToken) reference.value = response;
  } catch (error) {
    if (token !== requestToken) return;
    reference.value = null;
    errorMessage.value =
      error instanceof Error ? error.message : 'Failed to load schema reference.';
  } finally {
    if (token === requestToken) loading.value = false;
  }
}

function setLanguage(language: LanguageCode): void {
  selectedLanguage.value = language;
  followsAppLanguage.value = false;
}

function scrollToSection(section: string): void {
  const element = document.getElementById(`schema-reference-section-${section}`);
  element?.scrollIntoView({ block: 'start' });
}

watch(
  currentLanguage,
  language => {
    if (followsAppLanguage.value) selectedLanguage.value = language;
  }
);

watch(
  selectedLanguage,
  language => {
    void loadReference(language);
  },
  { immediate: true }
);
</script>

<template>
  <aside class="schema-reference" aria-label="Current schema reference">
    <div class="schema-reference__head">
      <div class="schema-reference__title">
        <strong>Current Schema</strong>
      </div>
      <button
        class="ui-icon-button schema-reference__close"
        type="button"
        title="Close schema reference"
        aria-label="Close schema reference"
        @click="emit('close')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </div>

    <div class="schema-reference__toolbar">
      <div class="schema-reference__language" role="group" aria-label="Schema language">
        <button
          v-for="language in SUPPORTED_LANGUAGES"
          :key="language.code"
          type="button"
          :class="{ 'is-active': selectedLanguage === language.code }"
          @click="setLanguage(language.code)"
        >
          {{ language.label }}
        </button>
      </div>
    </div>

    <div v-if="sections.length > 0" class="schema-reference__nav" aria-label="Schema sections">
      <button
        v-for="section in sections"
        :key="section"
        type="button"
        @click="scrollToSection(section)"
      >
        {{ section }}
      </button>
    </div>

    <div class="schema-reference__content">
      <div v-if="loading" class="schema-reference__state">Loading...</div>
      <div v-else-if="errorMessage" class="schema-reference__state schema-reference__state--error">
        {{ errorMessage }}
      </div>
      <pre v-else><code><template
        v-for="item in schemaLines"
        :key="item.key"
      ><span
        v-if="item.section"
        :id="`schema-reference-section-${item.section}`"
        class="schema-reference__section-line"
      >{{ item.line }}</span><span v-else>{{ item.line }}</span>
</template></code></pre>
    </div>
  </aside>
</template>

<style scoped>
.schema-reference {
  position: absolute;
  inset: 0;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-md);
  color: var(--ink);
}

.schema-reference__head {
  min-height: 42px;
  padding: 8px 10px 8px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid var(--line);
}

.schema-reference__title {
  min-width: 0;
}

.schema-reference__title strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.schema-reference__close {
  width: 30px;
  height: 30px;
}

.schema-reference__toolbar {
  padding: 8px 10px;
  border-bottom: 1px solid var(--line);
}

.schema-reference__language {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.schema-reference__language button {
  height: 28px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.schema-reference__language button.is-active {
  background: var(--green-soft);
  color: var(--green);
}

.schema-reference__nav {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 8px 10px;
  border-bottom: 1px solid var(--line);
}

.schema-reference__nav button {
  flex: 0 0 auto;
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-soft);
  color: var(--muted);
  font: inherit;
  font-size: 11px;
  font-weight: 620;
  cursor: pointer;
}

.schema-reference__nav button:hover,
.schema-reference__nav button:focus-visible {
  border-color: rgba(36, 114, 83, 0.34);
  color: var(--green);
}

.schema-reference__content {
  min-height: 0;
  overflow: auto;
  background: var(--editor-field);
}

.schema-reference__content pre {
  margin: 0;
  padding: 16px;
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: #3b3732;
}

.schema-reference__content code {
  font: inherit;
}

.schema-reference__section-line {
  display: inline-block;
  padding-top: 4px;
  color: var(--green);
  font-weight: 720;
}

.schema-reference__state {
  padding: 16px;
  color: var(--muted);
  font-size: 12px;
}

.schema-reference__state--error {
  color: var(--red);
}

[data-theme="dark"] .schema-reference__content pre {
  color: #d8d0c5;
}
</style>
