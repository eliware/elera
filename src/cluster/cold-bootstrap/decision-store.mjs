import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export function createRecoveryDecisionStore(path) {
  if (!path) throw new TypeError('recovery decision path is required');
  return {
    async read() { try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; } },
    async write(value, { expectedEpoch } = {}) {
      const existing = await this.read();
      if (expectedEpoch !== undefined && existing?.epoch !== expectedEpoch) throw Object.assign(new Error('recovery epoch changed before persistence'), { code: 'RECOVERY_EPOCH_CONFLICT', statusCode: 409 });
      await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.tmp-${process.pid}`; await writeFile(temporary, JSON.stringify(value)); await rename(temporary, path); return value;
    },
  };
}
