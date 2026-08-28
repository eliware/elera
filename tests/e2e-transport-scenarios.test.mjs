import { verifyNodeLoss, verifyRoutingFallback, verifyServiceRestart, verifyTwoNodeLoss } from '../docker/e2e/transport-scenarios.mjs';
import { resetLab, startFreshLab } from '../docker/e2e/lab-reset.mjs';

test('verifies WebSocket updates and REST bundle fallback', async () => {
  const events = [];
  await expect(verifyRoutingFallback({ stream: { connect: async ({ onUpdate }) => { onUpdate({ type: 'routing.update' }); }, disconnect: async () => {} }, rest: { bundle: async () => ({ bundleVersion: '2' }) }, expectedVersion: '2' })).resolves.toEqual({ websocketUpdates: 1, fallback: true, bundleVersion: '2' });
  expect(events).toHaveLength(0);
});

test('verifies one-node loss excludes the failed node', async () => {
  const lab = { stop: async () => {}, assertExcluded: async () => {} };
  const client = { snapshot: async () => ({ probes: [{ selectedNode: 'elera-1' }] }) };
  await expect(verifyNodeLoss({ lab, client, node: 'elera-0' })).resolves.toMatchObject({ node: 'elera-0', excluded: true });
});

test('rejects a client that still selects a failed node', async () => {
  await expect(verifyNodeLoss({ lab: { stop: async () => {}, assertExcluded: async () => {} }, client: { snapshot: async () => ({ probes: [{ selectedNode: 'elera-0' }] }) }, node: 'elera-0' })).rejects.toThrow('continued selecting');
});
test('verifies two-node loss excludes both failed nodes', async () => {
  const stopped = [];
  await expect(verifyTwoNodeLoss({ nodes: ['elera-0', 'elera-1'], lab: { stop: async (node) => stopped.push(node), assertExcluded: async () => {} }, client: { snapshot: async () => ({ probes: [{ selectedNode: 'elera-2' }] }) } })).resolves.toMatchObject({ excluded: true });
  expect(stopped).toEqual(['elera-0', 'elera-1']);
});

test('verifies supervisor and MariaDB restart recovery', async () => {
  const lab = { restart: async () => {}, assertReady: async () => {} };
  const client = { bundle: async () => ({ bundleVersion: '3' }) };
  await expect(verifyServiceRestart({ lab, client, service: 'supervisor' })).resolves.toMatchObject({ recovered: true });
  await expect(verifyServiceRestart({ lab, client, service: 'mariadb' })).resolves.toMatchObject({ recovered: true });
  await expect(verifyServiceRestart({ lab, client: { bundle: async () => ({}) }, service: 'mariadb' })).rejects.toThrow('did not restore');
});

test('resets named volumes before a fresh lab start', async () => {
  const calls = [];
  const exec = async (...args) => calls.push(args);
  await expect(resetLab({ exec, compose: 'lab.yaml', profile: 'cluster' })).resolves.toMatchObject({ reset: true, volumesRemoved: true });
  await expect(startFreshLab({ exec, compose: 'lab.yaml', profile: 'cluster' })).resolves.toMatchObject({ reset: true, started: true });
  expect(calls[0][1]).toEqual(['compose', '-f', 'lab.yaml', '--profile', 'cluster', 'down', '--volumes', '--remove-orphans']);
  expect(calls.at(-1)[1]).toEqual(['compose', '-f', 'lab.yaml', '--profile', 'cluster', 'up', '--detach', '--build']);
});
test('requires a lab executor for reset', async () => {
  await expect(resetLab()).rejects.toThrow('lab executor');
});
test('rejects stale REST fallback bundles', async () => {
  await expect(verifyRoutingFallback({ stream: { connect: async () => {} }, rest: { bundle: async () => ({ bundleVersion: '1' }) }, expectedVersion: '2' })).rejects.toThrow('stale');
});
