export function validateRecoveryEvidence(evidence, { now = new Date(), maxAgeMs = 10000 } = {}) {
  const missingEvidence = !Array.isArray(evidence) || evidence.length === 0;
  if (missingEvidence) {
    throw Object.assign(new Error('complete recovery evidence is required'), { code: 'INCOMPLETE_RECOVERY_EVIDENCE' });
  }
  const currentTime = now.getTime();
  const nodes = new Set();
  for (const item of evidence) {
    const observedTime = Date.parse(item?.observedAt);
    if (!item?.node || nodes.has(item.node) || !item?.uuid || !Number.isInteger(item.seqno) || !Number.isInteger(item.generation) || item.generation < 1 || typeof item.safeToBootstrap !== 'boolean' || typeof item.active !== 'boolean' || (item.dataDirectory && item.dataDirectory.valid !== true) || !Number.isFinite(observedTime)) throw Object.assign(new Error('recovery evidence is incomplete or malformed'), { code: 'INVALID_RECOVERY_EVIDENCE' });
    if (Math.abs(currentTime - observedTime) > maxAgeMs) throw Object.assign(new Error('recovery evidence is stale'), { code: 'STALE_RECOVERY_EVIDENCE' });
    nodes.add(item.node);
  }
  return evidence;
}
