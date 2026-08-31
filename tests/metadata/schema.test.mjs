import { expect, test } from '@jest/globals';
import { META_DATABASE, META_MIGRATIONS } from '../../src/metadata/schema.mjs';

test('defines ordered metadata migrations for the canonical database', () => {
  expect(META_DATABASE).toBe('elera_meta');
  expect(META_MIGRATIONS.map(({ version }) => version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(META_MIGRATIONS.every(({ name, statements }) => name && statements.length > 0)).toBe(true);
});
