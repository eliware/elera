import { expect, test } from '@jest/globals';
import { supervisorDbEnvironment } from '../../src/runtime/db-environment.mjs';

test('builds local root-socket control-plane environment', () => {
  expect(supervisorDbEnvironment({ CUSTOM: 'value', MYSQL_PASSWORD: 'ignored' })).toEqual(expect.objectContaining({ CUSTOM: 'value', MYSQL_HOST: '127.0.0.1', MYSQL_SOCKET: '/run/mysqld/mysqld.sock', MYSQL_USER: 'root', MYSQL_PASSWORD: '', MYSQL_DATABASE: 'elera_meta' }));
});
