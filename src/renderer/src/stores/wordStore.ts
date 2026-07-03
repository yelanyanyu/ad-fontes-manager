import { defineStore } from 'pinia';
import yaml from 'js-yaml';
import request from '@/utils/request';
import { useAppStore } from '@/stores/appStore';
import { wordLogger } from '@/utils/logger';
import { hideWordAppMetadataInYaml } from '@/utils/wordMetadata';
import type { DbListMeta, WordRecord } from '@/types/word-list';
import type {
  WordEditorSessionContext,
  WordEditorSessionSnapshot,
} from '@/modules/wordEditor/session';

interface SaveConflictResult {
  status: 'conflict';
  id?: string | number;
  lemma?: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  diff?: unknown[];
  [key: string]: unknown;
}

interface SaveWordOptions {
  sourceJobId?: string | null;
}

interface WordSaveProvenance {
  sourceJobId: string | null;
  syncMarkerUpdated: boolean;
  syncMarkerStatus: 'updated' | 'not-found' | 'word-not-found' | 'skipped';
  shouldRefreshWorkset: boolean;
  provenanceWarning?: 'source-job-not-found' | 'word-not-found';
}

interface WordStoreState {
  dbRecords: WordRecord[];
  dbListMeta: DbListMeta;
  editorSession: WordEditorSessionSnapshot;
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
  sort: 'updated-newest',
});

const defaultEditorSession = (): WordEditorSessionSnapshot => ({
  yaml: '',
  reloadToken: 0,
  context: {
    id: null,
    wordSchemaVersion: null,
    isLatestSchema: null,
  },
});

export const useWordStore = defineStore('word', {
  state: (): WordStoreState => ({
    dbRecords: [],
    dbListMeta: defaultDbListMeta(),
    editorSession: defaultEditorSession(),
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

    async saveWord(
      yamlContent: string,
      force = false,
      options: SaveWordOptions = {}
    ): Promise<boolean | SaveConflictResult> {
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
          {
            yaml: yamlContent,
            forceUpdate: !!force,
            sourceJobId: options.sourceJobId ?? this.editorSession.context.sourceJobId ?? undefined,
          },
          { skipErrorToast: true }
        );

        if (res && res.error) {
          wordLogger.error('Save failed', { lemma, error: res.error });
          if (typeof res.yaml === 'string' && res.changed) {
            this.updateEditorYaml(res.yaml);
            appStore.addToast('Format repaired, but save still has validation errors.', 'warning');
          }
          appStore.addToast(`Save failed: ${res.error}`, 'error');
          return false;
        }
        if (res && res.status === 'conflict') {
          if (typeof res.yaml === 'string' && res.changed) {
            this.updateEditorYaml(res.yaml);
            appStore.addToast('Format repaired before conflict review.', 'info');
          }
          wordLogger.warn('Save conflict detected', { lemma: res.lemma, diff: res.diff });
          return { ...(res as object) } as SaveConflictResult;
        }
        if (res && res.success) {
          const provenance = res.provenance as WordSaveProvenance | undefined;
          if (typeof res.yaml === 'string' && res.changed) {
            this.updateEditorYaml(res.yaml);
            appStore.addToast('Format repaired before save.', 'info');
          }
          wordLogger.success(`Word "${res.lemma}" saved`, {
            id: res.id,
            lemma: res.lemma,
            status: res.status,
            provenance,
          });
          appStore.addToast(`Word "${res.lemma}" saved!`, 'success');
          if (
            provenance?.sourceJobId &&
            provenance.syncMarkerUpdated === false &&
            provenance.syncMarkerStatus !== 'skipped'
          ) {
            appStore.addToast(
              `Saved, but Queue status did not sync (${provenance.syncMarkerStatus}).`,
              'warning',
              3000
            );
          }
          void this.fetchDbRecords({ background: true });
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('ad-fontes:word-saved', {
                detail: { id: res.id, lemma: res.lemma, status: res.status, provenance },
              })
            );
          }
          this.updateEditorSessionContext(
            res.status === 'created'
              ? { id: null, wordSchemaVersion: null, isLatestSchema: null, sourceJobId: null }
              : { id: res.id ?? null, sourceJobId: null }
          );
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

    async deleteWords(ids: Array<string | number>): Promise<void> {
      const appStore = useAppStore();
      const uniqueIds = [...new Set(ids.map(id => String(id)).filter(Boolean))];
      if (!uniqueIds.length) return;

      wordLogger.debug('Deleting words...', { count: uniqueIds.length, ids: uniqueIds });
      try {
        await Promise.all(
          uniqueIds.map(id => request.delete(`/v2/words/${id}`, { skipErrorToast: true }))
        );
        wordLogger.success('Words deleted', { count: uniqueIds.length });
        appStore.addToast(`Deleted ${uniqueIds.length} words`, 'success');
        await this.fetchDbRecords();
      } catch (e) {
        wordLogger.error('Delete words failed', {
          count: uniqueIds.length,
          error: (e as HttpErrorLike)?.message,
        });
        appStore.addToast('Batch delete failed', 'error');
      }
    },

    loadEditorSession({
      yaml: yamlContent,
      context = {},
    }: {
      yaml: string;
      context?: WordEditorSessionContext;
    }): void {
      this.editorSession = {
        yaml: hideWordAppMetadataInYaml(yamlContent),
        reloadToken: this.editorSession.reloadToken + 1,
        context: {
          id: context.id ?? null,
          wordSchemaVersion: context.wordSchemaVersion ?? null,
          isLatestSchema: context.isLatestSchema ?? null,
          sourceJobId: context.sourceJobId ?? null,
        },
      };
    },

    updateEditorYaml(yamlContent: string): void {
      this.editorSession = {
        ...this.editorSession,
        yaml: hideWordAppMetadataInYaml(yamlContent),
        reloadToken: this.editorSession.reloadToken + 1,
      };
    },

    updateEditorSessionContext(context: WordEditorSessionContext): void {
      this.editorSession = {
        ...this.editorSession,
        context: {
          ...this.editorSession.context,
          ...context,
        },
      };
    },
  },
});
