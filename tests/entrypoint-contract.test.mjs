import { readFile } from 'node:fs/promises';
import { expect, test } from '@jest/globals';

test('entrypoint requires a root password and keeps it off command arguments', async () => {
  const source = await readFile(new URL('../docker/mariadb-entrypoint.sh', import.meta.url), 'utf8');
  expect(source).toContain('MARIADB_ROOT_PASSWORD is required');
  expect(source).toContain('mariadb --socket="$init_socket" -uroot <<SQL');
  expect(source).not.toMatch(/mariadb[^\n]*--password/);
});
