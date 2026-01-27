<script setup>
import { ref, watch, computed } from 'vue'
import yaml from 'js-yaml'
import { useWordStore } from '@/stores/wordStore'
import { useAppStore } from '@/stores/appStore'
import { storeToRefs } from 'pinia'
import ConflictModal from '@/components/ui/ConflictModal.vue'
import { deepDiffAdapter, yamlFormatter } from '@/utils/conflict'

const wordStore = useWordStore()
const appStore = useAppStore()
const { editorYaml, dbConnected, currentEditingIsLocal } = storeToRefs(wordStore)

const input = ref('')
const status = ref('')
const conflictData = ref(null)

const saveLabel = computed(() => {
  if (currentEditingIsLocal.value || !dbConnected.value) return 'Save Locally (Offline)'
  return 'Save to Database'
})

const handleInput = () => {
  try {
    yaml.load(input.value)
    status.value = 'Valid YAML'
  } catch (e) {
    status.value = 'Invalid YAML'
  }
}

watch(editorYaml, (val) => {
  if (typeof val === 'string') {
    input.value = val
    handleInput()
  }
}, { immediate: true })

const clear = () => {
  input.value = ''
  status.value = ''
}

const save = async () => {
  if (!input.value) return
  const res = await wordStore.saveWord(input.value)
  if (res && res.status === 'conflict') {
      conflictData.value = res
  }
}

const closeConflict = () => {
  conflictData.value = null
}

const useExisting = () => {
  if (!conflictData.value || !conflictData.value.oldData) return
  try {
    input.value = yamlFormatter.format(conflictData.value.oldData)
  } catch (e) {
    input.value = yaml.dump(conflictData.value.oldData || {}, { lineWidth: -1, noRefs: true })
  }
  if (conflictData.value.source === 'local' && conflictData.value.id) {
    wordStore.setEditingContext({ id: conflictData.value.id, isLocal: true })
  }
  handleInput()
  closeConflict()
}

const overwrite = async () => {
  const target = conflictData.value?.source === 'local' ? 'local' : (conflictData.value?.source === 'db' ? 'db' : 'auto')
  const ok = await wordStore.saveWord(input.value, true, target)
  if (ok) closeConflict()
}
</script>

<template>
    <div class="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 flex flex-col min-h-0 overflow-hidden relative">
        <ConflictModal
          :open="!!conflictData"
          title="Conflict Detected"
          :diff="conflictData?.diff || []"
          :leftData="conflictData?.oldData || {}"
          :rightData="conflictData?.newData || {}"
          leftLabel="Existing"
          rightLabel="New"
          primaryLabel="Overwrite"
          secondaryLabel="Use Existing"
          :formatter="yamlFormatter"
          :diffAdapter="deepDiffAdapter"
          @close="closeConflict"
          @secondary="useExisting"
          @primary="overwrite"
        />
        <div class="flex justify-between items-center px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex-none">
            <div class="flex items-center gap-3">
                <h2 class="text-xs font-bold text-slate-500 uppercase tracking-wider">YAML Editor</h2>
                <span class="text-xs font-mono" :class="status === 'Valid YAML' ? 'text-green-500' : 'text-red-500'">{{ status }}</span>
            </div>
            <div class="flex gap-2">
                <button @click="clear" class="text-xs text-slate-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 transition-colors">
                    Clear
                </button>
            </div>
        </div>
        
        <div class="flex-1 relative group min-h-0">
            <div class="absolute inset-0 flex flex-col">
                <textarea v-model="input" @input="handleInput" class="flex-1 w-full h-full font-mono text-sm bg-white p-4 resize-none outline-none focus:bg-slate-50 transition-colors" placeholder="Paste your YAML here..." spellcheck="false"></textarea>
            </div>
        </div>

        <div class="p-3 border-t border-slate-100 bg-white flex justify-end flex-none">
            <button @click="save" class="bg-primary hover:bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2">
                <i class="fa-regular fa-floppy-disk"></i>
                <span>{{ saveLabel }}</span>
            </button>
        </div>
    </div>
</template>
