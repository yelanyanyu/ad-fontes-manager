const toastRootId = 'toastRoot';

function ensureRoot() {
    let root = document.getElementById(toastRootId);
    if (root) return root;
    root = document.createElement('div');
    root.id = toastRootId;
    root.className = 'fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none';
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-relevant', 'additions');
    document.body.appendChild(root);
    return root;
}

function iconHtml(type) {
    if (type === 'success') return '<i class="fa-solid fa-circle-check"></i>';
    if (type === 'error') return '<i class="fa-solid fa-circle-exclamation"></i>';
    if (type === 'warning') return '<i class="fa-solid fa-triangle-exclamation"></i>';
    return '<i class="fa-solid fa-circle-info"></i>';
}

function classes(type) {
    if (type === 'success') return 'bg-emerald-600 text-white';
    if (type === 'error') return 'bg-rose-600 text-white';
    if (type === 'warning') return 'bg-amber-500 text-slate-900';
    return 'bg-slate-900 text-white';
}

function titleFor(type) {
    if (type === 'success') return 'Success';
    if (type === 'error') return 'Error';
    if (type === 'warning') return 'Warning';
    return 'Info';
}

export function notify(message, options = {}) {
    const {
        type = 'info',
        title,
        timeoutMs = 2200,
        id
    } = options;

    const root = ensureRoot();

    if (id) {
        const existing = root.querySelector(`[data-toast-id="${CSS.escape(id)}"]`);
        if (existing) existing.remove();
    }

    const node = document.createElement('div');
    if (id) node.dataset.toastId = id;
    node.className = `pointer-events-auto w-[min(420px,calc(100vw-2rem))] rounded-xl shadow-lg border border-white/10 ${classes(type)} overflow-hidden`;
    node.setAttribute('role', 'status');

    const headerText = title || titleFor(type);

    node.innerHTML = `
        <div class="flex items-start gap-3 px-4 py-3">
            <div class="mt-0.5 text-lg leading-none opacity-95">${iconHtml(type)}</div>
            <div class="min-w-0 flex-1">
                <div class="text-sm font-bold leading-5">${headerText}</div>
                <div class="text-sm leading-5 opacity-95 break-words">${String(message ?? '')}</div>
            </div>
            <button type="button" class="ml-2 -mr-1 mt-0.5 p-1 rounded-md hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/40" aria-label="Dismiss">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
        <div class="h-1 bg-white/20">
            <div class="toast-progress h-1 bg-white/60"></div>
        </div>
    `;

    const close = () => {
        if (!node.isConnected) return;
        node.classList.add('opacity-0', 'translate-y-1');
        window.setTimeout(() => node.remove(), 160);
    };

    node.querySelector('button')?.addEventListener('click', (e) => {
        e.preventDefault();
        close();
    });
    node.addEventListener('click', () => close());

    node.classList.add('transition', 'duration-150', 'ease-out');
    root.appendChild(node);

    const progress = node.querySelector('.toast-progress');
    if (progress) {
        progress.classList.add('transition-[width]', 'duration-[var(--toast-ms)]', 'ease-linear');
        progress.style.setProperty('--toast-ms', `${timeoutMs}ms`);
        progress.style.width = '100%';
        requestAnimationFrame(() => {
            progress.style.width = '0%';
        });
    }

    if (timeoutMs > 0) window.setTimeout(() => close(), timeoutMs);
    return close;
}

notify.success = (message, options = {}) => notify(message, { ...options, type: 'success' });
notify.error = (message, options = {}) => notify(message, { ...options, type: 'error' });
notify.warning = (message, options = {}) => notify(message, { ...options, type: 'warning' });
notify.info = (message, options = {}) => notify(message, { ...options, type: 'info' });
