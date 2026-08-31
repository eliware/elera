import { createColdBootstrapCoordinator } from '../cluster/cold-bootstrap/coordinator.mjs';

export function createSupervisorColdBootstrap({ members, localEvidence, remoteEvidence, bootstrapLocal, config, environment = process.env, log, fetchImpl = fetch, createCoordinator = createColdBootstrapCoordinator } = {}) {
  return createCoordinator({
    nodes: members,
    local: localEvidence,
    remote: remoteEvidence,
    bootstrapLocal,
    bootstrapRemote: async (node) => {
      const response = await fetchImpl(`${node.url}/api/v1/cluster/cold-bootstrap/local`, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', 'x-elera-internal': 'true', 'x-elera-peer-token': environment.ELERA_PEER_TOKEN ?? environment.ROOT_TOKEN, authorization: `Bearer ${environment.ROOT_TOKEN}` }, body: JSON.stringify({ confirm: true }), signal: AbortSignal.timeout(config.timeoutMs) });
      if (!response.ok) throw Object.assign(new Error(`candidate supervisor returned ${response.status}`), { statusCode: response.status });
      return response.json();
    },
    lockPath: '/run/elera/cold-bootstrap.lock',
    log,
  });
}
