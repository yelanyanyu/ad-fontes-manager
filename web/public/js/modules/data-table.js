function escapeHtml(value) {
    const str = String(value ?? '');
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeColumns(columns) {
    return (columns || []).map((c) => ({
        key: c.key,
        title: c.title ?? '',
        widthClass: c.widthClass ?? '',
        alignClass: c.alignClass ?? 'text-left',
        headerClass: c.headerClass ?? '',
        cellClass: c.cellClass ?? '',
        render: typeof c.render === 'function' ? c.render : null
    }));
}

export function renderDataTable(options) {
    const {
        columns,
        rows,
        getRowId,
        emptyText = 'No data',
        tableLabel
    } = options || {};

    const cols = normalizeColumns(columns);
    const data = Array.isArray(rows) ? rows : [];

    if (data.length === 0) {
        return `
            <div class="bg-white rounded-lg border border-slate-200 p-6 text-center text-slate-400">
                ${escapeHtml(emptyText)}
            </div>
        `;
    }

    const thead = `
        <thead class="bg-slate-50">
            <tr>
                ${cols.map((c) => `
                    <th scope="col" class="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 ${c.alignClass} ${c.widthClass} ${c.headerClass}">
                        ${escapeHtml(c.title)}
                    </th>
                `).join('')}
            </tr>
        </thead>
    `;

    const tbody = `
        <tbody class="divide-y divide-slate-100">
            ${data.map((row) => {
                const rid = getRowId ? getRowId(row) : '';
                return `
                    <tr data-row-id="${escapeHtml(rid)}" class="hover:bg-slate-50/60">
                        ${cols.map((c) => {
                            let cell = '';
                            if (c.render) {
                                cell = c.render(row);
                            } else {
                                cell = escapeHtml(row?.[c.key]);
                            }
                            return `<td class="px-4 py-3 text-sm text-slate-700 ${c.alignClass} ${c.cellClass}">${cell}</td>`;
                        }).join('')}
                    </tr>
                `;
            }).join('')}
        </tbody>
    `;

    const labelAttr = tableLabel ? `aria-label="${escapeHtml(tableLabel)}"` : '';

    return `
        <div class="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
                <table class="min-w-full" ${labelAttr}>
                    ${thead}
                    ${tbody}
                </table>
            </div>
        </div>
    `;
}
