import { createStartupLocalEvidence } from '../../../src/cluster/cold-bootstrap/startup-local-evidence.mjs';

test('reads persisted state and recovers an unavailable sequence number', async () => {
  const evidence = createStartupLocalEvidence({ node: { name: 'a' }, dataDir: 'x', readState: async () => ({ uuid: 'c', seqno: -1, safeToBootstrap: false }), runRecover: async () => 'Recovered position: c:42' });
  await expect(evidence()).resolves.toMatchObject({ node: 'a', state: { uuid: 'c', seqno: 42 } });
});

test('requires evidence dependencies', () => expect(() => createStartupLocalEvidence({ node: { name: 'a' }, dataDir: 'x' })).toThrow('startup local evidence dependencies are required'));
test('requires an options object', () => expect(() => createStartupLocalEvidence()).toThrow('startup local evidence dependencies are required'));

test('preserves a valid persisted sequence number without recovery', async () => {
  const runRecover = async () => { throw new Error('must not run'); }; const evidence = createStartupLocalEvidence({ node: { name: 'a' }, dataDir: 'x', readState: async () => ({ uuid: 'c', seqno: 7, safeToBootstrap: false }), runRecover });
  await expect(evidence()).resolves.toMatchObject({ state: { seqno: 7 } });
});

test('does not recover while the local database process is active', async () => {
  const runRecover = async () => { throw new Error('must not run'); };
  const evidence = createStartupLocalEvidence({ node: { name: 'a' }, dataDir: 'x', readState: async () => ({ uuid: 'c', seqno: -1, safeToBootstrap: false }), runRecover, isActive: () => true });
  await expect(evidence()).resolves.toMatchObject({ node: 'a', active: true, state: { seqno: -1 } });
});

test('includes protocol freshness metadata and preserves both sequence numbers', async () => {
  const evidence = createStartupLocalEvidence({ node: { name: 'a' }, dataDir: 'x', readState: async () => ({ uuid: 'c', seqno: -1, safeToBootstrap: false }), runRecover: async () => 'Recovered position: c:42' });
  await expect(evidence()).resolves.toMatchObject({ generation: 1, observedAt: expect.any(String), state: { savedSeqno: -1, recoveredSeqno: 42, seqno: 42 } });
  await expect(evidence()).resolves.toMatchObject({ generation: 2, state: { recoveredSeqno: 42 } });
});

test('fails closed when recovery cannot report a sequence number', async () => {
  const evidence = createStartupLocalEvidence({ node: { name: 'a' }, dataDir: 'x', readState: async () => ({ uuid: 'c', seqno: -1, safeToBootstrap: false }), runRecover: async () => 'no recovered position' });
  await expect(evidence()).rejects.toThrow('wsrep-recover did not report a position');
});
