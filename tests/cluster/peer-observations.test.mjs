import { jest } from '@jest/globals';
import { createPeerObservationClient } from '../../src/cluster/peer-observations.mjs';
const observation = { nodeId: 'n2', clusterId: 'c', state: 'Synced', synced: true, primary: 'p', health: 'ok', observedAt: 100 };
test('refreshes authenticated peer observations into the store', async () => { const calls = []; const client = createPeerObservationClient({ peers: ['http://peer/'], token: 'secret', fetchImpl: async (url, options) => { calls.push([url, options]); return { ok: true, json: async () => ({ data: [observation] }) }; }, store: { upsert: item => ({ accepted: item.nodeId === 'n2' }) } }); expect(await client.refresh()).toEqual([{ accepted: true }]); expect(calls[0][0]).toBe('http://peer/api/v1/cluster/observations'); expect(calls[0][1].headers.authorization).toBe('Bearer secret'); });
test('reports unavailable and malformed peers without aborting refresh', async () => { const warnings = []; const client = createPeerObservationClient({ peers: ['http://bad', 'http://malformed'], fetchImpl: async url => url.includes('bad') ? { ok: false, status: 503 } : { ok: true, json: async () => ({ data: [{}] }) }, store: { upsert: () => ({ accepted: true }) }, log: { warn: (...args) => warnings.push(args) } }); const result = await client.refresh(); expect(result[0].reason).toBe('unavailable'); expect(warnings).toHaveLength(2); });
test('requires an observation store', () => { expect(() => createPeerObservationClient()).toThrow('observation store'); });
test('supports an empty peer set and unavailable peers without a logger', async () => { const client = createPeerObservationClient({ store: { upsert: () => ({}) }, peers: [] }); expect(await client.refresh()).toEqual([]); const unavailable = createPeerObservationClient({ store: { upsert: () => ({}) }, peers: ['http://bad'], fetchImpl: async () => ({ ok: false, status: 500 }) }); expect((await unavailable.refresh())[0].reason).toBe('unavailable'); });
test('accepts a peer response without data', async () => { const client = createPeerObservationClient({ store: { upsert: () => ({}) }, peers: ['http://peer'], fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }); expect(await client.refresh()).toEqual([]); });
test('publishes observations with authenticated JSON and reports peer failures', async () => {
  const calls = []; const warnings = [];
  const client = createPeerObservationClient({ peers: ['http://one/', 'http://bad'], token: 'secret', timeoutMs: 50, fetchImpl: async (url, options) => { calls.push([url, options]); if (url.includes('bad')) return { ok: false, status: 503 }; return { ok: true }; }, store: { upsert: () => {} }, log: { warn: (...args) => warnings.push(args) } });
  await expect(client.publish(observation)).resolves.toEqual([{ accepted: true }, { accepted: false, reason: 'unavailable' }]);
  expect(calls[0][0]).toBe('http://one/api/v1/cluster/observations');
  expect(calls[0][1].headers['content-type']).toBe('application/json');
  expect(JSON.parse(calls[0][1].body)).toEqual(observation);
  expect(warnings).toHaveLength(1);
});
test('reports refresh transport failures through the warning hook', async () => {
  const warn = jest.fn();
  const client = createPeerObservationClient({ peers: ['http://peer'], fetchImpl: async () => { throw new Error('network'); }, store: { upsert: () => {} }, log: { warn } });
  await expect(client.refresh()).resolves.toEqual([{ accepted: false, reason: 'unavailable' }]);
  expect(warn).toHaveBeenCalled();
});
