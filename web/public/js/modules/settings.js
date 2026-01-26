import { post, get } from '../api.js';
import { checkConnection } from './sync.js';
import { refreshRecords } from './list.js';

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
    }
}

export function openSettings() {
    document.getElementById('settingsModal').classList.remove('hidden');
    document.getElementById('settingsModal').classList.add('flex');
}

export function closeSettings() {
    document.getElementById('settingsModal').classList.add('hidden');
    document.getElementById('settingsModal').classList.remove('flex');
}

export async function saveSettings() {
    const dbUrl = document.getElementById('modalDbUrl').value;
    const maxItems = document.getElementById('modalMaxItems').value;
    try {
        await post('/config', { 
            database_url: dbUrl,
            MAX_LOCAL_ITEMS: maxItems ? parseInt(maxItems) : 100
        });
        closeSettings();
        await checkConnection();
        refreshRecords(); 
    } catch (e) {
        alert('Save config failed');
    }
}