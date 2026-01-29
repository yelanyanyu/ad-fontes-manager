<script setup>
import { ref, computed, onMounted, watch, onActivated } from 'vue'
import { useWordStore } from '@/stores/wordStore'
import { storeToRefs } from 'pinia'
import request from '@/utils/request'
import yaml from 'js-yaml'
import { useAppStore } from '@/stores/appStore'
import ConflictModal from '@/components/ui/ConflictModal.vue'
import { deepDiffAdapter, yamlFormatter } from '@/utils/conflict'
import { normalizeSearchInput, isBlankSearch } from '@/utils/search'

const wordStore = useWordStore()
const appStore = useAppStore()
const { dbConnected, dbRecords, localRecords, dbListMeta, loading } = storeToRefs(wordStore)

const search = ref('')
const sort = ref('newest')
const pageSize = ref(20)

// Sync meta from store to local refs if needed, or just use store actions
watch(dbListMeta, (meta) => {
    if (meta.search !== search.value) search.value = meta.search
    if (meta.sort !== sort.value) sort.value = meta.sort
    if (meta.limit !== pageSize.value) pageSize.value = meta.limit
})

const totalCount = computed(() => {
    return dbConnected.value ? (dbListMeta.value.total || 0) : localRecords.value.length
})

const displayedRecords = computed(() => {
    const mappedLocal = (localRecords.value || []).map(r => ({
        ...r,
        isLocal: true,
        lemma: r.lemma || r.lemma_preview,
        original_yaml: r.original_yaml || r.raw_yaml
    }))

    return [...mappedLocal, ...(dbRecords.value || [])]
})

const emit = defineEmits(['preview', 'edit'])

const handlePreview = (id) => {
    emit('preview', id)
}

const handleEdit = (id) => {
    loadIntoEditor(id)
}

const showMenuId = ref(null)
const pendingDelete = ref(null)
const syncAllOpen = ref(false)
const syncAllLoading = ref(false)
const syncChecks = ref([])
const syncActions = ref({})
const syncConflict = ref(null)

const getDiffBadges = (diffs) => deepDiffAdapter.getBadges(diffs)
const getChangedModules = (diffs) => deepDiffAdapter.getModules(diffs)
const syncConflictTitle = computed(() => syncConflict.value ? `Conflict: ${syncConflict.value.lemma || ''}` : 'Conflict')

const toggleMenu = (id) => {
    if (showMenuId.value === id) {
        showMenuId.value = null
    } else {
        showMenuId.value = id
    }
}

const selectedMenuItem = computed(() => {
    if (!showMenuId.value) return null
    return displayedRecords.value.find(r => r.id === showMenuId.value) || null
})

const openDelete = (id, isLocal) => {
    pendingDelete.value = { id, isLocal }
    showMenuId.value = null
}

const cancelDelete = () => {
    pendingDelete.value = null
}

const confirmDelete = async () => {
    if (!pendingDelete.value) return
    await wordStore.deleteWord(pendingDelete.value.id, pendingDelete.value.isLocal)
    pendingDelete.value = null
}

const handleExport = () => {
    appStore.addToast('Export feature is not implemented yet.', 'info')
    showMenuId.value = null
}

const formatYamlForEditor = (yamlObj) => {
    const orderedObj = {}
    const keyOrder = ['yield', 'etymology', 'cognate_family', 'application', 'nuance']
    for (const k of keyOrder) {
        if (yamlObj && yamlObj[k] !== undefined) orderedObj[k] = yamlObj[k]
    }
    if (yamlObj && typeof yamlObj === 'object') {
        for (const k of Object.keys(yamlObj)) {
            if (!keyOrder.includes(k)) orderedObj[k] = yamlObj[k]
        }
    }
    return yaml.dump(orderedObj, {
        lineWidth: -1,
        noRefs: true,
        quotingType: '"',
        forceQuotes: false,
        sortKeys: false
    })
}

const localSyncItems = computed(() => {
    return (localRecords.value || []).map(r => ({ id: r.id, raw_yaml: r.raw_yaml }))
})

const openSyncAll = async () => {
    if (!dbConnected.value) {
        appStore.addToast('Database offline', 'warning')
        return
    }
    if (!localSyncItems.value.length) return

    syncAllLoading.value = true
    try {
        const checks = await wordStore.syncCheck(localSyncItems.value)
        syncChecks.value = checks || []

        const nextActions = {}
        for (const c of syncChecks.value) {
            if (c.status === 'conflict') nextActions[c.id] = 'skip'
        }
        syncActions.value = nextActions

        const hasConflict = syncChecks.value.some(c => c.status === 'conflict')
        if (!hasConflict) {
            await runBatchSyncDirect()
            return
        }
        syncAllOpen.value = true
    } catch (e) {
        await wordStore.checkConnection()
        appStore.addToast('Sync check failed (database offline)', 'error')
    } finally {
        syncAllLoading.value = false
    }
}

const closeSyncAll = () => {
    syncAllOpen.value = false
    syncChecks.value = []
    syncActions.value = {}
}

const setBatchAction = (id, action) => {
    syncActions.value = { ...syncActions.value, [id]: action }
}

const runBatchSyncDirect = async () => {
    const res = await wordStore.syncExecute(localSyncItems.value, false)
    if (res && (res.success > 0 || res.failed === 0)) {
        appStore.addToast(`Synced ${res.success} items`, 'success')
        await refresh()
    } else {
        appStore.addToast('Sync failed', 'error')
    }
}

const executeBatchSync = async () => {
    if (!syncChecks.value.length) {
        closeSyncAll()
        return
    }

    const conflicts = syncChecks.value.filter(c => c.status === 'conflict')
    const nonConflicts = syncChecks.value.filter(c => c.status !== 'conflict')

    const normalItems = nonConflicts
        .map(c => localSyncItems.value.find(i => i.id === c.id))
        .filter(Boolean)

    const forcedItems = conflicts
        .filter(c => syncActions.value[c.id] === 'overwrite')
        .map(c => localSyncItems.value.find(i => i.id === c.id))
        .filter(Boolean)

    syncAllLoading.value = true
    try {
        if (normalItems.length) await wordStore.syncExecute(normalItems, false)
        if (forcedItems.length) await wordStore.syncExecute(forcedItems, true)
        appStore.addToast('Batch sync completed', 'success')
        closeSyncAll()
        await refresh()
    } catch (e) {
        await wordStore.checkConnection()
        appStore.addToast('Batch sync failed (database offline)', 'error')
    } finally {
        syncAllLoading.value = false
    }
}

const syncOne = async (id) => {
    if (!dbConnected.value) {
        appStore.addToast('Database offline', 'warning')
        return
    }
    const item = localSyncItems.value.find(i => i.id === id)
    if (!item) return

    syncAllLoading.value = true
    try {
        const checks = await wordStore.syncCheck([item])
        const check = Array.isArray(checks) ? checks[0] : null
        if (!check) return
        if (check.status === 'conflict') {
            syncConflict.value = check
            return
        }
        const res = await wordStore.syncExecute([item], false)
        if (res && res.success > 0) {
            appStore.addToast('Synced 1 item', 'success')
            await refresh()
        } else {
            appStore.addToast('Sync failed', 'error')
        }
    } catch (e) {
        await wordStore.checkConnection()
        appStore.addToast('Sync failed (database offline)', 'error')
    } finally {
        syncAllLoading.value = false
        showMenuId.value = null
    }
}

const closeSyncConflict = () => {
    syncConflict.value = null
}

const editLocalFromSyncConflict = () => {
    if (!syncConflict.value) return
    if (syncConflict.value.newData) {
        wordStore.setEditorYaml(formatYamlForEditor(syncConflict.value.newData))
        wordStore.setEditingContext({ id: syncConflict.value.id, isLocal: true })
    }
    closeSyncConflict()
}

const overwriteSyncConflict = async () => {
    if (!syncConflict.value) return
    const item = localSyncItems.value.find(i => i.id === syncConflict.value.id)
    if (!item) return
    syncAllLoading.value = true
    try {
        const res = await wordStore.syncExecute([item], true)
        if (res && res.success > 0) {
            appStore.addToast('Synced (overwrite)', 'success')
            await refresh()
        } else {
            appStore.addToast('Sync failed', 'error')
        }
        closeSyncConflict()
    } catch (e) {
        await wordStore.checkConnection()
        appStore.addToast('Sync failed (database offline)', 'error')
    } finally {
        syncAllLoading.value = false
    }
}

const loadIntoEditor = async (id) => {
    const item = displayedRecords.value.find(r => r.id === id)
    if (!item) return

    if (item.isLocal) {
        try {
            const obj = yaml.load(String(item.raw_yaml || item.original_yaml || ''))
            wordStore.setEditorYaml(formatYamlForEditor(obj))
        } catch (e) {
            wordStore.setEditorYaml(String(item.raw_yaml || item.original_yaml || ''))
        }
        wordStore.setEditingContext({ id, isLocal: true })
        return
    }

    if (item.original_yaml) {
        try {
            const obj = typeof item.original_yaml === 'string' ? yaml.load(item.original_yaml) : item.original_yaml
            wordStore.setEditorYaml(formatYamlForEditor(obj))
        } catch (e) {
            const txt = typeof item.original_yaml === 'string' ? item.original_yaml : yaml.dump(item.original_yaml, { lineWidth: -1, noRefs: true })
            wordStore.setEditorYaml(txt)
        }
        wordStore.setEditingContext({ id, isLocal: false })
        return
    }

    try {
        const full = await request.get(`/words/${encodeURIComponent(id)}`, { skipErrorToast: true })
        if (full && full.original_yaml) {
            try {
                const obj = typeof full.original_yaml === 'string' ? yaml.load(full.original_yaml) : full.original_yaml
                wordStore.setEditorYaml(formatYamlForEditor(obj))
            } catch (e) {
                const txt = typeof full.original_yaml === 'string' ? full.original_yaml : yaml.dump(full.original_yaml, { lineWidth: -1, noRefs: true })
                wordStore.setEditorYaml(txt)
            }
            wordStore.setEditingContext({ id, isLocal: false })
        }
    } catch (e) {
    }
}

onMounted(() => {
    refresh()
})

onActivated(() => {
    refresh()
})
const canSearch = computed(() => {
    return !loading.value
})

const handleSearch = async () => {
    if (!canSearch.value) return
    const normalized = normalizeSearchInput(search.value)
    const searchValue = isBlankSearch(normalized) ? '' : normalized
    await wordStore.fetchDbRecords({ search: searchValue, page: 1 })
}

const handleSearchKeydown = (e) => {
    if (e.keyCode === 13) {
        e.preventDefault()
        handleSearch()
    }
}


const handleSort = () => {
    wordStore.fetchDbRecords({ sort: sort.value, page: 1 })
}

const handlePageSize = () => {
    wordStore.fetchDbRecords({ limit: pageSize.value, page: 1 })
}

const changePage = (delta) => {
    const newPage = dbListMeta.value.page + delta
    if (newPage >= 1 && newPage <= dbListMeta.value.totalPages) {
        wordStore.fetchDbRecords({ page: newPage })
    }
}

const goToPage = (page) => {
    if (page >= 1 && page <= dbListMeta.value.totalPages) {
        wordStore.fetchDbRecords({ page })
    }
}

const paginationRange = computed(() => {
    const current = dbListMeta.value.page
    const total = dbListMeta.value.totalPages
    const delta = 2
    const range = []
    
    for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
        range.push(i)
    }
    
    if (current - delta > 2) range.unshift('...')
    if (current + delta < total - 1) range.push('...')
    
    range.unshift(1)
    if (total > 1) range.push(total)
    
    return range
})

const refresh = async () => {
    await Promise.all([
        wordStore.fetchLocalRecords(),
        wordStore.fetchDbRecords()
    ])
}
</script>

<template>
    <div class="bg-white rounded-xl shadow-sm border border-slate-200 flex-col flex h-full overflow-hidden ml-1">
        <div v-if="showMenuId !== null" class="fixed inset-0 z-30 bg-black/30" @click="showMenuId = null"></div>
        <div v-if="showMenuId !== null" class="fixed inset-0 z-40 flex items-center justify-center p-4">
            <div class="w-full max-w-sm rounded-xl bg-white shadow-lg border border-slate-200 overflow-hidden">
                <div class="px-4 py-3 border-b border-slate-100 font-bold text-slate-800 flex items-center justify-between">
                    <span>More</span>
                    <button @click="showMenuId = null" class="text-slate-400 hover:text-slate-600 transition-colors">
                        <i class="fa-solid fa-xmark text-xl"></i>
                    </button>
                </div>
                <div class="p-2">
                    <button v-if="selectedMenuItem?.isLocal" @click="syncOne(selectedMenuItem.id)" class="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg flex items-center gap-2">
                        <i class="fa-solid fa-cloud-arrow-up w-5 text-center"></i>
                        <span>Sync</span>
                    </button>
                    <button @click="handleExport" class="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg flex items-center gap-2">
                        <i class="fa-solid fa-download w-5 text-center"></i>
                        <span>Export</span>
                    </button>
                    <button @click="openDelete(selectedMenuItem.id, selectedMenuItem.isLocal)" class="w-full text-left px-3 py-2 text-sm text-red-700 hover:bg-red-50 rounded-lg flex items-center gap-2">
                        <i class="fa-solid fa-trash w-5 text-center"></i>
                        <span>Delete</span>
                    </button>
                </div>
            </div>
        </div>
        <div v-if="pendingDelete" class="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
            <div class="w-full max-w-sm rounded-xl bg-white shadow-lg border border-slate-200 overflow-hidden">
                <div class="px-4 py-3 border-b border-slate-100 font-bold text-slate-800">Delete Word</div>
                <div class="px-4 py-4 text-sm text-slate-600">确认删除该词条？此操作不可撤销。</div>
                <div class="px-4 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
                    <button @click="cancelDelete" class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm hover:bg-slate-50 transition-colors">Cancel</button>
                    <button @click="confirmDelete" class="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm hover:bg-red-500 transition-colors">Delete</button>
                </div>
            </div>
        </div>
        <div v-if="syncAllOpen" class="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
            <div class="w-full max-w-3xl rounded-xl bg-white shadow-lg border border-slate-200 overflow-hidden">
                <div class="px-4 py-3 border-b border-slate-100 font-bold text-slate-800 flex items-center justify-between">
                    <span>Sync All</span>
                    <button @click="closeSyncAll" class="text-slate-400 hover:text-slate-600 transition-colors">
                        <i class="fa-solid fa-xmark text-xl"></i>
                    </button>
                </div>
                <div class="px-4 py-3 text-sm text-slate-600 border-b border-slate-100">
                    Found {{ syncChecks.filter(c => c.status === 'conflict').length }} conflicts among {{ syncChecks.length }} items
                </div>
                <div class="max-h-[60vh] overflow-y-auto p-4 space-y-2">
                    <div v-for="c in syncChecks" :key="c.id" class="p-3 rounded-lg border flex items-center justify-between gap-3"
                        :class="c.status === 'conflict' ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-200'">
                        <div class="min-w-0">
                            <div class="font-bold text-slate-800 truncate">{{ c.lemma || 'unknown' }}</div>
                            <div class="text-xs text-slate-500">{{ c.status }}</div>
                            <div v-if="c.status === 'conflict'" class="mt-2 flex flex-wrap gap-1">
                                <span v-for="b in getDiffBadges(c.diff)" :key="b.path" class="px-2 py-0.5 rounded border text-[10px] font-bold" :class="b.cls">{{ b.path }}</span>
                            </div>
                        </div>
                        <div v-if="c.status === 'conflict'" class="flex items-center gap-3 flex-none">
                            <label class="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                                <input type="radio" :name="`action_${c.id}`" value="skip" class="text-primary" :checked="(syncActions[c.id] || 'skip') === 'skip'" @change="setBatchAction(c.id, 'skip')">
                                <span>Skip</span>
                            </label>
                            <label class="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                                <input type="radio" :name="`action_${c.id}`" value="overwrite" class="text-red-500 focus:ring-red-500" :checked="syncActions[c.id] === 'overwrite'" @change="setBatchAction(c.id, 'overwrite')">
                                <span>Overwrite</span>
                            </label>
                        </div>
                        <div v-else class="text-xs text-green-700 font-bold flex-none">Will Sync</div>
                    </div>
                </div>
                <div class="px-4 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
                    <button @click="closeSyncAll" class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm hover:bg-slate-50 transition-colors">Cancel</button>
                    <button @click="executeBatchSync" :disabled="syncAllLoading" class="px-3 py-1.5 rounded-lg bg-primary text-white text-sm hover:bg-blue-600 transition-colors disabled:opacity-60">Sync</button>
                </div>
            </div>
        </div>
        <ConflictModal
          :open="!!syncConflict"
          :title="syncConflictTitle"
          :diff="syncConflict?.diff || []"
          :leftData="syncConflict?.oldData || {}"
          :rightData="syncConflict?.newData || {}"
          leftLabel="DB"
          rightLabel="LOCAL"
          primaryLabel="Overwrite"
          secondaryLabel="Cancel"
          tertiaryLabel="Edit Local"
          :formatter="yamlFormatter"
          :diffAdapter="deepDiffAdapter"
          @close="closeSyncConflict"
          @secondary="closeSyncConflict"
          @tertiary="editLocalFromSyncConflict"
          @primary="overwriteSyncConflict"
        />
        <div class="px-4 py-3 border-b border-slate-100 flex flex-col gap-3 bg-slate-50/50 flex-none">
            <div class="flex items-center gap-2 w-full">
                <div class="relative w-full">
                    <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 text-xs"></i>
                    <input type="text" v-model="search" @keydown="handleSearchKeydown" placeholder="Search..." 
                        class="w-full bg-white border border-slate-200 rounded-lg py-1.5 pl-8 pr-4 text-xs focus:ring-1 focus:ring-primary transition-all outline-none placeholder-slate-400">
                </div>
                <button @click="handleSearch" :disabled="!canSearch" class="min-w-[88px] text-xs bg-primary text-white rounded-lg px-3 py-1.5 hover:bg-blue-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                    <i v-if="loading" class="fa-solid fa-spinner fa-spin text-xs"></i>
                    <span>{{ loading ? 'Searching' : 'Search' }}</span>
                </button>
            </div>

            <div class="flex justify-between items-center">
                <div class="flex items-center gap-2">
                    <select v-model="sort" @change="handleSort" class="text-xs border border-slate-200 rounded px-2 py-1.5 bg-white text-slate-600 outline-none focus:ring-1 focus:ring-primary shadow-sm cursor-pointer">
                        <option value="az">A-Z</option>
                        <option value="za">Z-A</option>
                        <option value="newest">Newest</option>
                        <option value="oldest">Oldest</option>
                    </select>
                    <div class="flex items-center gap-2 bg-white border border-slate-200 rounded px-2 py-1 shadow-sm">
                        <span class="text-[10px] text-slate-400 uppercase font-bold">Size</span>
                        <input type="number" v-model="pageSize" @change="handlePageSize" min="1" max="500" class="w-10 text-xs bg-transparent outline-none text-center font-medium text-slate-700">
                    </div>
                    <button v-if="dbConnected && localSyncItems.length" @click="openSyncAll" :disabled="syncAllLoading" class="text-xs bg-white border border-slate-200 rounded px-2 py-1.5 text-slate-600 hover:bg-slate-50 shadow-sm flex items-center gap-2 disabled:opacity-60">
                        <i class="fa-solid fa-cloud-arrow-up"></i>
                        <span>Sync All ({{ localSyncItems.length }})</span>
                    </button>
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">{{ totalCount }} words</span>
                    <button @click="refresh" class="text-slate-400 hover:text-primary transition-colors p-1" title="Reload All">
                        <i class="fa-solid fa-arrows-rotate" :class="{ 'fa-spin': loading }"></i>
                    </button>
                </div>
            </div>
        </div>

        <div class="flex-1 overflow-y-auto bg-slate-50">
            <div v-if="loading && !displayedRecords.length" class="text-center text-slate-400 py-10 flex flex-col items-center gap-2">
                <i class="fa-solid fa-spinner fa-spin text-2xl"></i>
                <span>Loading records...</span>
            </div>
            
            <div v-else class="bg-white rounded-lg border border-slate-200 shadow-sm overflow-visible m-4">
                <div class="overflow-x-auto">
                    <table class="min-w-full">
                        <thead class="bg-slate-50">
                            <tr>
                                <th scope="col" class="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 text-left w-24">Src</th>
                                <th scope="col" class="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 text-left min-w-[220px]">Lemma</th>
                                <th scope="col" class="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 text-right w-[160px]"></th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            <tr v-for="item in displayedRecords" :key="item.id" class="hover:bg-slate-50/60">
                                <td class="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                                    <span v-if="item.isLocal" class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-bold"><i class="fa-solid fa-laptop"></i>Local</span>
                                    <span v-else class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold"><i class="fa-solid fa-cloud"></i>DB</span>
                                </td>
                                <td class="px-4 py-3 text-sm text-slate-700 font-bold text-slate-900">{{ item.lemma || item.yield?.lemma }}</td>
                                <td class="px-4 py-3 text-sm text-slate-700 text-right">
                                    <div class="flex items-center justify-end gap-2 w-[140px]">
                                        <button @click="handlePreview(item.id)" class="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors">
                                            <i class="fa-solid fa-eye"></i>
                                        </button>
                                        <button @click="handleEdit(item.id)" class="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors">
                                            <i class="fa-solid fa-pen"></i>
                                        </button>
                                        <button @click="toggleMenu(item.id)" class="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors">
                                            <i class="fa-solid fa-ellipsis"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        
        <div class="p-3 border-t border-slate-100 bg-white flex justify-between items-center text-xs text-slate-500 flex-none">
            <span class="font-medium">Page {{ dbListMeta.page }} of {{ dbListMeta.totalPages }}</span>
            <div class="flex items-center gap-2">
                <button @click="changePage(-1)" :disabled="dbListMeta.page <= 1" class="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium">Prev</button>
                <div class="flex items-center gap-1">
                    <button v-for="(p, index) in paginationRange" :key="index"
                        @click="typeof p === 'number' ? goToPage(p) : null"
                        :class="[
                            'px-2.5 py-1 text-xs rounded transition-colors',
                            p === dbListMeta.page 
                                ? 'bg-primary text-white font-bold' 
                                : typeof p === 'number' 
                                    ? 'hover:bg-slate-100 text-slate-600' 
                                    : 'text-slate-400 cursor-default'
                        ]"
                        :disabled="typeof p !== 'number'">
                        {{ p }}
                    </button>
                </div>
                <button @click="changePage(1)" :disabled="dbListMeta.page >= dbListMeta.totalPages" class="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium">Next</button>
            </div>
        </div>
    </div>
</template>
