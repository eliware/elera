import { createStartupLocalEvidence } from '../cluster/cold-bootstrap/startup-local-evidence.mjs';
import { createStartupEvidenceServer } from '../cluster/cold-bootstrap/startup-evidence-server.mjs';
import { createRecoveryLease } from '../cluster/cold-bootstrap/lease.mjs';
import { readStateFile } from '../cluster/cold-bootstrap/state-file.mjs';
import { inspectDataDirectory } from '../lifecycle/data-directory.mjs';
import { createRecoveryCompletion } from '../cluster/cold-bootstrap/completion.mjs';
import { runWsrepRecover } from './wsrep-recovery.mjs';
import { createStartupEvidenceRoutes } from '../cluster/cold-bootstrap/startup-evidence-routes.mjs';

export function createRecoveryEvidenceService({ identity, dataDir, httpPort, token, mariaProcess, getMariaProcess = () => mariaProcess?.mariaProcess ?? mariaProcess, log, leasePath = '/run/elera/cold-recovery.lease', createEvidence = createStartupLocalEvidence, createServer = createStartupEvidenceServer, createLease = createRecoveryLease, readState = readStateFile, inspect = inspectDataDirectory, recover = runWsrepRecover, createCompletion = createRecoveryCompletion } = {}) {
  const evidence = createEvidence({ node: identity, dataDir, readState: (directory) => readState(directory), runRecover: recover, inspect, isActive: () => { const current = getMariaProcess?.(); return Boolean(current?.child && current.child.exitCode === null); } });
  const completion = createCompletion();
  const lease = createLease(leasePath);
  const server = createServer?.({ port: httpPort, token, evidence, lease, completion, log });
  const routes = typeof evidence === 'function' ? createStartupEvidenceRoutes({ evidence, lease, completion, token, log }) : undefined;
  return routes ? { evidence, completion, server, routes } : { evidence, completion, server };
}
