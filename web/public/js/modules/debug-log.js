const DEBUG_KEY = 'etymos.debug';

export function isDebugEnabled() {
    try {
        const url = new URL(window.location.href);
        const qp = url.searchParams.get('debug');
        if (qp === '1') {
            localStorage.setItem(DEBUG_KEY, '1');
            return true;
        }
        if (qp === '0') {
            localStorage.setItem(DEBUG_KEY, '0');
            return false;
        }
    } catch (_) {}

    try {
        return localStorage.getItem(DEBUG_KEY) === '1';
    } catch (_) {
        return false;
    }
}

export function debugLog(component, state, details = {}) {
    if (!isDebugEnabled()) return;
    const ts = new Date().toISOString();
    const payload = { ts, component, state, ...details };
    console.log(`[${ts}] [${component}] ${state}`, payload);
}

export function debugGroup(component, title, details = {}) {
    if (!isDebugEnabled()) return () => {};
    const ts = new Date().toISOString();
    console.groupCollapsed(`[${ts}] [${component}] ${title}`);
    console.log({ ts, component, title, ...details });
    return () => console.groupEnd();
}
