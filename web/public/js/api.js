import { API_BASE } from './config.js';

export async function get(endpoint, headers = {}) {
    const res = await fetch(`${API_BASE}${endpoint}`, { headers });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return res.json();
}

export async function post(endpoint, body, headers = {}) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body)
    });
    return {
        ok: res.ok,
        status: res.status,
        data: await res.json()
    };
}

export async function del(endpoint) {
    const res = await fetch(`${API_BASE}${endpoint}`, { method: 'DELETE' });
    return res.json();
}