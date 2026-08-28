import { expect, test } from '@jest/globals';
import { bootstrapEligibility } from '../../src/cluster/bootstrap-eligibility.mjs';

test('requires clustered mode and a non-ready uninitialized node', () => {
  expect(bootstrapEligibility({ enabled: false, ready: false })).toEqual({ eligible: false, reason: 'requires clustered configuration' });
  expect(bootstrapEligibility({ enabled: true, ready: true })).toEqual({ eligible: false, reason: 'node is already ready' });
  for (const state of ['Initialized', 'Joining', 'Joined', 'Synced', 'Donor', 'Donor/Desynced', 'Desynced']) expect(bootstrapEligibility({ enabled: true, ready: false, state }).eligible).toBe(false);
  expect(bootstrapEligibility({ enabled: true, ready: false, state: 'Offline' })).toEqual({ eligible: true, reason: 'node is Elera-enabled and not ready' });
});
