import { get, del } from '../api.js';
import { store, updateState } from '../state.js';
import { notify } from './toast.js';
import { confirmAction } from './confirm.js';
import { debugGroup, debugLog } from './debug-log.js';
import { renderDataTable } from './data-table.js';
import { loadListPrefs, saveListPrefs, clearListPrefs } from './prefs.js';
import { filterSortWords } from './list-sort.js';

let dbFetchTimer = null;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_SORT = 'newest';

export function applyListPrefsFromStorage() {
    const prefs = loadListPrefs({ pageSize: DEFAULT_PAGE_SIZE, sort: DEFAULT_SORT });
    const pageSizeInput = document.getElementById('pageSizeInput');
    const sortSelect = document.getElementById('sortSelect');

    if (pageSizeInput) pageSizeInput.value = String(prefs.pageSize);
    if (sortSelect) sortSelect.value = prefs.sort;

    updateState('dbListMeta', { ...store.dbListMeta, limit: prefs.pageSize, sort: prefs.sort });

    if (!prefs.storageAvailable) {
        notify.warning('Local storage unavailable; using defaults');
    }
}

function getPageItems(currentPage, totalPages) {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const items = [];
    const add = (v) => items.push(v);

    add(1);

    const left = Math.max(2, currentPage - 1);
    const right = Math.min(totalPages - 1, currentPage + 1);

    if (left > 2) add('…');

    for (let p = left; p <= right; p++) add(p);

    if (right < totalPages - 1) add('…');

    add(totalPages);

    return items;
}

function renderPaginationNumbers(currentPage, totalPages) {
    const root = document.getElementById('pageNumbers');
    if (!root) return;

    const items = getPageItems(currentPage, totalPages);
    root.innerHTML = items.map((it) => {
        if (it === '…') {
            return `<span class="px-2 text-slate-400 select-none">…</span>`;
        }

        const isActive = it === currentPage;
        const base = 'min-w-8 px-2 py-1.5 rounded border text-xs font-bold transition-colors';
        const active = 'bg-primary text-white border-primary cursor-default';
        const idle = 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50';
        return `<button onclick="goToPage(${it})" class="${base} ${isActive ? active : idle}" aria-label="Page ${it}" ${isActive ? 'aria-current="page" disabled' : ''}>${it}</button>`;
    }).join('');
}

export async function loadRecords() {
    const list = document.getElementById('recordsList');
    const end = debugGroup('ListLazyLoad', 'mount.loadRecords()', { dbConnected: store.dbConnected });
    
    try {
        debugLog('ListLazyLoad', 'local.fetch.start');
        const localItems = await get('/local');
        debugLog('ListLazyLoad', 'local.fetch.ok', { count: Array.isArray(localItems) ? localItems.length : 0 });
        
        const parsedLocal = localItems.map(item => {
            try {
                const parsed = jsyaml.load(item.raw_yaml);
                return {
                    ...item, // keep local ID
                    isLocal: true,
                    lemma: parsed.yield?.lemma || 'Unknown',
                    part_of_speech: parsed.yield?.part_of_speech || '-',
                    syllabification: parsed.yield?.syllabification || '-',
                    contextual_meaning_en: parsed.yield?.contextual_meaning?.en,
                    original_yaml: parsed
                };
            } catch (e) {
                return { ...item, isLocal: true, lemma: 'Invalid YAML', original_yaml: {} };
            }
        });

        updateState('localRecords', parsedLocal);
        updateState('dbRecords', []);
        updateState('dbListMeta', { ...store.dbListMeta, page: 1, total: 0, totalPages: 1 });

        if (store.dbConnected) {
            debugLog('ListLazyLoad', 'db.page.fetch.start', { page: 1 });
            await loadDbPage(1);
        }

        debugLog('ListLazyLoad', 'render.start');
        renderList();
        debugLog('ListLazyLoad', 'render.done', { local: store.localRecords.length, db: store.dbRecords.length });

    } catch (e) {
        console.error(e);
        list.innerHTML = '<div class="text-center text-red-400 py-10">Failed to load records.</div>';
        debugLog('ListLazyLoad', 'mount.error', { message: e?.message });
    } finally {
        end();
    }
}

async function loadDbPage(page) {
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
    const pageSizeInput = document.getElementById('pageSizeInput');

    const search = (searchInput?.value || '').trim();
    const sort = (sortSelect?.value || 'newest').trim();
    const limitRaw = parseInt(pageSizeInput?.value || store.dbListMeta.limit || 20, 10) || 20;
    const limit = Math.min(200, Math.max(1, limitRaw));

    const q = new URLSearchParams();
    q.set('page', String(page));
    q.set('limit', String(limit));
    if (search) q.set('search', search);
    if (sort) q.set('sort', sort);

    const syncBtn = document.getElementById('syncAllBtn');
    try {
        debugLog('ListLazyLoad', 'db.fetch.start', { page, limit, search, sort });
        const res = await get(`/words?${q.toString()}`);

        if (Array.isArray(res)) {
            const filtered = filterSortWords(res, search, sort);
            const total = filtered.length;
            const totalPages = Math.max(1, Math.ceil(total / limit) || 1);
            const safePage = Math.max(1, Math.min(totalPages, page));
            const start = (safePage - 1) * limit;
            const end = start + limit;

            updateState('dbRecords', filtered.slice(start, end));
            updateState('dbListMeta', {
                ...store.dbListMeta,
                page: safePage,
                limit,
                total,
                totalPages,
                search,
                sort
            });
            debugLog('ListLazyLoad', 'db.fetch.ok.legacy', { page: safePage, total, totalPages, returned: store.dbRecords.length });
        } else {
            updateState('dbRecords', res.items || []);
            updateState('dbListMeta', {
                ...store.dbListMeta,
                page: res.page || page,
                limit: res.limit || limit,
                total: res.total || 0,
                totalPages: res.totalPages || 1,
                search,
                sort
            });
            debugLog('ListLazyLoad', 'db.fetch.ok', { page: store.dbListMeta.page, total: store.dbListMeta.total, totalPages: store.dbListMeta.totalPages, returned: store.dbRecords.length });
        }

        if (store.localRecords.length > 0) {
            syncBtn.classList.remove('hidden');
            syncBtn.textContent = `Sync All (${store.localRecords.length})`;
        } else {
            syncBtn.classList.add('hidden');
        }
    } catch (e) {
        try {
            debugLog('ListLazyLoad', 'db.fetch.fail.primary', { message: e?.message });
            const legacy = await get('/words');
            if (Array.isArray(legacy)) {
                const filtered = filterSortWords(legacy, search, sort);
                const total = filtered.length;
                const totalPages = Math.max(1, Math.ceil(total / limit) || 1);
                const safePage = Math.max(1, Math.min(totalPages, page));
                const start = (safePage - 1) * limit;
                const end = start + limit;

                updateState('dbRecords', filtered.slice(start, end));
                updateState('dbListMeta', {
                    ...store.dbListMeta,
                    page: safePage,
                    limit,
                    total,
                    totalPages,
                    search,
                    sort
                });
                notify.warning('DB paging fallback (legacy mode)');
                debugLog('ListLazyLoad', 'db.fetch.ok.fallback', { page: safePage, total, totalPages, returned: store.dbRecords.length });
                return;
            }
        } catch (_) {}

        updateState('dbRecords', []);
        updateState('dbListMeta', { ...store.dbListMeta, page: 1, total: 0, totalPages: 1, search, sort });
        notify.error(e.message || 'Failed to load database records');
        debugLog('ListLazyLoad', 'db.fetch.fail', { message: e?.message });
    }
}

function renderList() {
    const syncBtn = document.getElementById('syncAllBtn');
    const list = document.getElementById('recordsList');
    const searchVal = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
    const sortVal = (document.getElementById('sortSelect')?.value || 'newest').trim();

    const localVisible = filterSortWords(store.localRecords, searchVal, sortVal);

    const localRows = localVisible.map((w) => ({ ...w, source: 'offline' }));
    const dbRows = store.dbRecords.map((w) => ({ ...w, source: 'db' }));
    const rows = [...localRows, ...dbRows];

    const actionButtons = (w) => {
        const preview = `window.showPreviewPage('${w.id}')`;
        const edit = w.source === 'offline'
            ? `window.loadIntoEditor(${JSON.stringify(w.original_yaml || {}).replace(/"/g, '&quot;')}, '${w.id}')`
            : `window.loadWordForEdit('${w.id}')`;
        const delAct = w.source === 'offline' ? `window.deleteLocal('${w.id}')` : `window.deleteWord('${w.id}')`;
        const exportAct = `window.exportWord && window.exportWord('${w.id}')`;
        const syncAct = `window.syncOne('${w.id}')`;

        const iconBtn = (onClick, label, iconClass) => `
            <button onclick="${onClick}" class="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30" aria-label="${label}" title="${label}">
                <i class="${iconClass}"></i>
            </button>
        `;

        const moreId = `more-${w.id}`;

        const moreMenuItems = [
            w.source === 'offline'
                ? `<button onclick="${syncAct}; window.toggleRowMenu('${moreId}')" class="w-full text-left px-3 py-2 text-sm text-amber-700 hover:bg-amber-50 flex items-center gap-2"><i class="fa-solid fa-cloud-arrow-up text-amber-500"></i>Sync</button>`
                : '',
            `<button onclick="${exportAct}; window.toggleRowMenu('${moreId}')" class="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"><i class="fa-solid fa-file-export text-slate-400"></i>Export</button>`,
            `<div class="h-px bg-slate-100 my-1"></div>`,
            `<button onclick="${delAct}; window.toggleRowMenu('${moreId}')" class="w-full text-left px-3 py-2 text-sm text-rose-700 hover:bg-rose-50 flex items-center gap-2"><i class="fa-solid fa-trash text-rose-500"></i>Delete</button>`
        ].filter(Boolean).join('');

        return `
            <div class="flex items-center justify-end gap-2 w-[140px]">
                ${iconBtn(preview, 'Preview', 'fa-solid fa-eye')}
                ${iconBtn(edit, 'Edit', 'fa-solid fa-pen')}
                <div class="relative">
                    <button onclick="window.toggleRowMenu('${moreId}')" class="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30" aria-label="More" title="More">
                        <i class="fa-solid fa-ellipsis"></i>
                    </button>
                    <div id="${moreId}" class="hidden absolute right-0 mt-2 w-40 bg-white rounded-xl shadow-lg border border-slate-200 z-30 py-1">
                        ${moreMenuItems}
                    </div>
                </div>
            </div>
        `;
    };

    const html = renderDataTable({
        tableLabel: 'Words list',
        emptyText: 'No records found.',
        getRowId: (r) => r.id,
        rows,
        columns: [
            {
                key: 'source',
                title: 'Src',
                widthClass: 'w-24',
                cellClass: 'whitespace-nowrap',
                render: (r) => r.source === 'offline'
                    ? '<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-bold"><i class="fa-solid fa-laptop"></i>Local</span>'
                    : '<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold"><i class="fa-solid fa-cloud"></i>DB</span>'
            },
            { key: 'lemma', title: 'Lemma', widthClass: 'min-w-[220px]', cellClass: 'font-bold text-slate-900' },
            {
                key: 'actions',
                title: '',
                alignClass: 'text-right',
                widthClass: 'w-[160px]',
                headerClass: 'text-right',
                render: (r) => actionButtons(r)
            }
        ]
    });

    list.innerHTML = html;

    const meta = store.dbListMeta;
    const dbLabel = store.dbConnected ? `DB Page ${meta.page} of ${meta.totalPages} (${meta.total} items)` : 'DB Offline';
    document.getElementById('pageInfo').textContent = localVisible.length ? `Local ${localVisible.length} • ${dbLabel}` : dbLabel;
    document.getElementById('prevPageBtn').disabled = !store.dbConnected || meta.page <= 1;
    document.getElementById('nextPageBtn').disabled = !store.dbConnected || meta.page >= meta.totalPages;
    renderPaginationNumbers(meta.page, meta.totalPages);

    if (store.localRecords.length > 0) {
        syncBtn.classList.remove('hidden');
        syncBtn.textContent = `Sync All (${store.localRecords.length})`;
    } else {
        syncBtn.classList.add('hidden');
    }

    const countBadge = document.getElementById('totalCountBadge');
    if (countBadge) {
        const totalCount = store.dbConnected ? (store.dbListMeta.total || 0) : store.localRecords.length;
        countBadge.textContent = `${totalCount} words`;
        countBadge.classList.remove('hidden');
    }
}

export function filterAndSortRecords() {
    if (!store.dbConnected) {
        renderList();
        return;
    }

    const pageSizeInput = document.getElementById('pageSizeInput');
    const sortSelect = document.getElementById('sortSelect');
    const pageSize = Math.max(1, Math.min(500, parseInt(pageSizeInput?.value || DEFAULT_PAGE_SIZE, 10) || DEFAULT_PAGE_SIZE));
    const sort = (sortSelect?.value || DEFAULT_SORT).trim();
    saveListPrefs({ pageSize, sort });

    if (dbFetchTimer) window.clearTimeout(dbFetchTimer);
    dbFetchTimer = window.setTimeout(async () => {
        debugLog('ListLazyLoad', 'db.query.debounced', { page: 1 });
        await loadDbPage(1);
        renderList();
    }, 220);
}

export function changePage(delta) {
    if (!store.dbConnected) return;
    const next = store.dbListMeta.page + delta;
    goToPage(next);
}

export function goToPage(page) {
    if (!store.dbConnected) return;
    const next = Math.max(1, Math.min(store.dbListMeta.totalPages, Number(page)));
    if (!Number.isFinite(next)) return;
    debugLog('ListLazyLoad', 'db.page.change', { from: store.dbListMeta.page, to: next });
    loadDbPage(next).then(() => renderList());
}

export function updatePageSize() {
    if (!store.dbConnected) {
        renderList();
        return;
    }
    const input = document.getElementById('pageSizeInput');
    const val = Math.max(1, Math.min(500, parseInt(input?.value || DEFAULT_PAGE_SIZE, 10) || DEFAULT_PAGE_SIZE));
    saveListPrefs({ pageSize: val });
    goToPage(1);
}

export function refreshRecords() {
    document.getElementById('searchInput').value = ''; 
    loadRecords(); 
}

export async function deleteLocal(id) {
    const ok = await confirmAction({
        title: 'Delete local record?',
        message: 'This will remove the item from your offline cache.',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        tone: 'danger'
    });
    if (!ok) return;
    await del(`/local/${id}`);
    refreshRecords();
}

export async function deleteWord(id) {
    if (!store.dbConnected) {
        notify.warning('Database offline');
        return;
    }
    const ok = await confirmAction({
        title: 'Delete from database?',
        message: 'This cannot be undone.',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        tone: 'danger'
    });
    if (!ok) return;
    await del(`/words/${id}`);
    refreshRecords();
}

export async function checkWord() {
    const word = document.getElementById('searchInput').value;
    if(!word) return;

    if (!store.dbConnected) {
        notify.warning('Cannot search database while offline. Please check local records manually.');
        return;
    }

    try {
        const data = await get(`/check?word=${encodeURIComponent(word)}`);
        
        if(data.found) {
            window.loadIntoEditor(data.data.original_yaml);
            const list = document.getElementById('recordsList');
            list.innerHTML = renderCard(data.data, true);
        } else {
            notify.info(`Word "${data.lemma}" not found in Database.`);
        }
    } catch (e) {
        console.error(e);
        notify.error('Search failed');
    }
}
