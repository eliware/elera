export function createRecoveryAudit(log = {}) {
  return {
    evidence(details) { log.info?.('cold-recovery.evidence-collected', details); },
    winner(details) { log.info?.('cold-recovery.winner-selected', details); },
    lease(details) { log.info?.(details.granted ? 'cold-recovery.lease-acquired' : 'cold-recovery.lease-rejected', details); },
    authorization(details) { log.info?.('cold-recovery.bootstrap-authorized', details); },
    failure(details) { log.error?.('cold-recovery.failed', details); },
  };
}
