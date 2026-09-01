import { mariaDbArguments } from '../config.mjs';
import { loadStartupIntent } from './startup-intent.mjs';
import { promises as dns } from 'node:dns';

export async function loadSupervisorStartupConfiguration({ intentState, loadEnvironmentIntent, node, identity, routingEnvironment, config, environment = process.env, loadIntentImpl = loadStartupIntent, mariaArguments = mariaDbArguments, resolveAddress = (host) => dns.lookup(host) } = {}) {
  if (!identity?.name || !identity.name.includes('.')) throw new Error('shared runtime identity must be a fully qualified hostname during startup configuration');
  if (!intentState || typeof intentState.apply !== 'function' || typeof loadEnvironmentIntent !== 'function' || !routingEnvironment || !config || typeof resolveAddress !== 'function') throw new TypeError('startup configuration dependencies are required');
  const initialIntent = await loadIntentImpl({ intentState, loadEnvironmentIntent, identity, environment });
  if (!initialIntent?.cluster?.members?.length) throw new Error('startup intent must define cluster members');
  if (initialIntent.cluster.members.length > 1) {
    await Promise.all(initialIntent.cluster.members.map(async (member) => {
      try { await resolveAddress(member.address); } catch (error) { throw new Error(`configured member hostname resolution failed: runtime=${identity.name}; member=${member.name}; address=${member.address}; error=${error.message}`, { cause: error }); }
    }));
  }
  routingEnvironment.ELERA_CLUSTER_SIZE = String(initialIntent.cluster.members.length);
  await intentState.apply(initialIntent);
  const args = mariaArguments({ ...config, intentConfigPath: intentState.paths.renderedPath }, identity);
  return { initialIntent, args };
}
