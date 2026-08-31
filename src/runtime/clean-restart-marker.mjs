import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export function createCleanRestartMarker({ path, node, epoch, nonce = randomUUID(), now = Date.now, maxAgeMs = 120000 } = {}) {
  if (!path || !node || !nonce) throw new TypeError('clean restart marker requires path, node, and nonce');
  const payload = () => ({ version: 1, node, epoch: epoch ?? null, nonce, writtenAt: now() });
  return {
    async write() {
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${nonce}.tmp`;
      await writeFile(temporary, JSON.stringify(payload()), { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, path);
    },
    async consume({ expectedNode = node, expectedEpoch = epoch, expectedNonce } = {}) {
      let value;
      try { value = JSON.parse(await readFile(path, 'utf8')); } catch { return undefined; }
      try { await unlink(path); } catch {}
      if (value?.version !== 1 || value.node !== expectedNode || (expectedNonce !== undefined && value.nonce !== expectedNonce) || typeof value.nonce !== 'string' || value.epoch !== (expectedEpoch ?? null) || !Number.isFinite(value.writtenAt) || now() - value.writtenAt < 0 || now() - value.writtenAt > maxAgeMs) return undefined;
      return value;
    },
  };
}
