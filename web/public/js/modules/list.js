import { get, del } from '../api.js';
import { store, updateState } from '../state.js';
import { renderCard } from './ui-render.js';

// Load all records (Local + DB)
export async function loadRecords() {
    const list = document.getElementById('recordsList');
    
    try {
        // 1. Fetch Local
        const localItems = await get('/local');
        
        // 2. Fetch DB (if connected)
        let dbItems = [];
        if (store.dbConnected) {
            try {
                dbItems = await get('/words');
            } catch(e) {
                console.warn('DB fetch failed', e);
            }
        }

        // 3. Merge & Parse
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

        // Update Store
        updateState('localRecords', parsedLocal);
        updateState('allRecords', [...parsedLocal, ...dbItems]);

        // Initial Render
        filterAndSortRecords();

    } catch (e) {
        console.error(e);
        list.innerHTML = '<div class="text-center text-red-400 py-10">Failed to load records.</div>';
    }
}

// Filter, Sort and Paginate
export function filterAndSortRecords(resetPage = true) {
    const list = document.getElementById('recordsList');
    const syncBtn = document.getElementById('syncAllBtn');
    const searchVal = document.getElementById('searchInput').value.trim().toLowerCase();
    const sortVal = document.getElementById('sortSelect').value;

    // Reset page if needed
    if (resetPage) store.pagination.currentPage = 1;

    // 1. Filter
    let filtered = store.allRecords.filter(w => {
        if (!searchVal) return true;
        const lemma = (w.lemma || '').toLowerCase();
        return lemma.includes(searchVal);
    });

    // 2. Sort
    filtered.sort((a, b) => {
        const lemmaA = (a.lemma || '').toLowerCase();
        const lemmaB = (b.lemma || '').toLowerCase();
        const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
        const dateB = new Date(b.updated_at || b.created_at || 0).getTime();

        if (sortVal === 'az') return lemmaA.localeCompare(lemmaB);
        if (sortVal === 'za') return lemmaB.localeCompare(lemmaA);
        if (sortVal === 'newest') return dateB - dateA;
        if (sortVal === 'oldest') return dateA - dateB;
        return 0;
    });

    // 3. Paginate
    const { currentPage, pageSize } = store.pagination;
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    
    // Ensure current page is valid
    if (store.pagination.currentPage > totalPages) store.pagination.currentPage = totalPages;
    if (store.pagination.currentPage < 1) store.pagination.currentPage = 1;

    const startIndex = (store.pagination.currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const displayData = filtered.slice(startIndex, endIndex);

    // 4. Render
    if(displayData.length === 0) {
        list.innerHTML = '<div class="text-center text-slate-400 py-10">No records found.</div>';
    } else {
        list.innerHTML = displayData.map(w => renderCard(w, !w.isLocal)).join('');
    }

    // Update Pagination Controls
    document.getElementById('pageInfo').textContent = `Page ${store.pagination.currentPage} of ${totalPages} (${totalItems} items)`;
    document.getElementById('prevPageBtn').disabled = store.pagination.currentPage <= 1;
    document.getElementById('nextPageBtn').disabled = store.pagination.currentPage >= totalPages;

    // Sync Button Visibility
    if (store.localRecords.length > 0) {
        syncBtn.classList.remove('hidden');
        syncBtn.textContent = `Sync All (${store.localRecords.length})`;
    } else {
        syncBtn.classList.add('hidden');
    }
}

export function changePage(delta) {
    store.pagination.currentPage += delta;
    filterAndSortRecords(false);
}

export function updatePageSize() {
    const input = document.getElementById('pageSizeInput');
    let val = parseInt(input.value);
    if (val < 1) val = 1;
    if (val > 500) val = 500;
    store.pagination.pageSize = val;
    filterAndSortRecords(true);
}

export function refreshRecords() {
    document.getElementById('searchInput').value = ''; 
    loadRecords(); 
}

export async function deleteLocal(id) {
    if(!confirm('Delete local record?')) return;
    await del(`/local/${id}`);
    refreshRecords();
}

export async function deleteWord(id) {
    if(!store.dbConnected) return alert('Database offline');
    if(!confirm('Delete from database? This cannot be undone.')) return;
    await del(`/words/${id}`);
    refreshRecords();
}

export async function checkWord() {
    const word = document.getElementById('searchInput').value;
    if(!word) return;

    if (!store.dbConnected) {
        alert('Cannot search database while offline. Please check local records manually.');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/check?word=${encodeURIComponent(word)}`);
        const data = await res.json();
        
        if(data.found) {
            window.loadIntoEditor(data.data.original_yaml); // Assuming loadIntoEditor is global
            const list = document.getElementById('recordsList');
            list.innerHTML = renderCard(data.data, true); 
        } else {
            alert(`Word "${data.lemma}" not found in Database.`);
        }
    } catch (e) {
        console.error(e);
        alert('Search failed');
    }
}