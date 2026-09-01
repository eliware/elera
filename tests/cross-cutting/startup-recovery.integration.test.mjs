import { mkdtemp, rm } from 'node:fs/promises';
import { jest } from '@jest/globals';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStartupRecoveryDecision } from '../../src/cluster/cold-bootstrap/startup-decision.mjs';
import { createRecoveryLease } from '../../src/cluster/cold-bootstrap/lease.mjs';
import { createSupervisorRecoveryJoiner } from '../../src/runtime/recovery-join-wiring.mjs';

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

test('active-primary recovery verifies both joiners before clearing drain', async () => {
  const calls = [];
  const fetchImpl = jest.fn(async (url) => {
    calls.push(url);
    if (url.endsWith('/status')) return { ok: true, status: 200, json: async () => ({ ok: true, data: { values: { wsrep_cluster_state_uuid: 'cluster', wsrep_cluster_size: '3', wsrep_local_state_comment: 'Synced', wsrep_ready: 'ON', wsrep_cluster_status: 'Primary' } } }) };
    return { ok: true, status: 202, json: async () => ({ ok: true, data: { status: 'ready' } }) };
  });
  const recoveryState = { set: jest.fn() };
  const publishRecovery = jest.fn(async () => true);
  const join = createSupervisorRecoveryJoiner({ identity: { name: 'elera-0' }, token: 'root', timeoutMs: 100, recoveryState, recoveryAudit: {}, publishRecovery, fetchImpl });
  await expect(join({ bootstrap: { epoch: 1, clusterId: 'cluster' }, members: [{ name: 'elera-0', address: 'elera-0' }, { name: 'elera-1', address: 'elera-1' }, { name: 'elera-2', address: 'elera-2' }] })).resolves.toEqual({ completed: ['elera-1', 'elera-2'] });
  expect(calls).toEqual(['http://elera-1:8080/api/v1/cluster/cold-recovery/join', 'http://elera-1:8080/api/v1/cluster/status', 'http://elera-2:8080/api/v1/cluster/cold-recovery/join', 'http://elera-2:8080/api/v1/cluster/status']);
  expect(publishRecovery).toHaveBeenCalledWith({ members: ['elera-1', 'elera-2'] });
});
