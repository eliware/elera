import { planLifecycle } from './lifecycle-plan.mjs';
export function createLifecycleManager({ status, operations = {}, environment = process.env }) {
  if (typeof status !== 'function') throw new TypeError('status function is required');
  return {
    async plan(action, target) { const current = await status(); return planLifecycle(action, { enabled: environment.ELERA === '1', ready: current.ready, synced: current.values?.wsrep_local_state_comment === 'Synced', quorum: current.values?.wsrep_cluster_status === 'Primary', nodeId: environment.ELERA_NODE_NAME ?? 'elera', target }); },
    async execute(action, { target, confirm } = {}) { if (confirm !== true) throw Object.assign(new Error(`${action} requires confirm: true`), { statusCode: 409 }); const decision = await this.plan(action, target); if (!decision.eligible) throw Object.assign(new Error(decision.reason), { statusCode: 409 }); const operation = operations[action]; if (typeof operation !== 'function') throw Object.assign(new Error(`${action} operation is unavailable`), { statusCode: 503 }); await operation({ target }); return { action, changed: true, status: 'completed', target }; }
  };
}
