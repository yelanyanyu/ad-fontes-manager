const KEY_PAGE_SIZE = 'etymos.list.pageSize';
const KEY_SORT = 'etymos.list.sort';

function canUseStorage() {
    try {
        const k = '__etymos_test__';
        localStorage.setItem(k, '1');
        localStorage.removeItem(k);
        return true;
    } catch (_) {
        return false;
    }
}

export function loadListPrefs(defaults = { pageSize: 20, sort: 'newest' }) {
    if (!canUseStorage()) return { ...defaults, storageAvailable: false };
    const pageSizeRaw = localStorage.getItem(KEY_PAGE_SIZE);
    const sortRaw = localStorage.getItem(KEY_SORT);

    const pageSize = Math.max(1, Math.min(500, parseInt(pageSizeRaw || '', 10) || defaults.pageSize));
    const sort = (sortRaw || defaults.sort || 'newest').trim();

    return { pageSize, sort, storageAvailable: true };
}

export function saveListPrefs(prefs) {
    if (!canUseStorage()) return false;
    if (prefs?.pageSize != null) localStorage.setItem(KEY_PAGE_SIZE, String(prefs.pageSize));
    if (prefs?.sort != null) localStorage.setItem(KEY_SORT, String(prefs.sort));
    return true;
}

export function clearListPrefs() {
    if (!canUseStorage()) return false;
    localStorage.removeItem(KEY_PAGE_SIZE);
    localStorage.removeItem(KEY_SORT);
    return true;
}

export function getListPrefsKeys() {
    return { KEY_PAGE_SIZE, KEY_SORT };
}
