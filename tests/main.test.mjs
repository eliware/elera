import { expect, test } from '@jest/globals';
import { readFile } from 'node:fs/promises';

test('keeps the supervisor entrypoint limited to composition and startup wiring', async () => {
  const source = await readFile(new URL('../src/main.mjs', import.meta.url), 'utf8');
  expect(source).toContain("import { startSupervisor } from './runtime/startup-coordinator.mjs';");
  expect(source).toContain('await startSupervisor({');
  expect(source).not.toContain('createServer');
});
