import { initResizer, updateNavState } from './utils.js';
import { loadRecords, filterAndSortRecords, changePage, updatePageSize, refreshRecords, deleteLocal, deleteWord, checkWord } from './modules/list.js';
import { loadIntoEditor, clearInput, togglePreview, saveData, updateSaveBtn } from './modules/editor.js';
import { checkConnection, testConnection, syncOne, syncAll, showConflictModal, closeModal, resolveConflict, showBatchModal, closeBatchModal, batchSetAction, executeBatchSync } from './modules/sync.js';
import { loadServerConfig, openSettings, closeSettings, saveSettings } from './modules/settings.js';

// Mount global functions for HTML event handlers
window.loadRecords = loadRecords;
window.filterAndSortRecords = filterAndSortRecords;
window.changePage = changePage;
window.updatePageSize = updatePageSize;
window.refreshRecords = refreshRecords;
window.deleteLocal = deleteLocal;
window.deleteWord = deleteWord;
window.checkWord = checkWord;

window.loadIntoEditor = loadIntoEditor;
window.clearInput = clearInput;
window.togglePreview = togglePreview;
window.saveData = saveData;
window.updateSaveBtn = updateSaveBtn;

window.checkConnection = checkConnection;
window.testConnection = testConnection;
window.syncOne = syncOne;
window.syncAll = syncAll;
window.showConflictModal = showConflictModal;
window.closeModal = closeModal;
window.resolveConflict = resolveConflict;
window.showBatchModal = showBatchModal;
window.closeBatchModal = closeBatchModal;
window.batchSetAction = batchSetAction;
window.executeBatchSync = executeBatchSync;

window.loadServerConfig = loadServerConfig;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.saveSettings = saveSettings;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    updateNavState();
    initResizer('dragHandle', 'leftPanel', 'mainContainer');
    
    // Load config from server first
    await loadServerConfig();
    await checkConnection();
    await loadRecords();
});