import { expect, test } from '@jest/globals';
import { selectRecoveryDonor } from '../../src/lifecycle/node-reset-donors.mjs';

test('selects the first healthy Primary donor deterministically', () => {
  expect(selectRecoveryDonor({ node: 'node-a.example.test', donors: [{ node: 'node-c.example.test', healthy: true, primary: true }, { node: 'node-b.example.test', healthy: true, primary: true }, { node: 'node-a.example.test', healthy: true, primary: true }] })).toBe('node-b.example.test');
});
test('rejects missing or ineligible donors', () => {
  expect(() => selectRecoveryDonor({ node: 'node-a.example.test', donors: [] })).toThrow('healthy Primary donor');
  expect(() => selectRecoveryDonor({ node: 'node-a.example.test', donors: null })).toThrow('healthy Primary donor');
  expect(() => selectRecoveryDonor({ node: 'node-a.example.test', donors: [null, {}] })).toThrow('healthy Primary donor');
  expect(() => selectRecoveryDonor({ node: 'node-a.example.test', donors: [{ node: 'node-b.example.test', healthy: false, primary: true }] })).toThrow();
});
