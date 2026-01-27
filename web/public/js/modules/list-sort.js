function toLower(val) {
    return String(val ?? '').toLowerCase();
}

function toTime(val) {
    if (!val) return 0;
    const t = new Date(val).getTime();
    return Number.isFinite(t) ? t : 0;
}

export function filterSortWords(items, search, sort) {
    const q = toLower(search).trim();
    const mode = String(sort || 'newest').trim();

    const filtered = (Array.isArray(items) ? items : []).filter((w) => {
        if (!q) return true;
        return toLower(w?.lemma).includes(q);
    });

    const decorated = filtered.map((item, index) => ({ item, index }));

    decorated.sort((a, b) => {
        const la = toLower(a.item?.lemma);
        const lb = toLower(b.item?.lemma);
        const ta = toTime(a.item?.updated_at || a.item?.created_at);
        const tb = toTime(b.item?.updated_at || b.item?.created_at);

        let cmp = 0;
        if (mode === 'az') cmp = la.localeCompare(lb);
        else if (mode === 'za') cmp = lb.localeCompare(la);
        else if (mode === 'oldest') cmp = ta - tb;
        else cmp = tb - ta;

        if (cmp !== 0) return cmp;
        return a.index - b.index;
    });

    return decorated.map((x) => x.item);
}
