import { computed, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import type {
  LocalSyncItem,
  SyncAction,
  SyncActionMap,
  SyncCheckItem,
  SyncConflict,
} from '@/types/word-list';

interface WordStoreLike {
  syncCheck: (items: LocalSyncItem[]) => Promise<SyncCheckItem[]>;
  syncExecute: (
    items: LocalSyncItem[],
    forceUpdate: boolean
  ) => Promise<{ success?: number; failed?: number }>;
  checkConnection: () => Promise<void>;
  setEditorYaml: (yaml: string) => void;
  setEditingContext: (context: { id: string | null; isLocal: boolean }) => void;
}

interface AppStoreLike {
  addToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

interface UseWordSyncParams {
  wordStore: WordStoreLike;
  appStore: AppStoreLike;
  isBackendConnected: ComputedRef<boolean>;
  localSyncItems: ComputedRef<LocalSyncItem[]>;
  refresh: () => Promise<void>;
  closeMenu: () => void;
  formatYamlForEditor: (yamlObj: unknown) => string;
  loadDbRecordByLemma: (lemma: string | undefined) => Promise<boolean>;
}

interface UseWordSyncResult {
  syncAllOpen: Ref<boolean>;
  syncAllLoading: Ref<boolean>;
  syncChecks: Ref<SyncCheckItem[]>;
  syncActions: Ref<SyncActionMap>;
  syncConflict: Ref<SyncConflict | null>;
  syncConflictTitle: ComputedRef<string>;
  openSyncAll: () => Promise<void>;
  closeSyncAll: () => void;
  setBatchAction: (id: string, action: SyncAction) => void;
  executeBatchSync: () => Promise<void>;
  syncOne: (id: string) => Promise<void>;
  closeSyncConflict: () => void;
  editLocalFromSyncConflict: () => void;
  overwriteSyncConflict: () => Promise<void>;
}

export const useWordSync = ({
  wordStore,
  appStore,
  isBackendConnected,
  localSyncItems,
  refresh,
  closeMenu,
  formatYamlForEditor,
  loadDbRecordByLemma,
}: UseWordSyncParams): UseWordSyncResult => {
  const syncAllOpen = ref(false);
  const syncAllLoading = ref(false);
  const syncChecks = ref<SyncCheckItem[]>([]);
  const syncActions = ref<SyncActionMap>({});
  const syncConflict = ref<SyncConflict | null>(null);

  const syncConflictTitle = computed(() =>
    syncConflict.value ? `Conflict: ${syncConflict.value.lemma || ''}` : 'Conflict'
  );

  const closeSyncConflict = () => {
    syncConflict.value = null;
  };

  const closeSyncAll = () => {
    syncAllOpen.value = false;
    syncChecks.value = [];
    syncActions.value = {};
  };

  const setBatchAction = (id: string, action: SyncAction) => {
    syncActions.value = { ...syncActions.value, [id]: action };
  };

  const runBatchSyncDirect = async () => {
    const res = await wordStore.syncExecute(localSyncItems.value, false);
    if (res && (Number(res.success || 0) > 0 || Number(res.failed || 0) === 0)) {
      appStore.addToast(`Synced ${res.success || 0} items`, 'success');
      await refresh();
    } else {
      appStore.addToast('Sync failed', 'error');
    }
  };

  const openSyncAll = async () => {
    if (!isBackendConnected.value) {
      appStore.addToast('Backend disconnected', 'warning');
      return;
    }
    if (!localSyncItems.value.length) return;

    syncAllLoading.value = true;
    try {
      const checks = await wordStore.syncCheck(localSyncItems.value);
      syncChecks.value = checks || [];

      const nextActions: SyncActionMap = {};
      for (const c of syncChecks.value) {
        if (c.status === 'conflict') nextActions[c.id] = 'skip';
      }
      syncActions.value = nextActions;

      const hasConflict = syncChecks.value.some(c => c.status === 'conflict');
      if (!hasConflict) {
        await runBatchSyncDirect();
        return;
      }
      syncAllOpen.value = true;
    } catch {
      await wordStore.checkConnection();
      appStore.addToast('Sync check failed (database offline)', 'error');
    } finally {
      syncAllLoading.value = false;
    }
  };

  const executeBatchSync = async () => {
    if (!syncChecks.value.length) {
      closeSyncAll();
      return;
    }

    const conflicts = syncChecks.value.filter(c => c.status === 'conflict');
    const nonConflicts = syncChecks.value.filter(c => c.status !== 'conflict');

    const normalItems = nonConflicts
      .map(c => localSyncItems.value.find(i => i.id === c.id))
      .filter((i): i is LocalSyncItem => !!i);

    const forcedItems = conflicts
      .filter(c => syncActions.value[c.id] === 'overwrite')
      .map(c => localSyncItems.value.find(i => i.id === c.id))
      .filter((i): i is LocalSyncItem => !!i);

    syncAllLoading.value = true;
    try {
      if (normalItems.length) await wordStore.syncExecute(normalItems, false);
      if (forcedItems.length) await wordStore.syncExecute(forcedItems, true);
      appStore.addToast('Batch sync completed', 'success');
      closeSyncAll();
      await refresh();
    } catch {
      await wordStore.checkConnection();
      appStore.addToast('Batch sync failed (database offline)', 'error');
    } finally {
      syncAllLoading.value = false;
    }
  };

  const syncOne = async (id: string) => {
    if (!isBackendConnected.value) {
      appStore.addToast('Backend disconnected', 'warning');
      return;
    }
    const item = localSyncItems.value.find(i => i.id === id);
    if (!item) return;

    syncAllLoading.value = true;
    try {
      const checks = await wordStore.syncCheck([item]);
      const check = Array.isArray(checks) ? checks[0] : null;
      if (!check) return;
      if (check.status === 'conflict') {
        syncConflict.value = check as SyncConflict;
        return;
      }
      const res = await wordStore.syncExecute([item], false);
      if (res && Number(res.success || 0) > 0) {
        appStore.addToast('Synced 1 item', 'success');
        await refresh();
      } else {
        appStore.addToast('Sync failed', 'error');
      }
    } catch {
      await wordStore.checkConnection();
      appStore.addToast('Sync failed (database offline)', 'error');
    } finally {
      syncAllLoading.value = false;
      closeMenu();
    }
  };

  const editLocalFromSyncConflict = () => {
    if (!syncConflict.value) return;
    if (syncConflict.value.newData) {
      wordStore.setEditorYaml(formatYamlForEditor(syncConflict.value.newData));
      wordStore.setEditingContext({ id: syncConflict.value.id, isLocal: true });
    }
    closeSyncConflict();
  };

  const overwriteSyncConflict = async () => {
    if (!syncConflict.value) return;
    const conflict = syncConflict.value;
    const item = localSyncItems.value.find(i => i.id === conflict.id);
    if (!item) return;

    syncAllLoading.value = true;
    try {
      const res = await wordStore.syncExecute([item], true);
      if (res && Number(res.success || 0) > 0) {
        appStore.addToast('Synced (overwrite)', 'success');
        await refresh();
        const lemma = (conflict.newData?.yield as { lemma?: string } | undefined)?.lemma;
        const loaded = await loadDbRecordByLemma(lemma);
        if (!loaded && conflict.newData) {
          wordStore.setEditorYaml(formatYamlForEditor(conflict.newData));
          wordStore.setEditingContext({ id: null, isLocal: false });
        }
      } else {
        appStore.addToast('Sync failed', 'error');
      }
      closeSyncConflict();
    } catch {
      await wordStore.checkConnection();
      appStore.addToast('Sync failed (database offline)', 'error');
    } finally {
      syncAllLoading.value = false;
    }
  };

  return {
    syncAllOpen,
    syncAllLoading,
    syncChecks,
    syncActions,
    syncConflict,
    syncConflictTitle,
    openSyncAll,
    closeSyncAll,
    setBatchAction,
    executeBatchSync,
    syncOne,
    closeSyncConflict,
    editLocalFromSyncConflict,
    overwriteSyncConflict,
  };
};
