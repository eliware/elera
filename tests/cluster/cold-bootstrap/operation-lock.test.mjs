import { expect, test } from '@jest/globals';
import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOperationLock } from '../../../src/cluster/cold-bootstrap/operation-lock.mjs';

test('runs without a lock path and cleans a normal lock after completion', async () => {
  const result = await createOperationLock().run(async () => 'ok');
  expect(result).toBe('ok');
  const dir = await mkdtemp(join(tmpdir(), 'elera-lock-')); const path = join(dir, 'lock');
  try { const lock = createOperationLock({ path }); await expect(lock.run(async () => 'done')).resolves.toBe('done'); await expect(lock.run(async () => 'again')).resolves.toBe('again'); } finally { await rm(dir, { recursive: true, force: true }); }
});

test('rejects a live lock and removes a stale lock', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'elera-lock-')); const path = join(dir, 'lock');
  try {
    const lock = createOperationLock({ path, staleAfterMs: 100000 });
    let release;
    const held = lock.run(() => new Promise((resolve) => { release = resolve; }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    await expect(lock.run(async () => 'blocked')).rejects.toMatchObject({ statusCode: 409 });
    release('released');
    await expect(held).resolves.toBe('released');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('removes a stale lock and retries the operation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'elera-lock-')); const path = join(dir, 'lock');
  try {
    await writeFile(path, 'stale');
    await utimes(path, new Date(0), new Date(0));
    await expect(createOperationLock({ path, staleAfterMs: 1 }).run(async () => 'recovered')).resolves.toBe('recovered');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('propagates non-contention filesystem errors', async () => {
  await expect(createOperationLock({ path: '\0invalid-lock' }).run(async () => 'never')).rejects.toThrow();
});

test('retries when a competing lock disappears during inspection', async () => {
  let opens = 0;
  const openFile = async () => {
    opens += 1;
    if (opens === 1) throw Object.assign(new Error('exists'), { code: 'EEXIST' });
    return { writeFile: async () => {}, close: async () => {} };
  };
  const statFile = async () => { throw Object.assign(new Error('disappeared'), { code: 'ENOENT' }); };
  const remove = async () => {};
  await expect(createOperationLock({ path: 'lock', makeDirectory: async () => {}, openFile, statFile, remove }).run(async () => 'retried')).resolves.toBe('retried');
});

test('returns a conflict for a fresh competing lock', async () => {
  const openFile = async () => { throw Object.assign(new Error('exists'), { code: 'EEXIST' }); };
  await expect(createOperationLock({ path: 'lock', makeDirectory: async () => {}, openFile, statFile: async () => ({ mtimeMs: Date.now() }), remove: async () => {} }).run(async () => 'blocked')).rejects.toMatchObject({ statusCode: 409 });
});

test('propagates inspection failures other than a disappeared lock', async () => {
  const openFile = async () => { throw Object.assign(new Error('exists'), { code: 'EEXIST' }); };
  await expect(createOperationLock({ path: 'lock', makeDirectory: async () => {}, openFile, statFile: async () => { throw new Error('permission denied'); }, remove: async () => {} }).run(async () => 'blocked')).rejects.toThrow('permission denied');
});

test('tolerates cleanup failures after the operation completes', async () => {
  const handle = { writeFile: async () => {}, close: async () => { throw new Error('already closed'); } };
  const lock = createOperationLock({ path: 'lock', makeDirectory: async () => {}, openFile: async () => handle, remove: async () => { throw new Error('already removed'); } });
  await expect(lock.run(async () => 'ok')).resolves.toBe('ok');
});
