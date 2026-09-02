import { expect, jest, test } from '@jest/globals';
import { handleRoutingInspection } from '../../../src/api/routes/routing-inspection.mjs';

test('delegates route inspection to the observation and decision policies', async () => {
  const response = { json: jest.fn() }; const identity = { name: 'a.example.test' }; const observations = [{ nodeId: identity.name, clusterId: 'c', address: identity.name, sqlPort: 3306, synced: true, primary: 'Primary', health: 'ok', observedAt: Date.now() }];
  await expect(handleRoutingInspection({ url: new URL('http://localhost/api/v1/routes?application=app'), response, identity, observationStore: { snapshot: () => observations, upsert: jest.fn() }, getStatus: async () => ({ ready: true }), environment: {}, getConfig: () => ({ httpPort: 8080 }) })).resolves.toBe(true);
  expect(response.json).toHaveBeenCalled();
});
