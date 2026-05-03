<script setup lang="ts">
import { computed } from 'vue';
import {
  ANKI_DATA_SOURCE_OPTIONS,
  getRecommendedMapping,
  saveFieldMapping,
} from '@/services/ankiFieldMappingStore';
import type { AnkiDataSource, FieldMappingConfig } from '@/types/anki';

const props = defineProps<{
  modelName: string;
  modelFieldNames: string[];
  modelValue: FieldMappingConfig;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: FieldMappingConfig): void;
}>();

const dataSources = ANKI_DATA_SOURCE_OPTIONS;

const hasRecommendedMapping = computed(
  () => getRecommendedMapping(props.modelFieldNames).length > 0
);

const persistAndEmit = (mapping: FieldMappingConfig): void => {
  saveFieldMapping(props.modelName, mapping);
  emit('update:modelValue', mapping);
};

const getMappingFor = (fieldName: string): AnkiDataSource | '' =>
  props.modelValue.find(entry => entry.target === fieldName)?.source || '';

const setMapping = (fieldName: string, source: string): void => {
  const next = props.modelValue.filter(entry => entry.target !== fieldName);
  if (source) {
    next.push({ source: source as AnkiDataSource, target: fieldName });
  }
  persistAndEmit(next);
};

const resetToRecommended = (): void => {
  persistAndEmit(getRecommendedMapping(props.modelFieldNames));
};

const clearAll = (): void => {
  persistAndEmit([]);
};
</script>

<template>
  <div class="field-mapping-editor">
    <div class="flex items-center justify-between gap-3 mb-3">
      <h4 class="font-bold text-slate-700 text-sm">Field Mapping</h4>
      <div class="flex flex-wrap gap-2">
        <button
          class="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs hover:bg-slate-50 disabled:text-slate-400"
          :disabled="disabled || !hasRecommendedMapping"
          type="button"
          @click="resetToRecommended"
        >
          Recommended
        </button>
        <button
          class="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs hover:bg-slate-50 disabled:text-slate-400"
          :disabled="disabled"
          type="button"
          @click="clearAll"
        >
          Clear
        </button>
      </div>
    </div>

    <div class="max-h-72 overflow-auto rounded-lg border border-slate-200">
      <table class="min-w-full text-sm">
        <thead class="bg-slate-50 sticky top-0">
          <tr>
            <th class="px-3 py-2 text-left text-[11px] uppercase text-slate-500 font-bold">
              Anki Field
            </th>
            <th class="px-3 py-2 text-left text-[11px] uppercase text-slate-500 font-bold">
              Data Source
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="fieldName in modelFieldNames" :key="fieldName">
            <td class="px-3 py-2 text-slate-700 font-medium break-all">{{ fieldName }}</td>
            <td class="px-3 py-2">
              <select
                class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                :disabled="disabled"
                :value="getMappingFor(fieldName)"
                @change="setMapping(fieldName, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">Do not map</option>
                <option v-for="source in dataSources" :key="source.id" :value="source.id">
                  {{ source.label }}
                </option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
