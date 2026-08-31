import { expect, test } from '@jest/globals';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEventVersionStore } from '../../src/routing/event-version-store.mjs';

test('maintains in-memory versions per application', () => {
  const store = createEventVersionStore();
  expect(store.current('app')).toBe(0);
  expect(store.next('app')).toBe(1);
  expect(store.next('app')).toBe(2);
  expect(store.next('other')).toBe(1);
});

test('loads and persists durable application versions', () => {
  const root = mkdtempSync(join(tmpdir(), 'elera-version-'));
  const path = join(root, 'state', 'versions.json');
  mkdirSync(join(root, 'state'));
  writeFileSync(path, '{"app": 4}');
  const store = createEventVersionStore({ path });
  expect(store.current('app')).toBe(4);
  expect(store.current('missing')).toBe(0);
  expect(store.next('app')).toBe(5);
  expect(JSON.parse(readFileSync(path, 'utf8')).app).toBe(5);
  rmSync(root, { recursive: true, force: true });
});

test('recovers from malformed durable state', () => {
  const root = mkdtempSync(join(tmpdir(), 'elera-version-'));
  const path = join(root, 'versions.json');
  writeFileSync(path, 'not-json');
  const store = createEventVersionStore({ path });
  expect(store.next('app')).toBe(1);
  rmSync(root, { recursive: true, force: true });
});
