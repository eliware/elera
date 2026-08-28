import { mkdir, open, stat, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

export function createOperationLock({ path, staleAfterMs = 120000 } = {}) {
  if (!path) return { async run(operation) { return operation(); } };
  return {
    async run(operation) {
      let handle;
      try {
        await mkdir(dirname(path), { recursive: true });
        handle = await open(path, 'wx');
        await handle.writeFile(JSON.stringify({ operation: 'cold-bootstrap', createdAt: new Date().toISOString() }));
      } catch (error) {
        if (error.code === 'EEXIST') {
          try { const age = Date.now() - (await stat(path)).mtimeMs; if (age > staleAfterMs) await unlink(path); else throw Object.assign(new Error('cold bootstrap already in progress'), { statusCode: 409 }); }
          catch (staleError) { if (staleError.statusCode) throw staleError; if (staleError.code !== 'ENOENT') throw staleError; }
          return this.run(operation);
        }
        throw error;
      }
      try { return await operation(); }
      finally { await handle?.close().catch(() => {}); await unlink(path).catch(() => {}); }
    },
  };
}
