import { expect, jest, test } from '@jest/globals';
import { loadSupervisorStartupConfiguration } from '../../src/runtime/startup-configuration.mjs';

test('loads intent, publishes cluster size, applies intent, and builds MariaDB args', async () => {
  const intent = { cluster: { members: [{ name: 'node-a.example.test', address: 'node-a.example.test' }, { name: 'node-b.example.test', address: 'node-b.example.test' }] } };
  const intentState = { paths: { renderedPath: '/state/mariadb.cnf' }, apply: jest.fn() };
  const routingEnvironment = {};
  const mariaArguments = jest.fn(() => ['--defaults-extra-file=/state/mariadb.cnf']);
  await expect(loadSupervisorStartupConfiguration({ intentState, loadEnvironmentIntent: jest.fn(), identity: { name: 'node-a.example.test' }, routingEnvironment, config: { dataDir: '/data' }, loadIntentImpl: jest.fn(async () => intent), mariaArguments, resolveAddress: jest.fn(async () => []) })).resolves.toEqual({ initialIntent: intent, args: ['--defaults-extra-file=/state/mariadb.cnf'] });
  expect(routingEnvironment.ELERA_CLUSTER_SIZE).toBe('2');
  expect(intentState.apply).toHaveBeenCalledWith(intent);
  expect(mariaArguments).toHaveBeenCalledWith({ dataDir: '/data', intentConfigPath: '/state/mariadb.cnf' }, { name: 'node-a.example.test' });
});
