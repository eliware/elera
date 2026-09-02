import { expect, jest, test } from '@jest/globals';
import { createColdRecoveryProtocol } from '../../src/cluster/cold-bootstrap/protocol.mjs';
import { createRecoveryLease } from '../../src/cluster/cold-bootstrap/lease.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const nodes = [{ name: 'elera-0.example.test', url: 'http://elera-0.cluster.local', local: true }, { name: 'elera-1.example.test', url: 'http://elera-1.cluster.local' }, { name: 'elera-2.example.test', url: 'http://elera-2.cluster.local' }];
const evidence = { 'elera-0.cluster.local': { node: 'elera-0.example.test', state: { uuid: 'cluster', seqno: 11, safeToBootstrap: false }, active: false }, 'elera-1.cluster.local': { node: 'elera-1.example.test', state: { uuid: 'cluster', seqno: 14, safeToBootstrap: false }, active: false }, 'elera-2.cluster.local': { node: 'elera-2.example.test', state: { uuid: 'cluster', seqno: 12, safeToBootstrap: false }, active: false } };
const withEvidence = (item) => ({ ...item, generation: 1, observedAt: new Date().toISOString() });
const store = () => ({ value: undefined, async read() { return this.value; }, async write(value) { this.value = value; return value; } });

test('three supervisors converge on the same epoch and winner', async () => {
  const protocols = nodes.map((local) => createColdRecoveryProtocol({ nodes: nodes.map((node) => ({ ...node, local: node.name === local.name })), localEvidence: async () => withEvidence(evidence[local.name]), fetchEvidence: async (url) => withEvidence(evidence[url.replace('http://', '')]), store: store() }));
  const plans = await Promise.all(protocols.map((protocol) => protocol.plan()));
  expect(new Set(plans.map((plan) => plan.epoch)).size).toBe(1);
  expect(new Set(plans.map((plan) => plan.winner.node))).toEqual(new Set(['elera-1.example.test']));
});

test('quorum loss blocks authorization and retry recollects evidence', async () => {
  const recoveryStore = store();
  const protocol = createColdRecoveryProtocol({ nodes, localEvidence: async () => withEvidence(evidence['elera-0.cluster.local']), fetchEvidence: async () => { throw new Error('partition'); }, store: recoveryStore });
  await expect(protocol.plan()).resolves.toMatchObject({ mode: 'blocked', reason: 'partition' });
  await expect(protocol.retry()).resolves.toMatchObject({ mode: 'blocked', reason: 'partition' });
  expect(recoveryStore.value.phase).toBe('blocked');
});

test('one shared lease grants bootstrap authority to only one winner', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'elera-epoch-'));
  const lease = createRecoveryLease(join(directory, 'lease.json'));
  const claims = await Promise.all(['elera-0.cluster.local', 'elera-1.cluster.local', 'elera-2.cluster.local'].map((winner) => lease.claim({ epoch: 'cluster:epoch', winner: 'elera-1.cluster.local' })));
  expect(claims.filter((claim) => claim.granted && !claim.existing)).toHaveLength(1);
  await rm(directory, { recursive: true, force: true });
});
