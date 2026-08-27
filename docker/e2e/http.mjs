import { rootToken } from './context.mjs';
export async function waitForHealth(endpoint) { return retry(() => fetch(`${endpoint}/healthz`).then(check)); }
export async function waitForReady(endpoint) { return retry(() => fetch(`${endpoint}/readyz`).then(check), 90); }
export async function post(endpoint, path, body = {}) { const response = await fetch(`${endpoint}${path}`, { method: 'POST', headers: { accept: 'application/json', authorization: `Bearer ${rootToken}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }); if (!response.ok) throw new Error(`${path} failed with ${response.status}: ${await response.text()}`); return response.json(); }
function check(response) { if (!response.ok) throw new Error('supervisor unavailable'); }
async function retry(operation, attempts = 60) { for (let attempt = 0; attempt < attempts; attempt += 1) { try { return await operation(); } catch { await new Promise(resolve => setTimeout(resolve, 1000)); } } throw new Error('supervisor did not become available'); }
