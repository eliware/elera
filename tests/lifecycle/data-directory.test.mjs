import fs from 'node:fs';
import { expect, jest, test } from '@jest/globals';
import { inspectDataDirectory } from '../../src/lifecycle/data-directory.mjs';

const stat = (directory = true) => ({ isDirectory: () => directory });
test('fails closed for missing, non-directory, and non-writable paths', () => {
  jest.spyOn(fs, 'statSync').mockImplementation(() => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); });
  expect(inspectDataDirectory('/missing').reason).toBe('missing');
  fs.statSync.mockReturnValue(stat(false));
  expect(inspectDataDirectory('/file').reason).toBe('not-directory');
  fs.statSync.mockReturnValue(stat());
  jest.spyOn(fs, 'accessSync').mockImplementation(() => { throw new Error('readonly'); });
  expect(inspectDataDirectory('/readonly').reason).toBe('not-writable');
  jest.restoreAllMocks();
});

test('propagates unexpected filesystem stat failures', () => {
  jest.spyOn(fs, 'statSync').mockImplementation(() => { throw Object.assign(new Error('permission failure'), { code: 'EACCES' }); });
  expect(() => inspectDataDirectory('/blocked')).toThrow('permission failure');
  jest.restoreAllMocks();
});

test('distinguishes initialized, empty, suspicious, and unsafe bootstrap paths', () => {
  jest.spyOn(fs, 'statSync').mockReturnValue(stat());
  jest.spyOn(fs, 'accessSync').mockImplementation(() => {});
  const entries = jest.spyOn(fs, 'readdirSync');
  entries.mockReturnValue(['mysql']);
  expect(inspectDataDirectory('/data')).toEqual({ action: 'start', reason: 'initialized' });
  expect(inspectDataDirectory('/data', { bootstrap: true }).reason).toBe('bootstrap-on-initialized');
  entries.mockReturnValue([]);
  expect(inspectDataDirectory('/data').reason).toBe('empty');
  expect(inspectDataDirectory('/data', { bootstrap: true }).action).toBe('initialize');
  entries.mockReturnValue(['ibdata1']);
  expect(inspectDataDirectory('/data').reason).toBe('suspicious');
  jest.restoreAllMocks();
});
