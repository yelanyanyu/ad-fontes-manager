import { defineStore } from 'pinia';
import yaml from 'js-yaml';
import request from '@/utils/request';
import { useAppStore } from '@/stores/appStore';
import { wordLogger, syncLogger, dbLogger } from '@/utils/logger';
import type { DbListMeta, LocalSyncItem, SyncCheckItem, WordRecord } from '@/types/word-list';

type ConnectionStatus = 'connected' | 'disconnected' | 'testing';
type SaveTarget = 'local' | 'db' | 'auto';

interface SaveConflictResult {
  status: 'conflict';
  source: 'local' | 'db';
  id?: string | number;
  lemma?: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  diff?: unknown[];
  [key: string]: unknown;
}

interface SyncExecuteResult {
  success?: number;
  failed?: number;
  status?: string;
  [key: string]: unknown;
}

interface WordStoreState {
  localRecords: WordRecord[];
  dbRecords: WordRecord[];
  dbListMeta: DbListMeta;
  currentEditingId: string | number | null;
  currentEditingIsLocal: boolean;
  editorYaml: string;
  dbConnected: boolean;
  connectionStatus: ConnectionStatus;
  loading: boolean;
}

interface HttpErrorLike {
  response?: { status?: number };
  message?: string;
}

const defaultDbListMeta = (): DbListMeta => ({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 1,
  search: '',
  sort: 'newest',
});

export const useWordStore = defineStore('word', {
  state: (): WordStoreState => ({
    localRecords: [],
    dbRecords: [],
    dbListMeta: defaultDbListMeta(),
    currentEditingId: null,
    currentEditingIsLocal: false,
    editorYaml: '',
    dbConnected: false,
    connectionStatus: 'disconnected',
    loading: false,
  }),

  actions: {
    async checkConnection(): Promise<void> {
      dbLogger.debug('Checking database connection...');
      try {
        this.connectionStatus = 'testing';
        const res = await request.get('/status', { skipErrorToast: true });
        this.dbConnected = res.connected === true;
        this.connectionStatus = this.dbConnected ? 'connected' : 'disconnected';
        dbLogger.info(`Database ${this.dbConnected ? 'connected' : 'disconnected'}`);
      } catch (e) {
        this.dbConnected = false;
        this.connectionStatus = 'disconnected';
        dbLogger.warn('Database connection check failed', { error: (e as HttpErrorLike)?.message });
      }
    },

    async fetchLocalRecords(): Promise<void> {
      wordLogger.debug('Fetching local records...');
      try {
        const res = await request.get('/local', { skipErrorToast: true });
        const rows = (Array.isArray(res) ? res : []) as WordRecord[];
        this.localRecords = rows.map(r => ({
          ...r,
          isLocal: true,
          lemma: r.lemma || r.lemma_preview,
          original_yaml: r.original_yaml || r.raw_yaml,
        }));
        wordLogger.info(`Loaded ${this.localRecords.length} local records`);
      } catch (e) {
        wordLogger.error('Failed to fetch local records', e);
      }
    },

    async fetchDbRecords(params: Partial<DbListMeta> = {}): Promise<void> {
      this.loading = true;
      wordLogger.debug('Fetching database records...', params);
      try {
        const p = { ...this.dbListMeta, ...params };
        const res = await request.get('/words', {
          params: {
            page: p.page,
            limit: p.limit,
            search: p.search,
            sort: p.sort,
          },
          skipErrorToast: true,
        });

        if (res?.items) {
          this.dbRecords = res.items as WordRecord[];
          this.dbListMeta = {
            page: Number(res.page || 1),
            limit: Number(res.limit || p.limit),
            total: Number(res.total || 0),
            totalPages: Number(res.totalPages || 1),
            search: String(p.search || ''),
            sort: p.sort,
          };
          wordLogger.info(
            `Loaded ${this.dbRecords.length} records from database (page ${this.dbListMeta.page}/${this.dbListMeta.totalPages})`
          );
        } else {
          this.dbRecords = (Array.isArray(res) ? res : []) as WordRecord[];
          this.dbListMeta.total = this.dbRecords.length;
          wordLogger.info(`Loaded ${this.dbRecords.length} records from database`);
        }

        this.dbConnected = true;
        this.connectionStatus = 'connected';
      } catch (e) {
        this.dbRecords = [];
        this.dbListMeta = defaultDbListMeta();
        this.dbConnected = false;
        this.connectionStatus = 'disconnected';
        wordLogger.error('Failed to fetch database records', e);
      } finally {
        this.loading = false;
      }
    },

    async saveWord(
      yamlContent: string,
      force = false,
      target: SaveTarget = 'auto'
    ): Promise<boolean | SaveConflictResult> {
      const appStore = useAppStore();

      let lemma = 'unknown';
      let parsedYaml: Record<string, any> | null = null;
      try {
        parsedYaml = yaml.load(yamlContent) as Record<string, any> | null;
        lemma = parsedYaml?.yield?.lemma || 'unknown';
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid YAML';
        wordLogger.error('YAML parse error in saveWord', { error: message });
        appStore.addToast(`Invalid YAML: ${message}`, 'error');
        return false;
      }

      if (!parsedYaml?.yield?.lemma) {
        wordLogger.error('YAML missing yield.lemma');
        appStore.addToast('YAML missing yield.lemma', 'error');
        return false;
      }

      const resolvedTarget: Exclude<SaveTarget, 'auto'> =
        target === 'auto'
          ? this.currentEditingIsLocal
            ? 'local'
            : this.dbConnected
              ? 'db'
              : 'local'
          : target;

      wordLogger.debug('Saving word...', {
        target: resolvedTarget,
        force,
        isEditing: !!this.currentEditingId,
        lemma,
        contentLength: yamlContent?.length || 0,
      });

      if (resolvedTarget === 'local') {
        try {
          const localId = this.currentEditingIsLocal ? this.currentEditingId : null;
          wordLogger.debug('Saving to local storage', {
            localId,
            lemma,
            payload: {
              yaml: yamlContent?.substring(0, 500) + (yamlContent?.length > 500 ? '...' : ''),
              id: localId,
              forceUpdate: !!force,
            },
          });
          const localRes = await request.post(
            '/local',
            { yaml: yamlContent, id: localId, forceUpdate: !!force },
            { skipErrorToast: true }
          );

          if (localRes && localRes.status === 'conflict') {
            wordLogger.warn('Local save conflict detected', { localId, lemma });
            return { ...(localRes as object), source: 'local' } as SaveConflictResult;
          }

          if (localRes && localRes.success) {
            wordLogger.success('Word saved to local storage', { id: localRes.id, lemma });
            appStore.addToast('Saved Locally (Offline)', 'success');
            await this.fetchLocalRecords();
            if (localRes.id) this.setEditingContext({ id: localRes.id, isLocal: true });
            return true;
          }

          wordLogger.error('Local save failed', { localId, lemma, response: localRes });
          appStore.addToast('Local save failed', 'error');
          return false;
        } catch (e) {
          wordLogger.error('Local save error', { lemma, error: (e as HttpErrorLike)?.message });
          appStore.addToast('Local save failed', 'error');
          return false;
        }
      }

      try {
        wordLogger.debug('Saving to database...', {
          lemma,
          payload: {
            yaml: yamlContent?.substring(0, 500) + (yamlContent?.length > 500 ? '...' : ''),
            force,
          },
        });
        const res = await request.post(
          '/words',
          { yaml: yamlContent, forceUpdate: !!force },
          { skipErrorToast: true }
        );

        if (res && res.error) {
          wordLogger.error('Database save failed', { lemma, error: res.error });
          appStore.addToast(`Save failed: ${res.error}`, 'error');
          return false;
        }
        if (res && res.status === 'conflict') {
          wordLogger.warn('Database save conflict detected', {
            lemma: res.lemma,
            diff: res.diff,
          });
          return { ...(res as object), source: 'db' } as SaveConflictResult;
        }
        if (res && res.success) {
          wordLogger.success(`Word "${res.lemma}" saved to database`, {
            id: res.id,
            lemma: res.lemma,
            status: res.status,
          });
          appStore.addToast(`Word "${res.lemma}" saved!`, 'success');
          this.fetchLocalRecords();
          this.fetchDbRecords();
          this.setEditingContext({ id: null, isLocal: false });
          return true;
        }
        wordLogger.error('Database save failed', { lemma, response: res });
        return false;
      } catch (e) {
        const err = e as HttpErrorLike;
        if (err.response && err.response.status === 500) {
          wordLogger.warn('Database connection lost, falling back to local save', { lemma });
          this.dbConnected = false;
          this.connectionStatus = 'disconnected';
          const localRes = await this.saveWord(yamlContent, force, 'local');
          if (localRes && typeof localRes === 'object' && localRes.status === 'conflict')
            return localRes;
          if (localRes === true) {
            this.dbRecords = [];
            this.dbListMeta = defaultDbListMeta();
            return true;
          }
          appStore.addToast('数据库未连接，本地保存失败', 'error');
          return false;
        }
        wordLogger.error('Save error', { lemma, error: err?.message });
        appStore.addToast(err?.message || 'Save failed', 'error');
        return false;
      }
    },

    async deleteWord(id: string | number, isLocal: boolean): Promise<void> {
      const appStore = useAppStore();

      let wordInfo: WordRecord | undefined;
      if (isLocal) {
        wordInfo = this.localRecords.find(r => r.id === id);
      } else {
        wordInfo = this.dbRecords.find(r => r.id === id);
      }
      const lemma = wordInfo?.lemma || `ID:${id}`;

      wordLogger.debug('Deleting word...', { id, isLocal, lemma });

      try {
        const endpoint = isLocal ? `/local/${id}` : `/words/${id}`;
        await request.delete(endpoint, { skipErrorToast: true });
        wordLogger.success(`Word "${lemma}" deleted from ${isLocal ? 'local' : 'database'}`, {
          id,
          lemma,
        });
        appStore.addToast('Deleted successfully', 'success');
        if (isLocal) this.fetchLocalRecords();
        else this.fetchDbRecords();
      } catch (e) {
        wordLogger.error('Delete word failed', {
          id,
          lemma,
          isLocal,
          error: (e as HttpErrorLike)?.message,
        });
        appStore.addToast('Delete failed', 'error');
      }
    },

    setEditingContext({
      id = null,
      isLocal = false,
      yaml: yamlContent = undefined,
    }: {
      id?: string | number | null;
      isLocal?: boolean;
      yaml?: string;
    } = {}): void {
      this.currentEditingId = id;
      this.currentEditingIsLocal = isLocal;
      if (yamlContent !== undefined) {
        this.editorYaml = yamlContent;
      }
      wordLogger.debug('Editing context set', {
        id,
        isLocal,
        yamlLength: this.editorYaml?.length,
        yamlPreview: this.editorYaml?.substring(0, 50) + '...',
      });
    },

    setEditorYaml(yamlContent: string): void {
      this.editorYaml = yamlContent;
      wordLogger.debug('Editor YAML updated', {
        yamlLength: yamlContent?.length,
        yamlPreview: yamlContent?.substring(0, 50) + '...',
      });
    },

    async syncCheck(items: LocalSyncItem[]): Promise<SyncCheckItem[]> {
      syncLogger.debug('Checking sync status...', { itemCount: items?.length });
      try {
        const res = await request.post('/sync/check', { items }, { skipErrorToast: true });
        syncLogger.info('Sync check completed', { result: res?.status });
        return (res || []) as SyncCheckItem[];
      } catch (e) {
        syncLogger.error('Sync check failed', e);
        throw e;
      }
    },

    async syncExecute(items: LocalSyncItem[], forceUpdate: boolean): Promise<SyncExecuteResult> {
      syncLogger.debug('Executing sync...', { itemCount: items?.length, forceUpdate });
      try {
        const res = await request.post(
          '/sync/execute',
          { items, forceUpdate: !!forceUpdate },
          { skipErrorToast: true }
        );
        syncLogger.success('Sync executed successfully', { result: res?.status });
        return (res || {}) as SyncExecuteResult;
      } catch (e) {
        syncLogger.error('Sync execution failed', e);
        throw e;
      }
    },
  },
});
