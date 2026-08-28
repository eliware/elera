import { evaluateColdBootstrap } from './eligibility.mjs';

export function createColdBootstrapService({ nodes, readState, recover, isOnline, bootstrap, verifyCandidate, lock, idempotencyStore, log = {} } = {}) {
  if (!Array.isArray(nodes) || typeof readState !== 'function' || typeof bootstrap !== 'function') throw new TypeError('cold bootstrap dependencies are required');
  let lastPlan;
  const completed = new Map();
  const inFlight = new Map();
  const loadCompleted = async (key) => completed.get(key) ?? idempotencyStore?.get?.(key);
  return {
    async plan() {
      lastPlan = await evaluateColdBootstrap(nodes, { readState, recover, isOnline });
      log.info?.('Cold bootstrap plan evaluated', { eligible: lastPlan.eligible, reason: lastPlan.reason, candidate: lastPlan.candidate?.node });
      return lastPlan;
    },
    async execute({ confirm = false, idempotencyKey } = {}) {
      if (confirm !== true) throw Object.assign(new Error('cold bootstrap requires confirm: true'), { statusCode: 409 });
      if (idempotencyKey) { const previous = await loadCompleted(idempotencyKey); if (previous) return previous; }
      const run = async () => {
        const plan = await this.plan();
        if (!plan.eligible) throw Object.assign(new Error(`cold bootstrap refused: ${plan.reason}`), { statusCode: 409 });
        const fresh = await this.plan();
        if (!fresh.eligible || fresh.candidate.node !== plan.candidate.node || fresh.candidate.uuid !== plan.candidate.uuid || fresh.candidate.seqno !== plan.candidate.seqno)
          throw Object.assign(new Error('cold bootstrap evidence changed; refusing stale candidate'), { statusCode: 409 });
        if (typeof verifyCandidate === 'function' && !(await verifyCandidate(fresh.candidate))) throw Object.assign(new Error('cold bootstrap candidate revalidation failed'), { statusCode: 409 });
        await bootstrap(fresh.candidate.node);
        return { eligible: true, candidate: fresh.candidate, reason: fresh.reason };
      };
      if (inFlight.has(idempotencyKey)) return inFlight.get(idempotencyKey);
      const pending = lock?.run ? lock.run(run) : run();
      if (idempotencyKey) inFlight.set(idempotencyKey, pending);
      let result;
      try { result = await pending; }
      finally { if (idempotencyKey) inFlight.delete(idempotencyKey); }
      if (idempotencyKey) { completed.set(idempotencyKey, result); await idempotencyStore?.set?.(idempotencyKey, result); }
      return result;
    },
  };
}
