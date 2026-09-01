import { explicitStartupDecision } from '../cluster/cold-bootstrap/explicit-startup.mjs';
import { startupArguments } from '../cluster/cold-bootstrap/startup-arguments.mjs';

export async function resolveExplicitSupervisorStartup({ environment = process.env, nodeName, args, joinAddress, decision = explicitStartupDecision, addArguments = startupArguments } = {}) {
  const explicit = decision(environment, nodeName);
  if (!explicit) return { explicit: false, decision: undefined, args };
  if (explicit.mode !== 'bootstrap') return { explicit: true, decision: explicit, args: explicit.mode === 'join' ? addArguments(args, explicit, { joinAddress }) : args };
  return { explicit: true, decision: explicit, args: addArguments(args, explicit, { joinAddress }) };
}
