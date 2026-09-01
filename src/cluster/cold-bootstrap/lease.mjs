import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

const isFqdn = (value) => typeof value === 'string' && value.includes('.') && value.split('.').every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));

export function createRecoveryLease(path, { openFile = open, staleAfterMs = 120000, now = () => Date.now() } = {}) {
  if (!path) throw new TypeError('recovery lease path is required');
  return {
    async claim({ epoch, winner } = {}) {
      if (!epoch || !isFqdn(winner)) throw new TypeError('recovery lease epoch and FQDN winner are required');
      await mkdir(dirname(path), { recursive: true });
      const value = JSON.stringify({ epoch, winner, claimedAt: new Date().toISOString() });
      try { const handle = await openFile(path, 'wx'); await handle.writeFile(value); await handle.close(); return { granted: true, epoch, winner }; }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        try {
          const current = JSON.parse(await readFile(path, 'utf8'));
          if (current.epoch === epoch && current.winner === winner) return { granted: true, epoch, winner, existing: true };
          if (staleAfterMs >= 0 && Number.isFinite(Date.parse(current.claimedAt)) && now() - Date.parse(current.claimedAt) > staleAfterMs) {
            await unlink(path);
            return this.claim({ epoch, winner });
          }
        } catch {}
        return { granted: false, reason: 'recovery lease is held by another epoch' };
      }
    },
  };
}
