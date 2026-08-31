import { expect, test } from '@jest/globals';
import { META_DATABASE, META_SCHEMA } from '../../src/metadata/schema.mjs';

test('defines one canonical current schema for the metadata database', () => {
  expect(META_DATABASE).toBe('elera_meta');
  expect(META_SCHEMA.length).toBeGreaterThan(0);
  expect(META_SCHEMA.every((statement) => typeof statement === 'string' && statement.includes('CREATE TABLE'))).toBe(true);
});
