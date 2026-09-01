import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRecoveryLease } from '../../../src/cluster/cold-bootstrap/lease.mjs';

test('grants one epoch and rejects competing epochs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'elera-lease-')); const lease = createRecoveryLease(join(directory, 'lease.json'));
  await expect(lease.claim({ epoch: 'e1', winner: 'a.example.test' })).resolves.toMatchObject({ granted: true }); await expect(lease.claim({ epoch: 'e1', winner: 'a.example.test' })).resolves.toMatchObject({ granted: true, existing: true }); await expect(lease.claim({ epoch: 'e2', winner: 'b.example.test' })).resolves.toMatchObject({ granted: false }); await rm(directory, { recursive: true, force: true });
});

test('requires lease path and claim identity', async () => {
  expect(() => createRecoveryLease()).toThrow('recovery lease path is required'); const lease = createRecoveryLease('x'); await expect(lease.claim()).rejects.toThrow('recovery lease epoch and FQDN winner are required');
});

test('rejects a lease path that cannot be opened as a file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'elera-lease-')); const path = join(directory, 'lease'); await mkdir(path); const lease = createRecoveryLease(path); await expect(lease.claim({ epoch: 'e1', winner: 'a.example.test' })).resolves.toMatchObject({ granted: false }); await rm(directory, { recursive: true, force: true });
});

test('does not trust a malformed existing lease', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'elera-lease-')); const path = join(directory, 'lease.json'); await writeFile(path, '{'); const lease = createRecoveryLease(path); await expect(lease.claim({ epoch: 'e1', winner: 'a.example.test' })).resolves.toMatchObject({ granted: false }); await rm(directory, { recursive: true, force: true });
});

test('propagates unexpected lease storage failures', async () => {
  const lease = createRecoveryLease('lease.json', { openFile: async () => { const error = new Error('storage unavailable'); error.code = 'EIO'; throw error; } });
  await expect(lease.claim({ epoch: 'e1', winner: 'a.example.test' })).rejects.toMatchObject({ code: 'EIO' });
});

test('fences an expired competing lease', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'elera-lease-')); const path = join(directory, 'lease.json');
  await writeFile(path, JSON.stringify({ epoch: 'old', winner: 'old', claimedAt: new Date(0).toISOString() }));
  const lease = createRecoveryLease(path, { staleAfterMs: 100, now: () => 1000 });
  await expect(lease.claim({ epoch: 'new', winner: 'new.example.test' })).resolves.toMatchObject({ granted: true, epoch: 'new' });
  await rm(directory, { recursive: true, force: true });
});
