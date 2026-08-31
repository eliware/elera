import { createRecoveryDecisionStore } from '../cluster/cold-bootstrap/decision-store.mjs';

export async function recordSupervisorRecoveryDecision({ decision, recoveryState, recoveryAudit, environment = process.env, createStore = createRecoveryDecisionStore } = {}) {
  recoveryAudit.evidence({ nodes: decision.evidence?.length ?? 0, mode: decision.mode });
  if (decision.winner) recoveryAudit.winner({ winner: decision.winner, epoch: decision.epoch });
  recoveryState.set(decision.mode === 'bootstrap' ? 'awaiting-quorum' : decision.mode === 'join' ? 'joining' : 'blocked-ambiguous', { reason: decision.reason, epoch: decision.epoch });
  await createStore(environment.ELERA_RECOVERY_DECISION_PATH ?? '/run/elera/cold-recovery.json').write(decision);
  return decision;
}
