import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jest, test, describe, expect } from '@jest/globals';
import { inspectDataDirectory } from '../src/lifecycle/data-directory.mjs';

function tempDirectory() { return fs.mkdtempSync(path.join(os.tmpdir(), 'elera-data-')); }

describe('MariaDB data-directory gate', () => {
  test('fails when the directory is missing', () => {
    const directory = path.join(tempDirectory(), 'missing');
    expect(inspectDataDirectory(directory).reason).toBe('missing');
  });
  test('fails when the data path is not a directory', () => {
    const directory = path.join(tempDirectory(), 'file');
    fs.writeFileSync(directory, 'not a directory');
    expect(inspectDataDirectory(directory).reason).toBe('not-directory');
  });
  test('preserves unexpected filesystem errors', () => {
    const stat = jest.spyOn(fs, 'statSync').mockImplementation(() => { throw new Error('I/O failure'); });
    expect(() => inspectDataDirectory('/unavailable')).toThrow('I/O failure');
    stat.mockRestore();
  });
  test('fails closed for an empty directory without explicit bootstrap', () => {
    expect(inspectDataDirectory(tempDirectory()).reason).toBe('empty');
  });
  test('permits initialization only for an empty directory with explicit bootstrap', () => {
    expect(inspectDataDirectory(tempDirectory(), { bootstrap: true }).action).toBe('initialize');
  });
  test('fails closed for a partially initialized directory', () => {
    const directory = tempDirectory();
    fs.writeFileSync(path.join(directory, 'ibdata1'), 'partial');
    expect(inspectDataDirectory(directory, { bootstrap: true }).reason).toBe('suspicious');
  });
  test('fails closed for a stale directory', () => {
    const directory = tempDirectory();
    fs.mkdirSync(path.join(directory, 'old-backup'));
    expect(inspectDataDirectory(directory).reason).toBe('suspicious');
  });
  test('starts only an initialized directory', () => {
    const directory = tempDirectory();
    fs.mkdirSync(path.join(directory, 'mysql'));
    expect(inspectDataDirectory(directory).action).toBe('start');
  });
  test('refuses bootstrap mode on an initialized directory', () => {
    const directory = tempDirectory();
    fs.mkdirSync(path.join(directory, 'mysql'));
    expect(inspectDataDirectory(directory, { bootstrap: true }).reason).toBe('bootstrap-on-initialized');
  });
  test('fails when the directory is not writable', () => {
    const directory = tempDirectory();
    const access = jest.spyOn(fs, 'accessSync').mockImplementation(() => { throw new Error('read-only'); });
    expect(inspectDataDirectory(directory).reason).toBe('not-writable');
    access.mockRestore();
  });
});
