import { expect, jest, test } from '@jest/globals';
import { handleRoutingInspection } from '../../../src/api/routes/routing-inspection.mjs';

test('delegates route inspection to the observation and decision policies', async () => {
  const response = { json: jest.fn() }; const observations = [{ nodeId: 'a', clusterId: 'c', address: 'db', sqlPort: 3306, synced: true, primary: 'Primary', health: 'ok', observedAt: Date.now() }];
  await expect(handleRoutingInspection({ url: new URL('http://localhost/api/v1/routes?application=app'), response, observationStore: { snapshot: () => observations }, getStatus: async () => ({ ready: true }), environment: {} })).resolves.toBe(true);
  expect(response.json).toHaveBeenCalled();
});
