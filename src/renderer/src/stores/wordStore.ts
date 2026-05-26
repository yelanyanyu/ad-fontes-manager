import { defineStore } from 'pinia';
import yaml from 'js-yaml';
import request from '@/utils/request';
import { useAppStore } from '@/stores/appStore';
import { wordLogger } from '@/utils/logger';
import type { DbListMeta, WordRecord } from '@/types/word-list';

interface SaveConflictResult {
  status: 'conflict';
  id?: string | number;
  lemma?: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  diff?: unknown[];
  [key: string]: unknown;
}

interface WordStoreState {
  dbRecords: WordRecord[];
  dbListMeta: DbListMeta;
  currentEditingId: string | number | null;
  editorYaml: string;
  editorReloadToken: number;
  loading: boolean;
}

interface HttpErrorLike {
  response?: { status?: number };
  message?: string;
}

type FetchDbRecordsParams = Partial<DbListMeta> & {
  background?: boolean;
};

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
    dbRecords: [],
    dbListMeta: defaultDbListMeta(),
    currentEditingId: null,
    editorYaml: '',
    editorReloadToken: 0,
    loading: false,
  }),

  actions: {
    async fetchDbRecords(params: FetchDbRecordsParams = {}): Promise<void> {
      const { background = false, ...queryParams } = params;
      if (!background) {
        this.loading = true;
      }
      const appStore = useAppStore();
      const currentLang = appStore.currentLanguage;
      wordLogger.debug('Fetching records...', {
        ...queryParams,
        language: currentLang,
        background,
      });
      try {
        const p = { ...this.dbListMeta, ...queryParams };
        const res = await request.get('/v2/words', {
          params: {
            page: p.page,
            limit: p.limit,
            search: p.search,
            sort: p.sort,
            language: p.language || currentLang,
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
            language: String(p.language || currentLang),
          };
          wordLogger.info(
            `Loaded ${this.dbRecords.length} records (page ${this.dbListMeta.page}/${this.dbListMeta.totalPages})`
          );
        } else {
          this.dbRecords = (Array.isArray(res) ? res : []) as WordRecord[];
          this.dbListMeta.total = this.dbRecords.length;
          wordLogger.info(`Loaded ${this.dbRecords.length} records`);
        }
      } catch (e) {
        this.dbRecords = [];
        this.dbListMeta = defaultDbListMeta();
        wordLogger.error('Failed to fetch records', e);
      } finally {
        if (!background) {
          this.loading = false;
        }
      }
    },

    async saveWord(yamlContent: string, force = false): Promise<boolean | SaveConflictResult> {
      const appStore = useAppStore();

      let lemma = 'unknown';
      try {
        const parsedYaml = yaml.load(yamlContent) as Record<string, any> | null;
        lemma = parsedYaml?.yield?.lemma || 'unknown';
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid YAML';
        wordLogger.warn('Client YAML parse failed before save; server Format Fix will validate', {
          error: message,
        });
      }

      wordLogger.debug('Saving word...', {
        force,
        lemma,
        contentLength: yamlContent?.length || 0,
      });

      try {
        const res = await request.post(
          '/v2/words',
          { yaml: yamlContent, forceUpdate: !!force },
          { skipErrorToast: true }
        );

        if (res && res.error) {
          wordLogger.error('Save failed', { lemma, error: res.error });
          if (typeof res.yaml === 'string' && res.changed) {
            this.setEditorYaml(res.yaml);
            appStore.addToast('Format repaired, but save still has validation errors.', 'warning');
          }
          appStore.addToast(`Save failed: ${res.error}`, 'error');
          return false;
        }
        if (res && res.status === 'conflict') {
          if (typeof res.yaml === 'string' && res.changed) {
            this.setEditorYaml(res.yaml);
            appStore.addToast('Format repaired before conflict review.', 'info');
          }
          wordLogger.warn('Save conflict detected', { lemma: res.lemma, diff: res.diff });
          return { ...(res as object) } as SaveConflictResult;
        }
        if (res && res.success) {
          if (typeof res.yaml === 'string' && res.changed) {
            this.setEditorYaml(res.yaml);
            appStore.addToast('Format repaired before save.', 'info');
          }
          wordLogger.success(`Word "${res.lemma}" saved`, {
            id: res.id,
            lemma: res.lemma,
            status: res.status,
          });
          appStore.addToast(`Word "${res.lemma}" saved!`, 'success');
          void this.fetchDbRecords({ background: true });
          this.setEditingContext({ id: null });
          return true;
        }
        wordLogger.error('Save failed', { lemma, response: res });
        return false;
      } catch (e) {
        const err = e as HttpErrorLike;
        wordLogger.error('Save error', { lemma, error: err?.message });
        appStore.addToast(err?.message || 'Save failed', 'error');
        return false;
      }
    },

    async deleteWord(id: string | number): Promise<void> {
      const appStore = useAppStore();
      const wordInfo = this.dbRecords.find(r => r.id === id);
      const lemma = wordInfo?.lemma || `ID:${id}`;

      wordLogger.debug('Deleting word...', { id, lemma });
      try {
        await request.delete(`/v2/words/${id}`, { skipErrorToast: true });
        wordLogger.success(`Word "${lemma}" deleted`, { id, lemma });
        appStore.addToast('Deleted successfully', 'success');
        void this.fetchDbRecords();
      } catch (e) {
        wordLogger.error('Delete word failed', {
          id,
          lemma,
          error: (e as HttpErrorLike)?.message,
        });
        appStore.addToast('Delete failed', 'error');
      }
    },

    setEditingContext({
      id = null,
      yaml: yamlContent = undefined,
    }: {
      id?: string | number | null;
      yaml?: string;
    } = {}): void {
      this.currentEditingId = id;
      if (yamlContent !== undefined) {
        this.editorYaml = yamlContent;
      }
    },

    setEditorYaml(yamlContent: string): void {
      this.editorYaml = yamlContent;
      this.editorReloadToken++;
    },
  },
});
