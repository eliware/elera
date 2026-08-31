import { expect, test } from '@jest/globals';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEventVersionStore } from '../../src/routing/event-version-store.mjs';

test('persists per-application event versions across store instances', () => { const directory = mkdtempSync(join(tmpdir(), 'elera-event-version-')); const path = join(directory, 'versions.json'); const first = createEventVersionStore({ path }); expect(first.next('orders')).toBe(1); expect(first.next('orders')).toBe(2); const second = createEventVersionStore({ path }); expect(second.next('orders')).toBe(3); expect(JSON.parse(readFileSync(path, 'utf8')).orders).toBe(3); });
