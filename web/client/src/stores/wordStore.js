import { defineStore } from 'pinia'
import request from '@/utils/request'
import { useAppStore } from '@/stores/appStore'

export const useWordStore = defineStore('word', {
  state: () => ({
    dbConnected: false,
    connectionStatus: 'disconnected',
    localRecords: [],
    dbRecords: [],
    dbListMeta: {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1,
      search: '',
      sort: 'newest'
    },
    currentEditingId: null,
    currentEditingIsLocal: false,
    editorYaml: '',
    loading: false
  }),
  actions: {
    async checkConnection() {
      try {
        this.connectionStatus = 'testing'
        await request.get('/status', { skipErrorToast: true })
        this.dbConnected = true
        this.connectionStatus = 'connected'
      } catch (e) {
        this.dbConnected = false
        this.connectionStatus = 'disconnected'
      }
    },
    async testConnection(dbUrl) {
      try {
        this.connectionStatus = 'testing'
        const res = await request.get('/status', {
          headers: dbUrl ? { 'x-db-url': dbUrl } : {},
          skipErrorToast: true
        })
        if (res && res.connected) {
          this.dbConnected = true
          this.connectionStatus = 'connected'
          return { connected: true }
        }
        this.dbConnected = false
        this.connectionStatus = 'disconnected'
        return { connected: false, error: res?.error }
      } catch (e) {
        this.dbConnected = false
        this.connectionStatus = 'disconnected'
        return { connected: false, error: e?.message }
      }
    },
    async fetchLocalRecords() {
      try {
        const res = await request.get('/local', { skipErrorToast: true })
        this.localRecords = (res || []).map(r => ({
          ...r,
          isLocal: true,
          lemma: r.lemma || r.lemma_preview,
          original_yaml: r.original_yaml || r.raw_yaml
        }))
      } catch (e) {
      }
    },
    async fetchDbRecords(params = {}) {
      this.loading = true
      try {
        const p = { ...this.dbListMeta, ...params }
        const res = await request.get('/words', { 
            params: {
              page: p.page,
              limit: p.limit,
              search: p.search,
              sort: p.sort
            },
            skipErrorToast: true 
        })
        
        this.dbConnected = true
        this.connectionStatus = 'connected'

        if (res.items) {
          this.dbRecords = res.items
          this.dbListMeta = {
            page: res.page,
            limit: res.limit,
            total: res.total,
            totalPages: res.totalPages,
            search: p.search,
            sort: p.sort
          }
        } else {
          this.dbRecords = res
          this.dbListMeta.total = res.length
        }
      } catch (e) {
        this.dbConnected = false
        this.connectionStatus = 'disconnected'
        this.dbRecords = []
        this.dbListMeta = {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 1,
          search: '',
          sort: 'newest'
        }
      } finally {
        this.loading = false
      }
    },
    setEditorYaml(yamlText) {
      this.editorYaml = yamlText || ''
    },
    setEditingContext({ id, isLocal }) {
      this.currentEditingId = id || null
      this.currentEditingIsLocal = !!isLocal
    },
    async saveWord(yamlContent, force = false, target = 'auto') {
        const appStore = useAppStore()
        const resolvedTarget =
          target === 'auto'
            ? (this.currentEditingIsLocal ? 'local' : (this.dbConnected ? 'db' : 'local'))
            : target

        if (resolvedTarget === 'local') {
          try {
            const localId = this.currentEditingIsLocal ? this.currentEditingId : null
            const localRes = await request.post(
              '/local',
              { yaml: yamlContent, id: localId, forceUpdate: !!force },
              { skipErrorToast: true }
            )

            if (localRes && localRes.status === 'conflict') {
              return { ...localRes, source: 'local' }
            }

            if (localRes && localRes.success) {
              appStore.addToast('Saved Locally (Offline)', 'success')
              await this.fetchLocalRecords()
              if (localRes.id) this.setEditingContext({ id: localRes.id, isLocal: true })
              return true
            }

            appStore.addToast('Local save failed', 'error')
            return false
          } catch (e) {
            appStore.addToast('Local save failed', 'error')
            return false
          }
        }

        try {
          const res = await request.post('/words', { yaml: yamlContent, force }, { skipErrorToast: true })
          if (res && res.status === 'conflict') return { ...res, source: 'db' }
          if (res && res.success) {
            appStore.addToast(`Word "${res.lemma}" saved!`, 'success')
            this.fetchLocalRecords()
            this.fetchDbRecords()
            this.setEditingContext({ id: null, isLocal: false })
            return true
          }
          return false
        } catch (e) {
          if (e.response && e.response.status === 500) {
            this.dbConnected = false
            this.connectionStatus = 'disconnected'
            const localRes = await this.saveWord(yamlContent, force, 'local')
            if (localRes && localRes.status === 'conflict') return localRes
            if (localRes === true) {
              this.dbRecords = []
              this.dbListMeta = {
                page: 1,
                limit: 20,
                total: 0,
                totalPages: 1,
                search: '',
                sort: 'newest'
              }
              return true
            }
            appStore.addToast('数据库未连接，本地保存失败', 'error')
            return false
          }
          appStore.addToast(e.message || 'Save failed', 'error')
          return false
        }
    },
    async deleteWord(id, isLocal) {
        const appStore = useAppStore()
        try {
            const endpoint = isLocal ? `/local/${id}` : `/words/${id}`
            await request.delete(endpoint, { skipErrorToast: true })
            appStore.addToast('Deleted successfully', 'success')
            if (isLocal) this.fetchLocalRecords()
            else this.fetchDbRecords()
        } catch (e) {
            appStore.addToast('Delete failed', 'error')
        }
    },
    async syncCheck(items) {
      return await request.post('/sync/check', { items }, { skipErrorToast: true })
    },
    async syncExecute(items, forceUpdate) {
      return await request.post('/sync/execute', { items, forceUpdate: !!forceUpdate }, { skipErrorToast: true })
    }
  }
})
