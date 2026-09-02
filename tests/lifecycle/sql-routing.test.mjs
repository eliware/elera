import { expect, jest, test } from '@jest/globals';
import { createSqlDrainIntegration } from '../../src/lifecycle/sql-routing.mjs';

test('updates primary and balanced client availability during drain', () => {
  const client = { setNodeAvailability: jest.fn() };
  const integration = createSqlDrainIntegration({ getClient: () => client, node: 'node-1.example.test' });
  integration(true); integration(false);
  expect(client.setNodeAvailability).toHaveBeenNthCalledWith(1, 'primary', 'node-1.example.test', false);
  expect(client.setNodeAvailability).toHaveBeenNthCalledWith(4, 'balanced', 'node-1.example.test', true);
});
test('tolerates absent clients and logs client failures', () => {
  expect(() => createSqlDrainIntegration({ getClient: () => undefined })(true)).not.toThrow();
  const warn = jest.fn(); const client = { setNodeAvailability: () => { throw new Error('down'); } };
  createSqlDrainIntegration({ getClient: () => client, log: { warn } })(true);
  expect(warn).toHaveBeenCalled();
});
