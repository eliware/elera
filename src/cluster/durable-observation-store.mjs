import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createObservation } from './observation.mjs';

export function createDurableObservationStore({ store, statePath, read = readFile, write = writeFile, makeDirectory = mkdir, log = {} } = {}) {
  if (!store || typeof store.upsert !== 'function' || !statePath) throw new TypeError('store and statePath are required');
  let pending = Promise.resolve();
  const persist = () => {
    pending = pending.then(async () => { await makeDirectory(dirname(statePath), { recursive: true }); await write(statePath, JSON.stringify(store.all()), 'utf8'); }).catch((error) => log.warn?.('Observation state persistence failed', { error }));
    return pending;
  };
  return {
    async initialize() {
      try { const raw = JSON.parse(await read(statePath, 'utf8')); if (!Array.isArray(raw)) throw new TypeError('observation state must be an array'); for (const item of raw) store.upsert(createObservation(item)); }
      catch (error) { if (error.code !== 'ENOENT') log.warn?.('Observation state load failed', { error }); }
    },
    upsert(observation) { const result = store.upsert(observation); if (result.accepted) void persist(); return result; },
    snapshot(...args) { return store.snapshot(...args); }, all(...args) { return store.all(...args); },
    clear() { store.clear(); void persist(); }, flush() { return pending; }
  };
}
