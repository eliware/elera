import { createStartupLocalEvidence } from '../../../src/cluster/cold-bootstrap/startup-local-evidence.mjs';

test('reads persisted state and recovers an unavailable sequence number', async () => {
  const evidence = createStartupLocalEvidence({ node: { name: 'a' }, dataDir: 'x', readState: async () => ({ uuid: 'c', seqno: -1, safeToBootstrap: false }), runRecover: async () => 'Recovered position: c:42' });
  await expect(evidence()).resolves.toMatchObject({ node: 'a', state: { uuid: 'c', seqno: 42 } });
});

test('requires evidence dependencies', () => expect(() => createStartupLocalEvidence({ node: { name: 'a' }, dataDir: 'x' })).toThrow('startup local evidence dependencies are required'));

test('preserves a valid persisted sequence number without recovery', async () => {
  const runRecover = async () => { throw new Error('must not run'); }; const evidence = createStartupLocalEvidence({ node: { name: 'a' }, dataDir: 'x', readState: async () => ({ uuid: 'c', seqno: 7, safeToBootstrap: false }), runRecover });
  await expect(evidence()).resolves.toMatchObject({ state: { seqno: 7 } });
});
