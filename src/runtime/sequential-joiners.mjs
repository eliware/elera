/**
 * Recover non-winning members one at a time after the local winner is ready.
 * Process/control transport is injected so callers can use their authenticated
 * supervisor protocol without this coordinator making transport assumptions.
 */
export async function recoverJoinersSequentially({ joiners = [], startJoiner, joinClient, verifyJoiner, epoch, recoveryState, recoveryAudit, publishRecovery = async () => {}, log = {} } = {}) {
  const start = startJoiner ?? (joinClient ? (joiner) => joinClient.join(joiner) : undefined);
  if (!Array.isArray(joiners) || joiners.some((joiner) => !joiner?.name?.includes('.')) || new Set(joiners.map((joiner) => joiner.name)).size !== joiners.length || typeof start !== 'function' || typeof verifyJoiner !== 'function' || !recoveryState || typeof recoveryState.set !== 'function') throw new TypeError('sequential joiner recovery dependencies and FQDN joiners are required');
  const completed = [];
  const currentEpoch = () => recoveryState.snapshot?.().epoch;
  recoveryState.set('joining', { total: joiners.length, epoch });
  for (const joiner of joiners) {
    try {
      if (epoch !== undefined && currentEpoch() !== undefined && currentEpoch() !== epoch) throw Object.assign(new Error('stale recovery epoch cannot continue joining'), { code: 'STALE_RECOVERY_EPOCH', statusCode: 409 });
      log.debug?.('Recovery phase: starting joiner', { node: joiner.name, completed: completed.slice() });
      await start(joiner);
      const verification = await verifyJoiner(joiner);
      log.debug?.('Recovery phase: joiner verification complete', { node: joiner.name, valid: verification?.valid, state: verification });
      if (!verification?.valid) throw Object.assign(new Error(verification?.reason ?? 'joiner did not reach a ready Primary state'), { code: 'JOINER_NOT_READY', node: joiner.name });
      completed.push(joiner.name);
      recoveryAudit?.joinComplete?.({ node: joiner.name, completed: completed.slice() });
    } catch (error) {
      recoveryState?.set?.('cluster-unavailable', { reason: error.message, node: joiner.name, completed: completed.slice(), epoch });
      recoveryAudit?.failure?.({ reason: error.message, node: joiner.name, completed: completed.slice() });
      log.error?.('Sequential joiner recovery failed', { error, node: joiner.name, completed: completed.slice() });
      throw error;
    }
  }
  recoveryState.set('complete', { reason: 'all joiners reached ready Primary membership', members: completed.slice(), epoch });
  await publishRecovery({ members: completed.slice(), epoch });
  return { completed: completed.slice() };
}
