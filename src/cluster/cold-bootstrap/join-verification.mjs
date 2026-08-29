export function verifyJoinedMember({ values = {}, expectedClusterId, expectedSize } = {}) {
  const valid = values.wsrep_cluster_state_uuid === expectedClusterId && values.wsrep_local_state_comment === 'Synced' && values.wsrep_ready === 'ON' && values.wsrep_cluster_status === 'Primary' && Number(values.wsrep_cluster_size) === expectedSize;
  return { valid, reason: valid ? undefined : 'joining node did not verify expected Primary/Synced membership' };
}
