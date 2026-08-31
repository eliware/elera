import { expect, jest, test } from '@jest/globals';
import { createSupervisorColdRecovery } from '../../src/runtime/cold-recovery-wiring.mjs';

test('wires local and peer evidence into the recovery protocol', async () => {
  const evidence = { local: { state: 'local' }, remote: jest.fn() };
  const store = { write: jest.fn() };
  const protocol = { plan: jest.fn() };
  let evidenceOptions;
  let protocolOptions;
  const result = createSupervisorColdRecovery({ identity: { name: 'node-a' }, config: { dataDir: '/data', httpPort: 8080, members: [{ name: 'node-a', address: '10.0.0.1' }, { name: 'node-b', address: '10.0.0.2' }] }, health: {}, runRecover: jest.fn(), recoveryAudit: { event: jest.fn() }, environment: { ROOT_TOKEN: 'root', ELERA_RECOVERY_DECISION_PATH: '/tmp/decision' }, createEvidence: (options) => { evidenceOptions = options; return evidence; }, createProtocol: (options) => { protocolOptions = options; return protocol; }, createStore: (path) => { expect(path).toBe('/tmp/decision'); return store; } });
  expect(result).toEqual({ evidence, members: [{ name: 'node-a', address: '10.0.0.1', local: true, url: 'http://10.0.0.1:8080' }, { name: 'node-b', address: '10.0.0.2', local: false, url: 'http://10.0.0.2:8080' }], protocol });
  expect(evidenceOptions.token).toBe('root');
  expect(protocolOptions.nodes).toHaveLength(2);
  await protocolOptions.publishEvent({ type: 'recovery.test' });
  expect(protocolOptions.store).toBe(store);
});

test('supports a missing member list and default decision path', () => {
  const result = createSupervisorColdRecovery({ identity: { name: 'node-a' }, config: { dataDir: '/data', httpPort: 8080 }, health: {}, recoveryAudit: { event: jest.fn() }, createEvidence: () => ({ local: {}, remote: jest.fn() }), createProtocol: (options) => options, createStore: () => ({}) });
  expect(result.members).toEqual([]);
});
