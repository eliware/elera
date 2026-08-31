import { mariaDbArguments } from '../config.mjs';
import { loadStartupIntent } from './startup-intent.mjs';

export async function loadSupervisorStartupConfiguration({ intentState, loadEnvironmentIntent, node, routingEnvironment, config, environment = process.env, loadIntentImpl = loadStartupIntent, mariaArguments = mariaDbArguments } = {}) {
  const initialIntent = await loadIntentImpl({ intentState, loadEnvironmentIntent, node });
  routingEnvironment.ELERA_CLUSTER_SIZE = String(initialIntent.cluster.members.length);
  await intentState.apply(initialIntent);
  const args = mariaArguments({ ...config, intentConfigPath: intentState.paths.renderedPath });
  return { initialIntent, args };
}
