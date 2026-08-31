import { expect, test } from '@jest/globals';
import { selectRecoveryDonor } from '../../src/lifecycle/node-reset-donors.mjs';

test('selects the first healthy Primary donor deterministically', () => {
  expect(selectRecoveryDonor({ node: 'node-a', donors: [{ node: 'node-c', healthy: true, primary: true }, { node: 'node-b', healthy: true, primary: true }, { node: 'node-a', healthy: true, primary: true }] })).toBe('node-b');
});
test('rejects missing or ineligible donors', () => {
  expect(() => selectRecoveryDonor({ node: 'node-a', donors: [] })).toThrow('healthy Primary donor');
  expect(() => selectRecoveryDonor({ node: 'node-a', donors: null })).toThrow('healthy Primary donor');
  expect(() => selectRecoveryDonor({ node: 'node-a', donors: [null, {}] })).toThrow('healthy Primary donor');
  expect(() => selectRecoveryDonor({ node: 'node-a', donors: [{ node: 'node-b', healthy: false, primary: true }] })).toThrow();
});
