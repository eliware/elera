export function planLifecycle(action, { enabled, ready, synced = false, quorum = false, nodeId = null, target = null } = {}) {
  const actions = ['bootstrap', 'join', 'leave', 'recover']; if (!actions.includes(action)) throw new TypeError('unsupported lifecycle action');
  if (!enabled) return { action, eligible: false, changed: false, reason: 'Elera mode is disabled' };
  if (action === 'bootstrap') return { action, eligible: !ready && !quorum, changed: false, reason: ready ? 'node is already ready' : quorum ? 'quorum already exists' : 'eligible for bootstrap' };
  if (!target || !nodeId) return { action, eligible: false, changed: false, reason: 'node identity and target are required' };
  if (action === 'join') return { action, eligible: !ready && quorum, changed: false, reason: ready ? 'node is already ready' : quorum ? 'eligible to join Primary component' : 'joining requires an established quorum', target };
  if (action === 'leave') return { action, eligible: ready && synced && quorum, changed: false, reason: !ready ? 'node is not ready' : !synced ? 'node is not synced' : !quorum ? 'leave requires quorum' : 'eligible for graceful leave', target };
  return { action, eligible: !ready && quorum, changed: false, reason: ready ? 'recovery is only for an offline node' : quorum ? 'eligible for recovery' : 'recovery requires an established quorum', target };
}
