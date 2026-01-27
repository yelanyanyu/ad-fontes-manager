<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import request from '@/utils/request'
import { useAppStore } from '@/stores/appStore'

import { useWordStore } from '@/stores/wordStore'
import { storeToRefs } from 'pinia'

const router = useRouter()
const appStore = useAppStore()
const wordStore = useWordStore()
const { connectionStatus } = storeToRefs(wordStore)
const dbUrl = ref('')
const maxItems = ref(100)
const statusText = computed(() => {
    if (connectionStatus.value === 'connected') return '已连接'
    if (connectionStatus.value === 'testing') return 'Testing...'
    return '未连接'
})

const close = () => {
    router.push('/')
}

const loadConfig = async () => {
    try {
        const config = await request.get('/config')
        if (config) {
            dbUrl.value = config.DATABASE_URL || ''
            maxItems.value = config.MAX_LOCAL_ITEMS || 100
        }
        await wordStore.checkConnection()
    } catch(e) {
        console.error('Failed to load settings', e)
    }
}

const save = async () => {
    try {
        await request.post('/config', {
            database_url: dbUrl.value,
            MAX_LOCAL_ITEMS: parseInt(maxItems.value)
        })
        appStore.addToast('Configuration saved', 'success')
        router.push('/')
    } catch(e) {
        console.error('Failed to save settings', e)
    }
}

const testConnection = async () => {
    const res = await wordStore.testConnection(dbUrl.value)
    if (res.connected) appStore.addToast('Connection successful', 'success')
    else appStore.addToast('Connection failed' + (res.error ? `: ${res.error}` : ''), 'error')
}

onMounted(loadConfig)
</script>

<template>
    <div class="p-8">
        <div class="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 class="text-lg font-bold text-slate-800">Settings</h3>
                <button @click="close" class="text-slate-400 hover:text-slate-600 transition-colors">
                    <i class="fa-solid fa-xmark text-xl"></i>
                </button>
            </div>
            <div class="p-6 space-y-4">
                <div>
                    <label class="block text-sm font-medium text-slate-700 mb-1">Database Connection String</label>
                    <input type="password" v-model="dbUrl" class="w-full text-sm p-2 rounded border border-slate-200 focus:ring-2 focus:ring-primary outline-none font-mono" placeholder="postgresql://user:pass@localhost:5432/db">
                    <p class="text-xs text-slate-400 mt-1">Leave empty to use default environment variables (process.env.DATABASE_URL).</p>
                </div>
                <div>
                    <label class="block text-sm font-medium text-slate-700 mb-1">Max Local Items (Offline Cache)</label>
                    <input type="number" v-model="maxItems" class="w-full text-sm p-2 rounded border border-slate-200 focus:ring-2 focus:ring-primary outline-none" placeholder="100">
                    <p class="text-xs text-slate-400 mt-1">Oldest items will be removed when limit is reached.</p>
                </div>
                <div class="flex items-center gap-2 text-sm">
                    <span class="text-slate-500">
                        Status: <span :class="{'text-green-600 font-bold': statusText === '已连接', 'text-red-500 font-bold': statusText === '未连接'}">{{ statusText }}</span>
                        <span v-if="!dbUrl && statusText === '已连接'" class="text-[10px] text-slate-400 ml-1">(Using Default/Env)</span>
                    </span>
                    <button @click="testConnection" class="text-primary hover:underline text-xs">Run Test</button>
                </div>
            </div>
            <div class="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                <button @click="save" class="px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-blue-600 transition-colors shadow-sm">Save Configuration</button>
            </div>
        </div>
    </div>
</template>
