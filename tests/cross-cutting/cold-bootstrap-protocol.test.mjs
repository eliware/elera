import { expect, test } from '@jest/globals';
import { createColdRecoveryProtocol } from '../../src/cluster/cold-bootstrap/protocol.mjs';
const evidence = (node, seqno) => ({ node, state: { uuid: 'cluster', seqno, safeToBootstrap: false }, active: false, generation: 1, observedAt: new Date().toISOString() });
test('requires authorization before bootstrap authority can begin', async () => {
  const store = { value: undefined, async read() { return this.value; }, async write(value) { this.value = value; return value; } };
  const protocol = createColdRecoveryProtocol({ nodes: [{ name: 'a.example.test', local: true }, { name: 'b.example.test', url: 'http://b.example.test' }, { name: 'c.example.test', url: 'http://c.example.test' }], localEvidence: async () => evidence('a.example.test', 3), fetchEvidence: async (node) => evidence(node.name, 2), store });
  const plan = await protocol.plan();
  await expect(protocol.beginBootstrap({ epoch: plan.epoch, winner: 'a.example.test' })).rejects.toThrow('authority');
  await protocol.authorize({ epoch: plan.epoch, acknowledgements: ['a.example.test', 'b.example.test', 'c.example.test'] });
  await expect(protocol.beginBootstrap({ epoch: plan.epoch, winner: 'a.example.test' })).resolves.toMatchObject({ phase: 'bootstrapping' });
});

test('blocks bootstrap when evidence changes after authorization', async () => {
  const store = { value: undefined, async read() { return this.value; }, async write(value) { this.value = value; return value; } };
  let changed = false;
  const protocol = createColdRecoveryProtocol({ nodes: [{ name: 'a.example.test', local: true }, { name: 'b.example.test', url: 'http://b.example.test' }, { name: 'c.example.test', url: 'http://c.example.test' }], localEvidence: async () => evidence('a.example.test', changed ? 4 : 3), fetchEvidence: async (node) => evidence(node.name, 2), store });
  const plan = await protocol.plan();
  await protocol.authorize({ epoch: plan.epoch, acknowledgements: ['a.example.test', 'b.example.test', 'c.example.test'] });
  changed = true;
  await expect(protocol.beginBootstrap({ epoch: plan.epoch, winner: 'a.example.test' })).rejects.toMatchObject({ code: 'RECOVERY_EVIDENCE_CHANGED', statusCode: 409 });
  await expect(protocol.status()).resolves.toMatchObject({ phase: 'blocked' });
});
