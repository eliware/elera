import { describe, expect, test } from '@jest/globals';
import * as common from '@eliware/common';
import * as mysql from '@eliware/galera-lib';

describe('shared dependencies', () => {
  test('expose the required APIs', () => {
    expect(typeof common.log.info).toBe('function');
    expect(typeof common.path).toBe('function');
    expect(typeof common.registerHandlers).toBe('function');
    expect(typeof common.registerSignals).toBe('function');
    expect(typeof mysql.createDb).toBe('function');
    expect(typeof mysql.createDbFromEnvironment).toBe('function');
    expect(typeof mysql.classifyQuery).toBe('function');
  });
});
