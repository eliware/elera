import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@jest/globals';
import { createCleanRestartMarker } from '../../src/runtime/clean-restart-marker.mjs';

const setup = async () => join(await mkdtemp(join(tmpdir(), 'elera-marker-')), 'clean-restart.json');

test('creates an atomic node-bound marker and consumes it once', async () => {
  const path = await setup(); const marker = createCleanRestartMarker({ path, node: 'elera-1', epoch: 'e1', nonce: 'n1', now: () => 1000 });
  await marker.write(); expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ version: 1, node: 'elera-1', epoch: 'e1', nonce: 'n1', writtenAt: 1000 });
  expect(await marker.consume()).toMatchObject({ node: 'elera-1' }); await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' }); expect(await marker.consume()).toBeUndefined();
});

test('rejects wrong node, epoch, nonce, stale, and future markers', async () => {
  for (const options of [{ expectedNode: 'other' }, { expectedEpoch: 'other' }, { markerNonce: 'other' }, { now: () => 200000 }, { now: () => 900 }]) {
    const path = await setup(); const marker = createCleanRestartMarker({ path, node: 'elera-1', epoch: 'e1', nonce: options.markerNonce ?? 'n1', now: () => 1000 }); await marker.write();
    const reader = createCleanRestartMarker({ path, node: 'elera-1', epoch: 'e1', nonce: options.markerNonce === 'other' ? 'n1' : 'n1', now: options.now ?? (() => 1000) });
    expect(await reader.consume(options.expectedNode || options.expectedEpoch ? options : {})).toBeUndefined();
  }
});
