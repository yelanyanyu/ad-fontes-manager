const confirmRootId = 'confirmRoot';

function ensureRoot() {
    let root = document.getElementById(confirmRootId);
    if (root) return root;
    root = document.createElement('div');
    root.id = confirmRootId;
    document.body.appendChild(root);
    return root;
}

function sanitizeText(val) {
    return String(val ?? '');
}

export function confirmAction(options = {}) {
    const {
        title = 'Confirm',
        message = '',
        confirmText = 'Confirm',
        cancelText = 'Cancel',
        tone = 'danger'
    } = options;

    const root = ensureRoot();
    const previousActive = document.activeElement;

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-6';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.tabIndex = -1;

        const panel = document.createElement('div');
        panel.className = 'w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden';

        const confirmBtnClass = tone === 'danger'
            ? 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-500'
            : 'bg-primary hover:bg-blue-600 focus:ring-primary';

        panel.innerHTML = `
            <div class="p-5 border-b border-slate-100 bg-slate-50 flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <div class="text-base font-bold text-slate-900">${sanitizeText(title)}</div>
                    <div class="mt-1 text-sm text-slate-600 break-words">${sanitizeText(message)}</div>
                </div>
                <button type="button" class="p-2 -m-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40" aria-label="Close">
                    <i class="fa-solid fa-xmark text-lg"></i>
                </button>
            </div>
            <div class="p-5 flex justify-end gap-3 bg-white">
                <button type="button" data-action="cancel" class="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30">${sanitizeText(cancelText)}</button>
                <button type="button" data-action="confirm" class="px-4 py-2 rounded-lg text-white text-sm font-bold shadow-sm transition-colors focus:outline-none focus:ring-2 ${confirmBtnClass}">${sanitizeText(confirmText)}</button>
            </div>
        `;

        overlay.appendChild(panel);
        root.appendChild(overlay);

        const cleanup = (result) => {
            overlay.removeEventListener('click', onOverlayClick);
            document.removeEventListener('keydown', onKeyDown, true);
            overlay.remove();
            if (previousActive && typeof previousActive.focus === 'function') previousActive.focus();
            resolve(result);
        };

        const onOverlayClick = (e) => {
            if (e.target === overlay) cleanup(false);
        };

        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                cleanup(false);
            }
        };

        overlay.addEventListener('click', onOverlayClick);
        document.addEventListener('keydown', onKeyDown, true);

        panel.querySelector('button[aria-label="Close"]')?.addEventListener('click', () => cleanup(false));
        panel.querySelector('button[data-action="cancel"]')?.addEventListener('click', () => cleanup(false));
        panel.querySelector('button[data-action="confirm"]')?.addEventListener('click', () => cleanup(true));

        window.setTimeout(() => {
            panel.querySelector('button[data-action="confirm"]')?.focus();
        }, 0);
    });
}
