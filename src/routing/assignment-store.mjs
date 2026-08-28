import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export function createAssignmentStore({ path, read = readFile, write = writeFile, move = rename, makeDirectory = mkdir } = {}) {
  const memory = new Map();
  async function load() {
    if (!path) return;
    try { const values = JSON.parse(await read(path, 'utf8')); for (const [app, node] of Object.entries(values)) memory.set(app, node); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  let loaded;
  return {
    peek(application) { return memory.get(application); },
    applications() { return [...memory.keys()]; },
    async get(application) { loaded ??= load(); await loaded; return memory.get(application); },
    async set(application, nodeId) {
      loaded ??= load(); await loaded; memory.set(application, nodeId);
      if (path) { await makeDirectory(dirname(path), { recursive: true }); const temporary = `${path}.tmp-${process.pid}`; await write(temporary, JSON.stringify(Object.fromEntries(memory), null, 2)); await move(temporary, path); }
      return nodeId;
    },
  };
}
