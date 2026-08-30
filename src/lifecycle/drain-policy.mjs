export const CLIENT_DRAIN_TIMEOUT_MS = 45000;

export function clientDrainTimeout(timeoutMs = CLIENT_DRAIN_TIMEOUT_MS) {
  const requested = Number(timeoutMs);
  if (!Number.isFinite(requested) || requested < 0) throw new TypeError('drain timeout must be a non-negative number');
  return Math.min(requested, CLIENT_DRAIN_TIMEOUT_MS);
}
