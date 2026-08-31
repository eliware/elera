import { expect, test } from '@jest/globals';
import { readFile } from 'node:fs/promises';

test('documents all writable mounts required for read-only root operation', async () => {
  const contract = await readFile(new URL('../../docs/runtime-contract.md', import.meta.url), 'utf8');
  expect(contract).toContain('`/run/elera`');
  expect(contract).toContain('`/run/mysqld`');
  expect(contract).toContain('`/tmp`');
  expect(contract).toContain('root filesystem can be read-only');
});
