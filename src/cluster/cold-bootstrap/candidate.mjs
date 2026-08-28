function sameCluster(states) {
  return new Set(states.map((state) => state.uuid)).size === 1;
}

export function selectCandidate(states) {
  if (!Array.isArray(states) || states.length === 0) throw new Error('no Galera state evidence was provided');
  if (!sameCluster(states)) return { eligible: false, reason: 'state UUIDs do not match', candidates: states };
  const safe = states.filter((state) => state.safeToBootstrap);
  if (safe.length > 1) return { eligible: false, reason: 'multiple nodes are marked safe_to_bootstrap', candidates: states };
  if (safe.length === 1) {
    const highest = Math.max(...states.map((state) => state.seqno));
    if (safe[0].seqno !== highest) return { eligible: false, reason: 'safe_to_bootstrap node is not the highest-seqno node', candidates: states };
    return { eligible: true, reason: 'sole safe_to_bootstrap node has highest seqno', candidate: safe[0], candidates: states };
  }
  const highest = Math.max(...states.map((state) => state.seqno));
  if (highest < 0) return { eligible: false, reason: 'no recoverable seqno exists', candidates: states };
  const winners = states.filter((state) => state.seqno === highest);
  if (winners.length !== 1) return { eligible: false, reason: 'highest seqno is ambiguous', candidates: states };
  return { eligible: true, reason: 'unique highest seqno', candidate: winners[0], candidates: states };
}
