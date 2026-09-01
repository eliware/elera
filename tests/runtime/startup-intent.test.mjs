import { expect, test } from '@jest/globals';
import { loadStartupIntent } from '../../src/runtime/startup-intent.mjs';
import fixture from '../../contracts/supervisor-intent.fixture.json' with { type: 'json' };

test('prefers persisted startup intent', async () => {
  const persisted = structuredClone(fixture);
  const result = await loadStartupIntent({ intentState: { read: async () => persisted }, loadEnvironmentIntent: () => { throw new Error('unexpected'); }, identity: { name: persisted.cluster.members[0].name } });
  expect(result).toBe(persisted);
});

test('loads environment intent without injecting legacy identity variables', async () => {
  let received;
  const identity = { name: 'node.example.test' };
  const result = await loadStartupIntent({ intentState: { read: async () => undefined }, loadEnvironmentIntent: (value, actualIdentity) => { received = [value, actualIdentity]; return structuredClone(fixture); }, identity });
  expect(received).toEqual([process.env, identity]);
  expect(result).toEqual(fixture);
});

test('preserves a declared clustered environment intent during fresh startup', async () => {
  let received;
  await loadStartupIntent({ intentState: { read: async () => undefined }, loadEnvironmentIntent: (value) => { received = value; return structuredClone(fixture); }, environment: { SUPERVISOR_INTENT_JSON: JSON.stringify(fixture) }, identity: { name: fixture.cluster.members[0].name } });
  expect(received.SUPERVISOR_INTENT_JSON).toContain('"members"');
});
