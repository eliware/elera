import { describe, expect, test } from '@jest/globals';
import { mkdir, mkdtemp, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fixture from '../contracts/supervisor-intent.fixture.json' with { type: 'json' };
import { renderMariaDbConfig } from '../src/intent/render.mjs';
import { createIntentState } from '../src/intent/state.mjs';

describe('intent rendering and state', () => {
  test('renders standalone and Elera configuration', () => { const standalone = structuredClone(fixture); delete standalone.mariadb.dataDir; expect(renderMariaDbConfig(standalone)).toContain('datadir=/var/lib/mysql'); const cluster = structuredClone(fixture); cluster.cluster.members.push({ name: 'elera-2', address: 'elera-2' }); expect(renderMariaDbConfig(cluster)).toContain('wsrep_on=ON'); });
  test('applies atomically and verifies active state', async () => { const dir = await mkdtemp(join(tmpdir(), 'elera-intent-')); const state = createIntentState({ stateDir: dir }); expect((await state.plan(fixture)).change).toBe('restart'); expect((await state.verify(fixture)).ok).toBe(false); await state.apply(fixture); expect((await state.verify(fixture)).ok).toBe(true); const changed = structuredClone(fixture); changed.mariadb.port = 3307; expect((await state.plan(changed)).change).toBe('reload'); expect((await state.verify(changed)).ok).toBe(false); await state.apply(changed); expect(await readFile(state.paths.previousPath, 'utf8')).toContain('3306'); });
  test('requires a state directory', () => { expect(() => createIntentState({})).toThrow('stateDir'); });
  test('restores active state when rendered-file write fails', async () => { const dir = await mkdtemp(join(tmpdir(), 'elera-intent-')); const state = createIntentState({ stateDir: dir }); await state.apply(fixture); await unlink(state.paths.renderedPath); await mkdir(state.paths.renderedPath); const changed = structuredClone(fixture); changed.mariadb.port = 3307; await expect(state.apply(changed)).rejects.toBeTruthy(); expect(JSON.parse(await readFile(state.paths.activePath, 'utf8')).mariadb.port).toBe(3306); });
  test('propagates unexpected active-state read errors', async () => { const dir = await mkdtemp(join(tmpdir(), 'elera-intent-')); const state = createIntentState({ stateDir: dir }); await mkdir(state.paths.activePath); await expect(state.plan(fixture)).rejects.toBeTruthy(); });
});
