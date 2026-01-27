import { post } from '../api.js';
import { store, updateState } from '../state.js';
import { renderPreview } from './ui-render.js';
import { refreshRecords } from './list.js';
import { showConflictModal } from './sync.js';
import { notify } from './toast.js';

export function loadIntoEditor(yamlObj, localId = null) {
    updateState('currentEditingId', localId);

    // Force Order
    const orderedObj = {};
    const keyOrder = ['yield', 'etymology', 'cognate_family', 'application', 'nuance'];
    
    keyOrder.forEach(k => {
        if (yamlObj[k]) orderedObj[k] = yamlObj[k];
    });
    
    // Add any remaining keys
    Object.keys(yamlObj).forEach(k => {
        if (!keyOrder.includes(k)) orderedObj[k] = yamlObj[k];
    });

    const yamlStr = jsyaml.dump(orderedObj, {
        lineWidth: -1, 
        noRefs: true,
        quotingType: '"',
        forceQuotes: false,
        sortKeys: false 
    });
    document.getElementById('yamlInput').value = yamlStr;
    validateYaml(yamlStr);
}

export function clearInput() {
    document.getElementById('yamlInput').value = '';
    updateState('currentEditingId', null);
    validateYaml('');
}

export function togglePreview() {
    const editor = document.getElementById('editorView');
    const preview = document.getElementById('previewView');
    const input = document.getElementById('yamlInput');
    
    if (editor.classList.contains('hidden')) {
        // Show Editor
        editor.classList.remove('hidden');
        preview.classList.add('hidden');
        preview.classList.remove('flex');
    } else {
        // Show Preview
        const yamlStr = input.value;
        if (!yamlStr.trim()) {
            notify.info('Nothing to preview');
            return;
        }
        
        try {
            const data = jsyaml.load(yamlStr);
            renderPreview(data);
            editor.classList.add('hidden');
            preview.classList.remove('hidden');
            preview.classList.add('flex');
        } catch (e) {
            notify.error('Invalid YAML for preview');
        }
    }
}

// Keep track of currentYamlData for conflict resolution context
export let currentYamlData = null;

export async function saveData(force = false) {
    const btn = document.getElementById('saveBtn');
    const yamlStr = document.getElementById('yamlInput').value;
    
    if (!yamlStr.trim()) {
        notify.warning('Please enter YAML content');
        return;
    }

    try {
        btn.disabled = true;
        btn.innerHTML = 'Processing...';
        
        const endpoint = store.dbConnected ? '/words' : '/local';
        
        const payload = { yaml: yamlStr, forceUpdate: force };
        if (!store.dbConnected && store.currentEditingId) {
            payload.id = store.currentEditingId;
        }

        const res = await post(endpoint, payload);
        const data = res.data;
        
        if(data.status === 'conflict') {
            if (data.id && !store.currentEditingId) {
                 updateState('currentEditingId', data.id);
            }
            showConflictModal(data);
            currentYamlData = yamlStr; 
        } else if(!res.ok) {
            throw new Error(data.error || 'Save failed');
        } else {
            let msg = '';
            if (data.status === 'local_saved') {
                msg = 'Saved Locally (Offline)';
                updateState('currentEditingId', data.id);
            }
            else if (data.status === 'logged') msg = 'No changes detected (Request logged)';
            else if (data.status === 'created') msg = 'Created successfully!';
            else if (data.status === 'updated') msg = 'Updated successfully!';
            
            if (data.status === 'logged') notify.info(msg);
            else notify.success(msg);
            if (data.status !== 'logged') {
                document.getElementById('yamlInput').value = ''; 
                updateState('currentEditingId', null);
                validateYaml('');
            }
            refreshRecords();
        }

    } catch (e) {
        notify.error(e.message || 'Unknown error');
    } finally {
        btn.disabled = false;
        updateSaveBtn();
    }
}

export function updateSaveBtn() {
    const btn = document.getElementById('saveBtn');
    if (store.dbConnected) {
        btn.textContent = 'Save to Database';
    } else {
        btn.textContent = 'Save Locally (Offline)';
    }
}

// Validation Logic
export function initEditorValidation() {
    const input = document.getElementById('yamlInput');
    if (!input) return;
    input.addEventListener('input', (e) => validateYaml(e.target.value));
}

function validateYaml(val) {
    const statusEl = document.getElementById('yamlStatus');
    if (!statusEl) return;

    if (!val.trim()) {
        statusEl.innerHTML = '';
        return;
    }

    try {
        const data = jsyaml.load(val);
        if (!data || !data.yield) throw new Error("Missing 'yield'");
        
        statusEl.innerHTML = '<span class="text-green-600 text-xs font-bold uppercase tracking-wider flex items-center gap-1"><i class="fa-solid fa-check"></i> Valid</span>';
    } catch (e) {
        statusEl.innerHTML = '<span class="text-red-500 text-xs font-bold uppercase tracking-wider flex items-center gap-1"><i class="fa-solid fa-triangle-exclamation"></i> Error</span>';
    }
}
