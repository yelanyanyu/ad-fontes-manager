import { post, get } from '../api.js';
import { checkConnection } from './sync.js';
import { refreshRecords } from './list.js';
import { notify } from './toast.js';

const WORD_CARD_TEMPLATE_MODE_KEY = 'etymos.wordCardTemplateMode';
const WORD_CARD_TEMPLATE_HTML_KEY = 'etymos.wordCardTemplateHtml';
let templateBindingsReady = false;

function applyTemplateModeUI(mode) {
    const editor = document.getElementById('modalWordCardTemplateEditor');
    if (!editor) return;
    if (mode === 'custom') editor.classList.remove('hidden');
    else editor.classList.add('hidden');
}

function loadWordCardTemplateSettings() {
    const modeEl = document.getElementById('modalWordCardTemplateMode');
    const templateEl = document.getElementById('modalWordCardTemplate');
    if (!modeEl || !templateEl) return;

    const mode = localStorage.getItem(WORD_CARD_TEMPLATE_MODE_KEY) || 'default';
    const tpl = localStorage.getItem(WORD_CARD_TEMPLATE_HTML_KEY) || '';
    modeEl.value = mode;
    templateEl.value = tpl;
    applyTemplateModeUI(mode);
}

function resetWordCardTemplate() {
    localStorage.removeItem(WORD_CARD_TEMPLATE_MODE_KEY);
    localStorage.removeItem(WORD_CARD_TEMPLATE_HTML_KEY);
    loadWordCardTemplateSettings();
    notify.info('Template reset to default');
}

function bindTemplateSettings() {
    if (templateBindingsReady) return;
    templateBindingsReady = true;

    const modeEl = document.getElementById('modalWordCardTemplateMode');
    const resetBtn = document.getElementById('resetWordCardTemplateBtn');
    if (modeEl) {
        modeEl.addEventListener('change', (e) => {
            applyTemplateModeUI(e.target.value);
        });
    }
    if (resetBtn) {
        resetBtn.addEventListener('click', () => resetWordCardTemplate());
    }
}

export async function loadServerConfig() {
    try {
        const config = await get('/config');
        if (config.DATABASE_URL) {
            document.getElementById('modalDbUrl').value = config.DATABASE_URL;
        }
        if (config.MAX_LOCAL_ITEMS) {
            document.getElementById('modalMaxItems').value = config.MAX_LOCAL_ITEMS;
        }
    } catch (e) {
        console.error('Config load error', e);
    } finally {
        loadWordCardTemplateSettings();
        bindTemplateSettings();
    }
}

export function openSettings() {
    document.getElementById('settingsModal').classList.remove('hidden');
    document.getElementById('settingsModal').classList.add('flex');
    loadWordCardTemplateSettings();
}

export function closeSettings() {
    document.getElementById('settingsModal').classList.add('hidden');
    document.getElementById('settingsModal').classList.remove('flex');
}

export async function saveSettings() {
    const dbUrl = document.getElementById('modalDbUrl').value;
    const maxItems = document.getElementById('modalMaxItems').value;
    const mode = document.getElementById('modalWordCardTemplateMode')?.value || 'default';
    const tpl = document.getElementById('modalWordCardTemplate')?.value || '';

    try {
        localStorage.setItem(WORD_CARD_TEMPLATE_MODE_KEY, mode);
        if (mode === 'custom') localStorage.setItem(WORD_CARD_TEMPLATE_HTML_KEY, tpl);
        else localStorage.removeItem(WORD_CARD_TEMPLATE_HTML_KEY);

        await post('/config', { 
            database_url: dbUrl,
            MAX_LOCAL_ITEMS: maxItems ? parseInt(maxItems) : 100
        });
        closeSettings();
        await checkConnection();
        refreshRecords(); 
        notify.success('Settings saved');
    } catch (e) {
        notify.error('Save config failed');
    }
}
