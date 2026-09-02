import { expect, jest, test } from '@jest/globals';
import { createObservationStore } from '../../src/cluster/observation-store.mjs';
import { evaluateQuorum } from '../../src/cluster/quorum.mjs';
import { calculateRoutes } from '../../src/routing/decision.mjs';
import { createQuorumAssignmentCoordinator } from '../../src/routing/quorum-assignment.mjs';
import { selectCandidate } from '../../src/cluster/cold-bootstrap/candidate.mjs';

const observation = (nodeId, overrides = {}) => ({ nodeId, clusterId: 'elera', state: 'Synced', synced: true, primary: 'Primary', health: 'ok', address: `${nodeId}.elera`, sqlPort: 3306, observedAt: 100, ...overrides });
const stores = () => [createObservationStore({ now: () => 100 }), createObservationStore({ now: () => 100 }), createObservationStore({ now: () => 100 })];

test('three supervisors converge on a writer while preserving reader candidates', async () => {
  const shared = new Map(); const nodes = ['elera-0.cluster.local', 'elera-1.cluster.local', 'elera-2.cluster.local']; const observations = nodes.map((node) => observation(node));
  const storesForSupervisors = stores();
  storesForSupervisors.forEach((store) => observations.forEach((item) => store.upsert(item)));
  const routes = calculateRoutes({ application: 'payments', observations, now: 100 });
  expect(routes.primary).toHaveLength(3); expect(routes.readers).toHaveLength(3);
  for (const store of storesForSupervisors) {
    const coordinator = createQuorumAssignmentCoordinator({ assignmentStore: { get: async () => shared.get('payments'), set: async (_app, writer) => { shared.set('payments', writer); return writer; } }, observationStore: store, environment: { ELERA_CLUSTER_SIZE: '3' }, now: () => 100 });
    await coordinator.write('payments', routes.writer.host);
  }
  expect(shared.get('payments')).toBe(routes.writer.host);
});

test('quorum loss stops assignment changes and conflicting cluster views are rejected', async () => {
  const observations = [observation('elera-0.cluster.local'), observation('elera-1.cluster.local'), observation('elera-2.cluster.local')];
  expect(evaluateQuorum(observations, { expectedSize: 3, now: 100 }).quorum).toBe(true);
  const store = createObservationStore({ now: () => 100 }); observations.slice(0, 1).forEach((item) => store.upsert(item));
  const set = jest.fn(); const coordinator = createQuorumAssignmentCoordinator({ assignmentStore: { get: async () => 'elera-0.cluster.local.elera', set }, observationStore: store, environment: { ELERA_CLUSTER_SIZE: '3' }, now: () => 100 });
  await expect(coordinator.write('payments', 'elera-0.cluster.local.elera')).rejects.toMatchObject({ code: 'QUORUM_REQUIRED' }); expect(set).not.toHaveBeenCalled();
  expect(evaluateQuorum(observations.map((item, index) => index === 2 ? { ...item, clusterId: 'foreign' } : item), { expectedSize: 3, now: 100 }).reason).toBe('conflicting-clusters');
});

test('rejects a split-brain view with conflicting primary identities', () => {
  const observations = [
    observation('elera-0.cluster.local'),
    observation('elera-1.cluster.local'),
    observation('elera-2.cluster.local', { primary: 'other-primary' })
  ];
  expect(evaluateQuorum(observations, { expectedSize: 3, now: 100 }).quorum).toBe(false);
  expect(evaluateQuorum(observations, { expectedSize: 3, now: 100 }).reason).toBe('conflicting-primaries');
});

test('last surviving member cannot claim a writer after total cluster loss', async () => {
  const observations = [observation('elera-0.cluster.local', { observedAt: 100 }), observation('elera-1.cluster.local', { observedAt: 0 }), observation('elera-2.cluster.local', { observedAt: 0 })];
  const store = createObservationStore({ now: () => 100 }); store.upsert(observations[0]);
  const coordinator = createQuorumAssignmentCoordinator({ assignmentStore: { get: async () => 'elera-0.cluster.local.elera', set: jest.fn() }, observationStore: store, environment: { ELERA_CLUSTER_SIZE: '3' }, now: () => 100 });
  await expect(coordinator.write('payments', 'elera-0.cluster.local.elera')).rejects.toMatchObject({ code: 'QUORUM_REQUIRED' });
  expect(selectCandidate([{ node: 'elera-0.example.test', uuid: 'cluster', seqno: 9 }, { node: 'elera-1.example.test', uuid: 'cluster', seqno: 8 }, { node: 'elera-2.example.test', uuid: 'cluster', seqno: 7 }])).toMatchObject({ eligible: true, candidate: { node: 'elera-0.example.test' } });
});
