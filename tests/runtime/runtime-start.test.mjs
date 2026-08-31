import { expect, test } from '@jest/globals';
import { startSupervisorRuntime } from '../../src/runtime/runtime-start.mjs';

test('starts supervisor runtime dependencies', async () => {
  const result = await startSupervisorRuntime({ dbEnv: { ELERA_DB_HOST: '127.0.0.1', ELERA_DB_PORT: '3306' }, probes: { listen: () => {} }, config: { httpPort: 8080, startupTimeoutMs: 1, elera: false }, health: { status: async () => ({ ready: true }) }, log: { info: () => {}, warn: () => {} }, startupDecision: { mode: 'standalone' }, initialIntent: { cluster: { name: 'cluster-a', members: [] } }, recoveryState: {}, recoveryAudit: {}, identity: { name: 'node-a' }, routingEvent: () => undefined, routingBus: { publish: () => {} }, sharedRoutingAssignments: { applications: () => [] }, observationStore: {}, getDrained: () => false, environment: {} });
  expect(result.db).toBeDefined(); expect(result.sqlReady).toBe(true); expect(result.routingTimer).toBeDefined(); clearInterval(result.routingTimer); clearInterval(result.peerTimer);
});

test('passes configured peer credentials and application to routing startup', async () => {
  const result = await startSupervisorRuntime({ dbEnv: {}, probes: { listen: () => {} }, config: { httpPort: 8080, startupTimeoutMs: 1, elera: false }, health: { status: async () => ({ ready: true }) }, log: { info: () => {}, warn: () => {} }, startupDecision: { mode: 'standalone' }, initialIntent: { cluster: { name: 'cluster-a', members: [] } }, recoveryState: {}, recoveryAudit: {}, identity: { name: 'node-a' }, routingEvent: () => undefined, routingBus: { publish: () => {} }, sharedRoutingAssignments: { applications: () => [] }, observationStore: { upsert: () => {} }, getDrained: () => false, environment: { ELERA_APPLICATION: 'payments', ELERA_PEER_TOKEN: 'peer-token', ELERA_PEERS: 'node-b' } });
  clearInterval(result.routingTimer); clearInterval(result.peerTimer);
  expect(result.sqlReady).toBe(true);
});

test('starts runtime in Elera join mode', async () => {
  const status = async () => ({ ready: true, values: { wsrep_cluster_state_uuid: 'cluster-a', wsrep_local_state_comment: 'Synced', wsrep_ready: 'ON', wsrep_cluster_status: 'Primary', wsrep_cluster_size: 0 } });
  const result = await startSupervisorRuntime({ dbEnv: {}, probes: { listen: () => {} }, config: { httpPort: 8080, startupTimeoutMs: 1, elera: true }, health: { status }, log: { info: () => {}, warn: () => {} }, startupDecision: { mode: 'join', epoch: 1, recoveryEpoch: { clusterId: 'cluster-a' } }, initialIntent: { cluster: { name: 'cluster-a', members: [] } }, recoveryState: { set: () => {} }, recoveryAudit: { joinComplete: () => {}, failure: () => {} }, identity: { name: 'node-a' }, routingEvent: () => undefined, routingBus: { publish: () => {} }, sharedRoutingAssignments: { applications: () => [] }, observationStore: { upsert: () => {} }, getDrained: () => false, environment: {} });
  clearInterval(result.routingTimer); clearInterval(result.peerTimer);
  expect(result.sqlReady).toBe(true);
});
