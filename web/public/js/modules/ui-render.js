// UI Rendering Helpers

export function renderCard(w, isSynced) {
    const syncIcon = isSynced 
        ? `<span class="text-green-500" title="Synced"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg></span>`
        : `<button onclick="window.syncOne('${w.id}')" class="text-yellow-500 hover:text-yellow-600" title="Sync to Cloud"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M5.5 13a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 13H11V9.413l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13H5.5z" /><path d="M9 13h2v5a1 1 0 11-2 0v-5z" /></svg></button>`;

    const deleteAction = isSynced
        ? `window.deleteWord('${w.id}')` // Delete from DB
        : `window.deleteLocal('${w.id}')`; // Delete from Local

    // Note: We use window.loadIntoEditor because it will be mounted globally
    const editBtn = `<button onclick="window.loadIntoEditor(${JSON.stringify(w.original_yaml || {}).replace(/"/g, '&quot;')}, ${w.isLocal ? `'${w.id}'` : 'null'})" class="text-slate-400 hover:text-primary transition-colors p-1" title="Edit">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
    </button>`;

    return `
        <div class="bg-white p-4 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow group relative">
            <div class="flex justify-between items-start">
                <div class="flex items-start gap-3">
                    <div class="mt-1">${syncIcon}</div>
                    <div>
                        <h3 class="font-bold text-lg text-slate-800 flex items-center gap-2">
                            ${w.lemma}
                            ${w.revision_count ? `<span class="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded border border-slate-200">v${w.revision_count}</span>` : ''}
                        </h3>
                        <p class="text-xs text-slate-500 font-mono mt-1">${w.part_of_speech} • ${w.syllabification}</p>
                    </div>
                </div>
                <div class="flex gap-1">
                    ${editBtn}
                    <button onclick="${deleteAction}" class="text-slate-300 hover:text-red-500 transition-colors p-1" title="Delete">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>
            <div class="mt-3 text-sm text-slate-600 line-clamp-2">
                ${w.contextual_meaning_en || 'No definition'}
            </div>
        </div>
    `;
}

export function renderPreview(data) {
    const container = document.getElementById('previewContent');
    const w = data.yield || {};
    // Basic HTML Card Render (Mimicking yml2html structure)
    container.innerHTML = `
        <div class="max-w-md mx-auto bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <div class="border-b pb-4 mb-4">
                <h1 class="text-3xl font-bold text-slate-900">${w.lemma || 'Title'}</h1>
                <div class="text-slate-500 font-mono text-sm mt-1 flex gap-2">
                    <span>${w.part_of_speech || 'POS'}</span>
                    <span>•</span>
                    <span>/${w.syllabification || '... '}/</span>
                </div>
            </div>
            <div class="space-y-4">
                <div>
                    <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Meaning</h3>
                    <p class="text-slate-800 font-medium">${w.contextual_meaning?.en || ''}</p>
                    <p class="text-slate-600 text-sm mt-1">${w.contextual_meaning?.zh || ''}</p>
                </div>
                ${w.other_common_meanings?.length ? `
                <div class="bg-slate-50 p-3 rounded text-sm">
                    <strong class="block text-xs text-slate-400 uppercase mb-1">Other Meanings</strong>
                    <ul class="list-disc pl-4 text-slate-600 space-y-1">
                        ${w.other_common_meanings.map(m => `<li>${m}</li>`).join('')}
                    </ul>
                </div>` : ''}
            </div>
        </div>
    `;
}

export function renderDiffSummary(diffs) {
    if (!diffs || !Array.isArray(diffs)) return '<span class="text-slate-400">No specific field info available.</span>';
    
    return diffs.map(d => {
        const path = d.path ? d.path.join('.') : 'root';
        let badgeClass = 'bg-slate-100 text-slate-600';
        
        if (d.kind === 'N') badgeClass = 'bg-green-100 text-green-700 border-green-200'; // New
        if (d.kind === 'D') badgeClass = 'bg-red-100 text-red-700 border-red-200'; // Deleted
        if (d.kind === 'E') badgeClass = 'bg-yellow-100 text-yellow-700 border-yellow-200'; // Edited
        
        return `<span class="px-2 py-1 rounded border ${badgeClass}">${path}</span>`;
    }).join('');
}