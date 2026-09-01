import { planLifecycle } from './lifecycle-plan.mjs';
const isFqdn = (value) => typeof value === 'string' && value.length <= 253 && value.includes('.') && value.split('.').every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
export function createLifecycleManager({ status, operations = {}, environment = process.env, config = {}, identity } = {}) {
  if (typeof status !== 'function') throw new TypeError('status function is required');
  return {
    async plan(action, target) {
      const current = await status();
      if (!isFqdn(identity?.name)) throw new Error('fully qualified runtime identity is required for lifecycle operations');
      if (target !== undefined && !isFqdn(target)) throw Object.assign(new Error(`lifecycle target must be a fully qualified hostname: ${target ?? '<missing>'}`), { statusCode: 400 });
      if (target !== undefined && !config.intent?.cluster?.members?.some((member) => member.name === target)) throw Object.assign(new Error(`lifecycle target ${target} is not a configured cluster member`), { statusCode: 400 });
      return planLifecycle(action, { enabled: config.elera ?? config.clusterSize > 1, ready: current.ready, state: current.values?.wsrep_local_state_comment, synced: current.values?.wsrep_local_state_comment === 'Synced', quorum: current.values?.wsrep_cluster_status === 'Primary', nodeId: identity.name, target });
    },
    async execute(action, { target, confirm } = {}) { if (confirm !== true) throw Object.assign(new Error(`${action} requires confirm: true`), { statusCode: 409 }); const decision = await this.plan(action, target); if (!decision.eligible) throw Object.assign(new Error(decision.reason), { statusCode: 409 }); const operation = operations[action]; if (typeof operation !== 'function') throw Object.assign(new Error(`${action} operation is unavailable`), { statusCode: 503 }); await operation({ target }); return { action, changed: true, status: 'completed', target }; }
  };
}
