import { expect, jest, test } from '@jest/globals';
import { createColdRecoveryProtocol } from '../../../src/cluster/cold-bootstrap/protocol.mjs';

const evidence = (node, seqno) => ({ node, state: { uuid: 'cluster', seqno, safeToBootstrap: false }, active: false, generation: 1, observedAt: new Date().toISOString() });
const makeProtocol = () => {
  const store = { value: undefined, read: jest.fn(async function () { return this.value; }), write: jest.fn(async function (value) { this.value = value; return value; }) };
  const protocol = createColdRecoveryProtocol({ nodes: [{ name: 'a', url: 'http://a', local: true }, { name: 'b', url: 'http://b' }, { name: 'c', url: 'http://c' }], localEvidence: async () => evidence('a', 3), fetchEvidence: async (url) => evidence(url.slice(-1), 2), store });
  return { protocol, store };
};

test('plans a deterministic epoch from complete peer evidence', async () => {
  const { protocol } = makeProtocol();
  await expect(protocol.plan()).resolves.toMatchObject({ eligible: true, phase: 'evidence', winner: { node: 'a' }, quorum: ['a', 'b', 'c'] });
});

test('logs the full candidate decision after full evidence', async () => {
  const debug = jest.fn();
  const current = (node, seqno) => ({ ...evidence(node, seqno), state: { uuid: 'current', seqno, safeToBootstrap: false } });
  const protocol = createColdRecoveryProtocol({
    nodes: [{ name: 'a', local: true }, { name: 'b', url: 'b' }, { name: 'c', url: 'c' }],
    localEvidence: async () => current('a', 10),
    fetchEvidence: async (url) => ({ b: current('b', 9), c: current('c', 8) })[url],
    store: { async read() {}, async write(value) { return value; } },
    log: { debug },
  });
  await expect(protocol.plan()).resolves.toMatchObject({ eligible: true, divergent: [] });
  expect(debug).toHaveBeenCalledWith('Recovery candidate decision complete', expect.objectContaining({ candidate: 'a', divergentCount: 0 }));
});

test('publishes lifecycle events for evidence, candidate, authorization, bootstrap, and completion', async () => {
  const events = [];
  const eventProtocol = createColdRecoveryProtocol({ nodes: [{ name: 'a', local: true }, { name: 'b', url: 'b' }, { name: 'c', url: 'c' }], localEvidence: async () => evidence('a', 3), fetchEvidence: async (url) => evidence(url, 2), store: { value: undefined, async read() { return this.value; }, async write(value) { this.value = value; } }, publishEvent: async (event) => events.push(event) });
  const plan = await eventProtocol.plan();
  await eventProtocol.authorize({ epoch: plan.epoch, acknowledgements: ['a', 'b', 'c'] });
  await eventProtocol.beginBootstrap({ epoch: plan.epoch, winner: 'a' });
  await eventProtocol.complete({ epoch: plan.epoch, winner: 'a', clusterId: 'cluster', membership: ['a', 'b', 'c'] });
  expect(events.map((event) => event.type)).toEqual(['recovery.evidence-collected', 'recovery.candidate-selected', 'recovery.bootstrap-authorized', 'recovery.bootstrap-started', 'recovery.bootstrap-complete']);
});

test('requires the exact epoch and quorum before authorization', async () => {
  const { protocol } = makeProtocol();
  const plan = await protocol.plan();
  await expect(protocol.authorize({ epoch: 'stale', acknowledgements: ['a', 'b'] })).rejects.toMatchObject({ statusCode: 409 });
  await expect(protocol.authorize({ epoch: plan.epoch, acknowledgements: ['a', 'b'] })).rejects.toThrow('full-cluster');
  await expect(protocol.authorize({ epoch: plan.epoch, acknowledgements: ['a', 'b', 'c'] })).resolves.toMatchObject({ phase: 'authorized', acknowledgements: new Set(['a', 'b', 'c']) });
});

test('allows an explicit forced authorization to bypass peer acknowledgements', async () => {
  const { protocol } = makeProtocol();
  const plan = await protocol.plan();
  await expect(protocol.authorize({ epoch: plan.epoch, force: true })).resolves.toMatchObject({ phase: 'authorized', operatorForced: true, acknowledgements: new Set(['a', 'b', 'c']) });
});
test('allows a root-mediated temporary two-supervisor quorum', async () => {
  const { protocol } = makeProtocol();
  const plan = await protocol.plan();
  await expect(protocol.authorize({ epoch: plan.epoch, force: true, supervisorQuorum: 2, acknowledgements: ['a', 'b'] })).resolves.toMatchObject({ phase: 'authorized', operatorForced: true, requiredAcknowledgements: 2, acknowledgements: new Set(['a', 'b']) });
});
test('rejects an invalid temporary supervisor quorum', async () => {
  const { protocol } = makeProtocol();
  const plan = await protocol.plan();
  await expect(protocol.authorize({ epoch: plan.epoch, force: true, supervisorQuorum: 0 })).rejects.toMatchObject({ statusCode: 400 });
});

test('rejects stale or malformed evidence before candidate selection', async () => {
  const store = { async read() {}, async write() {} };
  const protocol = createColdRecoveryProtocol({ nodes: [{ name: 'a', local: true }], localEvidence: async () => ({ node: 'a', state: { uuid: 'cluster', seqno: 1, safeToBootstrap: false }, active: false, generation: 1, observedAt: new Date(Date.now() - 20000).toISOString() }), fetchEvidence: async () => undefined, store, maxEvidenceAgeMs: 1000 });
  await expect(protocol.plan()).resolves.toMatchObject({ mode: 'blocked', code: 'STALE_RECOVERY_EVIDENCE' });
});

test('validates required protocol dependencies and exposes collected evidence', async () => {
  expect(() => createColdRecoveryProtocol()).toThrow('dependencies are required');
  expect(() => createColdRecoveryProtocol({ nodes: [], localEvidence: jest.fn(), fetchEvidence: jest.fn(), store: {} })).toThrow('dependencies are required');
  const local = evidence('a', 3);
  const protocol = createColdRecoveryProtocol({ nodes: [{ name: 'a', local: true }], localEvidence: async () => local, fetchEvidence: async () => local, store: { async read() {}, async write(value) { return value; } } });
  await expect(protocol.evidence()).resolves.toMatchObject([{ node: 'a', uuid: 'cluster', seqno: 3 }]);
});
test('normalizes top-level evidence and rejects unknown completion epochs', async () => {
  const item = { node: 'a', uuid: 'cluster', seqno: 1, savedSeqno: 1, recoveredSeqno: 1, safeToBootstrap: false, active: false, generation: 1, observedAt: new Date().toISOString(), dataDirectory: { valid: true } };
  const store = { async read() {}, async write(value) { return value; } };
  const protocol = createColdRecoveryProtocol({ nodes: [{ name: 'a', local: true }], localEvidence: async () => item, fetchEvidence: async () => item, store });
  await expect(protocol.plan()).resolves.toMatchObject({ eligible: true });
  await expect(protocol.authorize({ epoch: 'wrong', acknowledgements: 'a' })).rejects.toMatchObject({ statusCode: 409 });
  await expect(protocol.complete({ epoch: 'wrong', membership: ['a'] })).rejects.toMatchObject({ statusCode: 409 });
  const plan = await protocol.plan();
  await expect(protocol.authorize({ epoch: plan.epoch, acknowledgements: 'not-an-array' })).rejects.toThrow('full-cluster');
  await expect(protocol.beginBootstrap()).rejects.toMatchObject({ statusCode: 409 });
});

test('fails closed when evidence collection throws and can retry with fresh evidence', async () => {
  let fail = true;
  const events = [];
  const store = { value: undefined, async read() { return this.value; }, async write(value) { this.value = value; return value; } };
  const protocol = createColdRecoveryProtocol({
    nodes: [{ name: 'a', local: true }],
    localEvidence: async () => { if (fail) throw Object.assign(new Error('data directory unavailable'), { code: 'DATA_DIRECTORY_INVALID' }); return evidence('a', 1); },
    fetchEvidence: async () => undefined,
    store,
    publishEvent: async (event) => events.push(event),
  });
  await expect(protocol.plan()).resolves.toMatchObject({ mode: 'blocked', code: 'DATA_DIRECTORY_INVALID' });
  fail = false;
  await expect(protocol.retry()).resolves.toMatchObject({ mode: 'bootstrap', eligible: true });
  expect(events.map(({ type }) => type)).toEqual(['recovery.refused', 'recovery.evidence-collected', 'recovery.candidate-selected']);
});

test('joins when a peer already reports an active Primary component', async () => {
  const active = { ...evidence('b', 2), active: true, galera: { clusterUuid: 'cluster', clusterStatus: 'Primary', localState: 'Synced', ready: true, clusterSize: 2 } };
  const store = { async read() {}, async write(value) { return value; } };
  const protocol = createColdRecoveryProtocol({
    nodes: [{ name: 'a', local: true }, { name: 'b', url: 'http://b' }],
    localEvidence: async () => evidence('a', 1),
    fetchEvidence: async () => active,
    store,
  });
  await expect(protocol.plan()).resolves.toMatchObject({ eligible: true, mode: 'join', reason: 'primary component already exists', expectedMembership: 2 });
});

test('joins an active Primary when another configured peer is unavailable', async () => {
  const active = { ...evidence('b', 2), active: true, galera: { clusterUuid: 'cluster', clusterStatus: 'Primary', localState: 'Synced', ready: true } };
  const protocol = createColdRecoveryProtocol({
    nodes: [{ name: 'a', local: true }, { name: 'b', url: 'http://b' }, { name: 'c', url: 'http://c' }],
    localEvidence: async () => evidence('a', 1),
    fetchEvidence: async (url) => { if (url.endsWith('c')) throw new Error('peer unavailable'); return active; },
    store: { async read() {}, async write(value) { return value; } },
  });
  await expect(protocol.plan()).resolves.toMatchObject({ eligible: true, mode: 'join', reason: 'primary component already exists' });
});
test('selects a winner from a validated majority when one peer is unavailable', async () => {
  const protocol = createColdRecoveryProtocol({
    nodes: [{ name: 'a', local: true }, { name: 'b', url: 'http://b' }, { name: 'c', url: 'http://c' }],
    localEvidence: async () => evidence('a', 5),
    fetchEvidence: async (url) => { if (url.endsWith('c')) throw Object.assign(new Error('peer unavailable'), { code: 'PEER_UNAVAILABLE' }); return evidence('b', 4); },
    store: { async read() {}, async write(value) { return value; } },
  });
  await expect(protocol.plan()).resolves.toMatchObject({ eligible: false, mode: 'blocked', code: 'INSUFFICIENT_RECOVERY_EVIDENCE' });
});
test('selects the strongest surviving UUID history and records divergent stale nodes', async () => {
  const stale = { ...evidence('a', 47), state: { uuid: 'old-history', seqno: 47, safeToBootstrap: true } };
  const winner = { ...evidence('b', 5112), state: { uuid: 'current-history', seqno: 5112, safeToBootstrap: false } };
  const follower = { ...evidence('c', 138), state: { uuid: 'current-history', seqno: 138, safeToBootstrap: false } };
  const protocol = createColdRecoveryProtocol({
    nodes: [{ name: 'a', local: true }, { name: 'b', url: 'http://b' }, { name: 'c', url: 'http://c' }],
    localEvidence: async () => stale,
    fetchEvidence: async (url) => url.endsWith('b') ? winner : follower,
    store: { async read() {}, async write(value) { return value; } },
  });
  await expect(protocol.plan()).resolves.toMatchObject({ eligible: true, mode: 'bootstrap', winner: { node: 'b' }, divergent: expect.arrayContaining([expect.objectContaining({ node: 'a' })]) });
});
test('does not treat a Primary from another cluster as a join target', async () => {
  const active = { ...evidence('b', 2), active: true, galera: { clusterUuid: 'other', clusterStatus: 'Primary', localState: 'Synced', ready: true } };
  const protocol = createColdRecoveryProtocol({ nodes: [{ name: 'a', local: true }, { name: 'b', url: 'http://b' }], localEvidence: async () => ({ ...evidence('a', 1), galera: { clusterUuid: 'cluster' } }), fetchEvidence: async () => active, store: { async read() {}, async write(value) { return value; } } });
  await expect(protocol.plan()).resolves.toMatchObject({ mode: 'bootstrap' });
});

test('blocks equal-authority divergent histories and exposes pending status', async () => {
  const store = { value: undefined, async read() { return this.value; }, async write(value) { this.value = value; return value; } };
  const same = (node) => ({ ...evidence(node, 4), state: { uuid: node === 'a' ? 'u1' : 'u2', seqno: 4, safeToBootstrap: false } });
  const protocol = createColdRecoveryProtocol({ nodes: [{ name: 'a', local: true }, { name: 'b', url: 'b' }], localEvidence: async () => same('a'), fetchEvidence: async () => same('b'), store });
  await expect(protocol.plan()).resolves.toMatchObject({ eligible: false, mode: 'blocked', code: 'SPLIT_BRAIN' });
  await expect(protocol.status()).resolves.toMatchObject({ phase: 'blocked' });
});
test('does not let safe markers override recovery ordering', async () => {
  const item = (node) => ({ ...evidence(node, 2), state: { uuid: 'u', seqno: 2, safeToBootstrap: true } });
  const protocol = createColdRecoveryProtocol({ nodes: [{ name: 'a', local: true }, { name: 'b', url: 'b' }], localEvidence: async () => item('a'), fetchEvidence: async () => item('b'), store: { async read() {}, async write(value) { return value; } } });
  await expect(protocol.plan()).resolves.toMatchObject({ eligible: true, mode: 'bootstrap', winner: { node: 'a' } });
});

test('blocks a quorum when no node has a recoverable sequence', async () => {
  const noPosition = (node) => ({ ...evidence(node, -1), state: { uuid: 'u', seqno: -1, safeToBootstrap: true } });
  const protocol = createColdRecoveryProtocol({
    nodes: [{ name: 'a', local: true }, { name: 'b', url: 'b' }],
    localEvidence: async () => noPosition('a'),
    fetchEvidence: async () => noPosition('b'),
    store: { async read() {}, async write(value) { return value; } },
  });
  await expect(protocol.plan()).resolves.toMatchObject({ eligible: false, mode: 'blocked', reason: 'no recoverable seqno exists' });
});

test('rejects invalid completion and preserves the authorized epoch', async () => {
  const { protocol } = makeProtocol();
  const plan = await protocol.plan();
  await protocol.authorize({ epoch: plan.epoch, acknowledgements: ['a', 'b', 'c'] });
  await expect(protocol.complete({ epoch: plan.epoch, winner: 'a', clusterId: 'cluster', membership: ['a'] })).rejects.toMatchObject({ statusCode: 409 });
  await expect(protocol.beginBootstrap({ epoch: plan.epoch, winner: 'wrong' })).rejects.toMatchObject({ statusCode: 409 });
  await expect(protocol.authorize({ epoch: 'old', acknowledgements: ['a', 'b'] })).rejects.toMatchObject({ statusCode: 409 });
});

test('blocks when the candidate cannot be revalidated before bootstrap', async () => {
  const store = { value: undefined, async read() { return this.value; }, async write(value) { this.value = value; return value; } };
  let unavailable = false;
  const protocol = createColdRecoveryProtocol({ nodes: [{ name: 'a', local: true }], localEvidence: async () => { if (unavailable) throw new Error('revalidation unavailable'); return evidence('a', 1); }, fetchEvidence: async () => undefined, store });
  const plan = await protocol.plan();
  await protocol.authorize({ epoch: plan.epoch, acknowledgements: ['a'] });
  unavailable = true;
  await expect(protocol.beginBootstrap({ epoch: plan.epoch, winner: 'a' })).rejects.toMatchObject({ statusCode: 409 });
  await expect(protocol.status()).resolves.toMatchObject({ phase: 'blocked', reason: 'revalidation unavailable' });
});

test('returns pending status when no recovery epoch is persisted', async () => {
  const protocol = createColdRecoveryProtocol({ nodes: [{ name: 'a', local: true }], localEvidence: async () => evidence('a', 1), fetchEvidence: async () => undefined, store: { async read() { return undefined; }, async write(value) { return value; } } });
  await expect(protocol.status()).resolves.toEqual({ phase: 'pending' });
});
test('rejects completion from a different winner or cluster', async () => {
  const { protocol } = makeProtocol();
  const plan = await protocol.plan();
  await expect(protocol.complete({ epoch: plan.epoch, winner: 'b', clusterId: 'cluster', membership: ['a', 'b', 'c'] })).rejects.toMatchObject({ statusCode: 409 });
  await expect(protocol.complete({ epoch: plan.epoch, winner: 'a', clusterId: 'other', membership: ['a', 'b', 'c'] })).rejects.toMatchObject({ statusCode: 409 });
});
test('blocks changed evidence after authorization', async () => {
  let sequence = 0;
  const store = { value: undefined, async read() { return this.value; }, async write(value) { this.value = value; return value; } };
  const protocol = createColdRecoveryProtocol({ nodes: [{ name: 'a', local: true }], localEvidence: async () => evidence('a', ++sequence), fetchEvidence: async (node) => evidence(node, 1), store });
  const plan = await protocol.plan(); await protocol.authorize({ epoch: plan.epoch, acknowledgements: ['a'] });
  await expect(protocol.beginBootstrap({ epoch: plan.epoch, winner: 'a' })).rejects.toMatchObject({ statusCode: 409, code: 'RECOVERY_EVIDENCE_CHANGED' });
});
test('uses the configured node value when a remote URL is omitted', async () => {
  const protocol = createColdRecoveryProtocol({ nodes: [{ name: 'a', local: false }], localEvidence: async () => evidence('a', 1), fetchEvidence: async (node) => evidence(node, 1), store: { async read() {}, async write(value) { return value; } } });
  await expect(protocol.evidence()).resolves.toMatchObject([{ node: { name: 'a', local: false } }]);
});
test('uses the default unavailable code for an untyped evidence failure', async () => {
  const protocol = createColdRecoveryProtocol({ nodes: [{ name: 'a', local: true }], localEvidence: async () => { throw new Error('temporary failure'); }, fetchEvidence: async () => undefined, store: { async read() {}, async write(value) { return value; } } });
  await expect(protocol.plan()).resolves.toMatchObject({ mode: 'blocked', code: 'RECOVERY_EVIDENCE_UNAVAILABLE' });
});
