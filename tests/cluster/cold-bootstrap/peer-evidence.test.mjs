import { expect, test } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createColdBootstrapEvidence } from '../../../src/cluster/cold-bootstrap/peer-evidence.mjs';

test('collects local state, recovers unknown sequence numbers, and reports health', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'elera-evidence-'));
  try {
    await writeFile(join(dir, 'grastate.dat'), 'uuid: abc\nseqno: -1\nsafe_to_bootstrap: 0\n');
    const evidence = createColdBootstrapEvidence({ localNode: { name: 'one' }, dataDir: dir, health: { status: async () => ({ ready: false, values: { wsrep_cluster_status: 'Non-Primary' } }) }, run: async () => 'WSREP: Recovered position: abc:12' });
    await expect(evidence.local()).resolves.toMatchObject({ node: 'one', active: false, state: { recoveredSeqno: 12 }, generation: 1 });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('does not run wsrep recovery for an active peer with an unknown saved sequence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'elera-evidence-'));
  try {
    await writeFile(join(dir, 'grastate.dat'), 'uuid: abc\nseqno: -1\nsafe_to_bootstrap: 0\n');
    const run = async () => { throw new Error('must not recover an active peer'); };
    const evidence = createColdBootstrapEvidence({ localNode: { name: 'one' }, dataDir: dir, health: { status: async () => ({ ready: true, values: { wsrep_local_state_comment: 'Synced' } }) }, run });
    await expect(evidence.local()).resolves.toMatchObject({ node: 'one', active: true, state: { savedSeqno: -1, recoveredSeqno: undefined } });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('forwards authenticated remote evidence and validates dependencies', async () => {
  const fetchImpl = async (url, options) => { expect(url).toBe('http://peer/api/v1/cluster/cold-bootstrap/evidence'); expect(options.headers.authorization).toBe('Bearer token'); return { ok: true, async json() { return { data: { node: 'peer' } }; } }; };
  const evidence = createColdBootstrapEvidence({ localNode: { name: 'one' }, dataDir: '/tmp', health: {}, fetchImpl, token: 'token' });
  await expect(evidence.remote('http://peer/')).resolves.toEqual({ node: 'peer' });
  await expect(evidence.remote('http://peer')).resolves.toEqual({ node: 'peer' });
  expect(() => createColdBootstrapEvidence()).toThrow('local evidence');
});

test('rejects authenticated evidence attributed to another node', async () => {
  const evidence = createColdBootstrapEvidence({ localNode: { name: 'one' }, dataDir: '/tmp', health: {}, token: 'token', fetchImpl: async () => ({ ok: true, async json() { return { data: { node: 'other' } }; } }) });
  await expect(evidence.remote('http://peer', 'peer')).rejects.toMatchObject({ code: 'RECOVERY_EVIDENCE_IDENTITY_MISMATCH' });
});
test('rejects malformed remote evidence at the protocol boundary', async () => {
  const evidence = createColdBootstrapEvidence({ localNode: { name: 'one' }, dataDir: '/tmp', health: {}, token: 'token', fetchImpl: async () => ({ ok: true, async json() { return { data: null }; } }) });
  await expect(evidence.remote('http://peer')).rejects.toMatchObject({ code: 'INVALID_RECOVERY_EVIDENCE' });
});

test('handles recovered state, health failures, and rejected peers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'elera-evidence-'));
  try {
    await writeFile(join(dir, 'grastate.dat'), 'uuid: abc\nseqno: 12\nsafe_to_bootstrap: 1\n');
    const evidence = createColdBootstrapEvidence({ localNode: { name: 'one' }, dataDir: dir, health: { status: async () => { throw new Error('down'); } } });
    await expect(evidence.local()).resolves.toMatchObject({ state: { savedSeqno: 12, recoveredSeqno: undefined }, active: false });
    const rejected = createColdBootstrapEvidence({ localNode: { name: 'one' }, dataDir: dir, health: {}, fetchImpl: async () => ({ ok: false, status: 503 }), token: 'token' });
    await expect(rejected.remote('http://peer')).rejects.toThrow('peer returned 503');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
