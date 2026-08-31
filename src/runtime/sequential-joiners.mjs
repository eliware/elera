/**
 * Recover non-winning members one at a time after the local winner is ready.
 * Process/control transport is injected so callers can use their authenticated
 * supervisor protocol without this coordinator making transport assumptions.
 */
export async function recoverJoinersSequentially({ joiners = [], startJoiner, joinClient, verifyJoiner, recoveryState, recoveryAudit, publishRecovery = async () => {}, log = {} } = {}) {
  const start = startJoiner ?? (joinClient ? (joiner) => joinClient.join(joiner) : undefined);
  if (!Array.isArray(joiners) || typeof start !== 'function' || typeof verifyJoiner !== 'function') throw new TypeError('sequential joiner recovery dependencies are required');
  const completed = [];
  recoveryState?.set?.('joining', { total: joiners.length });
  for (const joiner of joiners) {
    try {
      await start(joiner);
      const verification = await verifyJoiner(joiner);
      if (!verification?.valid) throw Object.assign(new Error(verification?.reason ?? 'joiner did not reach a ready Primary state'), { code: 'JOINER_NOT_READY', node: joiner.name });
      completed.push(joiner.name);
      recoveryAudit?.joinComplete?.({ node: joiner.name, completed: completed.slice() });
    } catch (error) {
      recoveryState?.set?.('cluster-unavailable', { reason: error.message, node: joiner.name, completed: completed.slice() });
      recoveryAudit?.failure?.({ reason: error.message, node: joiner.name, completed: completed.slice() });
      log.error?.('Sequential joiner recovery failed', { error, node: joiner.name, completed: completed.slice() });
      throw error;
    }
  }
  recoveryState?.set?.('complete', { reason: 'all joiners reached ready Primary membership', members: completed.slice() });
  await publishRecovery({ members: completed.slice() });
  return { completed: completed.slice() };
}
