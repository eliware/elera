import { explicitStartupDecision } from '../cluster/cold-bootstrap/explicit-startup.mjs';
import { promoteSafeToBootstrap } from '../cluster/cold-bootstrap/promote-state.mjs';
import { startupArguments } from '../cluster/cold-bootstrap/startup-arguments.mjs';

export async function resolveExplicitSupervisorStartup({ environment = process.env, nodeName, dataDir, args, decision = explicitStartupDecision, promote = promoteSafeToBootstrap, addArguments = startupArguments } = {}) {
  const explicit = decision(environment, nodeName);
  if (!explicit) return { explicit: false, decision: undefined, args };
  if (explicit.mode !== 'bootstrap') return { explicit: true, decision: explicit, args };
  await promote(`${dataDir}/grastate.dat`);
  return { explicit: true, decision: explicit, args: addArguments(args, explicit) };
}
