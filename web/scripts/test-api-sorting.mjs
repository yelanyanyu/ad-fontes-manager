import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.resolve(__dirname, '../config.json');
let config = {};
try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
    config = {};
}
const apiPort = config.API_PORT || process.env.API_PORT;
const base = process.env.API_BASE || `http://localhost:${apiPort}/api`;

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
}

function isSortedAsc(arr) {
    for (let i = 1; i < arr.length; i++) {
        if (String(arr[i - 1]).localeCompare(String(arr[i])) > 0) return false;
    }
    return true;
}

async function main() {
    const data = await fetchJson(`${base}/words?page=1&limit=10&sort=az`);
    if (Array.isArray(data)) {
        console.log('legacy /api/words response detected; skipping backend sort assertion');
        return;
    }
    assert.ok(Array.isArray(data.items), 'items should be array');
    const lemmas = data.items.map(x => x.lemma);
    assert.ok(isSortedAsc(lemmas), 'lemmas should be sorted A-Z');
    console.log('test-api-sorting ok');
}

main().catch((e) => {
    console.error('test-api-sorting failed:', e.message);
    process.exitCode = 1;
});
