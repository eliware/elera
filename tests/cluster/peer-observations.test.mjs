import { jest } from '@jest/globals';
import { createPeerObservationClient } from '../../src/cluster/peer-observations.mjs';
const observation = { nodeId: 'peer.example.test', clusterId: 'c', state: 'Synced', synced: true, primary: 'Primary', health: 'ok', observedAt: 100 };
test('refreshes authenticated peer observations into the store', async () => { const calls = []; const client = createPeerObservationClient({ peers: ['http://peer.example.test/'], token: 'secret', fetchImpl: async (url, options) => { calls.push([url, options]); return { ok: true, json: async () => ({ data: [observation] }) }; }, store: { upsert: item => ({ accepted: item.nodeId === 'peer.example.test' }) } }); expect(await client.refresh()).toEqual([{ accepted: true }]); expect(calls[0][0]).toBe('http://peer.example.test/api/v1/cluster/observations'); expect(calls[0][1].headers.authorization).toBe('Bearer secret'); });
test('reports unavailable and malformed peers without aborting refresh', async () => { const warnings = []; const client = createPeerObservationClient({ peers: ['http://bad.example.test', 'http://malformed.example.test'], fetchImpl: async url => url.includes('bad') ? { ok: false, status: 503 } : { ok: true, json: async () => ({ data: [{}] }) }, store: { upsert: () => ({ accepted: true }) }, log: { warn: (...args) => warnings.push(args) } }); const result = await client.refresh(); expect(result[0].reason).toBe('unavailable'); expect(warnings).toHaveLength(2); });
test('requires an observation store', () => { expect(() => createPeerObservationClient()).toThrow('observation store'); });
test('supports an empty peer set and unavailable peers without a logger', async () => { const client = createPeerObservationClient({ store: { upsert: () => ({}) }, peers: [] }); expect(await client.refresh()).toEqual([]); const unavailable = createPeerObservationClient({ store: { upsert: () => ({}) }, peers: ['http://bad.example.test'], fetchImpl: async () => ({ ok: false, status: 500 }) }); expect((await unavailable.refresh())[0].reason).toBe('unavailable'); });
test('accepts a peer response without data', async () => { const client = createPeerObservationClient({ store: { upsert: () => ({}) }, peers: ['http://peer.example.test'], fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }); expect(await client.refresh()).toEqual([]); });
test('publishes observations with authenticated JSON and reports peer failures', async () => {
  const calls = []; const warnings = [];
  const client = createPeerObservationClient({ peers: ['http://one.example.test/', 'http://bad.example.test'], token: 'secret', timeoutMs: 50, fetchImpl: async (url, options) => { calls.push([url, options]); if (url.includes('bad')) return { ok: false, status: 503 }; return { ok: true }; }, store: { upsert: () => {} }, log: { warn: (...args) => warnings.push(args) } });
  await expect(client.publish(observation)).resolves.toEqual([{ accepted: true }, { accepted: false, reason: 'unavailable' }]);
  expect(calls[0][0]).toBe('http://one.example.test/api/v1/cluster/observations');
  expect(calls[0][1].headers['content-type']).toBe('application/json');
  expect(JSON.parse(calls[0][1].body)).toEqual(observation);
  expect(warnings).toHaveLength(1);
});
test('reports refresh transport failures through the warning hook', async () => {
  const warn = jest.fn();
  const client = createPeerObservationClient({ peers: ['http://peer.example.test'], fetchImpl: async () => { throw new Error('network'); }, store: { upsert: () => {} }, log: { warn } });
  await expect(client.refresh()).resolves.toEqual([{ accepted: false, reason: 'unavailable' }]);
  expect(warn).toHaveBeenCalled();
});

test('rejects short peer URLs and rejects observations from the wrong peer identity', async () => {
  const store = { upsert: jest.fn(() => ({ accepted: true })) };
  expect(() => createPeerObservationClient({ peers: ['http://peer'], store })).toThrow('fully qualified');
  const client = createPeerObservationClient({ peers: ['http://peer.example.test'], store, fetchImpl: async () => ({ ok: true, json: async () => ({ data: [{ ...observation, nodeId: 'other.example.test' }] }) }), log: { warn: jest.fn() } });
  expect(await client.refresh()).toEqual([{ accepted: false, reason: 'identity-mismatch' }]);
  expect(store.upsert).not.toHaveBeenCalled();
});
