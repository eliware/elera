import { expect, test } from '@jest/globals';
import { readFile } from 'node:fs/promises';

test('keeps the pending-init CLI as a thin runtime wrapper', async () => {
  const source = await readFile(new URL('../../src/lifecycle/pending-init-cli.mjs', import.meta.url), 'utf8');
  expect(source).toContain("import { startPendingInitRuntime } from \"./pending-init/runtime.mjs\";");
  expect(source).toContain('startPendingInitRuntime();');
});
