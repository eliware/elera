import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRecoveryDecisionStore } from '../../../src/cluster/cold-bootstrap/decision-store.mjs';

test('persists and reads a recovery decision atomically', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'elera-recovery-')); const store = createRecoveryDecisionStore(join(directory, 'decision.json'));
  await expect(store.read()).resolves.toBeUndefined(); await store.write({ epoch: 'e1', winner: 'a' }); await expect(store.read()).resolves.toEqual({ epoch: 'e1', winner: 'a' }); await expect(readFile(join(directory, 'decision.json'), 'utf8')).resolves.toContain('e1'); await rm(directory, { recursive: true, force: true });
});

test('requires a decision path', () => expect(() => createRecoveryDecisionStore()).toThrow('recovery decision path is required'));

test('propagates malformed persisted decisions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'elera-recovery-')); const path = join(directory, 'decision.json'); const store = createRecoveryDecisionStore(path); await store.write({ ok: true });
  const fs = await import('node:fs/promises'); await fs.writeFile(path, '{'); await expect(store.read()).rejects.toThrow(); await rm(directory, { recursive: true, force: true });
});
