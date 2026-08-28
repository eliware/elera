import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';

export function createIdempotencyStore({ path, read = readFile, write = writeFile, move = rename, makeDirectory = mkdir } = {}) {
  const memory = new Map();
  const keyFor = (key) => createHash('sha256').update(String(key)).digest('hex');
  let loaded;
  async function load() {
    if (!path) return;
    try { for (const [key, value] of Object.entries(JSON.parse(await read(path, 'utf8')))) memory.set(key, value); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return {
    async get(key) { loaded ??= load(); await loaded; return memory.get(keyFor(key)); },
    async set(key, value) {
      loaded ??= load(); await loaded; memory.set(keyFor(key), value);
      if (path) { await makeDirectory(dirname(path), { recursive: true }); const temporary = `${path}.tmp-${process.pid}`; await write(temporary, JSON.stringify(Object.fromEntries(memory))); await move(temporary, path); }
    },
  };
}
