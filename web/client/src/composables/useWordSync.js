import { computed, ref } from 'vue';

/**
 * WordList 同步逻辑（为 TS 迁移拆出稳定边界）
 * @param {Object} params
 * @param {Object} params.wordStore
 * @param {Object} params.appStore
 * @param {import('vue').ComputedRef<boolean>} params.isBackendConnected
 * @param {import('vue').ComputedRef<Array<{id:string,raw_yaml:string}>>} params.localSyncItems
 * @param {() => Promise<void>} params.refresh
 * @param {() => void} params.closeMenu
 * @param {(yamlObj: Object) => string} params.formatYamlForEditor
 * @param {(lemma: string) => Promise<boolean>} params.loadDbRecordByLemma
 */
export const useWordSync = ({
  wordStore,
  appStore,
  isBackendConnected,
  localSyncItems,
  refresh,
  closeMenu,
  formatYamlForEditor,
  loadDbRecordByLemma,
}) => {
  const syncAllOpen = ref(false);
  const syncAllLoading = ref(false);
  const syncChecks = ref([]);
  const syncActions = ref({});
  const syncConflict = ref(null);

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

  const setBatchAction = (id, action) => {
    syncActions.value = { ...syncActions.value, [id]: action };
  };

  const runBatchSyncDirect = async () => {
    const res = await wordStore.syncExecute(localSyncItems.value, false);
    if (res && (res.success > 0 || res.failed === 0)) {
      appStore.addToast(`Synced ${res.success} items`, 'success');
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

      const nextActions = {};
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
      .filter(Boolean);

    const forcedItems = conflicts
      .filter(c => syncActions.value[c.id] === 'overwrite')
      .map(c => localSyncItems.value.find(i => i.id === c.id))
      .filter(Boolean);

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

  const syncOne = async id => {
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
        syncConflict.value = check;
        return;
      }
      const res = await wordStore.syncExecute([item], false);
      if (res && res.success > 0) {
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
      if (res && res.success > 0) {
        appStore.addToast('Synced (overwrite)', 'success');
        await refresh();
        const lemma = conflict.newData?.yield?.lemma;
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
