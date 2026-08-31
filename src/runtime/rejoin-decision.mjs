import { waitForRecoveryCompletion } from '../cluster/cold-bootstrap/completion.mjs';

export async function resolveSupervisorRejoin({ decision, members, config, environment = process.env, waitForCompletion = waitForRecoveryCompletion, recoveryState } = {}) {
  if (!(decision.mode === 'bootstrap' && decision.localWinner !== true && decision.winner)) return decision;
  try { await waitForCompletion({ url: members.find((node) => node.name === decision.winner)?.url, epoch: decision.epoch, token: environment.ELERA_PEER_TOKEN ?? environment.ROOT_TOKEN, timeoutMs: config.startupTimeoutMs }); return { ...decision, mode: 'join', bootstrapComplete: true }; }
  catch (error) { const blocked = { ...decision, mode: 'blocked', reason: error.message }; recoveryState.set('blocked-ambiguous', { reason: error.message, epoch: decision.epoch }); return blocked; }
}
