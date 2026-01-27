import { post, get } from '../api.js';
import { store, updateState } from '../state.js';
import { refreshRecords, loadRecords } from './list.js';
import { saveData, loadIntoEditor } from './editor.js';
import { updateSaveBtn } from './editor.js';
import { renderDiffSummary } from './ui-render.js';
import { notify } from './toast.js';

// Connection Status
export async function checkConnection() {
    const dot = document.getElementById('connStatusDot');
    
    try {
        const data = await get('/status');
        updateState('dbConnected', data.connected);
        
        if (store.dbConnected) {
            dot.classList.remove('bg-red-500');
            dot.classList.add('bg-green-500');
        } else {
            dot.classList.remove('bg-green-500');
            dot.classList.add('bg-red-500');
        }
    } catch (e) {
        updateState('dbConnected', false);
        dot.classList.remove('bg-green-500');
        dot.classList.add('bg-red-500');
    }
    updateSaveBtn();
}

export async function testConnection() {
    const dbUrl = document.getElementById('modalDbUrl').value;
    const statusEl = document.getElementById('testStatus');
    statusEl.textContent = 'Testing...';
    
    try {
        const res = await fetch('/api/status', {
            headers: { 'x-db-url': dbUrl }
        });
        const data = await res.json();
        if (data.connected) {
            statusEl.innerHTML = '<span class="text-green-600 font-bold">Success</span>';
        } else {
            statusEl.innerHTML = `<span class="text-red-600 font-bold">Failed: ${data.error}</span>`;
        }
    } catch (e) {
        statusEl.innerHTML = '<span class="text-red-600 font-bold">Error</span>';
    }
}


// Sync Logic
export async function syncOne(id) {
    updateState('currentLocalId', id);
    const item = store.localRecords.find(r => r.id === id);
    if(!item) return;

    // Update UI state
    // We assume the button has onclick="syncOne('id')"
    const btn = document.querySelector(`button[onclick="window.syncOne('${id}')"]`);
    if(btn) btn.textContent = '...';

    try {
        // 1. Check first (no force)
        const checkRes = await post('/sync/check', { items: [item] });
        const check = checkRes.data[0];

        if (check.status === 'conflict') {
            showConflictModal(check);
            if(btn) btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M5.5 13a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 13H11V9.413l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13H5.5z" /><path d="M9 13h2v5a1 1 0 11-2 0v-5z" /></svg>';
            return; 
        }

        // 2. Execute directly if no conflict
        await executeSyncOne(item, false);

    } catch (e) {
        notify.error(e.message ? `Sync Error: ${e.message}` : 'Sync Error');
        if(btn) btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M5.5 13a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 13H11V9.413l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13H5.5z" /><path d="M9 13h2v5a1 1 0 11-2 0v-5z" /></svg>';
    }
}

export async function executeSyncOne(item, forceUpdate) {
    const res = await post('/sync/execute', { items: [item], forceUpdate });
    const data = res.data;
    if(data.success > 0) {
        // Refresh both lists
        // Since loadRecords calls /local and /words, we just need to call it once
        // But loadLocalRecords is alias for loadRecords.
        refreshRecords();
    } else {
        throw new Error(data.errors?.[0]?.error || 'Sync failed');
    }
}

export async function syncAll() {
    if (!store.dbConnected) {
        notify.warning('Database offline');
        return;
    }
    if (store.localRecords.length === 0) return;
    
    const btn = document.getElementById('syncAllBtn');
    const originalText = btn.textContent;
    btn.textContent = 'Checking...';
    btn.disabled = true;

    try {
        // 1. Check all
        const checkRes = await post('/sync/check', { items: store.localRecords });
        const checks = checkRes.data;
        
        const conflicts = checks.filter(c => c.status === 'conflict');
        
        if (conflicts.length > 0) {
            showBatchModal(checks);
        } else {
            // No conflicts, proceed directly
            await executeBatchSyncDirect(store.localRecords);
        }

    } catch (e) {
        notify.error(e.message ? `Sync Check Failed: ${e.message}` : 'Sync Check Failed');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}


// Conflict Modal Logic
let conflictOldData = null;

export function showConflictModal(data) {
    const modal = document.getElementById('conflictModal');
    const diffOld = document.getElementById('diffOld');
    const diffNew = document.getElementById('diffNew');
    const summary = document.getElementById('diffSummary');
    
    conflictOldData = data.oldData; 

    // Render version
    document.getElementById('oldVer').textContent = 'unknown'; 

    // 1. Render Summary Badges
    summary.innerHTML = renderDiffSummary(data.diff);

    // 2. Render Side-by-Side Diff
    diffOld.textContent = jsyaml.dump(data.oldData);
    diffNew.textContent = jsyaml.dump(data.newData);

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

export function closeModal() {
    document.getElementById('conflictModal').classList.add('hidden');
    document.getElementById('conflictModal').classList.remove('flex');
}

export function resolveConflict(overwrite) {
    closeModal();
    
    if (store.currentLocalId) {
         // We are in Sync Single Mode
         if (overwrite) {
             const item = store.localRecords.find(r => r.id === store.currentLocalId);
             if (item) {
                executeSyncOne(item, true).finally(() => {
                    updateState('currentLocalId', null);
                });
             }
         } else {
             updateState('currentLocalId', null);
         }
    } else {
         // Standard Save Mode
        if (overwrite) {
            saveData(true);
        } else {
            // User wants to KEEP DB version
            if (conflictOldData) {
                loadIntoEditor(conflictOldData);
                notify.info('Reverted editor to database version');
            }
        }
    }
}


// Batch Modal Logic
let batchCheckResults = [];

export function showBatchModal(checks) {
    batchCheckResults = checks;
    const modal = document.getElementById('batchConflictModal');
    const list = document.getElementById('batchList');
    const summary = document.getElementById('batchSummaryText');
    
    const conflicts = checks.filter(c => c.status === 'conflict');
    summary.textContent = `Found ${conflicts.length} conflicts among ${checks.length} items`;

    list.innerHTML = '';
    checks.forEach(item => {
        const isConflict = item.status === 'conflict';
        const div = document.createElement('div');
        div.className = `p-4 rounded-lg border ${isConflict ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-200'} flex justify-between items-center`;
        
        const diffHtml = renderDiffSummary(item.diff);

        div.innerHTML = `
            <div class="flex-1">
                <div class="flex items-center gap-2">
                    <span class="font-bold text-slate-700">${item.lemma || 'Unknown'}</span>
                    ${isConflict ? '<span class="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">Conflict</span>' : '<span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Ready</span>'}
                </div>
                ${isConflict ? `<div class="mt-1 text-sm text-slate-500 flex flex-wrap gap-1">Changes: ${diffHtml}</div>` : ''}
            </div>
            
            ${isConflict ? `
                <div class="flex items-center gap-3">
                    <label class="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                        <input type="radio" name="action_${item.id}" value="skip" checked class="text-primary">
                        Skip
                    </label>
                    <label class="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                        <input type="radio" name="action_${item.id}" value="overwrite" class="text-red-500 focus:ring-red-500">
                        Overwrite
                    </label>
                </div>
            ` : `
                <span class="text-xs text-green-600 font-medium">Will Sync</span>
            `}
        `;
        list.appendChild(div);
    });

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

export function closeBatchModal() {
    const modal = document.getElementById('batchConflictModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

export function batchSetAction(action) { 
    const radios = document.querySelectorAll(`input[type="radio"][value="${action}"]`);
    radios.forEach(r => r.checked = true);
}

export async function executeBatchSync() {
    const toSync = []; 
    const conflicts = batchCheckResults.filter(c => c.status === 'conflict');
    const nonConflicts = batchCheckResults.filter(c => c.status !== 'conflict');

    nonConflicts.forEach(c => {
         const rawItem = store.localRecords.find(r => r.id === c.id);
         if(rawItem) toSync.push({ item: rawItem, force: false });
    });

    conflicts.forEach(c => {
        const action = document.querySelector(`input[name="action_${c.id}"]:checked`)?.value;
        if (action === 'overwrite') {
            const rawItem = store.localRecords.find(r => r.id === c.id);
            if(rawItem) toSync.push({ item: rawItem, force: true });
        }
    });

    if (toSync.length === 0) {
        closeBatchModal();
        return;
    }

    const forcedItems = toSync.filter(x => x.force).map(x => x.item);
    const normalItems = toSync.filter(x => !x.force).map(x => x.item);

    closeBatchModal();
    const btn = document.getElementById('syncAllBtn');
    btn.textContent = 'Syncing...';
    btn.disabled = true;

    try {
        if (normalItems.length > 0) {
            await post('/sync/execute', { items: normalItems, forceUpdate: false });
        }
        if (forcedItems.length > 0) {
            await post('/sync/execute', { items: forcedItems, forceUpdate: true });
        }
        
        notify.success('Batch Sync Completed');
        refreshRecords();

    } catch (e) {
        notify.error(e.message ? `Batch Sync Error: ${e.message}` : 'Batch Sync Error');
    } finally {
        btn.textContent = `Sync All (${store.localRecords.length})`;
        btn.disabled = false;
    }
}

export async function executeBatchSyncDirect(items) {
     const res = await post('/sync/execute', { items, forceUpdate: false });
     const data = res.data;
    if(data.success > 0 || data.failed === 0) {
        notify.success(`Synced ${data.success} items successfully`);
        refreshRecords();
    } else {
        notify.error(`Sync failed. Success: ${data.success}, Failed: ${data.failed}`);
    }
}
