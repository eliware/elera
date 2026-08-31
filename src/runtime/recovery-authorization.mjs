import { mariaDbArguments, } from '../config.mjs';
import { promoteSafeToBootstrap } from '../cluster/cold-bootstrap/promote-state.mjs';
import { startupArguments } from '../cluster/cold-bootstrap/startup-arguments.mjs';
import { access } from 'node:fs/promises';

export async function authorizeSupervisorRecovery({ decision, members, config, intentState, recoveryProtocol, recoveryState, recoveryAudit, log, environment = process.env, fetchImpl = fetch, promote = promoteSafeToBootstrap, pathExists = access, argumentsFor = mariaDbArguments, applyArguments = startupArguments } = {}) {
  if (!(decision.localWinner === true && decision.mode === 'bootstrap')) return { decision, args: undefined };
  const claims = await Promise.all(members.map(async (node) => {
    const url = node.local ? `http://127.0.0.1:${config.httpPort}` : node.url;
    try {
      const response = await fetchImpl(`${url}/api/v1/cluster/cold-bootstrap/lease`, { method: 'POST', headers: { authorization: `Bearer ${environment.ELERA_PEER_TOKEN ?? environment.ROOT_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ epoch: decision.epoch, winner: decision.winner }), signal: AbortSignal.timeout(config.timeoutMs) });
      const granted = response.ok && (await response.json()).data?.granted === true;
      recoveryAudit.lease({ node: node.name, granted, epoch: decision.epoch });
      return granted;
    } catch {
      recoveryAudit.lease({ node: node.name, granted: false, epoch: decision.epoch });
      return false;
    }
  }));
  if (claims.filter(Boolean).length < Math.floor(members.length / 2) + 1) {
    const blocked = { ...decision, mode: 'blocked', reason: 'recovery lease quorum was not acquired' };
    recoveryState.set('blocked-ambiguous', { reason: blocked.reason, epoch: blocked.epoch });
    log.warn('Cold recovery bootstrap refused without lease quorum', { epoch: blocked.epoch });
    return { decision: blocked, args: undefined };
  }
  const acknowledgements = members.filter((_, index) => claims[index]).map((node) => node.name);
  await recoveryProtocol.authorize({ epoch: decision.epoch, acknowledgements });
  await recoveryProtocol.beginBootstrap({ epoch: decision.epoch, winner: decision.winner });
  recoveryState.set('recovery-authorized', { reason: decision.reason, epoch: decision.epoch });
  recoveryAudit.authorization({ winner: decision.winner, epoch: decision.epoch });
  recoveryAudit.bootstrapStart({ winner: decision.winner, epoch: decision.epoch });
  const statePath = `${config.dataDir}/grastate.dat`;
  try { await pathExists(statePath); await promote(statePath); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; log.info?.('No Galera state file exists; explicit fresh bootstrap will create cluster state', { path: statePath }); }
  const args = applyArguments(argumentsFor({ ...config, intentConfigPath: intentState.paths.renderedPath, environment: { ...config.environment, ELERA_CLUSTER_BOOTSTRAP: 'true' } }), decision);
  return { decision, args };
}
