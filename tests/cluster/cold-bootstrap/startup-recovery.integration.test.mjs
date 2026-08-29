import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStartupRecoveryDecision } from '../../../src/cluster/cold-bootstrap/startup-decision.mjs';
import { createRecoveryLease } from '../../../src/cluster/cold-bootstrap/lease.mjs';

test('three supervisors converge on one winner and one lease', async () => {
  const nodes = [{ name: 'elera-0', local: true }, { name: 'elera-1' }, { name: 'elera-2' }];
  const evidence = [{ node: 'elera-0', state: { node: 'elera-0', uuid: 'u', seqno: 10, safeToBootstrap: false }, active: false }, { node: 'elera-1', state: { node: 'elera-1', uuid: 'u', seqno: 12, safeToBootstrap: false }, active: false }, { node: 'elera-2', state: { node: 'elera-2', uuid: 'u', seqno: 11, safeToBootstrap: false }, active: false }];
  const directory = await mkdtemp(join(tmpdir(), 'elera-recovery-')); const lease = createRecoveryLease(join(directory, 'lease.json'));
  const decide = () => createStartupRecoveryDecision({ nodes, localEvidence: async () => evidence[0], fetchEvidence: async (node) => evidence.find((item) => item.node === node.name) })();
  const decisions = await Promise.all([decide(), decide(), decide()]);
  expect(new Set(decisions.map((item) => item.winner))).toEqual(new Set(['elera-1']));
  const claims = await Promise.all(decisions.map((item) => lease.claim({ epoch: item.epoch, winner: item.winner })));
  expect(claims.filter((item) => item.granted && !item.existing)).toHaveLength(1);
  await rm(directory, { recursive: true, force: true });
});
