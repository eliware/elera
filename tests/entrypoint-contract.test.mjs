import { readFile } from 'node:fs/promises';
import { expect, test } from '@jest/globals';

test('entrypoint requires a root password and keeps it off command arguments', async () => {
  const source = await readFile(new URL('../docker/mariadb-entrypoint.mjs', import.meta.url), 'utf8');
  expect(source).toContain('MARIADB_ROOT_PASSWORD is required');
  expect(source).toContain("runInput('mariadb'");
  expect(source).not.toMatch(/mariadb[^\n]*--password/);
});
