import { expect, test } from '@jest/globals';
import { peerList } from '../../src/runtime/peer-list.mjs';

test('normalizes comma-separated peer addresses', () => {
  expect(peerList(' http://one , ,http://two ')).toEqual(['http://one', 'http://two']);
  expect(peerList()).toEqual([]);
});
