export function recoveryStartupDecision(plan, nodeName) {
  if (plan.mode === 'join') return { mode: 'join', reason: plan.reason, epoch: null, bootstrapComplete: true, ...(plan.expectedMembership ? { expectedMembership: plan.expectedMembership } : {}), evidence: plan.evidence };
  if (plan.eligible) return { mode: 'bootstrap', winner: plan.winner.node, localWinner: plan.winner.node === nodeName, reason: plan.reason, epoch: plan.epoch, recoveryEpoch: plan, evidence: plan.evidence };
  return { mode: 'blocked', reason: plan.reason, epoch: null, evidence: plan.evidence };
}
