import { createStartupRecoveryDecision } from '../../../src/cluster/cold-bootstrap/startup-decision.mjs';

const state = (node, seqno, safeToBootstrap = false) => ({ node, state: { uuid: 'cluster', seqno, safeToBootstrap }, active: false });
const nodes = [{ name: 'a', local: true }, { name: 'b' }, { name: 'c' }];

test('validates required startup decision dependencies', () => {
  expect(() => createStartupRecoveryDecision()).toThrow('complete node inventory');
  expect(() => createStartupRecoveryDecision({ nodes: [{ name: 'a' }, { name: 'a' }], localEvidence: async () => {}, fetchEvidence: async () => {} })).toThrow('complete node inventory');
});

test('rejects an incomplete inventory before collecting evidence', () => {
  expect(() => createStartupRecoveryDecision({ nodes, expectedNodeCount: 4, localEvidence: async () => {}, fetchEvidence: async () => {} })).toThrow('complete node inventory');
});

test('selects one local winner from quorum evidence and assigns an epoch', async () => {
  const decide = createStartupRecoveryDecision({ nodes, localEvidence: async () => state('a', 12), fetchEvidence: async (node) => state(node.name, node.name === 'b' ? 20 : 19), epoch: () => 'epoch-1' });
  await expect(decide()).resolves.toMatchObject({ mode: 'bootstrap', winner: 'b', localWinner: false, epoch: 'epoch-1' });
});

test('blocks ambiguous or unavailable evidence without bootstrap', async () => {
  const decide = createStartupRecoveryDecision({ nodes, localEvidence: async () => state('a', -1), fetchEvidence: async (node) => state(node.name, -1), attempts: 1 });
  await expect(decide()).resolves.toMatchObject({ mode: 'blocked', reason: 'no recoverable seqno exists' });
});

test('joins when a peer is already active', async () => {
  const decide = createStartupRecoveryDecision({ nodes, localEvidence: async () => state('a', 1), fetchEvidence: async (node) => ({ ...state(node.name, 2), active: true }), epoch: () => 'unused' });
  await expect(decide()).resolves.toMatchObject({ mode: 'join', reason: 'primary component already exists' });
});

test('retries transient evidence failures and creates a fencing epoch', async () => {
  let failures = 1;
  const decide = createStartupRecoveryDecision({ nodes, localEvidence: async () => state('a', 12), fetchEvidence: async (node) => { if (node.name === 'b' && failures-- > 0) throw new Error('peer unavailable'); return state(node.name, node.name === 'b' ? 20 : 19); }, attempts: 2, delayMs: 0 });
  await expect(decide()).resolves.toMatchObject({ mode: 'bootstrap', winner: 'b' });
});

test('blocks when evidence never becomes available', async () => {
  const decide = createStartupRecoveryDecision({ nodes, localEvidence: async () => state('a', 1), fetchEvidence: async () => { throw new Error('timeout'); }, attempts: 1, delayMs: 0 });
  await expect(decide()).resolves.toMatchObject({ mode: 'blocked', reason: 'recovery evidence unavailable: timeout' });
});

test('uses a stable timeout diagnostic when a peer fails without a message', async () => {
  const decide = createStartupRecoveryDecision({ nodes, localEvidence: async () => state('a', 1), fetchEvidence: async () => { throw {}; }, attempts: 1, delayMs: 0 });
  await expect(decide()).resolves.toMatchObject({ mode: 'blocked', reason: 'recovery evidence unavailable: timeout' });
});

test('blocks when quorum is lost during total shutdown or two-node loss', async () => {
  const decide = createStartupRecoveryDecision({ nodes, localEvidence: async () => state('a', -1), fetchEvidence: async () => { throw new Error('peer unavailable'); }, attempts: 1, delayMs: 0 });
  await expect(decide()).resolves.toMatchObject({ mode: 'blocked', reason: 'recovery evidence unavailable: peer unavailable' });
});

test('does not bootstrap during a normal restart when a primary peer is active', async () => {
  const decide = createStartupRecoveryDecision({ nodes, localEvidence: async () => state('a', 12), fetchEvidence: async (node) => ({ ...state(node.name, 12), active: node.name === 'b' }) });
  await expect(decide()).resolves.toMatchObject({ mode: 'join', bootstrapComplete: true });
});
test('joins an active peer even when another configured peer is offline', async () => {
  const decide = createStartupRecoveryDecision({ nodes, localEvidence: async () => state('a', 12), fetchEvidence: async (node) => { if (node.name === 'c') throw new Error('offline'); return { ...state(node.name, 12), active: node.name === 'b' }; }, attempts: 1 });
  await expect(decide()).resolves.toMatchObject({ mode: 'join', bootstrapComplete: true });
});
test('requires a Galera peer to be Primary, Synced, and ready when status is present', async () => {
  const make = (galera) => createStartupRecoveryDecision({ nodes, localEvidence: async () => state('a', 12), fetchEvidence: async (node) => ({ ...state(node.name, 12), active: node.name === 'b', ...(node.name === 'b' ? { galera } : {}) }), attempts: 1 });
  await expect(make({ clusterStatus: 'Primary', localState: 'Synced', ready: true })()).resolves.toMatchObject({ mode: 'join' });
  await expect(make({ clusterStatus: 'Non-Primary', localState: 'Synced', ready: true })()).resolves.toMatchObject({ mode: 'bootstrap' });
});
