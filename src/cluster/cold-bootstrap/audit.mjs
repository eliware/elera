export function createRecoveryAudit(log = {}) {
  return {
    event(details) {
      details = details && typeof details === 'object' ? details : {};
      const level = details.type === 'recovery.refused' ? 'warn' : 'info';
      log[level]?.(`cold-recovery.${details.type?.replace(/^recovery\./, '') ?? 'event'}`, details);
    },
    evidence(details) { log.info?.('cold-recovery.evidence-collected', details); },
    winner(details) { log.info?.('cold-recovery.winner-selected', details); },
    lease(details) { log.info?.(details.granted ? 'cold-recovery.lease-acquired' : 'cold-recovery.lease-rejected', details); },
    authorization(details) { log.info?.('cold-recovery.bootstrap-authorized', details); },
    bootstrapStart(details) { log.info?.('cold-recovery.bootstrap-started', details); },
    completion(details) { log.info?.('cold-recovery.bootstrap-completed', details); },
    joinStart(details) { log.info?.('cold-recovery.join-started', details); },
    joinComplete(details) { log.info?.('cold-recovery.join-completed', details); },
    failure(details) { log.error?.('cold-recovery.failed', details); },
  };
}
