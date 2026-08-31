import { expect, jest, test } from '@jest/globals';
import { createSupervisorTraffic } from '../../src/runtime/traffic-wiring.mjs';

test('wires drain, SQL quiesce, propagation, and event publication', async () => {
  const telemetry = { recordEvent: jest.fn() }; const routingBus = { publish: jest.fn() }; const health = { status: jest.fn(async () => ({ ready: true })) }; const log = { info: jest.fn(), warn: jest.fn() };
  const traffic = createSupervisorTraffic({ telemetry, identity: { name: 'node-a' }, config: { shutdownTimeoutMs: 10, drainTimeoutMs: 10 }, health, routingBus, log, environment: { ELERA_PEERS: 'node-b', ROOT_TOKEN: 'root' }, getDb: () => undefined });
  traffic.clusterDrain.set(true); await Promise.resolve(); expect(traffic.getDrained()).toBe(true); expect(telemetry.recordEvent).toHaveBeenCalledWith('traffic.drain'); expect(routingBus.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'routing.drain', node: 'node-a' }));
  traffic.drain.end(); await Promise.resolve(); expect(traffic.getDrained()).toBe(false); expect(routingBus.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'routing.recovery', node: 'node-a' }));
});

test('includes the load-balancer endpoint in propagated drain context', async () => { const bus = { publish: jest.fn() }; const traffic = createSupervisorTraffic({ telemetry: { recordEvent: jest.fn() }, identity: { name: 'node-a' }, config: { shutdownTimeoutMs: 10, drainTimeoutMs: 10 }, health: { status: async () => ({ ready: true }) }, routingBus: bus, log: { info: jest.fn() }, environment: { ELERA_PEERS: '', ROOT_TOKEN: 'root', ELERA_LOAD_BALANCER_ENDPOINT: 'http://lb' }, getDb: () => undefined }); traffic.drain.begin(); await Promise.resolve(); expect(bus.publish).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ loadBalancerEndpoint: 'http://lb' }) })); });

test('bridges drain state to the supervisor entrypoint', () => { const setDrained = jest.fn(); const traffic = createSupervisorTraffic({ telemetry: { recordEvent: jest.fn() }, identity: { name: 'node-a' }, config: { shutdownTimeoutMs: 10, drainTimeoutMs: 10 }, health: { status: async () => ({ ready: true }) }, routingBus: { publish: jest.fn() }, log: { info: jest.fn() }, environment: { ELERA_PEER_TOKEN: 'peer' }, getDb: () => undefined, setDrained }); traffic.drain.begin(); expect(setDrained).toHaveBeenCalledWith(true); });

test('recovers ordinary restart state and publishes recovery after readiness', async () => {
  const setDrained = jest.fn(); const publish = jest.fn();
  const traffic = createSupervisorTraffic({ telemetry: { recordEvent: jest.fn() }, identity: { name: 'node-a' }, config: { shutdownTimeoutMs: 10, drainTimeoutMs: 10 }, health: { status: async () => ({ ready: true }) }, routingBus: { publish }, log: { info: jest.fn() }, environment: { ROOT_TOKEN: 'root' }, getDb: () => undefined, setDrained });
  await traffic.recover();
  expect(traffic.getDrained()).toBe(false);
  expect(setDrained).toHaveBeenCalledWith(false);
  expect(publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'routing.recovery', node: 'node-a' }));
});
