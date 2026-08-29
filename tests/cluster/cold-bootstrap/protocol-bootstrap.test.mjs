import { expect, test } from '@jest/globals';
import { createColdRecoveryProtocol } from '../../../src/cluster/cold-bootstrap/protocol.mjs';
const evidence = (node, seqno) => ({ node, state: { uuid: 'cluster', seqno, safeToBootstrap: false }, active: false, generation: 1, observedAt: new Date().toISOString() });
test('requires authorization before bootstrap authority can begin', async () => {
  const store = { value: undefined, async read() { return this.value; }, async write(value) { this.value = value; return value; } };
  const protocol = createColdRecoveryProtocol({ nodes: [{ name: 'a', local: true }, { name: 'b' }, { name: 'c' }], localEvidence: async () => evidence('a', 3), fetchEvidence: async (node) => evidence(node.name, 2), store });
  const plan = await protocol.plan();
  await expect(protocol.beginBootstrap({ epoch: plan.epoch, winner: 'a' })).rejects.toThrow('authority');
  await protocol.authorize({ epoch: plan.epoch, acknowledgements: ['a', 'b'] });
  await expect(protocol.beginBootstrap({ epoch: plan.epoch, winner: 'a' })).resolves.toMatchObject({ phase: 'bootstrapping' });
});

test('blocks bootstrap when evidence changes after authorization', async () => {
  const store = { value: undefined, async read() { return this.value; }, async write(value) { this.value = value; return value; } };
  let changed = false;
  const protocol = createColdRecoveryProtocol({ nodes: [{ name: 'a', local: true }, { name: 'b' }, { name: 'c' }], localEvidence: async () => evidence('a', changed ? 4 : 3), fetchEvidence: async (node) => evidence(node.name, 2), store });
  const plan = await protocol.plan();
  await protocol.authorize({ epoch: plan.epoch, acknowledgements: ['a', 'b'] });
  changed = true;
  await expect(protocol.beginBootstrap({ epoch: plan.epoch, winner: 'a' })).rejects.toMatchObject({ code: 'RECOVERY_EVIDENCE_CHANGED', statusCode: 409 });
  await expect(protocol.status()).resolves.toMatchObject({ phase: 'blocked' });
});
