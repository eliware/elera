function quorumSize(expectedSize) {
  return Math.floor(expectedSize / 2) + 1;
}

export function isQuorumReady(values, { expectedSize = 1 } = {}) {
  const size = Number(expectedSize);
  const rawMembers = values?.wsrep_cluster_size;
  const members = Number(rawMembers);
  if (!Number.isInteger(size) || size < 1 || (typeof rawMembers !== 'number' && typeof rawMembers !== 'string') || String(rawMembers).trim() === '' || !Number.isInteger(members) || members < 0) return false;
  return members >= quorumSize(size);
}
