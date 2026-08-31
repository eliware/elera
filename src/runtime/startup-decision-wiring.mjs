import { explicitStartupDecision } from '../cluster/cold-bootstrap/explicit-startup.mjs';
import { promoteSafeToBootstrap } from '../cluster/cold-bootstrap/promote-state.mjs';
import { startupArguments } from '../cluster/cold-bootstrap/startup-arguments.mjs';
import { access } from 'node:fs/promises';

export async function resolveExplicitSupervisorStartup({ environment = process.env, nodeName, dataDir, args, decision = explicitStartupDecision, promote = promoteSafeToBootstrap, pathExists = access, addArguments = startupArguments, log = {} } = {}) {
  const explicit = decision(environment, nodeName);
  if (!explicit) return { explicit: false, decision: undefined, args };
  if (explicit.mode !== 'bootstrap') return { explicit: true, decision: explicit, args };
  const statePath = `${dataDir}/grastate.dat`;
  try { await pathExists(statePath); await promote(statePath); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; log.info?.('No Galera state file exists; explicit fresh bootstrap will create cluster state', { path: statePath }); }
  return { explicit: true, decision: explicit, args: addArguments(args, explicit) };
}
