import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export function createRecoveryDecisionStore(path) {
  if (!path) throw new TypeError('recovery decision path is required');
  return {
    async read() { try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; } },
    async write(value) { await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.tmp-${process.pid}`; await writeFile(temporary, JSON.stringify(value)); await rename(temporary, path); return value; },
  };
}
