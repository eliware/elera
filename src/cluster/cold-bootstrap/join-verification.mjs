export function verifyJoinedMember({ values = {}, expectedClusterId, expectedSize, minimumSize } = {}) {
  const clusterSize = Number(values.wsrep_cluster_size);
  const valid = values.wsrep_cluster_state_uuid === expectedClusterId && values.wsrep_local_state_comment === 'Synced' && values.wsrep_ready === 'ON' && values.wsrep_cluster_status === 'Primary' && (minimumSize === undefined ? clusterSize === expectedSize : clusterSize >= minimumSize);
  return { valid, reason: valid ? undefined : 'joining node did not verify expected Primary/Synced membership' };
}
