import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@jest/globals';
import { createCleanRestartMarker } from '../../src/runtime/clean-restart-marker.mjs';

const setup = async () => join(await mkdtemp(join(tmpdir(), 'elera-marker-')), 'clean-restart.json');

test('creates an atomic node-b.example.testound marker and consumes it once', async () => {
  const path = await setup(); const marker = createCleanRestartMarker({ path, node: 'elera-1.example.test', epoch: 'e1', nonce: 'n1', now: () => 1000 });
  await marker.write(); expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ version: 1, node: 'elera-1.example.test', epoch: 'e1', nonce: 'n1', writtenAt: 1000 });
  expect(await marker.consume()).toMatchObject({ node: 'elera-1.example.test' }); await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' }); expect(await marker.consume()).toBeUndefined();
});

test('rejects wrong node, epoch, nonce, stale, and future markers', async () => {
  for (const options of [{ expectedNode: 'other' }, { expectedEpoch: 'other' }, { markerNonce: 'other' }, { now: () => 200000 }, { now: () => 900 }]) {
    const path = await setup(); const marker = createCleanRestartMarker({ path, node: 'elera-1.example.test', epoch: 'e1', nonce: options.markerNonce ?? 'n1', now: () => 1000 }); await marker.write();
    const reader = createCleanRestartMarker({ path, node: 'elera-1.example.test', epoch: 'e1', nonce: 'reader', now: options.now ?? (() => 1000) });
    expect(await reader.consume(options.markerNonce ? { expectedNonce: 'n1' } : (options.expectedNode || options.expectedEpoch ? options : {}))).toBeUndefined();
  }
});

test('supports function-backed epochs and ignores malformed marker files', async () => {
  const path = await setup(); let epoch = 3;
  const marker = createCleanRestartMarker({ path, node: 'elera-1.example.test', epoch: () => epoch, nonce: 'n1', now: () => 1000 });
  await marker.write();
  expect(await marker.read({ expectedEpoch: () => 3 })).toMatchObject({ epoch: 3 });
  epoch = 4;
  expect(await marker.read({ expectedEpoch: () => epoch })).toBeUndefined();
  await writeFile(path, '{');
  expect(await marker.read()).toBeUndefined();
});

test('requires marker identity and supports generated nonce with a null epoch', async () => {
  expect(() => createCleanRestartMarker()).toThrow(TypeError);
  expect(() => createCleanRestartMarker({ path: 'marker', node: 'node', nonce: '' })).toThrow(TypeError);
  const path = await setup();
  const marker = createCleanRestartMarker({ path, node: 'node', now: () => 1000 });
  await marker.write();
  expect(await marker.read()).toMatchObject({ node: 'node', epoch: null });
});
