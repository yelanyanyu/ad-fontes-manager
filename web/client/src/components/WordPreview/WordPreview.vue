<script setup>
import { ref, onMounted, watch } from 'vue'
import { marked } from 'marked'
import { useWordStore } from '@/stores/wordStore'
import { useAppStore } from '@/stores/appStore'
import { generateCardHTML, generateMarkdown } from '@/utils/generator'
import { renderTemplate } from '@/utils/template'
import request from '@/utils/request'
import yaml from 'js-yaml'

const props = defineProps(['wordId'])
const emit = defineEmits(['close'])
const wordStore = useWordStore()
const appStore = useAppStore()

const mode = ref('card') // card or markdown
const content = ref('')
const loading = ref(false)
const rawData = ref(null)

const normalizeYamlData = (maybeYaml) => {
    if (!maybeYaml) return null
    if (typeof maybeYaml === 'string') {
        try {
            return yaml.load(maybeYaml)
        } catch (e) {
            return null
        }
    }
    if (typeof maybeYaml === 'object') return maybeYaml
    return null
}

const loadWord = async () => {
    if (!props.wordId) return
    loading.value = true
    try {
        let record = [...wordStore.localRecords, ...wordStore.dbRecords].find(r => r.id === props.wordId)
        
        if (!record) {
             appStore.addToast('Record not found', 'error')
             loading.value = false
             return
        }

        let data = record.original_yaml || record.raw_yaml
        
        // Fetch full data if missing yaml (e.g. from DB list which might be partial)
        if (!data && !record.isLocal) {
             const full = await request.get(`/words/${encodeURIComponent(props.wordId)}`, { skipErrorToast: true })
             data = full.original_yaml
             record.original_yaml = full.original_yaml
        }

        rawData.value = normalizeYamlData(data)
        renderContent()
    } catch (e) {
        appStore.addToast('Failed to load word details', 'error')
    } finally {
        loading.value = false
    }
}

const renderContent = () => {
    if (!rawData.value) return

    if (mode.value === 'card') {
        const templateMode = localStorage.getItem('etymos.wordCardTemplateMode') || 'default'
        const customTemplate = localStorage.getItem('etymos.wordCardTemplateHtml') || ''
        
        if (templateMode === 'custom' && customTemplate.trim()) {
            content.value = renderTemplate(customTemplate, rawData.value)
        } else {
            content.value = generateCardHTML(rawData.value)
        }
    } else {
        const md = generateMarkdown(rawData.value)
        content.value = marked.parse(md)
    }
}

watch(() => props.wordId, loadWord)
watch(mode, renderContent)

onMounted(() => {
    if (props.wordId) loadWord()
})

const close = () => emit('close')

const copyContent = async (type) => {
    if (!rawData.value) return
    let text = ''
    if (type === 'html') {
         // Re-generate to ensure it matches current view
         text = mode.value === 'card' ? content.value : generateCardHTML(rawData.value)
    } else if (type === 'md') {
         text = generateMarkdown(rawData.value)
    }

    try {
        await navigator.clipboard.writeText(text)
        appStore.addToast('Copied to clipboard', 'success')
    } catch (e) {
        appStore.addToast('Copy failed', 'error')
    }
}

const copyRichText = () => {
    const html = mode.value === 'markdown' ? content.value : generateCardHTML(rawData.value)
    const item = new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }) })
    navigator.clipboard.write([item]).then(
        () => appStore.addToast('Rich text copied', 'success'),
        () => appStore.addToast('Copy failed', 'error')
    )
}
</script>

<template>
    <div class="absolute inset-0 bg-slate-100 overflow-y-auto flex flex-col z-30">
        <!-- Preview Header -->
        <div class="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm">
             <button @click="close" class="text-slate-500 hover:text-slate-800 flex items-center gap-2 font-bold text-sm transition-colors group">
                <div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-slate-200 transition-colors">
                    <i class="fa-solid fa-arrow-left"></i>
                </div>
                <span>Back to List</span>
             </button>
             
             <!-- View Toggle -->
             <div class="flex bg-slate-100 p-1 rounded-lg">
                <button @click="mode = 'card'" :class="[mode === 'card' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:bg-slate-200/50']" class="px-4 py-1.5 text-xs rounded-md font-bold transition-colors">Card</button>
                <button @click="mode = 'markdown'" :class="[mode === 'markdown' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:bg-slate-200/50']" class="px-4 py-1.5 text-xs rounded-md font-medium transition-colors">Markdown</button>
             </div>
        </div>
        
        <div class="p-8 w-full max-w-5xl mx-auto flex-1">
            <!-- Dynamic Content -->
             <div v-if="loading" class="text-center py-10 flex flex-col items-center gap-2 text-slate-500">
                <i class="fa-solid fa-spinner fa-spin text-2xl"></i>
                <span>Loading...</span>
             </div>
             
             <div v-else-if="mode === 'card'" class="flex flex-col items-center gap-6">
                 <div v-html="content" class="w-full"></div>
                 <button @click="copyContent('html')" class="bg-amber-600 hover:bg-amber-500 text-white px-6 py-2 rounded-full font-bold shadow-lg transition transform active:scale-95 flex items-center gap-2">
                    <i class="fa-solid fa-copy"></i> <span>Copy HTML Code (Anki)</span>
                </button>
             </div>

             <div v-else class="flex flex-col gap-8 w-full max-w-4xl mx-auto">
                <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                     <div class="bg-gray-50 border-b border-gray-200 px-4 py-2 flex justify-between items-center">
                        <h3 class="font-bold text-sm text-gray-700 uppercase tracking-wide"><i class="fa-solid fa-eye mr-2"></i>Preview</h3>
                        <button @click="copyRichText" class="text-xs bg-white text-blue-600 border border-blue-200 px-3 py-1 rounded shadow-sm">Copy Rich Text</button>
                    </div>
                    <div class="p-8 markdown-body" id="md-render-target" v-html="content"></div>
                </div>
                <div class="bg-slate-800 rounded-lg shadow-sm border border-slate-700 overflow-hidden text-slate-300">
                     <div class="bg-slate-900 border-b border-slate-700 px-4 py-2 flex justify-between items-center">
                        <h3 class="font-bold text-sm text-slate-400 uppercase tracking-wide"><i class="fa-solid fa-code mr-2"></i>Source</h3>
                        <button @click="copyContent('md')" class="text-xs bg-slate-700 text-white border border-slate-600 px-3 py-1 rounded shadow-sm">Copy Source</button>
                    </div>
                    <div class="p-4 overflow-x-auto"><pre class="text-sm whitespace-pre-wrap">{{ generateMarkdown(rawData) }}</pre></div>
                </div>
             </div>
        </div>
    </div>
</template>
