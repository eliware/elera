import { expect, test } from '@jest/globals';
import { verifyJoinedMember } from '../../../src/cluster/cold-bootstrap/join-verification.mjs';

const values = { wsrep_cluster_state_uuid: 'u', wsrep_local_state_comment: 'Synced', wsrep_ready: 'ON', wsrep_cluster_status: 'Primary', wsrep_cluster_size: '3' };
test('accepts a synced member in the expected primary view', () => expect(verifyJoinedMember({ values, expectedClusterId: 'u', expectedSize: 3 })).toMatchObject({ valid: true }));
test('rejects mismatched UUID, membership, or readiness', () => {
  expect(verifyJoinedMember({ values: { ...values, wsrep_cluster_state_uuid: 'other' }, expectedClusterId: 'u', expectedSize: 3 }).valid).toBe(false);
  expect(verifyJoinedMember({ values: { ...values, wsrep_cluster_size: '2' }, expectedClusterId: 'u', expectedSize: 3 }).valid).toBe(false);
  expect(verifyJoinedMember({ values: { ...values, wsrep_ready: 'OFF' }, expectedClusterId: 'u', expectedSize: 3 }).valid).toBe(false);
});
