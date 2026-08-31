import { expect, test } from '@jest/globals';
import { readFile } from 'node:fs/promises';

test('keeps the data-directory CLI as a thin argument-driven wrapper', async () => {
  const source = await readFile(new URL('../../src/lifecycle/data-directory-cli.mjs', import.meta.url), 'utf8');
  expect(source).toContain("if (!directory) throw new Error('data directory is required')");
  expect(source).toContain('inspectDataDirectory(directory');
});
