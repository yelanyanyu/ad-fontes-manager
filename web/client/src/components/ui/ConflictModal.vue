<script setup>
import { computed } from 'vue'
import { deepDiffAdapter, yamlFormatter } from '@/utils/conflict'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: 'Conflict Detected' },
  subtitle: { type: String, default: '' },
  diff: { type: Array, default: null },
  leftLabel: { type: String, default: 'Existing' },
  rightLabel: { type: String, default: 'New' },
  leftData: { type: [Object, String], default: null },
  rightData: { type: [Object, String], default: null },
  formatter: { type: Object, default: () => yamlFormatter },
  diffAdapter: { type: Object, default: () => deepDiffAdapter },
  primaryLabel: { type: String, default: 'Overwrite' },
  secondaryLabel: { type: String, default: 'Use Existing' },
  tertiaryLabel: { type: String, default: '' }
})

const emit = defineEmits(['close', 'primary', 'secondary', 'tertiary'])

const modules = computed(() => props.diffAdapter?.getModules?.(props.diff) || [])
const badges = computed(() => props.diffAdapter?.getBadges?.(props.diff) || [])

const format = (val) => {
  if (!val) return props.formatter.format({})
  if (typeof val === 'string') return val
  return props.formatter.format(val)
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true">
    <div class="w-full max-w-5xl rounded-xl bg-white shadow-lg border border-slate-200 overflow-hidden">
      <div class="px-4 py-3 border-b border-slate-100 font-bold text-slate-800 flex items-center justify-between">
        <span>{{ title }}</span>
        <button @click="$emit('close')" class="text-slate-400 hover:text-slate-600 transition-colors" aria-label="Close">
          <i class="fa-solid fa-xmark text-xl"></i>
        </button>
      </div>

      <div v-if="subtitle" class="px-4 py-2 text-sm text-slate-600 border-b border-slate-100">
        {{ subtitle }}
      </div>

      <div v-if="modules.length || badges.length" class="px-4 py-3 text-sm text-slate-600 border-b border-slate-100">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-bold text-slate-700">Modules:</span>
          <span v-for="m in modules" :key="m" class="px-2 py-0.5 rounded border bg-slate-50 text-slate-700 border-slate-200 text-xs font-bold">{{ m }}</span>
          <span v-if="!modules.length" class="text-slate-400 text-xs">No module detail</span>
        </div>
        <div class="mt-2 flex flex-wrap gap-1">
          <span v-for="b in badges" :key="b.path" class="px-2 py-0.5 rounded border text-[10px] font-bold" :class="b.cls">{{ b.path }}</span>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-0">
        <div class="border-r border-slate-100">
          <div class="px-4 py-2 text-xs font-bold text-slate-500 bg-slate-50 border-b border-slate-100">{{ leftLabel }}</div>
          <pre class="p-4 text-xs overflow-auto max-h-[50vh]">{{ format(leftData) }}</pre>
        </div>
        <div>
          <div class="px-4 py-2 text-xs font-bold text-slate-500 bg-slate-50 border-b border-slate-100">{{ rightLabel }}</div>
          <pre class="p-4 text-xs overflow-auto max-h-[50vh]">{{ format(rightData) }}</pre>
        </div>
      </div>

      <div class="px-4 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
        <button v-if="tertiaryLabel" @click="$emit('tertiary')" class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm hover:bg-slate-50 transition-colors">
          {{ tertiaryLabel }}
        </button>
        <button @click="$emit('secondary')" class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm hover:bg-slate-50 transition-colors">
          {{ secondaryLabel }}
        </button>
        <button @click="$emit('primary')" class="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm hover:bg-red-500 transition-colors">
          {{ primaryLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

