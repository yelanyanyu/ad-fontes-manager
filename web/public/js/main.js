import { initResizer, updateNavState } from './utils.js';
import { loadRecords, filterAndSortRecords, applyListPrefsFromStorage, changePage, goToPage, updatePageSize, refreshRecords, deleteLocal, deleteWord, checkWord } from './modules/list.js';
import { loadIntoEditor, clearInput, togglePreview, saveData, updateSaveBtn, initEditorValidation } from './modules/editor.js';
import { checkConnection, testConnection, syncOne, syncAll, showConflictModal, closeModal, resolveConflict, showBatchModal, closeBatchModal, batchSetAction, executeBatchSync } from './modules/sync.js';
import { loadServerConfig, openSettings, closeSettings, saveSettings } from './modules/settings.js';
import { showPreviewPage, closePreviewPage } from './modules/preview.js';
import { get } from './api.js';
import { notify } from './modules/toast.js';
import { store } from './state.js';
import { clearListPrefs } from './modules/prefs.js';

// Mount global functions for HTML event handlers
window.loadRecords = loadRecords;
window.filterAndSortRecords = filterAndSortRecords;
window.applyListPrefsFromStorage = applyListPrefsFromStorage;
window.changePage = changePage;
window.goToPage = goToPage;
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

window.showPreviewPage = showPreviewPage;
window.closePreviewPage = closePreviewPage;

window.loadWordForEdit = async (id) => {
    try {
        const full = await get(`/words/${encodeURIComponent(id)}`);
        if (!full || !full.original_yaml) throw new Error('Missing YAML');
        window.loadIntoEditor(full.original_yaml, null);
        notify.success('Loaded');
    } catch (e) {
        const fallback = store.dbRecords?.find(r => r.id === id);
        if (fallback && fallback.original_yaml) {
            window.loadIntoEditor(fallback.original_yaml, null);
            notify.warning('Loaded (legacy)');
            return;
        }
        notify.error(e.message || 'Failed to load');
    }
};

window.resetListPrefs = () => {
    const ok = clearListPrefs();
    window.applyListPrefsFromStorage();
    window.filterAndSortRecords();
    if (ok) notify.success('List preferences reset');
    else notify.warning('Local storage unavailable; reset to defaults only');
};

// UI Helpers
window.toggleCardMenu = (id) => {
    const menu = document.getElementById(`menu-${id}`);
    if (!menu) return;
    
    const isHidden = menu.classList.contains('hidden');
    
    // Close all others
    document.querySelectorAll('[id^="menu-"]').forEach(el => el.classList.add('hidden'));
    
    if (isHidden) {
        menu.classList.remove('hidden');
    }
};

window.toggleRowMenu = (menuId) => {
    const menu = document.getElementById(menuId);
    if (!menu) return;

    const isHidden = menu.classList.contains('hidden');
    document.querySelectorAll('[id^="more-"]').forEach(el => el.classList.add('hidden'));

    if (isHidden) {
        menu.classList.remove('hidden');
    }
};

window.toggleSidebar = () => {
    const sidebar = document.getElementById('sidebar');
    const label = document.getElementById('sidebarLabel');
    const isCollapsed = sidebar.classList.contains('w-16');
    
    if (isCollapsed) {
        sidebar.classList.remove('w-16');
        sidebar.classList.add('w-64');
        document.querySelectorAll('.sidebar-text').forEach(el => el.classList.remove('hidden'));
        document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('justify-center'));
    } else {
        sidebar.classList.add('w-16');
        sidebar.classList.remove('w-64');
        document.querySelectorAll('.sidebar-text').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.sidebar-item').forEach(el => el.classList.add('justify-center'));
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    updateNavState();
    initResizer('dragHandle', 'leftPanel', 'mainContainer');
    
    // Close menus on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.relative')) {
             document.querySelectorAll('[id^="menu-"]').forEach(el => el.classList.add('hidden'));
             document.querySelectorAll('[id^="more-"]').forEach(el => el.classList.add('hidden'));
        }
    });

    // Handle History (Back Button)
    window.addEventListener('popstate', (event) => {
        if (event.state && event.state.page === 'preview') {
            showPreviewPage(event.state.id);
        } else {
            closePreviewPage();
        }
    });
    
    // Load config from server first
    await loadServerConfig();
    await checkConnection();
    applyListPrefsFromStorage();
    await loadRecords();
    
    // Init Validation
    initEditorValidation();
});
