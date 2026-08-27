function quorumSize(expectedSize) {
  return Math.floor(expectedSize / 2) + 1;
}

export function isQuorumReady(values, { expectedSize = 1 } = {}) {
  const size = Number(expectedSize);
  const members = Number(values.wsrep_cluster_size);
  if (!Number.isInteger(size) || size < 1 || !Number.isInteger(members)) return false;
  return members >= quorumSize(size);
}
